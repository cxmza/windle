// Home page for browsers hitting GET / (API clients keep the JSON index). Not documentation — that lives on
// docs.windle.fun and /reference/ — just identity, base URL, live status and three doors. One server-rendered HTML
// string: no framework, no web fonts, no external requests, inline CSS/JS authorised by a per-response CSP nonce.
//
// Visual language follows the sign-in page: flat black, mono uppercase labels, hairlines, solid type, one accent.
// No glow, gradients, glass or shadows (portal.test.ts guards this).
//
// Everything interpolated here is server state (version, commit, public origins, probe results), never request
// input, and nothing secret.

export type CheckStatus = 'up' | 'down';
export interface Check {
  status: CheckStatus;
  latencyMs: number;
}

export interface PortalData {
  nonce: string;
  version: string;
  commit: string | undefined;
  env: string;
  apiOrigin: string;
  docsOrigin: string;
  checks: { postgres: Check; redis: Check };
}

/** CSP for the page: only the nonce'd inline style/script, same-origin fetch (/ready), data: images (favicon). */
export function portalCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** The windle notch mark (packages/brand/assets/windle-mark.svg). */
const MARK_PATH =
  'M30 14H32.5L44 58L55.5 14H64.5L76 58L87.5 14H90A16 16 0 0 1 106 30V90A16 16 0 0 1 90 106H73.3L60 70L46.7 106H30A16 16 0 0 1 14 90V30A16 16 0 0 1 30 14Z';

const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><path fill="#ffffff" d="${MARK_PATH}"/></svg>`,
)}`;

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

// --- tiny syntax highlighter (JS + shell); input is raw code, output is escaped HTML ------------------------------
const TOKEN =
  /((?<=^|\s)\/\/[^\n]*|(?<=^|\s)#[^\n]*)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(const|let|await|async|return|new|import|from|curl)\b|((?<=\s)-{1,2}[A-Za-z][\w-]*)|(?<![\w:./-])(\d+)\b|\b(true|false|null)\b|([{}()[\];,=])/gm;
// comment, string, keyword, flag, number, literal (true/false/null), punctuation — colours in CSS (.t-*).
const TOKEN_CLASS = ['c', 's', 'k', 'f', 'n', 'n', 'p'] as const;

export function highlight(code: string): string {
  let out = '';
  let last = 0;
  for (const m of code.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    out += esc(code.slice(last, start));
    const group = m.slice(1).findIndex((g) => g !== undefined);
    out += `<span class="t-${TOKEN_CLASS[group] ?? 'k'}">${esc(m[0])}</span>`;
    last = start + m[0].length;
  }
  return out + esc(code.slice(last));
}

export type OverallState = 'ok' | 'degraded' | 'down';
export function overall(checks: PortalData['checks']): { state: OverallState; label: string } {
  const up = [checks.postgres, checks.redis].filter((c) => c.status === 'up').length;
  if (up === 2) return { state: 'ok', label: 'Operational' };
  if (up === 1) return { state: 'degraded', label: 'Degraded' };
  return { state: 'down', label: 'Major outage' };
}

const CSS = `
:root{
  --bg:#000;--code:#0b0d12;--line:#1c1f27;
  --text:#f2f3f5;--muted:#8a8f9a;--link:#43acfb;
  --ok:#3ee6a0;--warn:#f5b445;--bad:#ff6b6b;
  --display:"Inter Display","SF Pro Display","Helvetica Neue","Segoe UI",Arial,sans-serif;
  --sans:"Inter","SF Pro Text","Helvetica Neue","Segoe UI",Arial,sans-serif;
  --mono:ui-monospace,"SF Mono","JetBrains Mono","Cascadia Mono",Menlo,Consolas,monospace;
  --ease:cubic-bezier(.2,.7,.2,1);
  color-scheme:dark;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{background:var(--bg)}
body{min-height:100vh;min-height:100svh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);
  font:400 15px/1.5 var(--sans);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:inherit;text-decoration:none}
button{font:inherit;color:inherit;background:none;border:0;border-radius:0;cursor:pointer}
:focus-visible{outline:2px solid var(--link);outline-offset:3px;border-radius:2px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.lbl{font:500 11px/16px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}

.wrap{width:min(960px,100% - 32px);margin-inline:auto}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px 32px;flex-wrap:wrap;padding-block:32px}
.brand{display:inline-flex;align-items:center;gap:10px;font:700 18px/24px var(--display);letter-spacing:-.02em}
.brand svg{width:22px;height:22px;display:block}
.nav{display:flex;gap:8px 24px;flex-wrap:wrap}
.nav a{color:var(--muted)}
.nav a:hover{color:var(--text)}

main{flex:1;display:flex;flex-direction:column;justify-content:center;gap:48px;padding-block:24px 48px}
h1{margin-top:16px;font:800 64px/1 var(--display);letter-spacing:-.04em;color:var(--text)}
.sub{margin-top:16px;font-size:17px;line-height:24px;color:var(--muted)}

/* Hero: headline + spec sheet on the left, the mark on the right (top-aligned with the label). */
.hero{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:64px;align-items:start}
.hero-text{display:flex;flex-direction:column;gap:32px;min-width:0}
.mark{display:block;width:320px;height:320px;overflow:visible}
.mark .side{fill:#0e1116}
.mark .side use:first-child{stroke:#1c1f27;stroke-width:1;vector-effect:non-scaling-stroke}
.mark .edge{fill:#43acfb;transform:translate(-.32px,-.32px)} /* ~1px on screen at each size */
.mark .face{fill:#1d2129}
.facts{display:grid;grid-template-columns:1fr;border-bottom:1px solid var(--line)}
.facts>div{display:grid;grid-template-columns:104px minmax(0,1fr);align-items:baseline;column-gap:16px;padding-block:12px;border-top:1px solid var(--line);min-width:0}
.facts dd{font-size:15px;line-height:24px;color:var(--text)}
.facts code{font:500 14px/24px var(--mono);color:var(--text)}
.url{display:flex;align-items:baseline;gap:16px}
.copy{font:500 11px/16px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.copy:hover{color:var(--text)}
.copy[data-done]{color:var(--text)}
.sep{color:var(--muted)}

#status{display:flex;flex-wrap:wrap;align-items:baseline;column-gap:8px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--c,var(--ok));align-self:center}
#status[data-state="degraded"]{--c:var(--warn)}
#status[data-state="down"],#status[data-state="unreachable"]{--c:var(--bad)}
#status:not([data-state="ok"]) [data-title]{color:var(--c)}
.checks{color:var(--muted);font-variant-numeric:tabular-nums}
.checks b{font-weight:400;color:var(--text)}
.checks [data-status="down"] b{color:var(--bad)}

.split{display:grid;grid-template-columns:1fr 1fr;column-gap:48px;align-items:start}
.split h2{margin-bottom:16px}
.rows{list-style:none;border-bottom:1px solid var(--line)}
.row{display:flex;align-items:baseline;gap:8px;min-height:56px;padding-block:16px;border-top:1px solid var(--line)}
.row-t{color:var(--text);font-weight:600;white-space:nowrap}
.row-d{color:var(--muted);flex:1;min-width:0}
.arr{margin-left:auto;padding-left:16px;font-size:16px;line-height:1;color:var(--muted)}
.row:hover .row-d{color:var(--text)}
.row:hover .arr{color:var(--link);transform:translateX(4px)}

.ex{background:var(--code);border:1px solid var(--line);border-radius:6px;overflow:hidden}
.ex-head{display:flex;align-items:center;gap:24px;height:40px;padding:0 16px;border-bottom:1px solid var(--line)}
.tabs{display:flex;gap:24px;margin-right:auto;height:100%}
.tab{height:100%;font:500 12px var(--mono);color:var(--muted);border-bottom:1px solid transparent;margin-bottom:-1px}
.tab:hover{color:var(--text)}
.tab[aria-selected="true"]{color:var(--text);border-bottom-color:var(--text)}
pre{margin:0;padding:16px;overflow-x:auto;font:400 13px/24px var(--mono);color:var(--text);tab-size:2}
pre[hidden]{display:none}
/* Syntax palette, shared with /reference (reference.ts): keys #e6e8ec, strings #7cc4ff, numbers/literals #c4a7ff,
   punctuation + comments #5c6270, keywords/commands #43acfb. */
pre{color:#c9ccd3}
.t-c{color:#5c6270;font-style:italic}.t-s{color:#7cc4ff}.t-k{color:#43acfb}.t-f{color:#e6e8ec}.t-n{color:#c4a7ff}.t-p{color:#5c6270}

.foot{display:flex;justify-content:space-between;gap:8px 24px;flex-wrap:wrap;padding-block:24px 32px;border-top:1px solid var(--line)}
.foot nav{display:flex;flex-wrap:wrap}
.foot nav>*+*::before{content:"·";margin:0 8px}
.foot a:hover{color:var(--link)}

@media (prefers-reduced-motion:no-preference){
  .nav a,.copy,.tab,.row-d,.foot a{transition:color .15s var(--ease)}
  .arr{transition:color .15s var(--ease),transform .2s var(--ease)}
}
@media (max-width:880px){
  .split{grid-template-columns:1fr;row-gap:48px}
  .hero{column-gap:40px}
  .mark{width:208px;height:208px}
  .mark .edge{transform:translate(-.48px,-.48px)}
}
@media (max-width:640px){
  .top{padding-block:24px}
  main{justify-content:flex-start;gap:40px;padding-top:24px}
  .hero{grid-template-columns:1fr;row-gap:32px}
  .hero-mark{order:-1}
  .mark{width:136px;height:136px}
  .mark .edge{transform:translate(-.75px,-.75px)}
  h1{font-size:44px}
  .sub{font-size:16px}
  .facts>div{grid-template-columns:1fr;row-gap:4px}
  .row{flex-wrap:wrap;row-gap:4px;position:relative;padding-right:32px}
  .row-d{flex-basis:100%}
  .row-d .sep{display:none}
  .arr{position:absolute;right:4px;top:50%;translate:0 -50%}
}
`;

const SCRIPT = `
(() => {
  const live = document.getElementById('announce');
  const say = (t) => { if (live) { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 30); } };

  // Copy: async clipboard, falling back to a hidden textarea + execCommand on non-secure/old contexts.
  const fallbackCopy = (text) => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'sr';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  };
  document.addEventListener('click', async (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-copy]') : null;
    if (!button) return;
    const source = document.getElementById(button.getAttribute('data-copy') || '');
    // Sample-output lines (# ...) are for reading, not for the shell.
    const text = source ? (source.textContent || '').split(String.fromCharCode(10)).filter((l) => !/^# /.test(l)).join(String.fromCharCode(10)).trim() : '';
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch { ok = fallbackCopy(text); }
    const label = button.querySelector('[data-label]');
    if (label) label.textContent = ok ? 'Copied' : 'Press Ctrl+C';
    if (ok) button.setAttribute('data-done', '');
    say(ok ? 'Copied to clipboard' : 'Copy failed');
    clearTimeout(button._t);
    button._t = setTimeout(() => { if (label) label.textContent = 'Copy'; button.removeAttribute('data-done'); }, 1800);
  });

  // Tabs (WAI-ARIA pattern): click or arrow keys; the copy button follows the visible panel.
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const exCopy = document.getElementById('ex-copy');
  const select = (tab, focus) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls') || '');
      if (panel) panel.hidden = !on;
    }
    if (exCopy) exCopy.setAttribute('data-copy', tab.getAttribute('data-code') || '');
    if (focus) tab.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab, false));
    tab.addEventListener('keydown', (e) => {
      const n = tabs.length;
      const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
      if (next < 0) return;
      e.preventDefault();
      select(tabs[next], true);
    });
  });

  // Live status: re-read /ready (JSON) every 15 s while the tab is visible.
  const status = document.getElementById('status');
  if (!status) return;
  const LABELS = { ok: 'Operational', degraded: 'Degraded', down: 'Major outage', unreachable: 'API unreachable' };
  const setCheck = (name, check) => {
    const row = status.querySelector('[data-check="' + name + '"]');
    if (!row) return;
    const s = check ? check.status : 'down';
    row.setAttribute('data-status', s);
    const v = row.querySelector('[data-latency]');
    if (v) v.textContent = check && s === 'up' ? check.latencyMs + ' ms' : 'down';
  };
  let previous = status.getAttribute('data-state');
  const apply = (state, checks) => {
    status.setAttribute('data-state', state);
    const title = status.querySelector('[data-title]');
    if (title) title.textContent = LABELS[state];
    setCheck('postgres', checks && checks.postgres);
    setCheck('redis', checks && checks.redis);
    if (state !== previous) say('Status: ' + LABELS[state]);
    previous = state;
  };
  const refresh = async () => {
    if (document.hidden) return;
    try {
      const res = await fetch('/ready', { headers: { accept: 'application/json' }, cache: 'no-store', credentials: 'omit' });
      const body = await res.json();
      const c = body && body.checks;
      const ups = c ? [c.postgres, c.redis].filter((x) => x && x.status === 'up').length : 0;
      apply(ups === 2 ? 'ok' : ups === 1 ? 'degraded' : 'down', c);
    } catch {
      apply('unreachable', null);
    }
  };
  setInterval(refresh, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
`;

const MARK = `<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false"><path fill="#fff" d="${MARK_PATH}"/></svg>`;

// Hero mark: a graphite face with a 1px electric-blue edge over a solid extrusion (the face shape stacked in
// 0.5-unit steps down-right). Flat fills only — the depth comes from geometry, not gradients or shadows.
const DEPTH_STEPS = 10;
const extrusion = Array.from({ length: DEPTH_STEPS }, (_, i) => {
  const k = DEPTH_STEPS - i;
  return `<use href="#wm" transform="translate(${(k * 0.35).toFixed(2)} ${(k * 0.5).toFixed(2)})"/>`;
}).join('');
// The lit (up-left facing) edges get a 1px electric-blue line: a blue copy of the face nudged up-left, under it.
const HERO_MARK = `<svg class="mark" viewBox="13 13 99 99" aria-hidden="true" focusable="false" shape-rendering="geometricPrecision"><defs><path id="wm" d="${MARK_PATH}"/></defs><g class="side">${extrusion}</g><use class="edge" href="#wm"/><use class="face" href="#wm"/></svg>`;

function row(href: string, title: string, line: string, external: boolean): string {
  const ext = external ? ' rel="noopener"' : '';
  return `<li><a class="row" href="${esc(href)}"${ext}><span class="row-t">${esc(title)}</span><span class="row-d"><span class="sep" aria-hidden="true">— </span>${esc(line)}</span><span class="arr" aria-hidden="true">→</span></a></li>`;
}

export function renderPortal(d: PortalData): string {
  const api = d.apiOrigin;
  const docs = d.docsOrigin;
  const state = overall(d.checks);
  // A git sha is shortened; a release tag (e.g. 20261011T165629Z) is shown as is.
  const commit = d.commit && /^[0-9a-f]{12,}$/.test(d.commit) ? d.commit.slice(0, 7) : (d.commit ?? '');
  const env = d.env === 'production' ? '' : d.env;
  const release = [`v${d.version}`, commit, env].filter(Boolean).join(' · ');
  const check = (name: 'postgres' | 'redis', label: string) => {
    const c = d.checks[name];
    return `<span data-check="${name}" data-status="${c.status}">${label} <b data-latency>${c.status === 'up' ? `${c.latencyMs} ms` : 'down'}</b></span>`;
  };

  const curl = `curl ${api}/v1/auth/session\n# {"authenticated":false}`;
  const fetchJs = `const res = await fetch('${api}/v1/auth/session', { credentials: 'include' });\nconst { authenticated } = await res.json();`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#000000">
<meta name="description" content="windle API: sign-in, sessions and accounts. JSON over HTTPS.">
<title>windle API</title>
<link rel="icon" href="${FAVICON}">
<style nonce="${esc(d.nonce)}">${CSS}</style>
</head>
<body>
<header class="wrap top">
  <a class="brand" href="/" aria-label="windle API home">${MARK}<span>windle</span></a>
  <nav class="nav lbl" aria-label="Primary">
    <a href="/reference/">Reference</a>
    <a href="${esc(docs)}/api/overview/" rel="noopener">Docs</a>
    <a href="/openapi.json">OpenAPI</a>
    <a href="#status">Status</a>
  </nav>
</header>
<main class="wrap">
  <div class="hero">
  <div class="hero-text">
  <section aria-labelledby="title">
    <p class="lbl">API — ${esc(release)}</p>
    <h1 id="title">The windle API</h1>
    <p class="sub">Sign-in, sessions and accounts for windle. JSON over HTTPS.</p>
  </section>

  <dl class="facts">
    <div><dt class="lbl">Base URL</dt><dd class="url"><code id="base-url">${esc(api)}</code><button type="button" class="copy" data-copy="base-url" aria-label="Copy base URL"><span data-label>Copy</span></button></dd></div>
    <div><dt class="lbl">Auth</dt><dd>Sign-In With Solana <span class="sep">→</span> HttpOnly session cookie</dd></div>
    <div><dt class="lbl">Format</dt><dd>JSON <span class="sep">·</span> OpenAPI 3.1</dd></div>
    <div><dt class="lbl">Status</dt><dd id="status" data-state="${state.state}"><span class="dot" aria-hidden="true"></span><span data-title>${state.label}</span><span class="checks"><span class="sep">— </span>${check('postgres', 'Postgres')}<span class="sep"> · </span>${check('redis', 'Redis')}</span></dd></div>
  </dl>
  </div>
  <div class="hero-mark">${HERO_MARK}</div>
  </div>

  <div class="split">
    <nav aria-labelledby="res-h">
      <h2 class="lbl" id="res-h">Resources</h2>
      <ul class="rows">
        ${row('/reference/', 'API reference', 'every endpoint, schema and error', false)}
        ${row(`${docs}/api/overview/`, 'Documentation', 'guides and concepts', true)}
        ${row('/openapi.json', 'OpenAPI 3.1', 'machine-readable spec', false)}
      </ul>
    </nav>
    <section aria-labelledby="ex-h">
      <h2 class="lbl" id="ex-h">Example — GET /v1/auth/session</h2>
      <div class="ex">
        <div class="ex-head">
          <div class="tabs" role="tablist" aria-label="Language">
            <button type="button" class="tab" role="tab" id="tab-curl" aria-selected="true" aria-controls="ex-curl" data-code="code-curl">curl</button>
            <button type="button" class="tab" role="tab" id="tab-fetch" aria-selected="false" aria-controls="ex-fetch" data-code="code-fetch" tabindex="-1">fetch</button>
          </div>
          <button type="button" class="copy" id="ex-copy" data-copy="code-curl" aria-label="Copy example"><span data-label>Copy</span></button>
        </div>
        <pre id="ex-curl" role="tabpanel" aria-labelledby="tab-curl" tabindex="0"><code id="code-curl">${highlight(curl)}</code></pre>
        <pre id="ex-fetch" role="tabpanel" aria-labelledby="tab-fetch" tabindex="0" hidden><code id="code-fetch">${highlight(fetchJs)}</code></pre>
      </div>
    </section>
  </div>
</main>
<footer class="wrap foot lbl">
  <nav aria-label="Legal"><span>© 2026 windle</span><a href="${esc(docs)}/legal/terms/">Terms</a><a href="${esc(docs)}/legal/privacy/">Privacy</a></nav>
  <span>Built on Solana</span>
</footer>
<p id="announce" class="sr" aria-live="polite"></p>
<script nonce="${esc(d.nonce)}">${SCRIPT}</script>
</body>
</html>
`;
}
