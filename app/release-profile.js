'use strict';
// Public runtime and source checkout share the renderer, but not developer tools.
const fs = require('node:fs');
const path = require('node:path');

function developmentAsset(name) {
  const relative = path.posix.normalize(String(name).replaceAll('\\', '/').replace(/^\/+/, ''));
  return /^(?:monitor(?:[-.][^/]+)|sc-compare\.(?:html|css|js)|(?:normal|gift|levitation)\.(?:html|css|js)|simulation-controls\.(?:css|js))$/i.test(relative);
}

function developmentEnabled(requested = process.env.CONTROL_DEV === '1') {
  // A packaged public runtime cannot reveal developer controls through URL flags
  // or an inherited environment variable. The full source checkout has no marker.
  return requested === true && !fs.existsSync(path.join(__dirname, '..', 'PUBLIC-RELEASE.json'));
}

function runtimeConfig(text, development) {
  return String(text).replace('/* CONTROL_DEVELOPMENT */ false',
    '/* CONTROL_DEVELOPMENT */ ' + (development === true ? 'true' : 'false'));
}

function publicHtml(text) {
  return String(text).replace(/<!-- DEVELOPMENT_ONLY_START -->[\s\S]*?<!-- DEVELOPMENT_ONLY_END -->/g, '');
}

function pageDisposition(name, url, development) {
  if (developmentAsset(name) && !development) return 'deny';
  // simulation.html is also the production chat renderer. Keep its embedded
  // contract intact; only the old standalone laboratory is removed from public UI.
  if (path.posix.normalize(String(name).replaceAll('\\', '/')) === 'simulation.html' && !development && url.searchParams.get('embed') !== 'main') return 'live';
  return 'serve';
}

module.exports = { developmentAsset, developmentEnabled, runtimeConfig, publicHtml, pageDisposition };
