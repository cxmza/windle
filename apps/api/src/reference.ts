// Scalar API reference at /reference, fully re-themed to the windle API portal language (portal/render.ts): flat
// black, hairlines, sharp radii, system UI text, a mono stack for code, mono uppercase labels, one electric-blue
// accent and a calm syntax palette shared with the home page example. Dark only. System fonts: no external requests.

import { VERSION } from './version.ts';

/** CSP for the reference UI: its own bundle + inline config/styles, nothing third-party, same-origin requests only. */
export const REFERENCE_CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** Marker the tests (and anyone reading the page source) can use to tell the custom theme is in place. */
export const THEME_MARKER = 'windle-reference-theme';

const MARK_PATH =
  'M30 14H32.5L44 58L55.5 14H64.5L76 58L87.5 14H90A16 16 0 0 1 106 30V90A16 16 0 0 1 90 106H73.3L60 70L46.7 106H30A16 16 0 0 1 14 90V30A16 16 0 0 1 30 14Z';
const svgUri = (fill: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><path fill="${fill}" d="${MARK_PATH}"/></svg>`,
  )}`;
const FAVICON = svgUri('#ffffff');
const SIDEBAR_MARK = svgUri('#ffffff');

// Syntax palette (same values as the portal example): keys, strings, numbers/literals, punctuation/comments, keywords.
const SYN = {
  text: '#c9ccd3',
  key: '#e6e8ec',
  string: '#7cc4ff',
  number: '#c4a7ff',
  punct: '#5c6270',
  keyword: '#43acfb',
};

const MONO = `ui-monospace, 'SF Mono', SFMono-Regular, 'JetBrains Mono', 'Cascadia Mono', Menlo, Consolas, monospace`;
const SANS = `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;

const customCss = `/* ${THEME_MARKER} */
:root, .dark-mode, .light-mode {
  --scalar-font: ${SANS};
  --scalar-font-code: ${MONO};
  --scalar-radius: 4px;
  --scalar-radius-lg: 6px;
  --scalar-radius-xl: 6px;
  --scalar-background-1: #000;
  --scalar-background-2: #0b0d12;
  --scalar-background-3: #12151c;
  --scalar-background-accent: #0c1a2b;
  --scalar-color-1: #f2f3f5;
  --scalar-color-2: #8a8f9a;
  --scalar-color-3: #5c6270;
  --scalar-color-accent: #43acfb;
  --scalar-color-ghost: #5c6270;
  --scalar-border-color: #1c1f27;
  --scalar-color-blue: #43acfb;
  --scalar-color-green: #3ee6a0;
  --scalar-color-orange: #f5b445;
  --scalar-color-yellow: #f5b445;
  --scalar-color-red: #e5787a;
  --scalar-color-purple: #c4a7ff;
  --scalar-color-alert: #f5b445;
  --scalar-color-danger: #e5787a;
  --scalar-button-1: #1c69e3;
  --scalar-button-1-color: #fff;
  --scalar-button-1-hover: #2a76ec;
  --scalar-shadow-1: none;
  --scalar-shadow-2: none;
  --scalar-lifted-brightness: 1;
  --scalar-backdrop-brightness: 1;
  --scalar-scrollbar-color: #1c1f27;
  --scalar-scrollbar-color-active: #2a2f3a;
  --scalar-focus-color: #43acfb;
  --scalar-sidebar-background-1: #000;
  --scalar-sidebar-color-1: #f2f3f5;
  --scalar-sidebar-color-2: #8a8f9a;
  --scalar-sidebar-color-active: #f2f3f5;
  --scalar-sidebar-item-hover-background: transparent;
  --scalar-sidebar-item-hover-color: #f2f3f5;
  --scalar-sidebar-item-active-background: #0b0d12;
  --scalar-sidebar-border-color: #1c1f27;
  --scalar-sidebar-search-background: #0b0d12;
  --scalar-sidebar-search-border-color: #1c1f27;
  --scalar-sidebar-search-color: #8a8f9a;
  --scalar-sidebar-indent-border: #1c1f27;
  --scalar-sidebar-indent-border-hover: #2a2f3a;
  --scalar-sidebar-indent-border-active: #43acfb;
}
body, .scalar-app { background: #000; -webkit-font-smoothing: antialiased; }
.scalar-app *, .scalar-app *::before, .scalar-app *::after { box-shadow: none !important; }
.scalar-app ::selection { background: #1c69e3; color: #fff; }

/* --- type ------------------------------------------------------------------------------------------------ */
.scalar-app h1, .scalar-app h2, .scalar-app h3, .section-header-label { color: #f2f3f5; letter-spacing: -0.02em; }
.introduction-section h1.section-header-label { font-size: 44px; line-height: 1; font-weight: 800; letter-spacing: -0.04em; }
.scalar-app h3.section-header-label { font-weight: 700; }
/* Tag headings (System / Auth / Account) and sub-section titles (Responses, Body, Parameters): mono labels. */
.tag-section-container h2.section-header-label,
.section-header-label--rule,
.scalar-app .request-body-title, .scalar-app .parameters-title {
  font: 500 12px/16px ${MONO} !important; letter-spacing: 0.14em !important; text-transform: uppercase; color: #8a8f9a !important;
}
.section-header-label--rule { padding-bottom: 12px; border-color: #1c1f27 !important; }
.scalar-app .markdown { color: #8a8f9a; }
.scalar-app .markdown strong { color: #f2f3f5; }
.scalar-app .markdown a, .scalar-app a.text-c-accent { color: #43acfb; text-decoration-color: #43acfb55; text-underline-offset: 3px; }
.scalar-app .markdown code, .scalar-app :not(pre) > code {
  font-family: ${MONO}; font-size: 0.84em; font-weight: 400 !important; color: #c9ccd3; background: #0b0d12; border: 1px solid #1c1f27; border-radius: 3px; padding: 1px 5px;
}
.badge { border-radius: 3px !important; font: 500 11px/16px ${MONO} !important; letter-spacing: 0.06em; background: #0b0d12 !important; border-color: #1c1f27 !important; color: #8a8f9a !important; }
/* Schema trees: mono property names, muted types, "required" as a quiet mono tag (no off-palette orange). */
.scalar-app .property-name { font-family: ${MONO}; font-weight: 500 !important; color: #e6e8ec; }
.scalar-app .property-detail, .scalar-app .property-detail-value { color: #8a8f9a; font-family: ${MONO}; font-size: 12px; }
.scalar-app .property-required, .scalar-app .required {
  color: #43acfb !important; font: 500 10px/14px ${MONO} !important; letter-spacing: 0.1em; text-transform: uppercase;
}
.scalar-app .property-enum-value, .scalar-app .property-const { font-family: ${MONO}; color: #c4a7ff; }

/* --- cards, code ---------------------------------------------------------------------------------------- */
.scalar-card { background: #0b0d12 !important; border: 1px solid #1c1f27 !important; border-radius: 6px !important; overflow: hidden; }
.scalar-card-header { background: #0b0d12 !important; border-color: #1c1f27 !important; font-family: ${MONO}; font-size: 12px; }
.scalar-card-footer, .request-card-footer { background: #0b0d12 !important; border-color: #1c1f27 !important; }
.scalar-card .divide-y > *, .scalar-card.divide-y > * { border-color: #1c1f27 !important; }
.scalar-code-block, .scalar-code-block pre, .request-editor-section .code-snippet { background: #0b0d12 !important; }
.scalar-app pre, .scalar-app code.hljs { font-family: ${MONO} !important; font-size: 13px; line-height: 1.7; }
.scalar-app .hljs { color: ${SYN.text} !important; background: transparent !important; }
.scalar-app .hljs .hljs-attr, .scalar-app .hljs .hljs-attribute, .scalar-app .hljs .hljs-property,
.scalar-app .hljs .hljs-variable, .scalar-app .hljs .hljs-template-variable, .scalar-app .hljs .hljs-params { color: ${SYN.key} !important; }
.scalar-app .hljs .hljs-string, .scalar-app .hljs .hljs-regexp, .scalar-app .hljs .hljs-subst { color: ${SYN.string} !important; }
.scalar-app .hljs .hljs-number, .scalar-app .hljs .hljs-literal, .scalar-app .hljs .hljs-symbol { color: ${SYN.number} !important; }
.scalar-app .hljs .hljs-punctuation, .scalar-app .hljs .hljs-operator { color: ${SYN.punct} !important; }
.scalar-app .hljs .hljs-comment, .scalar-app .hljs .hljs-quote { color: ${SYN.punct} !important; font-style: italic; }
.scalar-app .hljs .hljs-keyword, .scalar-app .hljs .hljs-built_in, .scalar-app .hljs .hljs-meta,
.scalar-app .hljs .hljs-title, .scalar-app .hljs .hljs-name, .scalar-app .hljs .hljs-section, .scalar-app .hljs .hljs-type { color: ${SYN.keyword} !important; font-weight: 400 !important; }
.scalar-app .hljs .line::before, .scalar-app .line-numbers, .scalar-app [class*="line-number"] { color: #2f3440 !important; }
.operation-path { color: #c9ccd3 !important; }
.operation-path em { color: #f2f3f5 !important; }

/* Copy buttons: flat mono chip; Scalar swaps the label to "Copied" — we just make it read as a label. */
.scalar-code-copy, .scalar-code-copy-backdrop, .scalar-code-copy > .bg-inherit { background: #12151c !important; border-radius: 3px !important; }
.scalar-code-copy { color: #8a8f9a !important; border: 1px solid #1c1f27; }
.scalar-code-copy:hover { color: #f2f3f5 !important; }
.scalar-code-copy .group\\/copy-label { font: 500 10px/14px ${MONO}; letter-spacing: 0.12em; text-transform: uppercase; color: #f2f3f5; }

/* Response tabs + checkbox. */
.scalar-card-header-tabs .tab { font: 500 12px/22px ${MONO}; color: #8a8f9a; border-radius: 0 !important; background: transparent !important; position: relative; }
.scalar-card-header-tabs .tab:hover { color: #f2f3f5; }
.scalar-card-header-tabs .tab-selected { color: #f2f3f5 !important; }
.scalar-card-header-tabs .tab-selected::after { content: ''; position: absolute; left: 0; right: 0; bottom: -8px; height: 1px; background: #f2f3f5; }
.scalar-app .scalar-card-checkbox { font: 500 11px/16px ${MONO} !important; letter-spacing: 0.1em; text-transform: uppercase; color: #8a8f9a !important; }
.scalar-app .scalar-card-checkbox:hover { color: #f2f3f5 !important; }
.scalar-card-checkbox-checkmark { border-radius: 2px !important; border-color: #2a2f3a !important; background: #000 !important; }
.scalar-card-checkbox-input:checked ~ .scalar-card-checkbox-checkmark { background: #1c69e3 !important; border-color: #1c69e3 !important; }

/* --- HTTP methods: flat mono chips, colour-coded but restrained ------------------------------------------- */
.sidebar-heading-type, .request-method {
  font: 600 10px/14px ${MONO} !important; letter-spacing: 0.06em; text-transform: uppercase;
  padding: 1px 5px; border-radius: 2px; height: auto !important; align-self: center !important;
  color: #43acfb !important; background: #0c1a2b;
}
.request-method { margin-right: 10px; display: inline-block; vertical-align: 1px; }
.sidebar-heading-type--post, section[id*="/POST/"] .request-method { color: #fff !important; background: #1c69e3; }
.sidebar-heading-type--delete, section[id*="/DELETE/"] .request-method { color: #e5787a !important; background: #2a1316; }
.sidebar-heading-type--put, .sidebar-heading-type--patch,
section[id*="/PUT/"] .request-method, section[id*="/PATCH/"] .request-method { color: #c4a7ff !important; background: #1b1630; }

/* Primary action: flat electric-blue button, mono label. */
.show-api-client-button { background: #1c69e3 !important; border-radius: 3px !important; font: 600 11px/22px ${MONO} !important; letter-spacing: 0.1em; text-transform: uppercase; padding: 1px 10px !important; }
.show-api-client-button:hover { background: #2a76ec !important; }
.scalar-app .scalar-button-solid, .scalar-app .bg-btn-1 { border-radius: 3px; }

/* --- sidebar ---------------------------------------------------------------------------------------------- */
.t-doc__sidebar { border-color: #1c1f27 !important; }
.t-doc__sidebar::before {
  content: 'windle API'; display: flex; align-items: center; flex: none; height: 64px; padding: 0 16px 0 50px;
  font: 700 16px/1 ${SANS}; letter-spacing: -0.02em; color: #f2f3f5;
  background: url("${SIDEBAR_MARK}") no-repeat 16px center / 22px 22px;
  border-bottom: 1px solid #1c1f27;
}
.t-doc__sidebar::after {
  content: 'v${VERSION}'; position: absolute; top: 21px; right: 16px;
  font: 500 10px/20px ${MONO}; letter-spacing: 0.08em; color: #8a8f9a; padding: 0 6px; border: 1px solid #1c1f27; border-radius: 3px;
}
.t-doc__sidebar { position: sticky; }
.t-doc__sidebar button.bg-sidebar-b-search { border-radius: 4px !important; }
.t-doc__sidebar .sidebar-search-placeholder { font-family: ${SANS}; }
/* Tag groups: mono uppercase headers. */
.t-doc__sidebar li[data-sidebar-id*="/tag/"]:not([data-sidebar-id*="/tag/"] li) > div > a {
  font: 500 11px/16px ${MONO} !important; letter-spacing: 0.14em; text-transform: uppercase; color: #8a8f9a !important;
  margin-top: 12px; background: transparent !important;
}
.t-doc__sidebar li[data-sidebar-id*="/tag/"]:not([data-sidebar-id*="/tag/"] li) > div > a:hover { color: #f2f3f5 !important; }
.t-doc__sidebar li[data-sidebar-id*="/tag/"]:not([data-sidebar-id*="/tag/"] li) > div > button { top: calc(1lh + 12px) !important; }
.t-doc__sidebar a { border-radius: 3px !important; position: relative; }
.t-doc__sidebar ul ul a .group\\/button-label { transition: none; }
.t-doc__sidebar ul ul a::after {
  content: ''; position: absolute; left: 8px; right: 8px; bottom: 4px; height: 1px; background: #43acfb;
  transform: scaleX(0); transform-origin: left; opacity: 0;
}
.t-doc__sidebar ul ul a:hover::after { transform: scaleX(1); opacity: 1; }
.t-doc__sidebar ul ul a[aria-current], .t-doc__sidebar ul ul a.active, .t-doc__sidebar li[aria-selected="true"] > a { color: #f2f3f5 !important; }

/* --- clutter: AI agent / MCP (third-party, blocked by our CSP anyway), "Powered by", client libraries, flare - */
.t-doc__sidebar .px-3.pt-3 > button:not(:first-child),
.t-doc__sidebar .darklight-reference,
.t-doc__sidebar a[href*="scalar.com"],
.scalar-app a[href*="scalar.com"],
.scalar-mcp-layer, .mcp-nav, .mcp-logo,
.agent-button-container, .ask-agent-scalar-input,
.scalar-reference-intro-clients, .client-libraries,
.section-flare,
.operation-auth .scalar-button { display: none !important; }

/* --- motion: transform/opacity only, <= 200 ms, off under prefers-reduced-motion ------------------------- */
@media (prefers-reduced-motion: no-preference) {
  html { scroll-behavior: smooth; }
  .t-doc__sidebar ul ul a::after { transition: transform 180ms cubic-bezier(.2,.7,.2,1), opacity 180ms; }
  .t-doc__sidebar ul ul a .group\\/button-label { transition: transform 180ms cubic-bezier(.2,.7,.2,1); }
  .t-doc__sidebar ul ul a:hover .group\\/button-label { transform: translateX(2px); }
  .scalar-card-header-tabs .tab-selected::after { animation: windle-fade 160ms ease-out both; }
  .response-card .scalar-code-block, .response-card [role="tabpanel"], .scalar-card-content.request-editor-section > * {
    animation: windle-fade 180ms ease-out both;
  }
  .scalar-code-copy .group\\/copy-label { transition: opacity 150ms; }
  .show-api-client-button { transition: background-color 150ms; }
  @supports (animation-timeline: view()) {
    .section-container > section.section, .tag-section-container > section.section, section.section[id*="/tag/"] {
      animation: windle-rise linear both; animation-timeline: view(); animation-range: entry 0% entry 24%;
    }
  }
}
@keyframes windle-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes windle-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
`;

// Code samples: curl, fetch and a couple of common runtimes. Everything else is noise for this API.
const hiddenClients = {
  c: true,
  clojure: true,
  csharp: true,
  dart: true,
  fsharp: true,
  go: true,
  java: true,
  julia: true,
  kotlin: true,
  objc: true,
  ocaml: true,
  php: true,
  powershell: true,
  r: true,
  ruby: true,
  rust: true,
  swift: true,
  shell: [...(['httpie', 'wget'] as const)],
  js: [...(['jquery', 'xhr', 'axios', 'ofetch'] as const)],
  node: [...(['axios', 'ofetch', 'undici'] as const)],
  python: [...(['python3', 'requests', 'aiohttp', 'httpx_async'] as const)],
};

export function referenceConfiguration() {
  return {
    url: '/openapi.json',
    theme: 'none' as const,
    darkMode: true,
    forceDarkModeState: 'dark' as const,
    hideDarkModeToggle: true,
    withDefaultFonts: false,
    hideClientButton: true,
    hideModels: true,
    defaultOpenAllTags: true,
    showDeveloperTools: 'never' as const,
    documentDownloadType: 'json' as const,
    telemetry: false,
    agent: { disabled: true },
    mcp: { disabled: true },
    defaultHttpClient: { targetKey: 'shell' as const, clientKey: 'curl' as const },
    hiddenClients,
    favicon: FAVICON,
    metaData: {
      title: 'windle API reference',
      description: 'Interactive reference for the windle API: Sign-In With Solana, sessions and accounts.',
    },
    customCss,
  };
}
