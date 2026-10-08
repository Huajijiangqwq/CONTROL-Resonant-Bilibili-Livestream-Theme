'use strict';
// These isolated tests validate acceptance logic, not an actual Mac GUI.
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http'), path = require('node:path'), vm = require('node:vm');
const { deflateSync } = require('node:zlib');
const smoke = require('../scripts/smoke-mac');
const base = 'http://127.0.0.1:24000', expected = { version: '1.2.3', electron: '44.4.3', base };
const box = () => ({ visible: true, width: 140, height: 40 });
const shell = () => ({ url: smoke.SHELL_URL, readyState: 'complete', version: expected.version,
  userAgent: 'Mozilla/5.0 Chrome/148.0.0.0 Electron/44.4.3', title: '直播预览',
  navigation: smoke.NAVIGATION.map(([page, label]) => ({ page, label, active: page === 'live', ...box() })),
  frame: { src: base + '/live.html', ...box() } });
const live = () => ({ url: base + '/live.html', readyState: 'complete', scene: box(),
  chat: { src: base + '/simulation.html?embed=main&v=test', ready: true, ...box() } });

test('CLI requires an absolute built app and explicit report directory', () => {
  const bundle = path.resolve('Control Resonant.app');
  assert.deepEqual(smoke.parseArgs(['--bundle', bundle, '--output=reports']), { bundle, output: path.resolve('reports') });
  for (const args of [[], ['--bundle', 'relative.app', '--output', 'reports'], ['--bundle', bundle],
    ['--bundle', bundle, '--output', 'reports', '--bundle', bundle], ['--bundle', bundle, '--output', 'reports', '--disable-gpu']])
    assert.throws(() => smoke.parseArgs(args));
});

test('shell acceptance rejects a loaded but hidden, stale, or incomplete interface', () => {
  assert.equal(smoke.validateShell(shell(), expected).version, expected.version);
  for (const change of [
    value => { value.url = 'file:///app/desktop/index.html'; },
    value => { value.version = 'old'; },
    value => { value.userAgent = 'Chrome/148'; },
    value => { value.navigation.reverse(); },
    value => { value.navigation[2].visible = false; },
    value => { value.navigation[0].width = 0; },
    value => { value.navigation[1].label = '主题编辑器 Beta'; },
    value => { value.frame.src = 'http://127.0.0.1:8791/live.html'; },
    value => { value.frame.height = 0; },
  ]) { const snapshot = shell(); change(snapshot); assert.throws(() => smoke.validateShell(snapshot, expected)); }
});

test('live acceptance requires scene, visible chat, and the loaded embedded renderer', () => {
  assert.equal(smoke.validateLive(live(), base).chat.ready, true);
  for (const change of [
    value => { value.scene = null; }, value => { value.scene.visible = false; },
    value => { value.chat.height = 0; }, value => { value.chat.ready = false; },
    value => { value.chat.src = base + '/simulation.html'; },
    value => { value.chat.src = 'http://127.0.0.1:8791/simulation.html?embed=main'; },
  ]) { const snapshot = live(); change(snapshot); assert.throws(() => smoke.validateLive(snapshot, base)); }
});

test('DOM visibility checks include hidden ancestors and do not accept about:blank chat', () => {
  const style = { display: 'block', visibility: 'visible', opacity: '1' };
  const element = props => ({ hidden: false, parentElement: null, style,
    getBoundingClientRect: () => ({ width: 900, height: 600, top: 0, left: 0, bottom: 600, right: 900 }), ...props });
  const scene = element(), chat = element({ src: base + '/simulation.html?embed=main',
    contentDocument: { body: {}, readyState: 'complete', location: { href: 'about:blank' } } });
  const context = { document: { readyState: 'complete', getElementById: id => id === 'scene' ? scene : chat },
    location: { href: base + '/live.html' }, innerHeight: 980, innerWidth: 1560, getComputedStyle: value => value.style };
  let result = vm.runInNewContext(smoke.LIVE_EXPRESSION, context);
  assert.equal(result.chat.ready, false);
  chat.contentDocument.location.href = chat.src;
  scene.parentElement = element({ style: { ...style, display: 'none' } });
  result = vm.runInNewContext(smoke.LIVE_EXPRESSION, context);
  assert.equal(result.chat.ready, true); assert.equal(result.scene.visible, false);
});

test('HTTP 200 alone cannot prove service ownership, version, or GUI acceptance', async () => {
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ name: 'some-other-service', version: expected.version, port: server.address().port, pid: 505 })); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port, health = await smoke.fetchJSON('http://127.0.0.1:' + port + '/health', port, Date.now() + 2000);
    const options = { version: expected.version, port, ownedPids: new Set([505]) };
    assert.throws(() => smoke.validateHealth(health, options), /identity/);
    health.name = 'control-resonant-desktop'; assert.equal(smoke.validateHealth(health, options).pid, 505);
    assert.throws(() => smoke.validateHealth(health, { ...options, ownedPids: new Set() }), /PID/);
    assert.throws(() => smoke.validateHealth({ ...health, version: 'old' }, options), /version/);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('local endpoints reject redirects and remote debug listeners', async () => {
  for (const url of ['http://localhost:24000/', 'http://example.test:24000/', 'http://user@127.0.0.1:24000/', 'http://127.0.0.1:24001/'])
    assert.throws(() => smoke.localURL(url, 24000));
  smoke.validateDebugListener('p500\nn127.0.0.1:24000\n', 24000, new Set([500]));
  for (const output of ['p500\nn*:24000\n', 'p500\nn[::1]:24000\n', 'p999\nn127.0.0.1:24000\n', 'p500\n'])
    assert.throws(() => smoke.validateDebugListener(output, 24000, new Set([500])));
  const server = http.createServer((_req, res) => { res.writeHead(302, { location: 'http://example.test/' }); res.end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { const port = server.address().port; await assert.rejects(smoke.fetchJSON('http://127.0.0.1:' + port, port, Date.now() + 2000)); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

class FakeSocket extends EventTarget {
  constructor() { super(); this.sent = []; }
  send(value) { this.sent.push(JSON.parse(value)); }
  message(value) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })); }
  close() { this.dispatchEvent(new Event('close')); }
}

test('CDP routes flattened sessions, receives frame contexts, and rejects protocol errors/disconnects', async () => {
  const socket = new FakeSocket(), cdp = new smoke.CDP(socket, Date.now() + 1000);
  const first = cdp.send('Runtime.enable', {}, 'shell'), second = cdp.send('Runtime.enable', {}, 'frame');
  assert.equal(socket.sent[1].sessionId, 'frame');
  socket.message({ id: 2, result: { name: 'frame' } }); socket.message({ id: 1, result: { name: 'shell' } });
  assert.deepEqual(await Promise.all([first, second]), [{ name: 'shell' }, { name: 'frame' }]);
  socket.message({ method: 'Runtime.executionContextCreated', sessionId: 'shell', params: { context: { id: 17, auxData: { frameId: 'f', isDefault: true } } } });
  assert.equal(cdp.contexts.get('shell').get(17).auxData.frameId, 'f');
  const evaluation = cdp.evaluate('location.href', 'shell', 17);
  assert.equal(socket.sent.at(-1).params.contextId, 17);
  socket.message({ id: 3, result: { exceptionDetails: { text: 'context disappeared' } } });
  await assert.rejects(evaluation, /context disappeared/);
  const rejected = cdp.send('Page.getFrameTree', {}, 'shell');
  socket.message({ id: 4, error: { message: 'session detached' } }); await assert.rejects(rejected, /session detached/);
  const disconnected = cdp.send('Page.captureScreenshot', {}, 'shell'); socket.close();
  await assert.rejects(disconnected, /closed/); assert.equal(cdp.pending.size, 0);
});

test('CDP enforces one deadline instead of waiting forever on a dialog or renderer', async () => {
  const socket = new FakeSocket(), cdp = new smoke.CDP(socket, Date.now() + 25);
  await assert.rejects(cdp.send('Runtime.evaluate'), /timed out/);
  assert.equal(cdp.pending.size, 0); cdp.close();
  await assert.rejects(smoke.until(() => false, Date.now() + 15, 'Keychain bootstrap'), /Keychain bootstrap timed out/);
});

test('live DOM inspection works for both OOPIF targets and same-process execution contexts', async () => {
  const trace = [], attached = new Map();
  const oopif = { async send(method) { assert.equal(method, 'Target.getTargets'); return { targetInfos: [{ targetId: 'live-target', type: 'iframe', url: base + '/live.html' }] }; },
    async attach(id) { trace.push(['attach', id]); return 'live-session'; },
    async evaluate(expression, session) { trace.push(['evaluate', session]); assert.equal(expression, smoke.LIVE_EXPRESSION); return live(); } };
  await smoke.inspectLive(oopif, 'shell', base, attached); await smoke.inspectLive(oopif, 'shell', base, attached);
  assert.equal(trace.filter(item => item[0] === 'attach').length, 1);
  const sameProcess = { contexts: new Map([['shell', new Map([[9, { id: 9, auxData: { isDefault: true, frameId: 'live-frame' } }]])]]),
    async send(method) { return method === 'Target.getTargets' ? { targetInfos: [] } : { frameTree: { frame: { id: 'shell', url: smoke.SHELL_URL }, childFrames: [{ frame: { id: 'live-frame', url: base + '/live.html' } }] } }; },
    async evaluate(expression, session, context) { assert.equal(expression, smoke.LIVE_EXPRESSION); assert.equal(session, 'shell'); assert.equal(context, 9); return live(); } };
  await smoke.inspectLive(sameProcess, 'shell', base);
  sameProcess.contexts.clear(); await assert.rejects(smoke.inspectLive(sameProcess, 'shell', base), /execution context/);
});

test('process ownership survives reparenting but excludes other instances and reused PIDs', async () => {
  const rows = smoke.parseProcesses('500 1 500 Wed Oct 7 10:00:00 2026\n501 500 500 Wed Oct 7 10:00:01 2026\n502 501 502 Wed Oct 7 10:00:02 2026\n900 1 900 Wed Oct 7 09:00:00 2026');
  assert.equal(smoke.ownProcesses(rows, 500).size, 0, 'unknown root PIDs never establish ownership');
  const known = smoke.ownProcesses(rows, 500, new Map([[500, rows[0].started]]));
  assert.deepEqual([...known.keys()], [500, 501, 502]);
  const reparented = [{ ...rows[1], parent: 1 }, { ...rows[2], parent: 1 }, rows[3], { ...rows[0], started: 'later reused PID' }];
  assert.deepEqual([...smoke.ownProcesses(reparented, 500, known).keys()], [501, 502]);
  const signals = [];
  let current = reparented;
  const cleanup = await smoke.stopOwned(500, known, async () => current, (pid, signal) => {
    signals.push([pid, signal]); current = current.filter(row => row.pid !== pid);
  });
  assert.deepEqual(signals, [[501, 'SIGTERM'], [502, 'SIGTERM']]);
  assert.deepEqual(cleanup.remaining, []); assert.deepEqual(current.map(row => row.pid), [900, 500]);
  await assert.rejects(smoke.stopOwned(500, new Map(), async () => rows, () => assert.fail('Must never kill an unknown PID')), /Cannot confirm/);
});

test('screenshots must be PNGs with actual desktop dimensions', () => {
  const bytes = Buffer.alloc(40); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.write('IHDR', 12, 'ascii'); bytes.writeUInt32BE(1560, 16); bytes.writeUInt32BE(980, 20);
  assert.deepEqual(smoke.pngSize(bytes), { width: 1560, height: 980 });
  bytes.writeUInt32BE(1, 16); assert.throws(() => smoke.pngSize(bytes), /dimensions/);
  assert.throws(() => smoke.pngSize(Buffer.from('not an image')), /PNG/);
});

function pngFixture(pixel, channels = 4, filter = 0) {
  const width = 800, height = 600, stride = width * channels;
  const scanlines = Buffer.alloc((stride + 1) * height); let previous = Buffer.alloc(stride);
  const paeth = (a, b, c) => { const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c); return da <= db && da <= dc ? a : db <= dc ? b : c; };
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(stride); for (let x = 0; x < width; x++) Buffer.from(pixel(x, y).slice(0, channels)).copy(row, x * channels);
    const offset = y * (stride + 1); scanlines[offset] = filter;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels] : 0, up = previous[x], corner = x >= channels ? previous[x - channels] : 0;
      const prediction = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, corner);
      scanlines[offset + 1 + x] = (row[x] - prediction) & 255;
    }
    previous = row;
  }
  // Test PNGs have real CRCs, IHDR, compressed IDAT and IEND chunks.
  const crc32 = bytes => { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const bytes = Buffer.alloc(data.length + 12); bytes.writeUInt32BE(data.length); bytes.write(type, 4); data.copy(bytes, 8); bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4); return bytes; };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = channels === 3 ? 2 : 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
}

test('pixel evidence rejects black, transparent, and uniform PNGs even with valid dimensions', () => {
  for (const color of [[0, 0, 0, 255], [255, 255, 255, 0], [80, 80, 80, 255]]) {
    const result = smoke.analyzePNG(pngFixture(() => color));
    assert.equal(result.width, 800); assert.equal(result.height, 600); assert.equal(result.hasVisibleContent, false);
  }
  const sparse = smoke.analyzePNG(pngFixture((x, y) => x < 5 && y < 5 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
  assert.equal(sparse.hasVisibleContent, false, 'a cursor or single white pixel cannot prove the window rendered');
});

test('PNG pixel analysis reconstructs all filters for RGB and RGBA screenshot content', () => {
  const pixel = (x, y) => [Math.floor(x / 10) % 256, Math.floor(y / 5) % 256, (Math.floor(x / 10) + Math.floor(y / 10)) % 256, 255];
  let expectedStats;
  for (let filter = 0; filter <= 4; filter++) {
    const result = smoke.analyzePNG(pngFixture(pixel, filter % 2 ? 3 : 4, filter));
    assert.equal(result.hasVisibleContent, true);
    const { colorType, ...stats } = result;
    if (expectedStats) assert.deepEqual(stats, expectedStats); else expectedStats = stats;
  }
  const truncated = pngFixture(pixel).subarray(0, -20);
  assert.throws(() => smoke.analyzePNG(truncated), /Truncated|incomplete/);
});
