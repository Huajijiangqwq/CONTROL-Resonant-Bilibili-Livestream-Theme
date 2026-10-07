'use strict';
// Stable local OBS address and validated theme documents. No live-room state.
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path');
const root = __dirname;
const releaseProfile = require('./release-profile');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};
let cachedThemeModel,
  modelModified = 0;
function themeModel() {
  const file = path.join(root, 'theme-editor-model.js'),
    stamp = fs.statSync(file).mtimeMs;
  if (!cachedThemeModel || stamp !== modelModified) {
    delete require.cache[require.resolve(file)];
    cachedThemeModel = require(file);
    modelModified = stamp;
  }
  return cachedThemeModel;
}
function createPreviewServer({
  port = 8791,
  release = null,
  onStop = null,
  stopToken = null,
  dataRoot = root,
  development = process.env.CONTROL_DEV === '1',
} = {}) {
  development = releaseProfile.developmentEnabled(development);
  const published = require('./theme-publish-server.js').createThemePublish({ dataRoot, model: themeModel });
  const obs = require('./obs-bridge.js').createObsBridge({ root: dataRoot, model: themeModel, publication: published });
  const timer = require('./live-timer-server.js').createTimer({ dataRoot });
  const editorMessages = require('./editor-message-server.js').createEditorMessages({ dataRoot });
  const library = require('./project-library-server.js').createProjectLibrary({ dataDirectory: dataRoot });
  const studioEvents = require('./studio-events-server.js').createStudioEvents({ timer, messages: editorMessages, published, obsPublished: obs.managed });
  const server = http.createServer(async (req, res) => {
    let requestHost;
    try {
      requestHost = new URL('http://' + req.headers.host).hostname;
    } catch {}
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(requestHost)) {
      res.writeHead(403).end();
      return;
    }
    if (req.url === '/api/release-health' && req.method === 'GET' && release) {
      res
        .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify(release));
      return;
    }
    if (req.url === '/api/release-stop' && req.method === 'POST') {
      if (!stopToken || req.headers.authorization !== 'Bearer ' + stopToken || req.headers.origin) {
        res.writeHead(403).end();
        return;
      }
      res.writeHead(200).end('Stopping');
      setTimeout(() => onStop?.(), 30);
      return;
    }
    if (req.url === '/api/studio-events') {
      studioEvents.handle(req, res);
      return;
    }
    if (req.url?.startsWith('/api/projects')) {
      try { await library.handle(req, res, new URL(req.url, 'http://' + req.headers.host)); }
      catch { if (!res.headersSent) res.writeHead(500).end('Project storage unavailable'); else res.end(); }
      return;
    }
    if (req.url?.startsWith('/api/theme-publish')) {
      published.handle(req, res);
      return;
    }
    if (req.url?.startsWith('/api/editor-messages/')) {
      editorMessages.handle(req, res);
      return;
    }
    if (req.url?.startsWith('/api/live-timer')) {
      timer.handle(req, res);
      return;
    }
    if (req.url?.startsWith('/api/obs/')) {
      obs.handle(req, res);
      return;
    }
    if (req.method === 'POST' && req.url === '/api/themes') {
      const boundPort = server.address()?.port || port;
      const allowed = ['http://127.0.0.1:' + boundPort, 'http://localhost:' + boundPort];
      if (
        !allowed.includes(req.headers.origin) ||
        !String(req.headers['content-type']).startsWith('application/json')
      ) {
        res.writeHead(403).end();
        return;
      }
      let size = 0,
        chunks = [];
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > 40 * 1024 * 1024) {
          res.writeHead(413).end();
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', async () => {
        try {
          const raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (raw.format !== 'control-theme' || raw.version !== 1 || !Array.isArray(raw.layers))
            throw Error('format');
          const doc = require('./project-library-server.js').cleanDocument(raw, themeModel()),
            text = JSON.stringify(doc),
            id = require('node:crypto')
              .createHash('sha256')
              .update(text)
              .digest('hex')
              .slice(0, 24),
            dir = path.join(dataRoot, 'theme-projects');
          await fs.promises.mkdir(dir, { recursive: true });
          const file = path.join(dir, id + '.json');
          try {
            await fs.promises.writeFile(file, text, { flag: 'wx' });
          } catch (e) {
            if (e.code !== 'EEXIST') throw e;
          }
          res
            .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
            .end(JSON.stringify({ id }));
        } catch {
          res.writeHead(400).end('Invalid theme document');
        }
      });
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let file;
    try {
      const url = new URL(req.url, 'http://' + req.headers.host);
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw Error('host');
      if (url.pathname === '/api/preview-health') {
        res
          .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          .end(
            req.method === 'HEAD'
              ? undefined
              : JSON.stringify({ service: 'hiss-preview', pid: process.pid, obsBridge: 2 }),
          );
        return;
      }
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'theme-editor.html';
      const disposition = releaseProfile.pageDisposition(relative, url, development);
      if (disposition === 'deny') throw Error('development-only');
      if (disposition === 'live') {
        res.writeHead(302, { Location: 'live.html', 'Cache-Control': 'no-store' }).end();
        return;
      }
      file = path.resolve(root, relative);
      if (
        /^(?:theme-live(?:[\\/]|$)|(?:timer-state|editor-message-state)\.json(?:\.tmp)?$|(?:audio|now-playing)-settings\.json$)/i.test(relative) ||
        /^bilibili-(?:server|protocol|qr-auth|session-store|credentials)\.js$/i.test(relative) ||
        /^(?:external-now-playing(?:[\\/]|$)|now-playing-setup\.js$)/i.test(relative) ||
        /^release-profile\.js$/i.test(relative) ||
        /(?:^|[\\/])bilibili-(?:open|session)-credentials\.enc(?:\.tmp)?$/i.test(relative) ||
        /(?:^|[\\/])credential-key\.enc(?:\.tmp)?$/i.test(relative) ||
        !file.startsWith(root + path.sep) ||
        relative.split(/[\\/]/).some((x) => x.startsWith('.')) ||
        !types[path.extname(file).toLowerCase()]
      )
        throw Error('path');
      if (/^theme-projects\/[a-f0-9]{24}\.json$/.test(relative))
        file = path.join(dataRoot, relative);
    } catch {
      res.writeHead(404).end();
      return;
    }
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) {
        res.writeHead(404).end();
        return;
      }
      if (path.basename(file) === 'runtime-config.js' || (!development && path.extname(file) === '.html')) {
        fs.readFile(file, 'utf8', (readError, text) => {
          if (readError) { res.writeHead(500).end(); return; }
          const content = path.basename(file) === 'runtime-config.js'
            ? releaseProfile.runtimeConfig(text, development) : releaseProfile.publicHtml(text);
          res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff', 'Content-Length': Buffer.byteLength(content) });
          res.end(req.method === 'HEAD' ? undefined : content);
        });
        return;
      }
      const headers = {
        'Content-Type': types[path.extname(file).toLowerCase()],
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'bytes',
      };
      let start = 0,
        end = stat.size - 1,
        status = 200;
      if (req.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!match || (!match[1] && !match[2])) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size }).end();
          return;
        }
        if (!match[1]) start = Math.max(0, stat.size - Number(match[2]));
        else {
          start = Number(match[1]);
          if (match[2]) end = Math.min(end, Number(match[2]));
        }
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start < 0 ||
          start > end ||
          start >= stat.size
        ) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size }).end();
          return;
        }
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length'] = Math.max(0, end - start + 1);
      res.writeHead(status, headers);
      if (req.method === 'HEAD' || stat.size === 0) {
        res.end();
        return;
      }
      const stream = fs.createReadStream(file, { start, end });
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    });
  });
  return {
    server,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', reject);
          resolve(server.address());
        });
      }),
    close: () =>
      new Promise((resolve) => {
        studioEvents.close();
        obs.close();
        timer.close();
        editorMessages.close();
        published.close();
        server.close(resolve);
      }),
  };
}
module.exports = { createPreviewServer };
if (require.main === module) {
  const app = createPreviewServer();
  app
    .listen()
    .then(() => console.log('Theme preview: http://127.0.0.1:8791/live.html'))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
