'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const Settings = require('../app/now-playing-settings');
const { createService } = require('../app/now-playing-server');
function provider() { return { read: () => ({ track: { connected: true, hasSong: false }, error: '' }), close() {}, stop() {}, cover() {} }; }
async function open(root) {
  const service = createService({ port: 0, settingsFile: path.join(root, 'settings.json'), capturePath: path.join(root, 'missing.exe'), defaultProvider: 'builtin', mediaProvider: provider() });
  const address = await service.listen(), base = 'http://127.0.0.1:' + address.port;
  return { service, base, async post(body) {
    const response = await fetch(base + '/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, state: await response.json() };
  } };
}
test('restored controls match the supported V46 shader parameter ranges', () => {
  const context = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/now-playing-signal.js'), 'utf8'), context);
  const shader = context.window.NowPlayingSignal;
  assert.equal(Object.keys(Settings.signal).length, 8);
  for (const [key, field] of Object.entries(Settings.signal)) {
    assert.equal(shader.settings({ [key]: field.min })[key], field.min);
    assert.equal(shader.settings({ [key]: field.max })[key], field.max);
  }
  assert.equal(Settings.normalizeSignal({ softness: 99, noise: null }).softness, 2.5);
  assert.equal(Settings.normalizeSignal({ noise: null }).noise, 1);
  assert.throws(() => Settings.signalPatch({ strength: 2 }, true), /超出范围/);
});
test('the existing print control reaches the signal renderer with the original default unchanged', () => {
  const context = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/now-playing-signal.js'), 'utf8'), context);
  const render = context.window.NowPlayingSignal.Renderer.prototype.draw;
  let args, sourceConfig;
  const instance = { source: 'frame', base: { hiss: {}, typeLayer: 'glyphs', draw(now, levels, config) { sourceConfig = config; } }, effect: { draw(...a) { args = a; } } };
  for (const [texture, expected] of [[.65, 1], [0, 0], [1, 1 / .65]]) {
    const config = { texture, flow: 1.2 };
    render.call(instance, 2000, [], config, 7, Settings.signalDefaults, -Infinity);
    assert.equal(args[5], expected); assert.equal(args[4], 'glyphs');
    assert.equal(sourceConfig, config); assert.equal(sourceConfig.flow, 1.2);
  }
});
test('recording controls persist, merge independently, and broadcast to another skin', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'control-music-settings-'));
  let app, stream, reader;
  try {
    app = await open(root);
    stream = await fetch(app.base + '/events'); reader = stream.body.getReader();
    await reader.read();
    const a = await app.post({ signal: { strength: 0, softness: 2.5, noise: 2 } });
    assert.equal(a.status, 200); assert.equal(a.state.config.signal.strength, 0);
    assert.equal(a.state.config.signalConfigured, true);
    const b = await app.post({ signal: { bleed: 8 }, gain: 6 });
    assert.equal(b.state.config.signal.softness, 2.5); assert.equal(b.state.config.signal.bleed, 8);
    assert.equal(b.state.config.gain, 6);
    let chunks = '', limit = Date.now() + 3000;
    while (!chunks.includes('"bleed":8') && Date.now() < limit) chunks += new TextDecoder().decode((await reader.read()).value);
    assert.match(chunks, /"strength":0/); assert.match(chunks, /"bleed":8/);
    const invalid = await app.post({ signal: { noise: 200 }, flow: .5 });
    assert.equal(invalid.status, 400); assert.equal(app.service.state.config.flow, 1);
    await reader.cancel(); reader = null; app.service.close();
    app = await open(root);
    assert.equal(app.service.state.config.signal.strength, 0); assert.equal(app.service.state.config.signal.bleed, 8);
    assert.equal(app.service.state.config.signalConfigured, true);
  } finally {
    if (reader) await reader.cancel(); app?.service.close(); fs.rmSync(root, { recursive: true, force: true });
  }
});
test('legacy browser settings migrate only once and cannot overwrite a later user choice', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'control-music-migration-'));
  let app;
  try {
    fs.writeFileSync(path.join(root, 'settings.json'), JSON.stringify({ texture: .72, flow: 1.3, musicProvider: 'builtin' }));
    app = await open(root);
    assert.equal(app.service.state.config.signalConfigured, false);
    await app.post({ command: 'migrate-signal', signal: { noise: .4, offset: -3 } });
    assert.equal(app.service.state.config.signal.noise, .4);
    assert.equal(app.service.state.config.texture, .72); assert.equal(app.service.state.config.flow, 1.3);
    await app.post({ signal: { noise: 0 } });
    await app.post({ command: 'migrate-signal', signal: { noise: 2.5 } });
    assert.equal(app.service.state.config.signal.noise, 0);
    const reset = await app.post({ signal: Settings.signalDefaults });
    assert.deepEqual(reset.state.config.signal, Settings.signalDefaults);
    assert.equal(reset.state.config.flow, 1.3);
  } finally { app?.service.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
