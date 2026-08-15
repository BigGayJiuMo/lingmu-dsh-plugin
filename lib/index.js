// LingMu relay usage report - Host half (client-plugin package edition).
//
// This is a REAL node module loaded by the DSH loader (a static loader entry),
// not a sandboxed dynamic-plugin body. It therefore has the full node runtime:
// global fetch, Buffer, URL, process.env — no `shell` + `node -e` child needed,
// and no `harness` global.
//
// Bridge with the browser half: this plugin registers a `/lingmu` HTTP route on
// the host webServer; the browser bundle (exports["./client"]) calls it with a
// same-origin fetch. Credentials are NEVER hardcoded:
//   - the browser half sends { email, password } in the POST body when the user
//     configured them in the floating-window settings (stored in localStorage),
//   - otherwise this half falls back to the DSH process environment
//     (LM_EMAIL / LM_PASSWORD), and finally fails with a clear message.

const BASE = 'https://api.lmuai.com';

/** Read the whole request body as utf8 (node http IncomingMessage). */
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/** Send a JSON response. */
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

/**
* Aggregate LingMu (lmuai.com) relay usage for the last `days` natural days
* (Asia/Shanghai). Credentials: `creds` (from the client) win; the DSH process
* environment LM_EMAIL / LM_PASSWORD is the fallback.
* @param days - report range in days (clamped to 1..90).
* @param creds - optional { email, password } forwarded from the browser.
* @returns the report object; throws Error with a user-facing message on failure.
*/
async function aggregate(days, creds) {
  const email = creds && typeof creds.email === 'string' && creds.email.length > 0
    ? creds.email
    : process.env.LM_EMAIL || '';
  const password = creds && typeof creds.password === 'string' && creds.password.length > 0
    ? creds.password
    : process.env.LM_PASSWORD || '';
  if (!email || !password) {
    throw new Error('no credentials: set LM_EMAIL/LM_PASSWORD for the DSH process or configure them in the floating window settings');
  }
  let d = Math.floor(Number(days) || 1);
  if (!(d >= 1) || d > 90) d = 1;
  // Asia/Shanghai is UTC+8, no DST
  const now = new Date();
  const sh = new Date(now.getTime() + 8 * 3600 * 1000);
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const ymd = (x) => x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1) + '-' + pad(x.getUTCDate());
  const end = ymd(sh);
  const start = ymd(new Date(sh.getTime() - (d - 1) * 86400000));

  // 1. login -> token + balance
  const loginRes = await fetch(BASE + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: email, password: password })
  });
  if (!loginRes.ok) throw new Error('login http ' + loginRes.status);
  const login = await loginRes.json();
  if (!login || login.code !== 0) throw new Error('login failed: ' + ((login && login.message) || 'unknown'));
  const token = login.data.access_token;
  const balance = login.data.user.balance;

  // 2. paginated usage fetch
  const items = [];
  let page = 1;
  while (true) {
    const qs = new URLSearchParams({
      page: String(page),
      page_size: '200',
      start_date: start,
      end_date: end,
      timezone: 'Asia/Shanghai',
      sort_by: 'created_at',
      sort_order: 'desc'
    });
    const res = await fetch(BASE + '/api/v1/usage?' + qs.toString(), {
      headers: { authorization: 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('usage http ' + res.status);
    const body = await res.json();
    if (!body || body.code !== 0) throw new Error('usage failed: ' + ((body && body.message) || 'unknown'));
    const data = body.data || {};
    const arr = data.items || [];
    for (const row of arr) items.push(row);
    const pages = data.pages || 1;
    if (page >= pages) break;
    page += 1;
    if (page > 500) break; // safety cap
  }

  // 3. aggregate
  let totalRequests = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let totalCost = 0;
  const modelMap = {};
  const modelOrder = [];
  for (const row of items) {
    totalRequests += 1;
    const ii = Number(row.input_tokens || 0);
    const oo = Number(row.output_tokens || 0);
    const cr = Number(row.cache_read_tokens || 0);
    const cw = Number(row.cache_creation_tokens || 0);
    const cost = Number(row.actual_cost || 0);
    inputTokens += ii; outputTokens += oo; cacheRead += cr; cacheWrite += cw; totalCost += cost;
    const name = String(row.model || 'unknown');
    let m = modelMap[name];
    if (!m) {
      m = modelMap[name] = { model: name, count: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
      modelOrder.push(m);
    }
    m.count += 1; m.inputTokens += ii; m.outputTokens += oo; m.cacheRead += cr; m.cacheWrite += cw; m.cost += cost;
  }
  modelOrder.sort((a, b) => b.cost - a.cost);

  // 4. cache hit rate: reads / (reads + uncached input); null when no tokens
  // at all. cache_creation_tokens is 0 on this relay, so reads/(reads+creations)
  // would be 100% forever; inputTokens here is the uncached input, giving a
  // meaningful hit rate (e.g. 137984 / (137984 + 157) ~= 99.9%).
  const cacheDenominator = cacheRead + inputTokens;
  const cacheHitRate = cacheDenominator > 0 ? cacheRead / cacheDenominator : null;

  // 5. report
  return {
    ok: true,
    days: d,
    balance: balance,
    dateRange: { start: start, end: end },
    totalRequests: totalRequests,
    inputTokens: inputTokens,
    outputTokens: outputTokens,
    cacheReadTokens: cacheRead,
    cacheCreationTokens: cacheWrite,
    cacheHitRate: cacheHitRate,
    totalCost: totalCost,
    models: modelOrder,
    fetchedAt: new Date().toISOString()
  };
}

/**
* Host plugin body: register the `/lingmu` HTTP route on the host webServer.
* Uses ctx.inject so the route registers as soon as the webServer service is
* available; on a non-web host the service never appears and the plugin stays
* inert (the browser half is never loaded there anyway).
* @param ctx - host plugin context.
*/
export function apply(ctx) {
  ctx.inject(['webServer'], (scope) => {
    const webServer = scope.get('webServer');
    scope.effect(() => webServer.register({
    kind: 'prefix',
    path: '/lingmu',
    handler: async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://x');
        if (url.pathname !== '/lingmu/report') {
          sendJson(res, 404, { ok: false, error: 'not found' });
          return;
        }
        if (req.method !== 'POST' && req.method !== 'GET') {
          sendJson(res, 405, { ok: false, error: 'method not allowed' });
          return;
        }
        let days;
        let creds;
        if (req.method === 'POST') {
          const raw = await readBody(req);
          let payload = {};
          if (raw) {
            try { payload = JSON.parse(raw); } catch { payload = {}; }
          }
          days = payload.days;
          creds = payload.creds;
        } else {
          days = Number(url.searchParams.get('days') || 1);
        }
        try {
          const report = await aggregate(days, creds);
          sendJson(res, 200, report);
        } catch (err) {
          sendJson(res, 200, { ok: false, error: String((err && err.message) || err) });
        }
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String((err && err.message) || err) });
      }
    }
    }), 'lingmu: /lingmu report route');
  });
}
