// Alternate preview ports keep all four local services in the same installation.
(() => {
  'use strict';
  const port = Number(location.port) || 8791;
  window.ThemeServices = Object.freeze({
    bilibili: `http://127.0.0.1:${port + 2}`,
    audio: `http://127.0.0.1:${port + 3}`,
    music: `http://127.0.0.1:${port + 4}`,
  });
})();
