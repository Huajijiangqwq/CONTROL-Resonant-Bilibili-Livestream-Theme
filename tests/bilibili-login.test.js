'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');
const { createSessionStore } = require('../app/bilibili-session-store');
const { createQrAuth } = require('../app/bilibili-qr-auth');
const { startServer, BilibiliRelay } = require('../app/bilibili-server');
const { normalize: normalizeTheme, create } = require('../app/theme-editor-model');
const { excluded } = require('../scripts/package');
const { config, requestBody, normalizeOpen, sign } = require('../app/bilibili-open-protocol');
const { protect } = require('../app/bilibili-open-store');
const QR = { code: 0, data: { url: 'https://account.bilibili.com/h5/account-h5/auth/scan-web?qrcode_key=fixture', qrcode_key: 'fixture-1234567890' } };
const response = (body, headers = {}) => new Response(JSON.stringify(body), { headers });
const memory = () => { let value = ''; return { save: s => { value = s; }, read: () => value, info: () => ({ saved: !!value }), clear: () => { value = ''; } }; };
async function port() { const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; }
test('QR waiting, scanned and successful login save once, expose no session', async () => {
  let time = 0, calls = 0;
  const store = memory(), steps = [QR, { code: 0, data: { code: 86101 } }, { code: 0, data: { code: 86090 } }];
  const qr = createQrAuth(store, { now: () => time, fetch: async () => { calls++; return steps.length ? response(steps.shift()) : response({ code: 0, data: { code: 0 } }, { 'Set-Cookie': 'SESSDATA=fixture-session; Path=/; HttpOnly' }); } });
  const start = await qr.start(); assert.match(start.image, /^data:image\/svg\+xml;base64,/);
  assert.equal((await qr.poll(start.id)).phase, 'waiting');
  assert.equal((await qr.poll(start.id)).phase, 'waiting'); assert.equal(calls, 2);
  time += 2000; assert.equal((await qr.poll(start.id)).phase, 'scanned');
  time += 2000; const done = await qr.poll(start.id); assert.equal(done.phase, 'success');
  assert.equal(store.read(), 'fixture-session'); assert(!JSON.stringify(done).includes('fixture-session'));
  await qr.poll(start.id); assert.equal(calls, 4);
});
test('new cross-domain ticket captures Set-Cookie; legacy callback also works', async () => {
  for (const legacy of [false, true]) {
    const store = memory(), urls = [];
    const qr = createQrAuth(store, { fetch: async (url, opts) => {
      urls.push(url); assert.equal(opts.redirect, 'manual');
      if (urls.length === 1) return response(QR);
      if (urls.length === 2) return response({ code: 0, data: { code: 0, url: 'https://passport.bilibili.com/x/passport-login/web/crossDomain?' + (legacy ? 'SESSDATA=fixture-legacy%2C1' : 'ticket=test-only') } });
      return response({}, { 'Set-Cookie': 'SESSDATA=fixture-new; HttpOnly' });
    } });
    const start = await qr.start(); assert.equal((await qr.poll(start.id)).phase, 'success');
    assert.equal(store.read(), legacy ? 'fixture-legacy,1' : 'fixture-new'); assert.equal(urls.length, legacy ? 2 : 3);
  }
});
test('callback redirects cannot escape allowlist or leak into error messages', async () => {
  const store = memory(); let calls = 0;
  const qr = createQrAuth(store, { fetch: async () => ++calls === 1 ? response(QR) : response({ code: 0, data: { code: 0, url: 'https://attacker.invalid/?SESSDATA=secret-fixture' } }) });
  const start = await qr.start(), result = await qr.poll(start.id);
  assert.equal(result.phase, 'error'); assert.equal(store.read(), ''); assert.equal(calls, 2); assert(!JSON.stringify(result).includes('secret-fixture'));
});
test('expiry and cancelled in-flight success never persist credentials', async () => {
  let time = 0, resolve, calls = 0;
  const store = memory(), qr = createQrAuth(store, { now: () => time, fetch: async () => ++calls === 1 ? response(QR) : new Promise(r => { resolve = r; }) });
  const start = await qr.start(), pending = qr.poll(start.id); qr.cancel(start.id);
  resolve(response({ code: 0, data: { code: 0 } }, { 'Set-Cookie': 'SESSDATA=must-not-save' }));
  assert.equal((await pending).phase, 'cancelled'); assert.equal(store.read(), '');
  calls = 0; const newer = await qr.start(); time = 180001;
  assert.equal((await qr.poll(newer.id)).phase, 'expired'); assert.equal(calls, 1);
});
test('encryption failures never report successful login', async () => {
  let calls = 0;
  const qr = createQrAuth({ save() { throw Error('test'); } }, { fetch: async () => ++calls === 1 ? response(QR) : response({ code: 0, data: { code: 0 } }, { 'Set-Cookie': 'SESSDATA=fixture' }) });
  const q = await qr.start(), result = await qr.poll(q.id);
  assert.equal(result.phase, 'error'); assert.match(result.message, /加密保存失败/);
});
test('Windows DPAPI survives store recreation and protects file contents', { skip: process.platform !== 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-login-test-')), file = path.join(dir, 'session.enc');
  try {
    const one = createSessionStore({ file }), two = createSessionStore({ file });
    assert.equal(two.read(), ''); one.save('test-only-never-a-real-session');
    assert(!fs.readFileSync(file).includes(Buffer.from('test-only-never-a-real-session')));
    assert.equal(two.read(), 'test-only-never-a-real-session');
    assert.equal(createSessionStore({ file }).read(), two.read());
    one.clear(); assert.equal(two.read(), '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('credentials and connection controls are stripped from theme exports; package excludes encrypted files', () => {
  const doc = create('split'); doc.settings = { liveSession: 'fixture-secret', liveOpenSecret: 'fixture-secret', liveIdentityCode: 'fixture-secret', liveRoom: '123', messageSource: 'live', streamerName: '保留' };
  const safe = normalizeTheme(doc);
  assert.deepEqual(safe.settings, { streamerName: '保留' });
  for (const file of ['app/bilibili-session-credentials.enc', 'bilibili-open-credentials.enc', 'app/bilibili-session-credentials.enc.tmp']) assert(excluded(file));
});
test('local API rejects cross-origin, keeps identity disabled, uses saved login and supports guest/forget', async () => {
  const store = memory(); store.save('fixture-saved');
  const original = BilibiliRelay.prototype.attempt; let observed;
  BilibiliRelay.prototype.attempt = function () { observed = this.credentials; };
  const p = await port(), app = startServer(p, { sessionStore: store, store: { read: () => ({}), info: () => ({}), clear() {} } });
  await new Promise(r => app.server.once('listening', r));
  const base = 'http://127.0.0.1:' + p;
  try {
    const health = await fetch(base + '/api/health').then(r => r.json());
    assert.equal(health.login.saved, true); assert(!JSON.stringify(health).includes('fixture-saved'));
    const post = (url, body, extra = {}) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Control-Token': health.token, ...extra }, body: JSON.stringify(body) });
    assert.equal((await post('/api/login/start', {}, { Origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await post('/api/connect', { mode: 'open' })).status, 501);
    assert.equal((await post('/api/connect', { room: '123' })).status, 202); assert.equal(observed, 'fixture-saved');
    await post('/api/connect', { room: '123', guest: true }); assert.equal(observed, '');
    await post('/api/connect', { room: '123', session: 'manual-fixture' }); assert.equal(observed, 'manual-fixture'); assert.equal(store.read(), 'fixture-saved');
    for (const file of ['bilibili-session-store.js', 'bilibili-qr-auth.js', 'bilibili-open-store.js']) assert.equal((await fetch(base + '/' + file)).status, 404);
    await post('/api/login/forget', {}); assert.equal(store.read(), ''); assert.equal(app.relay.state.phase, 'idle');
  } finally { BilibiliRelay.prototype.attempt = original; app.server.closeAllConnections(); await new Promise(r => app.server.close(r)); }
});
test('identity protocol preserves int64 application ids and maps official messages', () => {
  const value = config({ appId: '9007199254740993', accessKeyId: 'fixture-id', accessKeySecret: 'fixture-secret', code: 'fixture-code' });
  assert(requestBody('start', value).includes('9007199254740993'));
  const headers = sign(requestBody('start', value), value, 12345, 'fixture'); assert.equal(headers.Authorization.length, 64);
  assert(!JSON.stringify(headers).includes('fixture-secret'));
  const events = normalizeOpen({ cmd: 'LIVE_OPEN_PLATFORM_DM', data: { open_id: 'test-open-user', uname: '调查员', msg: '欢迎来到太古屋', msg_id: 'one' } });
  assert.equal(events[0].kind, 'normal'); assert.equal(events[0].eventId, 'open:one');
  assert.equal(normalizeOpen({ cmd: 'UNSUPPORTED' }).length, 0);
});
