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
    // Loading screen messages: say what's happening as the wait gets longer.
    var steps = lang === 'ar'
      ? [[4000, 'جارٍ تشغيل السيرفر…'], [15000, 'السيرفر المجاني بيصحى بعد الخمول، لحظات…'], [35000, 'قربنا خلاص…']]
      : [[4000, 'Waking the server up…'], [15000, 'Free servers nap when nobody uses them. Nearly awake…'], [35000, 'Almost there…']];
    document.addEventListener('DOMContentLoaded', function () {
      var t = document.getElementById('splash-text');
      if (!t) return;
      steps.forEach(function (s) {
        setTimeout(function () { t.textContent = s[1]; t.className = 'on'; }, s[0]);
      });
    });
  } catch (e) { /* storage blocked */ }
})();
