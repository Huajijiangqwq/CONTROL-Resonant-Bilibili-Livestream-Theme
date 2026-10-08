'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EventEmitter } = require('node:events');
const appProtocol = require('../desktop/app-protocol');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture() {
  const trace = [], logs = [], dialogs = [], handlers = new Map(), windows = [], timers = [], ready = deferred();
  const listenerSnapshots = [], bootstraps = [];
  const processChild = new EventEmitter();
  processChild.stdout = new EventEmitter(); processChild.stderr = new EventEmitter();
  processChild.postMessage = message => { trace.push('bootstrap:' + message.type); bootstraps.push(message); };
  processChild.kill = () => {};
  const app = new EventEmitter();
  Object.assign(app, { name: 'Fixture', whenReady: () => ready.promise, requestSingleInstanceLock: () => true,
    setAppUserModelId() {}, getPath: () => '/isolated profile', setPath() {}, quit() {}, exit: code => trace.push('exit:' + code), dock: { setIcon() {} } });
  function sessionFor(kind) {
    return { protocol: { handle(name, handler) { trace.push('protocol:' + kind); this.handler = handler; } },
      setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, setDisplayMediaRequestHandler() {} };
  }
  const defaultSession = sessionFor('shell'), audioSession = sessionFor('audio');
  class FakeWindow extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.loads = []; this.reloads = 0;
      this.webContents = new EventEmitter();
      Object.assign(this.webContents, { mainFrame: { url: 'about:blank' }, isDestroyed: () => false,
        send() {}, setWindowOpenHandler() {}, reload: () => this.reloads++, executeJavaScript: async () => {} });
      windows.push(this);
    }
    loadURL(url) { const load = { url, ...deferred() }; this.loads.push(load); trace.push('load:' + url); return load.promise; }
    isDestroyed() { return false; }
    isMinimized() { return false; }
    show() { trace.push('show'); }
    focus() {}
    hide() {}
    destroy() {}
  }
  class FakeTray extends EventEmitter { setToolTip() {} setContextMenu() {} destroy() {} }
  const ipcMain = new EventEmitter(); ipcMain.handle = (name, callback) => handlers.set(name, callback);
  const icon = { resize() { return this; }, setTemplateImage() {} };
  const electron = { app, BrowserWindow: FakeWindow, Tray: FakeTray, ipcMain,
    Menu: { setApplicationMenu() {}, buildFromTemplate: value => value }, nativeImage: { createFromPath: () => icon },
    shell: { openExternal: async () => {}, openPath: async () => {} }, clipboard: { writeText() {} },
    session: { defaultSession, fromPartition: () => audioSession }, safeStorage: {}, desktopCapturer: {},
    protocol: { registerSchemesAsPrivileged() { trace.push('scheme'); } },
    utilityProcess: { fork() { trace.push('fork'); return processChild; } },
    dialog: { async showMessageBox(_window, options) { dialogs.push(options); return { response: options.buttons.length - 1 }; } },
  };
  const mockFS = { mkdirSync() {}, existsSync: () => false, appendFileSync: (_file, value) => logs.push(value) };
  const requires = {
    electron, 'node:path': path, 'node:fs': mockFS, './app-protocol': appProtocol,
    './core': { readConfig: () => ({}), saveConfig() {}, pageUrl: (base, page) => new URL(page + '.html', base).href },
    './mac-audio-controller': require('../desktop/mac-audio-controller'),
    './window-diagnostics': require('../desktop/window-diagnostics'), '../package.json': { version: 'fixture' },
    './credential-key': { loadKey() {
      trace.push('keychain');
      listenerSnapshots.push(['spawn', 'message', 'exit'].map(name => processChild.listenerCount(name))
        .concat(processChild.stdout.listenerCount('data'), processChild.stderr.listenerCount('data')));
      return Buffer.alloc(32, 7);
    } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../desktop/main.js'), 'utf8'), {
    __dirname: path.resolve(__dirname, '../desktop'), Buffer, URL,
    process: { argv: [], env: {}, platform: 'darwin', arch: 'arm64', versions: { electron: '44.4.3' } },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); },
    require(name) { if (!Object.hasOwn(requires, name)) throw Error('Unexpected require: ' + name); return requires[name]; },
  });
  return { trace, logs, dialogs, handlers, windows, processChild, listenerSnapshots, bootstraps,
    async start() { ready.resolve(); await tick(); return windows[0]; },
    async finishLoad() { const win = windows[0], load = win.loads.at(-1); win.webContents.mainFrame.url = load.url; load.resolve(); await tick(); },
    async runTimers(delay) {
      for (let i = timers.length - 1; i >= 0; i--) if (timers[i].delay === delay) timers.splice(i, 1)[0].callback();
      await tick();
    },
  };
}

test('Mac services and Keychain wait for the protected protocol shell to finish loading', async () => {
  const f = fixture();
  assert.deepEqual(f.trace, ['scheme']);
  const win = await f.start();
  assert(f.trace.indexOf('protocol:shell') < f.trace.indexOf('load:' + appProtocol.shellURL));
  assert(f.trace.includes('protocol:audio'), 'audio protocol is installed on its partition');
  assert.equal(f.windows.length, 1, 'audio controller does not create a capture window at startup');
  const prefs = win.options.webPreferences;
  assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.nodeIntegration, false); assert.equal(prefs.webviewTag, false);
  assert(path.isAbsolute(prefs.preload));
  await f.runTimers(150);
  assert(!f.trace.includes('fork')); assert(!f.trace.includes('keychain'));
  await f.finishLoad();
  assert(f.trace.includes('show')); assert(!f.trace.includes('fork'));
  await f.runTimers(150);
  assert(f.trace.indexOf('show') < f.trace.indexOf('fork'));
  assert(f.trace.indexOf('fork') < f.trace.indexOf('keychain'));
});

test('failed shell load can recover through the full startup path without a renderer reload loop', async () => {
  const f = fixture(), win = await f.start();
  win.loads[0].reject(new Error('ERR_FAILED (-2)'));
  await tick(); await f.runTimers(150);
  assert.equal(f.dialogs.length, 1); assert.equal(f.dialogs[0].type, 'error');
  assert(f.dialogs[0].buttons.includes('打开日志文件夹'));
  assert(!f.trace.includes('fork')); assert(!f.trace.includes('keychain'));
  win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 9 });
  assert.equal(win.loads.length, 2, 'automatic recovery uses the same protocol load path');
  assert.equal(win.reloads, 0, 'raw reload would skip the service startup continuation');
  assert(!f.trace.includes('fork'));
  await f.finishLoad();
  assert(!f.trace.includes('fork'));
  await f.runTimers(150);
  assert.equal(f.trace.filter(item => item === 'fork').length, 1);
  assert.equal(f.trace.filter(item => item === 'keychain').length, 1);
  assert.equal(f.bootstraps.length, 1);
  for (let i = 0; i < 3; i++) win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 9 });
  await tick();
  assert.equal(win.loads.length, 2); assert.equal(win.reloads, 0); assert.equal(f.dialogs.length, 1);
});

test('desktop IPC and navigation trust only the exact shell in the main window main frame', async () => {
  const f = fixture(), win = await f.start(); await f.finishLoad();
  const invoke = f.handlers.get('desktop:state'), frame = win.webContents.mainFrame;
  const event = { sender: win.webContents, senderFrame: frame };
  assert.equal(invoke(event).status, 'starting');
  assert.throws(() => invoke({ sender: {}, senderFrame: frame }), /未授权/);
  assert.throws(() => invoke({ sender: win.webContents, senderFrame: { url: appProtocol.shellURL } }), /未授权/);
  assert.throws(() => invoke({ sender: win.webContents, senderFrame: null }), /未授权/);
  for (const url of ['https://example.test/', 'file:///desktop/index.html', appProtocol.audioURL, appProtocol.shellURL + '?copy=1']) {
    frame.url = url; assert.throws(() => invoke(event), /未授权/);
  }
  frame.url = appProtocol.shellURL;
  let blocked = 0;
  const navigation = { preventDefault() { blocked++; } };
  win.webContents.emit('will-navigate', navigation, appProtocol.shellURL);
  assert.equal(blocked, 0);
  win.webContents.emit('will-navigate', navigation, 'https://example.test/');
  assert.equal(blocked, 1);
});

test('service listeners are attached before Keychain initialization and bootstrap delivery', async () => {
  const f = fixture(); await f.start(); await f.finishLoad(); await f.runTimers(150);
  assert.deepEqual(f.listenerSnapshots, [[1, 1, 1, 1, 1]]);
  assert(f.trace.indexOf('keychain') < f.trace.indexOf('bootstrap:bootstrap'));
  assert.equal(f.bootstraps.length, 1); assert.equal(f.bootstraps[0].type, 'bootstrap');
  f.processChild.emit('message', { type: 'error', message: 'fixture startup error' });
  assert(f.logs.some(line => line.includes('Local services startup error: fixture startup error')));
  f.processChild.emit('exit', 0);
  const win = f.windows[0];
  const state = f.handlers.get('desktop:state')({ sender: win.webContents, senderFrame: win.webContents.mainFrame });
  assert.equal(state.status, 'error'); assert.equal(state.message, 'fixture startup error');
  assert(!f.logs.some(line => line.includes(f.bootstraps[0].credentialKey)), 'logs never include the fixture credential key');
});
