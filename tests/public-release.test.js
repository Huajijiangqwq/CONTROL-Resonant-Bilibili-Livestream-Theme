'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const profile = require('../app/release-profile');
const { sourceFiles, runtimeEntries } = require('../scripts/package');
const { validate } = require('../scripts/public-dependencies');
const { createPreviewServer } = require('../app/preview-server');
const { listenLocalService } = require('./fixtures/http-service');

test('public runtime excludes laboratories but retains every embedded renderer dependency', () => {
  const source = sourceFiles(), entries = runtimeEntries(source), files = new Map(entries);
  for (const name of ['monitor.html', 'monitor-stage.js', 'monitor-audio-clock-worklet.js', 'sc-compare.html', 'normal.html', 'gift.js', 'levitation.css', 'simulation-controls.js']) {
    assert(source.includes('app/' + name), 'source archive retains ' + name);
    assert(!files.has('app/' + name), 'public runtime excludes ' + name);
  }
  assert(![...files.keys()].some(file => /^(tests|scripts|\.github)\//.test(file)));
  for (const name of ['simulation.html', 'simulation.js', 'sc-flow-field.js', 'fleet-notice-engine.js', 'normal-notice-engine.js', 'gift-notice-engine.js']) assert(files.has('app/' + name));
  assert.equal(JSON.parse(files.get('PUBLIC-RELEASE.json')).developmentTools, false);
  assert.deepEqual(validate(entries).errors, []);
  assert.match(files.get('app/simulation.html').toString(), /id="stream"/);
  assert.doesNotMatch(files.get('app/simulation.html').toString(), /(?:src|href)="(?:monitor|sc-compare|normal\.html|gift\.html|levitation\.html|simulation-controls)/);
});

test('desktop public route keys cannot reopen removed development tools', () => {
  const { PAGES, pageUrl } = require('../desktop/core');
  assert.deepEqual(Object.keys(PAGES).sort(), ['chat', 'live', 'music', 'theme']);
  for (const key of ['simulation', 'monitor', 'sc-compare', 'normal', 'gift', 'levitation'])
    assert.throws(() => pageUrl('http://127.0.0.1:19001/', key), /页面无效/, key);
});

test('development controls require both a development server and an explicit page flag', () => {
  const template = fs.readFileSync(path.join(__dirname, '../app/runtime-config.js'), 'utf8');
  for (const development of [false, true]) for (const search of ['', '?dev=1']) {
    const window = {}, context = vm.createContext({ window, location: { port: '19001', search }, URLSearchParams });
    vm.runInContext(profile.runtimeConfig(template, development), context);
    assert.equal(window.ThemeBuild.development, development);
    assert.equal(window.ThemeDevelopment, development && search === '?dev=1');
    assert.equal(window.ThemeServices.music, 'http://127.0.0.1:19005');
  }
});

test('a packaged public runtime ignores inherited development environment settings', () => {
  const module = { exports: {} }, code = fs.readFileSync(path.join(__dirname, '../app/release-profile.js'), 'utf8');
  const context = vm.createContext({ module, __dirname: '/runtime/app', process: { env: { CONTROL_DEV: '1' } }, require(name) {
    if (name === 'node:fs') return { existsSync: value => value.replaceAll('\\', '/').endsWith('/PUBLIC-RELEASE.json') };
    return require(name);
  } });
  vm.runInContext(code, context);
  assert.equal(module.exports.developmentEnabled(), false);
  assert.equal(module.exports.developmentEnabled(true), false);
});

test('public routes hide legacy standalone tools without breaking live chat iframes', async () => {
  for (const development of [false, true]) {
    const dataRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'control-public-routes-'));
    let service;
    try {
      const started = await listenLocalService(port => createPreviewServer({ port, development, dataRoot }));
      service = started.service;
      const { base } = started;
      for (const name of ['monitor.html', 'sc-compare.html', 'normal.html', 'gift.html', 'levitation.html']) {
        assert.equal((await fetch(base + '/' + name + '?dev=1')).status, development ? 200 : 404, name);
      }
      if (!development) for (const name of ['assets%2f..%2fmonitor.html', 'assets%5c..%5cmonitor.html', 'monitor.html?dev=1'])
        assert.equal((await fetch(base + '/' + name)).status, 404, name);
      const standalone = await fetch(base + '/simulation.html?dev=1', { redirect: 'manual' });
      assert.equal(standalone.status, development ? 200 : 302);
      if (!development) assert.equal(standalone.headers.get('location'), 'live.html');
      const embedded = await fetch(base + '/simulation.html?embed=main&themeInstance=qa');
      assert.equal(embedded.status, 200);
      const html = await embedded.text();
      assert.match(html, /simulation\.js/);
      assert.equal(html.includes('src="simulation-controls.js"'), development);
      const head = await fetch(base + '/simulation.html?embed=main', { method: 'HEAD' });
      assert.equal(head.status, 200); assert.equal(await head.text(), '');
      assert.equal(Number(head.headers.get('content-length')), Buffer.byteLength(html));
      assert.equal((await fetch(base + '/simulation-controls.js')).status, development ? 200 : 404);
      const config = await fetch(base + '/runtime-config.js').then(response => response.text());
      assert(config.includes('/* CONTROL_DEVELOPMENT */ ' + development));
    } finally {
      if (service) { service.server.closeAllConnections(); await service.close(); }
      fs.rmSync(dataRoot, { recursive: true, force: true });
    }
  }
});

test('secondary Bilibili static port applies the same public-development boundary', async () => {
  const emptyStore = { read: () => ({}), info: () => ({ saved: false }), clear() {} };
  const { service, base } = await listenLocalService(port => {
    const app = require('../app/bilibili-server').startServer(port, {
      development: false, store: emptyStore, sessionStore: { ...emptyStore, read: () => '' },
    });
    return { ...app,
      listen: () => new Promise((resolve, reject) => {
        app.server.once('error', reject);
        app.server.once('listening', () => { app.server.removeListener('error', reject); resolve(app.server.address()); });
      }),
      close: () => new Promise(resolve => app.server.close(resolve)),
    };
  });
  try {
    for (const file of ['monitor.html?dev=1', 'sc-compare.js', 'simulation-controls.css', 'release-profile.js'])
      assert.equal((await fetch(base + '/' + file)).status, 404, file);
    const html = await fetch(base + '/simulation.html?embed=main').then(response => response.text());
    assert.match(html, /src="simulation\.js/);
    assert.doesNotMatch(html, /src="simulation-controls\.js/);
    const config = await fetch(base + '/runtime-config.js').then(response => response.text());
    assert(config.includes('/* CONTROL_DEVELOPMENT */ false'));
  } finally { service.server.closeAllConnections(); await service.close(); }
});
