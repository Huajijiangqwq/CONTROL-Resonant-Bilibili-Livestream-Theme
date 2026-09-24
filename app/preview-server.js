'use strict';
// Stable local OBS address and validated theme documents. No live-room state.
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path');
const root = __dirname;
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
} = {}) {
  const obs = require('./obs-bridge.js').createObsBridge({ root: dataRoot, model: themeModel });
  const server = http.createServer((req, res) => {
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
          const doc = themeModel().normalize(raw),
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
      file = path.resolve(root, relative);
      if (
        /^(?:theme-live(?:[\\/]|$)|(?:audio|now-playing)-settings\.json$)/i.test(relative) ||
        /^bilibili-(?:server|protocol|qr-auth|session-store|open-(?:store|protocol|relay))\.js$/i.test(relative) ||
        /^(?:external-now-playing(?:[\\/]|$)|now-playing-setup\.js$)/i.test(relative) ||
        /(?:^|[\\/])bilibili-(?:open|session)-credentials\.enc(?:\.tmp)?$/i.test(relative) ||
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
        obs.close();
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
