// Runs before the first paint so the page never flashes the wrong theme.
// Kept in sync with src/theme/theme.ts (same storage key and values).
(function () {
  var pref = 'system'
  try {
    var saved = localStorage.getItem('storely.theme')
    if (saved === 'light' || saved === 'dark') pref = saved
  } catch { /* storage blocked: follow the system */ }
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
})()
