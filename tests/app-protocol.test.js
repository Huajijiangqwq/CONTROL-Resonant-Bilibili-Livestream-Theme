'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { scheme, shellURL, audioURL, registerScheme, install, createHandler } = require('../desktop/app-protocol');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'control app 中文 '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const contents = new Map();
  function write(name, bytes) {
    bytes = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), bytes);
    contents.set(name, bytes);
  }
  for (const name of ['desktop/index.html', 'desktop/shell.js', 'desktop/shell.css', 'app/studio-tokens.css',
    'desktop/mac-audio.html', 'desktop/mac-audio-renderer.js', 'desktop/mac-audio-worklet.js'])
    write(name, 'fixture 中文 ' + name);
  write('desktop/icon.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 255]));
  for (const name of ['desktop/main.js', 'desktop/preload.js', 'desktop/mac-audio-preload.js',
    'desktop/credential-key.enc', 'app/bilibili-session-credentials.enc', 'package.json'])
    write(name, 'private fixture');
  return { root, contents };
}

const request = (url, method = 'GET') => ({ url, method });

test('shell serves only its five assets with matching bytes, MIME types and HEAD metadata', async t => {
  const { root, contents } = fixture(t), handler = createHandler({ root });
  const types = { 'desktop/index.html': 'text/html; charset=utf-8', 'desktop/shell.js': 'text/javascript; charset=utf-8',
    'desktop/shell.css': 'text/css; charset=utf-8', 'desktop/icon.png': 'image/png', 'app/studio-tokens.css': 'text/css; charset=utf-8' };
  for (const [name, mime] of Object.entries(types)) {
    for (const method of ['GET', 'HEAD']) {
      const result = await handler(request(scheme + '://app/' + name + '?v=1%202', method));
      assert.equal(result.status, 200, name);
      assert.equal(result.headers.get('content-type'), mime);
      assert.equal(result.headers.get('content-length'), String(contents.get(name).length));
      assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.deepEqual(Buffer.from(await result.arrayBuffer()), method === 'HEAD' ? Buffer.alloc(0) : contents.get(name));
    }
  }
});

test('private files, other asset sets, external authorities and path aliases remain inaccessible', async t => {
  const { root } = fixture(t), logs = [], handler = createHandler({ root, log: line => logs.push(line) });
  const urls = [
    'control-resonant://app/', 'control-resonant://app/missing.html',
    'control-resonant://app/desktop/main.js', 'control-resonant://app/desktop/preload.js',
    'control-resonant://app/desktop/mac-audio-preload.js', 'control-resonant://app/desktop/credential-key.enc',
    'control-resonant://app/app/bilibili-session-credentials.enc', 'control-resonant://app/package.json', audioURL,
    'https://app/desktop/index.html', 'file:///desktop/index.html', 'control-resonant://other/desktop/index.html',
    'control-resonant://app.evil/desktop/index.html', 'control-resonant://app:123/desktop/index.html',
    'control-resonant://app:/desktop/index.html', 'control-resonant://@app/desktop/index.html',
    'control-resonant://user@app/desktop/index.html', 'control-resonant://user:pass@app/desktop/index.html',
    'control-resonant://app/%64esktop/index.html', 'control-resonant://app/desktop%2findex.html',
    'control-resonant://app/desktop%5cindex.html', 'control-resonant://app/private/../desktop/index.html',
    'control-resonant://app/private/%2e%2e/desktop/index.html', 'control-resonant://app/desktop\\index.html',
    'control-resonant://app//desktop/index.html', shellURL + '#unexpected', 'not a URL',
  ];
  for (const url of urls) {
    const result = await handler(request(url));
    assert.equal(result.status, 404, url);
    assert.equal(await result.text(), 'Not found');
  }
  assert.deepEqual(logs, [], 'unmapped requests do not read or log private paths');
});

test('audio session serves only the hidden page, renderer and worklet', async t => {
  const { root, contents } = fixture(t), handler = createHandler({ root, kind: 'audio' });
  for (const name of ['desktop/mac-audio.html', 'desktop/mac-audio-renderer.js', 'desktop/mac-audio-worklet.js']) {
    const result = await handler(request(scheme + '://app/' + name));
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('content-type'), name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8');
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), contents.get(name));
  }
  for (const url of [shellURL, 'control-resonant://app/desktop/mac-audio-preload.js', 'control-resonant://app/app/studio-tokens.css'])
    assert.equal((await handler(request(url))).status, 404);
});

test('unsupported methods are rejected without serving files', async t => {
  const { root } = fixture(t), handler = createHandler({ root });
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']) {
    const result = await handler(request(shellURL, method));
    assert.equal(result.status, 405);
    assert.equal(result.headers.get('allow'), 'GET, HEAD');
    assert.equal(await result.text(), 'Method not allowed');
  }
});

test('missing and unreadable assets produce controlled responses and path-free diagnostics', async t => {
  const { root } = fixture(t), logs = [], handler = createHandler({ root, log: line => logs.push(line) });
  const file = path.join(root, 'desktop/index.html');
  fs.unlinkSync(file);
  let result = await handler(request(shellURL));
  assert.equal(result.status, 404);
  assert.equal(await result.text(), 'Not found');
  assert.deepEqual(logs, ['desktop/index.html: ENOENT']);
  fs.mkdirSync(file);
  result = await handler(request(shellURL));
  assert.equal(result.status, 500);
  assert.equal(await result.text(), 'Asset unavailable');
  assert.match(logs[1], /^desktop\/index\.html: [A-Z0-9_]+$/);
  assert(logs.every(line => !line.includes(root)));
  result = await handler(request(shellURL, 'HEAD'));
  assert.equal(result.status, 500);
  assert.equal(await result.text(), '');
});

test('scheme registration keeps CSP enforced and installs each asset handler on its own session', async t => {
  const { root } = fixture(t), registrations = [];
  registerScheme({ registerSchemesAsPrivileged(value) { registrations.push(value); } });
  assert.deepEqual(registrations, [[{ scheme: 'control-resonant', privileges: {
    standard: true, secure: true, supportFetchAPI: true, corsEnabled: true,
  } }]]);
  assert.equal(shellURL, 'control-resonant://app/desktop/index.html');
  assert.equal(audioURL, 'control-resonant://app/desktop/mac-audio.html');
  const shell = new Map(), audio = new Map();
  install({ protocol: { handle(name, handler) { shell.set(name, handler); } } }, { root });
  install({ protocol: { handle(name, handler) { audio.set(name, handler); } } }, { root, kind: 'audio' });
  assert.equal((await shell.get(scheme)(request(shellURL))).status, 200);
  assert.equal((await shell.get(scheme)(request(audioURL))).status, 404);
  assert.equal((await audio.get(scheme)(request(audioURL))).status, 200);
  assert.equal((await audio.get(scheme)(request(shellURL))).status, 404);
  assert.throws(() => createHandler({ root, kind: '__proto__' }), /Unknown application asset set/);
});
