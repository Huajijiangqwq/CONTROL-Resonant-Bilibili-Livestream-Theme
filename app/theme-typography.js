(() => {
  'use strict';
  const fonts = {
    native: '"Microsoft YaHei","PingFang SC","Segoe UI",sans-serif',
    sans: '"Segoe UI","Microsoft YaHei",sans-serif',
    serif: 'Georgia,"Songti SC",SimSun,serif',
    condensed: '"Roboto Condensed","Arial Narrow","Microsoft YaHei",sans-serif',
    mono: 'Consolas,"Microsoft YaHei",monospace',
  };
  let requested = false,
    revision = 0;
  function family(type = 'native') {
    if (type === 'condensed' && !requested) {
      requested = true;
      document.fonts.load('700 24px "Roboto Condensed"').then(() => {
        revision++;
        window.dispatchEvent(new CustomEvent('theme-font-ready'));
      });
    }
    return fonts[type] || fonts.native;
  }
  window.ThemeTypography = {
    family,
    get revision() {
      return revision;
    },
  };
})();
