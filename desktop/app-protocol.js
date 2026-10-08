'use strict';
const fs = require('node:fs'), path = require('node:path');

const scheme = 'control-resonant';
const shellURL = scheme + '://app/desktop/index.html';
const audioURL = scheme + '://app/desktop/mac-audio.html';
const assets = Object.freeze({
  shell: Object.freeze({
    '/desktop/index.html': 'text/html; charset=utf-8',
    '/desktop/shell.js': 'text/javascript; charset=utf-8',
    '/desktop/shell.css': 'text/css; charset=utf-8',
    '/desktop/icon.png': 'image/png',
    '/app/studio-tokens.css': 'text/css; charset=utf-8',
  }),
  audio: Object.freeze({
    '/desktop/mac-audio.html': 'text/html; charset=utf-8',
    '/desktop/mac-audio-renderer.js': 'text/javascript; charset=utf-8',
    '/desktop/mac-audio-worklet.js': 'text/javascript; charset=utf-8',
  }),
});

// Call once before app.whenReady(). Each session installs its own handler later.
function registerScheme(protocol) {
  protocol.registerSchemesAsPrivileged([{ scheme, privileges: {
    standard: true, secure: true, supportFetchAPI: true, corsEnabled: true,
  } }]);
}

function createHandler({ root, kind = 'shell', log } = {}) {
  if (!Object.hasOwn(assets, kind)) throw Error('Unknown application asset set');
  const files = assets[kind], base = path.resolve(root);
  const response = (text, status, method, extra = {}) => new Response(method === 'HEAD' ? null : text, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store',
      'x-content-type-options': 'nosniff', ...extra },
  });
  return async request => {
    const method = request.method;
    if (method !== 'GET' && method !== 'HEAD')
      return response('Method not allowed', 405, method, { allow: 'GET, HEAD' });
    let url, rawAuthority, rawPath;
    try {
      const raw = String(request.url);
      url = new URL(raw);
      const parts = raw.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]*)(\/[^?#]*)?/i);
      rawAuthority = parts?.[1]; rawPath = parts?.[2];
    } catch { return response('Not found', 404, method); }
    // Match fixed assets, never resolve a caller-supplied path against the disk.
    // Reject encoded/normalized path aliases before looking up the mapping.
    if (url.protocol !== scheme + ':' || url.hostname !== 'app' || rawAuthority !== 'app' || url.port ||
        url.username || url.password || url.hash || !rawPath || /[%\\]/.test(rawPath) ||
        rawPath !== url.pathname || !Object.hasOwn(files, rawPath))
      return response('Not found', 404, method);
    const asset = rawPath.slice(1);
    try {
      const bytes = await fs.promises.readFile(path.join(base, asset));
      return new Response(method === 'HEAD' ? null : bytes, { headers: {
        'content-type': files[rawPath], 'content-length': String(bytes.length),
        'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
      } });
    } catch (error) {
      const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'UNKNOWN';
      try { if (log) log(asset + ': ' + code); } catch {}
      const status = code === 'ENOENT' || code === 'ENOTDIR' ? 404 : 500;
      return response(status === 404 ? 'Not found' : 'Asset unavailable', status, method);
    }
  };
}

function install(session, options) {
  session.protocol.handle(scheme, createHandler(options));
}

module.exports = { scheme, shellURL, audioURL, registerScheme, install, createHandler };
