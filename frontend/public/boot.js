// Runs before the app loads: applies the saved theme and language so the
// first paint is already correct (no white flash, Arabic already right-to-left).
(function () {
  try {
    // Saved choice first; otherwise follow the phone's own light/dark setting.
    var theme = localStorage.getItem('theme');
    if (!theme && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) theme = 'light';
    if (theme === 'light') document.documentElement.classList.remove('dark');
    var lang = localStorage.getItem('lang') || ((navigator.language || '').indexOf('ar') === 0 ? 'ar' : 'en');
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    if (lang === 'ar') {
      document.addEventListener('DOMContentLoaded', function () {
        var t = document.getElementById('splash-text');
        if (t) t.textContent = 'جارٍ تشغيل السيرفر… قد يستغرق دقيقة.';
      });
    }
  } catch (e) { /* storage blocked */ }
})();
