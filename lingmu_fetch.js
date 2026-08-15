// LingMu (lmuai.com) relay usage aggregator - standalone reference script.
// Originally ported from lingmu_report.py, now credential-free for open source.
//
// Usage:
//   set LM_EMAIL=you@example.com
//   set LM_PASSWORD=your-password
//   node lingmu_fetch.js            (days default 1; set LM_DAYS for other ranges)
//
// Output: one-line JSON { ok, balance, dateRange, totalRequests, inputTokens,
//   outputTokens, cacheReadTokens, cacheCreationTokens, totalCost, models[], fetchedAt }
//
// NOTE: pure ASCII on purpose - the LingMu Report plugin inlines this script
// into a node -e command string, so it must stay free of double quotes,
// backticks and dollar signs (safe inside a pwsh -Command quoted argument).
// Days travel in the LM_DAYS env var instead of argv: PowerShell 5.1 drops
// trailing positional arguments after a long multi-line -e code string.
var BASE = 'https://api.lmuai.com';

async function main() {
  var email = process.env.LM_EMAIL || '';
  var password = process.env.LM_PASSWORD || '';
  if (!email || !password) {
    throw new Error('no credentials: set LM_EMAIL and LM_PASSWORD for this process');
  }
  var days = parseInt(process.env.LM_DAYS || '1', 10);
  if (!(days >= 1)) days = 1;
  // Asia/Shanghai is UTC+8, no DST
  var now = new Date();
  var sh = new Date(now.getTime() + 8 * 3600 * 1000);
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var ymd = function (d) {
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  };
  var end = ymd(sh);
  var start = ymd(new Date(sh.getTime() - (days - 1) * 86400000));

  // 1. login -> token + balance
  var loginRes = await fetch(BASE + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: password })
  });
  if (!loginRes.ok) throw new Error('login http ' + loginRes.status);
  var login = await loginRes.json();
  if (!login || login.code !== 0) throw new Error('login failed: ' + ((login && login.message) || 'unknown'));
  var token = login.data.access_token;
  var balance = login.data.user.balance;

  // 2. paginated usage fetch
  var items = [];
  var page = 1;
  while (true) {
    var qs = new URLSearchParams({
      page: String(page),
      page_size: '200',
      start_date: start,
      end_date: end,
      timezone: 'Asia/Shanghai',
      sort_by: 'created_at',
      sort_order: 'desc'
    });
    var res = await fetch(BASE + '/api/v1/usage?' + qs.toString(), {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('usage http ' + res.status);
    var body = await res.json();
    if (!body || body.code !== 0) throw new Error('usage failed: ' + ((body && body.message) || 'unknown'));
    var data = body.data || {};
    var arr = data.items || [];
    for (var i = 0; i < arr.length; i++) items.push(arr[i]);
    var pages = data.pages || 1;
    if (page >= pages) break;
    page += 1;
    if (page > 500) break; // safety cap
  }

  // 3. aggregate
  var totalRequests = 0, inputTokens = 0, outputTokens = 0, cacheRead = 0, cacheWrite = 0, totalCost = 0;
  var modelMap = {};
  var modelOrder = [];
  for (var k = 0; k < items.length; k++) {
    var row = items[k];
    totalRequests += 1;
    var ii = Number(row.input_tokens || 0);
    var oo = Number(row.output_tokens || 0);
    var cr = Number(row.cache_read_tokens || 0);
    var cw = Number(row.cache_creation_tokens || 0);
    var cost = Number(row.actual_cost || 0);
    inputTokens += ii; outputTokens += oo; cacheRead += cr; cacheWrite += cw; totalCost += cost;
    var name = String(row.model || 'unknown');
    var m = modelMap[name];
    if (!m) {
      m = modelMap[name] = { model: name, count: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
      modelOrder.push(m);
    }
    m.count += 1; m.inputTokens += ii; m.outputTokens += oo; m.cacheRead += cr; m.cacheWrite += cw; m.cost += cost;
  }
  modelOrder.sort(function (a, b) { return b.cost - a.cost; });

  // 4. cache hit rate: reads / (reads + uncached input); null when no tokens
  // at all. cache_creation_tokens is 0 on this relay, so reads/(reads+creations)
  // would be 100% forever; inputTokens here is the uncached input, giving a
  // meaningful hit rate (e.g. 137984 / (137984 + 157) ~= 99.9%).
  var cacheDenominator = cacheRead + inputTokens;
  var cacheHitRate = cacheDenominator > 0 ? cacheRead / cacheDenominator : null;

  // 5. one-line JSON out
  console.log(JSON.stringify({
    ok: true,
    days: days,
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
  }));
}

main().catch(function (err) {
  console.log(JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
});
