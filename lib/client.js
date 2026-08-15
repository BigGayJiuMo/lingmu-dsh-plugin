window.__ModuleLoader__.load({
	id: "lingmu-dsh-plugin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let React = require("react");
		//#region LingMu floating window - client half (client-plugin package edition)
		//
		// Bridge: this bundle talks to the host half (lib/index.js) through a
		// same-origin fetch to the `/lingmu/report` route the host registers on
		// the DSH webServer. Credentials entered in the settings view are kept in
		// browser localStorage (key lingmu.creds.v1) and forwarded with every
		// report call; no credentials are hardcoded anywhere.
		//
		// UI: a draggable floating window in the shell.overlay seat:
		//   - drag the title bar to move; released within 64px of a page edge it
		//     snaps to that edge, otherwise it stays where you dropped it,
		//   - the '-' button minimizes it into a 46px 'ling' floating ball;
		//     dragging the ball docks it to the nearest horizontal edge, clicking
		//     it expands,
		//   - the gear button opens an account settings view.
		// The overlay layer is click-through, so the widget opts back in with
		// pointer-events:auto. Drag uses pointer capture on the head/ball
		// elements; presses landing on a button never start a drag.

		function fmtInt(n) {
			return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
		}
		function fmtUsd2(n) { return (Number(n) || 0).toFixed(2); }
		function fmtUsd4(n) { return (Number(n) || 0).toFixed(4); }
		function fmtPct(rate) {
			if (rate === null || rate === undefined || isNaN(Number(rate))) return '—';
			return (Number(rate) * 100).toFixed(1) + '%';
		}
		function fmtTime(iso) {
			if (!iso) return '';
			const d = new Date(iso);
			if (isNaN(d.getTime())) return '';
			const p = function (x) { return (x < 10 ? '0' : '') + x; };
			return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
		}
		function maskEmail(email) {
			if (!email) return '';
			const at = email.indexOf('@');
			if (at <= 0) return email.slice(0, 2) + '***';
			return email.slice(0, 1) + '***' + email.slice(at);
		}

		const LM_EDGE = 64;        // px from an edge that triggers snap on release
		const LM_MIN_VISIBLE = 40; // px of the widget kept on screen when free-floating
		const LM_CREDS_KEY = 'lingmu.creds.v1';

		const LM_CSS = `
.lm-float{position:fixed;pointer-events:auto}
.lm-win{width:360px;max-width:calc(100vw - 24px);border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);box-shadow:0 8px 30px rgba(0,0,0,.28);overflow:hidden;display:flex;flex-direction:column}
.lm-head{cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;display:flex;align-items:center;justify-content:space-between;gap:6px;padding:8px 12px;background:var(--dsw-alias-bg-layer-2);border-bottom:1px solid var(--dsw-alias-border-l1)}
.lm-head.dragging{cursor:grabbing}
.lm-title{font-size:13px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lm-ico{width:24px;height:24px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0}
.lm-ico:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.lm-win-body{overflow-y:auto;max-height:min(55vh,520px);padding:10px 12px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.lm-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.lm-tabs{display:flex;gap:6px}
.lm-tab{padding:3px 12px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px}
.lm-tab.on{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}
.lm-tab:disabled{opacity:.5;cursor:default}
.lm-refresh{padding:3px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;white-space:nowrap}
.lm-refresh:hover{color:var(--dsw-alias-label-primary)}
.lm-refresh:disabled{opacity:.5;cursor:default}
.lm-balance{display:flex;align-items:baseline;gap:10px;padding:8px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);margin-bottom:8px}
.lb-label{color:var(--dsw-alias-label-secondary);font-size:12px}
.lb-num{font-size:20px;font-weight:700;color:var(--dsw-alias-state-success-primary);font-variant-numeric:tabular-nums}
.lm-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:6px;margin-bottom:8px}
.lm-stat{padding:6px 8px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.ls-label{font-size:11px;color:var(--dsw-alias-label-secondary);margin-bottom:2px}
.ls-num{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
.lm-sub{margin-bottom:4px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.lm-table{width:100%;border-collapse:collapse;font-size:12px}
.lm-table th{text-align:left;padding:5px 8px;color:var(--dsw-alias-label-secondary);font-weight:500;border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap}
.lm-table td{padding:5px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);font-variant-numeric:tabular-nums;white-space:nowrap}
.lm-table td.lm-model{font-weight:600}
.lm-foot{margin-top:8px;font-size:11px;color:var(--dsw-alias-label-secondary);display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.lm-err{padding:8px 12px;border-radius:8px;border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);font-size:12px;margin-bottom:8px;word-break:break-all;display:flex;align-items:center;justify-content:space-between;gap:8px}
.lm-err-go{padding:3px 10px;border-radius:8px;border:1px solid var(--dsw-alias-state-error-primary);background:transparent;color:var(--dsw-alias-state-error-primary);cursor:pointer;font-size:12px;white-space:nowrap}
.lm-note{color:var(--dsw-alias-label-secondary);font-size:12px;padding:6px 0}
.lm-field{margin-bottom:10px}
.lm-field label{display:block;font-size:12px;color:var(--dsw-alias-label-secondary);margin-bottom:4px}
.lm-input{width:100%;box-sizing:border-box;padding:6px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:13px}
.lm-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.lm-srow{display:flex;gap:8px;margin-top:4px}
.lm-btn{padding:5px 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:12px}
.lm-btn:hover{border-color:var(--dsw-alias-border-l2)}
.lm-btn.primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}
.lm-btn.danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.lm-ball{width:46px;height:46px;border-radius:50%;background:var(--dsw-alias-brand-primary);color:#fff;font-size:20px;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;box-shadow:0 4px 16px rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.18)}
.lm-ball.dragging{cursor:grabbing}
`;

		// module-scope drag session + root node (single root-scoped overlay instance)
		let lmDrag = null;
		let lmRootNode = null;

		/** Report fetch against the host half's /lingmu route (same-origin). */
		function fetchReport(days, creds) {
			return fetch('/lingmu/report', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ days: days, creds: creds })
			}).then(function (res) {
				if (!res.ok) throw new Error('report http ' + res.status);
				return res.json();
			});
		}

		function LingMuFloat() {
			const [mode, setMode] = React.useState('window');
			const [pos, setPos] = React.useState(function () {
				const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
				return { x: Math.max(8, vw - 376), y: 72 };
			});
			const [dragging, setDragging] = React.useState(false);
			const [view, setView] = React.useState('dashboard');
			const [creds, setCreds] = React.useState(function () {
				try {
					if (typeof localStorage !== 'undefined') {
						const raw = localStorage.getItem(LM_CREDS_KEY);
						if (raw) {
							const p = JSON.parse(raw);
							if (p && typeof p.email === 'string' && typeof p.password === 'string' && p.email.length > 0 && p.password.length > 0) {
								return { email: p.email, password: p.password };
							}
						}
					}
				} catch (e) {}
				return null;
			});
			const [draftEmail, setDraftEmail] = React.useState('');
			const [draftPassword, setDraftPassword] = React.useState('');
			const [days, setDays] = React.useState(1);
			const [data, setData] = React.useState(null);
			const [loading, setLoading] = React.useState(false);
			const [error, setError] = React.useState(null);
			const [stamp, setStamp] = React.useState(0);

			React.useEffect(function () {
				let cancelled = false;
				setLoading(true);
				setError(null);
				fetchReport(days, creds)
					.then(function (res) {
						if (cancelled) return;
						if (res && res.ok === true) {
							setData(res);
						} else {
							setData(null);
							setError((res && res.error) || '获取用量失败');
						}
					})
					.catch(function (e) {
						if (!cancelled) {
							setData(null);
							setError(String((e && e.message) || e));
						}
					})
					.finally(function () {
						if (!cancelled) setLoading(false);
					});
				return function () { cancelled = true; };
			}, [days, stamp, creds]);

			// Auto-load once credentials become available (first mount reads them
			// from localStorage; if the widget opened before they existed, retry
			// as soon as they do) and whenever the widget expands to a window.
			const prevModeRef = React.useRef(mode);
			React.useEffect(function () {
				const wasBall = prevModeRef.current === 'ball';
				prevModeRef.current = mode;
				if (creds && wasBall && mode === 'window') {
					setStamp(stamp + 1);
				}
			}, [mode, creds, stamp]);

			function openSettings() {
				setDraftEmail(creds ? creds.email : '');
				setDraftPassword(creds ? creds.password : '');
				setView('settings');
			}
			function saveSettings() {
				const email = draftEmail.trim();
				const password = draftPassword;
				if (!email || !password) {
					setError('请输入邮箱和密码');
					setView('dashboard');
					setStamp(stamp + 1);
					return;
				}
				const next = { email: email, password: password };
				try {
					if (typeof localStorage !== 'undefined') {
						localStorage.setItem(LM_CREDS_KEY, JSON.stringify(next));
					}
				} catch (e) {}
				setCreds(next);
				setView('dashboard');
				setStamp(stamp + 1);
			}
			function clearSettings() {
				try {
					if (typeof localStorage !== 'undefined') {
						localStorage.removeItem(LM_CREDS_KEY);
					}
				} catch (e) {}
				setCreds(null);
				setDraftEmail('');
				setDraftPassword('');
				setView('dashboard');
				setStamp(stamp + 1);
			}
			function minimizeToBall() {
				// Minimizing docks the ball to the nearest horizontal edge immediately,
				// instead of leaving it at the window's old position until it is dragged.
				const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
				const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
				const cx = pos.x + 180; // window center (window is 360px wide)
				const ny = Math.min(Math.max(pos.y, 8), Math.max(8, vh - 46 - 8));
				setPos({ x: cx < vw / 2 ? 8 : Math.max(8, vw - 46 - 8), y: ny });
				setMode('ball');
			}

			function onPointerDown(e) {
				// Never start a drag from a press that lands on a button: pointer capture
				// would retarget the click to the drag surface and swallow the button.
				if (e.target && e.target.closest && e.target.closest('button')) return;
				e.preventDefault();
				const t = e.currentTarget;
				try { t.setPointerCapture(e.pointerId); } catch (err) {}
				lmDrag = {
					id: e.pointerId,
					startX: e.clientX,
					startY: e.clientY,
					originX: pos.x,
					originY: pos.y,
					moved: false
				};
				setDragging(true);
			}
			function onPointerMove(e) {
				const d = lmDrag;
				if (!d || d.id !== e.pointerId) return;
				const dx = e.clientX - d.startX;
				const dy = e.clientY - d.startY;
				if (!d.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) d.moved = true;
				setPos({ x: d.originX + dx, y: d.originY + dy });
			}
			function onPointerUp(e) {
				const d = lmDrag;
				if (!d || d.id !== e.pointerId) return;
				lmDrag = null;
				setDragging(false);
				const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
				const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
				const node = lmRootNode;
				if (mode === 'ball' && !d.moved && node) {
					// click on the ball -> expand back to the window, clamped into view;
					// the ball->window effect below refreshes the report on expand
					const rect = node.getBoundingClientRect();
					setMode('window');
					setPos({
						x: Math.min(Math.max(rect.left, 8), Math.max(8, vw - 360 - 8)),
						y: Math.min(Math.max(rect.top, 8), Math.max(8, vh - 320 - 8))
					});
					return;
				}
				if (!d.moved || !node) return; // plain click (head): keep position
				const rect = node.getBoundingClientRect();
				const w = rect.width;
				const h = rect.height;
				const clampX = function (v) { return Math.min(Math.max(v, 8), Math.max(8, vw - w - 8)); };
				const clampY = function (v) { return Math.min(Math.max(v, 8), Math.max(8, vh - h - 8)); };
				let x = rect.left;
				let y = rect.top;
				if (mode === 'ball') {
					// ball always docks to the nearest horizontal edge
					x = rect.left < vw / 2 ? 8 : vw - 46 - 8;
					y = clampY(rect.top);
				} else {
					// window: snap only when released close to a page edge, else float freely
					let bestD = LM_EDGE + 1;
					let bestX = null;
					let bestY = null;
					const consider = function (dist, nx, ny) {
						if (dist < bestD) { bestD = dist; bestX = nx; bestY = ny; }
					};
					consider(rect.left, 8, clampY(rect.top));
					consider(vw - (rect.left + w), vw - w - 8, clampY(rect.top));
					consider(rect.top, clampX(rect.left), 8);
					consider(vh - (rect.top + h), clampX(rect.left), vh - h - 8);
					if (bestX !== null) {
						x = bestX;
						y = bestY;
					} else {
						// free float: keep the dropped position, never lose the widget
						x = Math.min(Math.max(rect.left, LM_MIN_VISIBLE - w), vw - LM_MIN_VISIBLE);
						y = Math.min(Math.max(rect.top, LM_MIN_VISIBLE - h), vh - LM_MIN_VISIBLE);
					}
				}
				setPos({ x: x, y: y });
			}
			function onPointerCancel(e) {
				const d = lmDrag;
				if (!d || d.id !== e.pointerId) return;
				lmDrag = null;
				setDragging(false);
			}

			const head = React.createElement('div', {
				className: 'lm-head' + (dragging ? ' dragging' : ''),
				onPointerDown: onPointerDown,
				onPointerMove: onPointerMove,
				onPointerUp: onPointerUp,
				onPointerCancel: onPointerCancel
			},
				React.createElement('div', { className: 'lm-title' }, '灵眸中转站 · 用量报表'),
				React.createElement('button', {
					className: 'lm-ico',
					title: '账号配置',
					onClick: openSettings
				}, '⚙'),
				React.createElement('button', {
					className: 'lm-ico',
					title: '最小化为悬浮球',
					onClick: minimizeToBall
				}, '−')
			);

			let bodyEl;
			if (view === 'settings') {
				const settingsEl = React.createElement('div', null,
					React.createElement('div', { className: 'lm-sub' }, '账号配置（仅保存在本机浏览器）'),
					React.createElement('div', { className: 'lm-field' },
						React.createElement('label', null, '邮箱 / 账号'),
						React.createElement('input', {
							className: 'lm-input',
							type: 'text',
							value: draftEmail,
							placeholder: 'you@example.com',
							onChange: function (e) { setDraftEmail(e.target.value); }
						})
					),
					React.createElement('div', { className: 'lm-field' },
						React.createElement('label', null, '密码'),
						React.createElement('input', {
							className: 'lm-input',
							type: 'password',
							value: draftPassword,
							placeholder: '********',
							onChange: function (e) { setDraftPassword(e.target.value); }
						})
					),
					React.createElement('div', { className: 'lm-srow' },
						React.createElement('button', { className: 'lm-btn primary', onClick: saveSettings }, '保存并刷新'),
						React.createElement('button', { className: 'lm-btn', onClick: function () { setView('dashboard'); } }, '取消'),
						creds ? React.createElement('button', { className: 'lm-btn danger', onClick: clearSettings }, '清除') : null
					),
					React.createElement('div', { className: 'lm-foot' },
						React.createElement('span', null, creds ? ('当前账号：' + maskEmail(creds.email)) : '尚未配置账号'),
						React.createElement('span', null, '或使用环境变量 LM_EMAIL / LM_PASSWORD')
					)
				);
				bodyEl = settingsEl;
			} else if (error) {
				bodyEl = React.createElement('div', { className: 'lm-err' },
					React.createElement('span', null, '⚠ ' + error),
					React.createElement('button', { className: 'lm-err-go', onClick: openSettings }, '去配置')
				);
			} else if (!data) {
				bodyEl = React.createElement('div', { className: 'lm-note' }, '加载中…');
			} else {
				const balanceEl = React.createElement('div', { className: 'lm-balance' },
					React.createElement('span', { className: 'lb-label' }, '💰 当前余额'),
					React.createElement('span', { className: 'lb-num' }, '$' + fmtUsd2(data.balance))
				);
				const stats = [
					{ label: '请求次数', value: fmtInt(data.totalRequests) },
					{ label: '输入Token', value: fmtInt(data.inputTokens) },
					{ label: '输出Token', value: fmtInt(data.outputTokens) },
					{ label: '缓存命中率', value: fmtPct(data.cacheHitRate) },
					{ label: '缓存命中', value: fmtInt(data.cacheReadTokens) },
					{ label: '总费用', value: '$' + fmtUsd4(data.totalCost) }
				];
				const statEls = React.createElement('div', { className: 'lm-stats' },
					stats.map(function (s) {
						return React.createElement('div', { key: s.label, className: 'lm-stat' },
							React.createElement('div', { className: 'ls-label' }, s.label),
							React.createElement('div', { className: 'ls-num' }, s.value)
						);
					})
				);
				let tableEl;
				const models = data.models || [];
				if (models.length === 0) {
					tableEl = React.createElement('div', { className: 'lm-note' }, '该时间段内没有调用记录。');
				} else {
					const headRow = React.createElement('tr', null,
						React.createElement('th', null, '模型'),
						React.createElement('th', null, '请求'),
						React.createElement('th', null, '输入'),
						React.createElement('th', null, '输出'),
						React.createElement('th', null, '缓存命中'),
						React.createElement('th', null, '费用')
					);
					const rows = models.map(function (m) {
						return React.createElement('tr', { key: m.model },
							React.createElement('td', { className: 'lm-model' }, m.model),
							React.createElement('td', null, fmtInt(m.count)),
							React.createElement('td', null, fmtInt(m.inputTokens)),
							React.createElement('td', null, fmtInt(m.outputTokens)),
							React.createElement('td', null, fmtInt(m.cacheRead)),
							React.createElement('td', null, '$' + fmtUsd4(m.cost))
						);
					});
					tableEl = React.createElement('table', { className: 'lm-table' },
						React.createElement('thead', null, headRow),
						React.createElement('tbody', null, rows)
					);
				}
				const footEl = React.createElement('div', { className: 'lm-foot' },
					React.createElement('span', null, '统计区间 ' + data.dateRange.start + ' ~ ' + data.dateRange.end),
					React.createElement('span', null, '刷新于 ' + fmtTime(data.fetchedAt))
				);
				bodyEl = React.createElement('div', null,
					balanceEl,
					statEls,
					React.createElement('div', { className: 'lm-sub' }, '按模型拆分（按费用排序）'),
					tableEl,
					footEl
				);
			}

			const tabs = [
				{ v: 1, label: '近1天' },
				{ v: 7, label: '近7天' },
				{ v: 30, label: '近30天' }
			];
			const tabsEl = React.createElement('div', { className: 'lm-tabs' },
				tabs.map(function (t) {
					return React.createElement('button', {
						key: t.v,
						className: 'lm-tab' + (days === t.v ? ' on' : ''),
						onClick: function () { setDays(t.v); },
						disabled: loading
					}, t.label);
				})
			);
			const refreshEl = React.createElement('button', {
				className: 'lm-refresh',
				onClick: function () { setStamp(stamp + 1); },
				disabled: loading
			}, loading ? '加载中…' : '↻ 刷新');

			const content = React.createElement('div', { className: 'lm-win' },
				head,
				React.createElement('div', { className: 'lm-win-body' },
					view === 'dashboard'
						? React.createElement('div', null,
							React.createElement('div', { className: 'lm-row' }, tabsEl, refreshEl),
							bodyEl
						)
						: bodyEl
				)
			);

			const ball = React.createElement('div', {
				className: 'lm-ball' + (dragging ? ' dragging' : ''),
				title: '灵眸用量 · 点击展开',
				onPointerDown: onPointerDown,
				onPointerMove: onPointerMove,
				onPointerUp: onPointerUp,
				onPointerCancel: onPointerCancel
			}, '灵');

			const wrapStyle = {
				left: pos.x + 'px',
				top: pos.y + 'px',
				zIndex: 9999,
				pointerEvents: 'auto',
				transition: dragging ? 'none' : 'left 0.25s ease, top 0.25s ease'
			};

			return React.createElement('div', {
				className: 'lm-float',
				style: wrapStyle,
				ref: function (node) { lmRootNode = node; }
			}, mode === 'window' ? content : ball);
		}
		//#endregion
		const inject = ["slots"];
		function apply(ctx) {
			const slots = ctx.get('slots');
			if (slots === undefined) return;
			// inject the widget stylesheet (owned by this plugin id)
			if (typeof document !== 'undefined') {
				let styleEl = document.querySelector('style[data-plugin="lingmu-dsh-plugin"]');
				if (styleEl === null) {
					styleEl = document.createElement('style');
					styleEl.setAttribute('data-plugin', 'lingmu-dsh-plugin');
					styleEl.textContent = LM_CSS;
					document.head.append(styleEl);
				}
			}
			slots.inject('shell.overlay', function () {
				return slots.register(
					{ name: 'shell.overlay', id: 'lingmu-float' },
					function () {
						return React.createElement(LingMuFloat, null);
					}
				);
			});
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
