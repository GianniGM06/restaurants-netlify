/* Thème appliqué avant le premier paint (anti-flash).
   Script classique bloquant, chargé dans <head> — externe pour rester
   compatible avec un CSP sans 'unsafe-inline'. Le toggle vit dans theme.js. */
(function () {
  var saved = localStorage.getItem('theme');
  var theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-bs-theme', theme);
})();
