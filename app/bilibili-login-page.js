(() => {
  'use strict';
  const base = window.ThemeServices?.bilibili || location.origin;
  window.BilibiliLogin.mount(document.getElementById('login'), { base });
  document.getElementById('liveGuest').closest('label').hidden = true;
})();
