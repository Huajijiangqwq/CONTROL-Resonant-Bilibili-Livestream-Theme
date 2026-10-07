// Alternate preview ports keep all four local services in the same installation.
(() => {
  'use strict';
  const port = Number(location.port) || 8791;
  const development = /* CONTROL_DEVELOPMENT */ false;
  window.ThemeBuild = Object.freeze({ development });
  window.ThemeDevelopment = development && new URLSearchParams(location.search).get('dev') === '1';
  window.ThemeServices = Object.freeze({
    bilibili: `http://127.0.0.1:${port + 2}`,
    audio: `http://127.0.0.1:${port + 3}`,
    music: `http://127.0.0.1:${port + 4}`,
  });
})();
