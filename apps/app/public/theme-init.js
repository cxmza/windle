(() => {
  var root = document.documentElement;
  var prefs = {};
  var parsed;
  try {
    parsed = JSON.parse(localStorage.getItem('windle.prefs.v1') || '{}');
  } catch {
    parsed = null;
  }
  if (parsed && typeof parsed === 'object') prefs = parsed;
  function media(query) {
    return typeof matchMedia === 'function' && matchMedia(query).matches;
  }
  function pick(key, allowed, fallback) {
    return allowed.indexOf(prefs[key]) === -1 ? fallback : prefs[key];
  }
  var theme = pick('theme', ['system', 'light', 'dark'], 'system');
  if (theme === 'system') theme = media('(prefers-color-scheme: dark)') ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
  var chrome = document.querySelector('meta[name="theme-color"]');
  if (chrome) chrome.setAttribute('content', theme === 'light' ? '#f4f4f4' : '#000000');
  if (pick('contrast', ['off', 'on'], 'off') === 'on' || media('(prefers-contrast: more)')) {
    root.setAttribute('data-contrast', 'more');
  }
  var size = pick('textSize', ['small', 'medium', 'large'], 'medium');
  if (size !== 'medium') root.setAttribute('data-text-size', size);
  var font = pick('font', ['inter', 'system', 'atkinson', 'mono'], 'inter');
  if (font !== 'inter') root.setAttribute('data-font', font);
  if (pick('motion', ['system', 'reduced'], 'system') === 'reduced') root.setAttribute('data-motion', 'reduced');
  if (pick('density', ['comfortable', 'compact'], 'comfortable') === 'compact')
    root.setAttribute('data-density', 'compact');
})();
