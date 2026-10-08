'use strict';
// Native macOS CI acceptance only. Unit tests for this file are not Mac acceptance.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { randomInt } = require('node:crypto');
const { inflateSync } = require('node:zlib');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const SHELL_URL = 'control-resonant://app/desktop/index.html';
const NAVIGATION = [['live', '直播预览'], ['theme', '主题编辑器'], ['chat', '弹幕编辑器'], ['music', '音乐皮肤']];
const TIMEOUT_MS = 60000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const match = /^(--bundle|--output)(?:=(.*))?$/.exec(args[i]);
    if (!match) throw Error('Usage: node scripts/smoke-mac.js --bundle /absolute/App.app --output /report/directory');
    const key = match[1].slice(2), value = match[2] ?? args[++i];
    if (!value || value.startsWith('--') || options[key]) throw Error('Missing or duplicate option: ' + key);
    options[key] = value;
  }
  if (!options.bundle || !path.isAbsolute(options.bundle) || !options.bundle.endsWith('.app'))
    throw Error('--bundle must be an absolute .app path');
  if (!options.output) throw Error('--output is required');
  options.output = path.resolve(options.output);
  return options;
}

function remaining(deadline, maximum = 3000) {
  const left = deadline - Date.now();
  if (left <= 0) throw Error('Native GUI smoke test deadline exceeded');
  return Math.max(1, Math.min(left, maximum));
}

async function until(probe, deadline, description, alive = () => {}) {
  let last;
  while (Date.now() < deadline) {
    alive();
    try { const result = await probe(); if (result) return result; }
    catch (error) { last = error; }
    await sleep(Math.min(200, Math.max(0, deadline - Date.now())));
  }
  throw Error(description + ' timed out' + (last ? ': ' + last.message : ''));
}

function localURL(value, port, protocol = 'http:') {
  const url = new URL(value);
  if (url.protocol !== protocol || url.hostname !== '127.0.0.1' || Number(url.port) !== port || url.username || url.password)
    throw Error('Refusing a non-local or unexpected debug/service address');
  return url;
}

async function fetchJSON(value, port, deadline) {
  localURL(value, port);
  const response = await fetch(value, { signal: AbortSignal.timeout(remaining(deadline)), redirect: 'error' });
  if (!response.ok) throw Error('HTTP ' + response.status);
  const bytes = await response.text();
  if (bytes.length > 1024 * 1024) throw Error('Unexpectedly large local response');
  return JSON.parse(bytes);
}

async function reservePort(port = 0) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return { port: server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}

async function reservePorts(deadline) {
  while (Date.now() < deadline) {
    const base = randomInt(20000, 60000), reservations = [];
    try {
      for (const offset of [0, 2, 3, 4]) reservations.push(await reservePort(base + offset));
      reservations.push(await reservePort());
      return { base, debug: reservations.at(-1).port, release: () => Promise.all(reservations.map(item => item.close())) };
    } catch { await Promise.all(reservations.map(item => item.close())); }
  }
  throw Error('Could not reserve an isolated local port group');
}

class CDP {
  constructor(socket, deadline) {
    this.socket = socket; this.deadline = deadline; this.nextId = 0; this.pending = new Map(); this.contexts = new Map();
    socket.addEventListener('message', event => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.id) {
        const request = this.pending.get(message.id);
        if (!request) return;
        clearTimeout(request.timer); this.pending.delete(message.id);
        if (message.error) request.reject(Error(request.method + ': ' + message.error.message));
        else request.resolve(message.result);
      } else if (message.method === 'Runtime.executionContextCreated') {
        const list = this.contexts.get(message.sessionId) || new Map();
        list.set(message.params.context.id, message.params.context); this.contexts.set(message.sessionId, list);
      } else if (message.method === 'Runtime.executionContextDestroyed') {
        this.contexts.get(message.sessionId)?.delete(message.params.executionContextId);
      } else if (message.method === 'Runtime.executionContextsCleared') this.contexts.delete(message.sessionId);
    });
    const disconnected = () => this.rejectPending(Error('CDP connection closed'));
    socket.addEventListener('close', disconnected); socket.addEventListener('error', disconnected);
  }
  static async connect(url, port, deadline, WebSocketClass = WebSocket) {
    localURL(url, port, 'ws:');
    const socket = new WebSocketClass(url), client = new CDP(socket, deadline);
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('CDP connection timeout')), remaining(deadline));
        socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
        socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('CDP connection failed')); }, { once: true });
      });
      return client;
    } catch (error) { client.close(); throw error; }
  }
  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error(method + ' timed out')); }, remaining(this.deadline));
      this.pending.set(id, { method, resolve, reject, timer });
      try { this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  async attach(targetId) {
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    await this.send('Runtime.enable', {}, sessionId);
    return sessionId;
  }
  async evaluate(expression, sessionId, contextId) {
    const response = await this.send('Runtime.evaluate', { expression, returnByValue: true,
      ...(contextId === undefined ? {} : { contextId }), timeout: remaining(this.deadline), silent: true }, sessionId);
    if (response.exceptionDetails) throw Error('DOM inspection failed: ' + (response.exceptionDetails.text || 'JavaScript exception'));
    if (!Object.hasOwn(response.result || {}, 'value')) throw Error('DOM inspection did not return a value');
    return response.result.value;
  }
  rejectPending(error) {
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear();
  }
  close() { this.rejectPending(Error('CDP closed')); this.socket.close(); }
}

// These expressions only inspect DOM/style/location; they do not invoke app IPC,
// grant permissions, connect a room, start capture, or change app settings.
const visibleElement = `function view(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  let visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  for (let node = element; node && visible; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (node.hidden || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) visible = false;
  }
  return { visible, width: rect.width, height: rect.height };
}`;
const SHELL_EXPRESSION = `(() => {
  ${visibleElement}
  const frame = document.getElementById('frame-live');
  return { url: location.href, readyState: document.readyState, userAgent: navigator.userAgent,
    version: document.getElementById('version')?.textContent.trim(),
    title: document.getElementById('sectionTitle')?.textContent.trim(),
    navigation: [...document.querySelectorAll('button[data-page]')].filter(e => e.dataset.page !== 'about').map(e => ({
      page: e.dataset.page, label: e.querySelector('.nav-label')?.textContent.trim(), active: e.getAttribute('aria-current') === 'page', ...view(e) })),
    frame: frame ? { src: frame.src, ...view(frame) } : null,
    serviceMessage: document.getElementById('serviceDetail')?.textContent.trim() };
})()`;
const LIVE_EXPRESSION = `(() => {
  ${visibleElement}
  const chat = document.getElementById('chatFrame');
  let chatReady = false;
  try { chatReady = !!chat?.contentDocument?.body && chat.contentDocument.readyState === 'complete' && chat.contentDocument.location.href === chat.src; } catch {}
  return { url: location.href, readyState: document.readyState, scene: view(document.getElementById('scene')),
    chat: chat ? { src: chat.src, ready: chatReady, ...view(chat) } : null };
})()`;

function validateShell(snapshot, { version, electron, base }) {
  if (snapshot?.url !== SHELL_URL || snapshot.readyState !== 'complete') throw Error('Protected shell is not fully loaded');
  if (snapshot.version !== version) throw Error('Shell version does not match the built application');
  if (!snapshot.userAgent?.includes('Electron/' + electron)) throw Error('Unexpected Electron runtime');
  if (snapshot.title !== '直播预览' || snapshot.navigation?.length !== NAVIGATION.length) throw Error('Unexpected startup workspace');
  NAVIGATION.forEach(([page, label], i) => {
    const item = snapshot.navigation[i];
    if (item.page !== page || item.label !== label || !item.visible || !(item.width > 0 && item.height > 0))
      throw Error('Navigation is missing, hidden, or out of order: ' + page);
    if (item.active !== (page === 'live')) throw Error('Unexpected active navigation: ' + page);
  });
  if (!snapshot.frame?.visible || !(snapshot.frame.width > 0 && snapshot.frame.height > 0) || snapshot.frame.src !== base + '/live.html')
    throw Error('Live preview iframe is missing, hidden, or uses another service');
  return snapshot;
}

function validateLive(snapshot, base) {
  if (snapshot?.url !== base + '/live.html' || snapshot.readyState !== 'complete') throw Error('Live preview document is not loaded');
  for (const key of ['scene', 'chat']) {
    if (!snapshot[key]?.visible || !(snapshot[key].width > 0 && snapshot[key].height > 0)) throw Error('Live preview ' + key + ' is not visibly laid out');
  }
  const chat = new URL(snapshot.chat.src);
  if (chat.origin !== base || chat.pathname !== '/simulation.html' || chat.searchParams.get('embed') !== 'main' || !snapshot.chat.ready)
    throw Error('Embedded chat renderer did not load');
  return snapshot;
}

function validateHealth(health, { version, port, ownedPids }) {
  if (health?.name !== 'control-resonant-desktop' || health.version !== version || health.port !== port)
    throw Error('Local service identity/version does not match this smoke run');
  if (!Number.isInteger(health.pid) || !ownedPids.has(health.pid)) throw Error('Local service PID is not a child of this smoke run');
  return health;
}

async function inspectLive(cdp, shellSession, base, attached = new Map()) {
  const { targetInfos } = await cdp.send('Target.getTargets');
  const target = targetInfos.find(item => item.type === 'iframe' && item.url === base + '/live.html');
  if (target) {
    let session = attached.get(target.targetId);
    if (!session) { session = await cdp.attach(target.targetId); attached.set(target.targetId, session); }
    return validateLive(await cdp.evaluate(LIVE_EXPRESSION, session), base);
  }
  // Chromium can keep this iframe in the shell renderer instead of an OOPIF.
  const { frameTree } = await cdp.send('Page.getFrameTree', {}, shellSession);
  const find = tree => tree.frame.url === base + '/live.html' ? tree.frame.id : (tree.childFrames || []).map(find).find(Boolean);
  const frameId = find(frameTree);
  const context = [...(cdp.contexts.get(shellSession)?.values() || [])].find(item => item.auxData?.isDefault && item.auxData.frameId === frameId);
  if (!context) throw Error('Live preview execution context is not available');
  return validateLive(await cdp.evaluate(LIVE_EXPRESSION, shellSession, context.id), base);
}

function parseProcesses(text) {
  return text.trim().split(/\r?\n/).map(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    return match ? { pid: Number(match[1]), parent: Number(match[2]), group: Number(match[3]), started: match[4].trim() } : null;
  }).filter(Boolean);
}
async function processes() {
  const { stdout } = await execute('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,lstart='], { timeout: 1000, maxBuffer: 1024 * 1024, env: { ...process.env, LC_ALL: 'C' } });
  return parseProcesses(stdout);
}
function ownProcesses(rows, rootPid, known = new Map()) {
  const own = new Map();
  for (const row of rows) {
    if (known.has(row.pid) && known.get(row.pid) === row.started) own.set(row.pid, row.started);
  }
  // A detached root owns its process group. Reparented children retain it.
  const liveRoot = rows.find(row => row.pid === rootPid && own.has(rootPid));
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (!own.has(row.pid) && (own.has(row.parent) || (liveRoot?.group === rootPid && row.group === rootPid))) {
      own.set(row.pid, row.started); changed = true;
    }
  }
  return own;
}

async function stopOwned(rootPid, known, list = processes, kill = process.kill.bind(process), deadline = Date.now() + 3000) {
  if (!known.size) throw Error('Cannot confirm application process identity; no unverified PID was terminated');
  const terminated = [];
  const signal = (rows, name) => {
    for (const [pid] of ownProcesses(rows, rootPid, known)) {
      try { kill(pid, name); terminated.push({ pid, signal: name }); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  };
  let rows = await list();
  known = new Map([...known, ...ownProcesses(rows, rootPid, known)]);
  signal(rows, 'SIGTERM');
  for (let i = 0; i < 8 && Date.now() < deadline - 1200; i++) {
    await sleep(150); rows = await list();
    if (!ownProcesses(rows, rootPid, known).size) return { terminated, remaining: [] };
  }
  signal(rows, 'SIGKILL');
  await sleep(150);
  return { terminated, remaining: [...ownProcesses(await list(), rootPid, known).keys()] };
}

function pngSize(bytes) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString('ascii', 12, 16) !== 'IHDR')
    throw Error('CDP did not return a PNG screenshot');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width < 800 || height < 600) throw Error('Screenshot dimensions do not show a desktop window');
  return { width, height };
}

function analyzePNG(bytes) {
  const { width, height } = pngSize(bytes);
  const depth = bytes[24], colorType = bytes[25], channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  if (depth !== 8 || !channels || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0)
    throw Error('Screenshot PNG must use noninterlaced 8-bit RGB or RGBA');
  const stride = width * channels, decodedSize = (stride + 1) * height;
  if (decodedSize > 64 * 1024 * 1024) throw Error('Screenshot PNG is unexpectedly large');
  const chunks = []; let ended = false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    if (size > bytes.length - offset - 12) throw Error('Truncated screenshot PNG chunk');
    if (type === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + size));
    if (type === 'IEND') { ended = true; break; }
    offset += size + 12;
  }
  if (!ended || !chunks.length) throw Error('Screenshot PNG is incomplete');
  const raw = inflateSync(Buffer.concat(chunks), { maxOutputLength: decodedSize });
  if (raw.length !== decodedSize) throw Error('Screenshot PNG decoded size does not match its dimensions');
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  let previous = Buffer.alloc(stride), current = Buffer.alloc(stride);
  let samples = 0, visible = 0, bright = 0, minimum = 255, maximum = 0;
  const colors = new Set(), stepX = Math.max(1, Math.floor(width / 160)), stepY = Math.max(1, Math.floor(height / 100));
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1), filter = raw[start];
    if (filter > 4) throw Error('Unknown PNG scanline filter');
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? current[x - channels] : 0, up = previous[x], corner = x >= channels ? previous[x - channels] : 0;
      const prediction = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, corner);
      current[x] = (raw[start + 1 + x] + prediction) & 255;
    }
    if (y % stepY === 0) for (let x = 0; x < width; x += stepX) {
      samples++; const index = x * channels, alpha = channels === 4 ? current[index + 3] : 255;
      if (alpha < 32) continue;
      visible++; const r = current[index], g = current[index + 1], b = current[index + 2];
      const luminance = (r * 0.2126 + g * 0.7152 + b * 0.0722) * alpha / 255;
      minimum = Math.min(minimum, luminance); maximum = Math.max(maximum, luminance);
      if (luminance >= 24) bright++;
      colors.add((r >> 3) << 10 | (g >> 3) << 5 | b >> 3);
    }
    [previous, current] = [current, previous];
  }
  const stats = { width, height, colorType, samples, visibleFraction: visible / samples, brightFraction: bright / samples,
    luminanceRange: visible ? maximum - minimum : 0, distinctColors: colors.size };
  stats.hasVisibleContent = stats.visibleFraction >= 0.5 && stats.brightFraction >= 0.01 && stats.luminanceRange >= 20 && stats.distinctColors >= 12;
  return stats;
}

function validateDebugListener(output, port, ownedPids) {
  let owner, listeners = 0;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('p')) owner = Number(line.slice(1));
    if (line.startsWith('n')) {
      if (!ownedPids.has(owner) || line.slice(1) !== '127.0.0.1:' + port)
        throw Error('Remote debugging is not exclusively bound to this application on 127.0.0.1');
      listeners++;
    }
  }
  if (!listeners) throw Error('Could not verify the private debug listener');
}

async function run(options) {
  const began = Date.now(), deadline = began + TIMEOUT_MS, workDeadline = deadline - 5000;
  const report = { kind: 'native-macos-gui-smoke', platform: process.platform, arch: process.arch,
    startedAt: new Date(began).toISOString(), timeoutMs: TIMEOUT_MS, version: null, electron: null,
    domLoaded: false, guiLoaded: false, serviceReady: false, keychainReady: false, screenshot: null, passed: false, failureStage: null };
  fs.mkdirSync(options.output, { recursive: true, mode: 0o700 });
  let phase = 'platform', child, cdp, shellSession, reservation, profile, tracker, tracking = null, known = new Map(), launchError, launchedAt;
  let stdout = '', stderr = '', stdoutTruncated = false, stderrTruncated = false;
  const limit = 2 * 1024 * 1024;
  const alive = () => { if (launchError) throw launchError; if (child && (child.exitCode !== null || child.signalCode)) throw Error('Application exited before acceptance: ' + (child.signalCode || child.exitCode)); };
  const track = async () => {
    if (!child?.pid) return;
    alive(); const rows = await processes(); alive();
    if (!known.has(child.pid)) {
      const root = rows.find(row => row.pid === child.pid && row.group === child.pid);
      const started = root && Date.parse(root.started);
      if (!root || !Number.isFinite(started) || started < launchedAt - 1500 || started > Date.now() + 1000)
        throw Error('Could not confirm the newly launched application process identity');
      known.set(root.pid, root.started);
    }
    known = new Map([...known, ...ownProcesses(rows, child.pid, known)]);
  };
  try {
    if (process.platform !== 'darwin') throw Error('This acceptance script requires a native macOS GUI runner');
    phase = 'bundle';
    const bundle = fs.realpathSync(options.bundle), binary = path.join(bundle, 'Contents/MacOS/Electron');
    fs.accessSync(binary, fs.constants.X_OK);
    const expected = require('../package.json');
    const metadata = JSON.parse(fs.readFileSync(path.join(bundle, 'Contents/Resources/app/package.json'), 'utf8'));
    report.version = metadata.version; report.electron = expected.devDependencies.electron;
    if (metadata.name !== expected.name || metadata.version !== expected.version || metadata.devDependencies?.electron !== report.electron)
      throw Error('Bundle metadata does not match the checked-out source and pinned Electron');
    phase = 'profile';
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'control-resonant-smoke-'));
    fs.chmodSync(profile, 0o700); report.profile = profile;
    reservation = await reservePorts(workDeadline);
    const { base: port, debug } = reservation, base = 'http://127.0.0.1:' + port;
    report.servicePort = port; report.debugPort = debug;
    fs.writeFileSync(path.join(profile, 'desktop.json'), JSON.stringify({ port }), { mode: 0o600 });
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    phase = 'launch';
    await reservation.release(); reservation = null;
    launchedAt = Date.now();
    child = spawn(binary, ['--profile=' + profile, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + debug],
      { detached: true, stdio: ['ignore', 'pipe', 'pipe'], env });
    report.appPid = child.pid;
    child.on('error', error => { launchError = error; });
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > limit) { stdout = stdout.slice(-limit); stdoutTruncated = true; } });
    child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > limit) { stderr = stderr.slice(-limit); stderrTruncated = true; } });
    await track();
    tracker = setInterval(() => { if (!tracking) { tracking = track().catch(error => { report.processTrackingError = error.message; }).finally(() => { tracking = null; }); } }, 400);
    phase = 'debug-endpoint';
    const debugInfo = await until(() => fetchJSON('http://127.0.0.1:' + debug + '/json/version', debug, workDeadline), workDeadline, 'CDP endpoint', alive);
    await track();
    const listener = await execute('/usr/sbin/lsof', ['-nP', '-a', '-iTCP:' + debug, '-sTCP:LISTEN', '-Fpn'], { timeout: remaining(workDeadline), maxBuffer: 65536 });
    validateDebugListener(listener.stdout, debug, new Set(known.keys())); report.debugLoopbackVerified = true;
    cdp = await CDP.connect(debugInfo.webSocketDebuggerUrl, debug, workDeadline);
    phase = 'shell-target';
    const target = await until(async () => (await cdp.send('Target.getTargets')).targetInfos.find(item => item.type === 'page' && item.url === SHELL_URL), workDeadline, 'Protected shell target', alive);
    const session = shellSession = await cdp.attach(target.targetId); await cdp.send('Page.enable', {}, session);
    phase = 'keychain-bootstrap';
    await until(() => {
      const log = fs.existsSync(path.join(profile, 'desktop.log')) ? fs.readFileSync(path.join(profile, 'desktop.log'), 'utf8') : '';
      if (log.includes('Keychain unavailable')) throw Error('Keychain was unavailable; credential bootstrap is not accepted');
      return log.includes('Keychain initialization complete') && log.includes('Local services bootstrap sent');
    }, workDeadline, 'Keychain bootstrap (permission dialogs are not bypassed)', alive);
    report.keychainReady = true;
    phase = 'service';
    report.service = await until(async () => {
      await track();
      return validateHealth(await fetchJSON(base + '/api/release-health', port, workDeadline), { version: report.version, port, ownedPids: new Set(known.keys()) });
    }, workDeadline, 'Local service readiness', alive);
    report.serviceReady = true;
    phase = 'shell-dom';
    report.shell = await until(async () => validateShell(await cdp.evaluate(SHELL_EXPRESSION, session), { version: report.version, electron: report.electron, base }), workDeadline, 'Visible shell navigation and live iframe', alive);
    phase = 'live-dom';
    const attached = new Map();
    report.live = await until(() => inspectLive(cdp, session, base, attached), workDeadline, 'Rendered live preview and embedded chat', alive);
    report.domLoaded = true;
    phase = 'screenshot';
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }, session);
    const bytes = Buffer.from(screenshot.data, 'base64');
    report.screenshot = 'desktop.png'; fs.writeFileSync(path.join(options.output, report.screenshot), bytes, { mode: 0o600 });
    report.screenshotAnalysis = analyzePNG(bytes);
    if (!report.screenshotAnalysis.hasVisibleContent) throw Error('Screenshot is black, transparent, or effectively uniform');
    report.guiLoaded = true;
    report.passed = true;
  } catch (error) {
    report.failureStage = phase; report.error = error.message;
    if (!report.screenshot && cdp && shellSession && Date.now() < deadline - 3500) {
      try {
        cdp.deadline = Math.min(deadline - 3000, Date.now() + 1500);
        const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }, shellSession);
        const bytes = Buffer.from(result.data, 'base64');
        report.screenshot = 'failure.png'; fs.writeFileSync(path.join(options.output, report.screenshot), bytes, { mode: 0o600 });
      } catch (captureError) { report.screenshotError = captureError.message; }
    }
  } finally {
    clearInterval(tracker); if (tracking) await tracking;
    if (cdp) cdp.close(); if (reservation) await reservation.release();
    if (child?.pid) {
      try {
        report.cleanup = await stopOwned(child.pid, known, processes, process.kill.bind(process), deadline);
        if (report.cleanup.remaining.length) throw Error('Own application processes remain after cleanup');
      } catch (error) { report.cleanupError = error.message; report.passed = false; report.failureStage ||= 'cleanup'; }
    }
    child?.stdout?.destroy(); child?.stderr?.destroy(); child?.unref();
    // Never copy the profile: Keychain credentials and Chromium caches are not CI artifacts.
    fs.writeFileSync(path.join(options.output, 'stdout.log'), stdout, { mode: 0o600 });
    fs.writeFileSync(path.join(options.output, 'stderr.log'), stderr, { mode: 0o600 });
    report.logs = { stdout: 'stdout.log', stderr: 'stderr.log', stdoutTruncated, stderrTruncated };
    if (profile && fs.existsSync(path.join(profile, 'desktop.log'))) {
      fs.copyFileSync(path.join(profile, 'desktop.log'), path.join(options.output, 'desktop.log'));
      report.logs.desktop = 'desktop.log';
    }
    report.durationMs = Date.now() - began;
    fs.writeFileSync(path.join(options.output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  }
  return report;
}

if (require.main === module) {
  Promise.resolve().then(() => run(parseArgs(process.argv.slice(2)))).then(report => {
    console.log(JSON.stringify({ passed: report.passed, failureStage: report.failureStage, version: report.version, screenshot: report.screenshot }));
    process.exitCode = report.passed ? 0 : 1;
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { SHELL_URL, NAVIGATION, SHELL_EXPRESSION, LIVE_EXPRESSION, parseArgs, remaining, until, localURL,
  fetchJSON, CDP, validateShell, validateLive, validateHealth, inspectLive, parseProcesses, ownProcesses, stopOwned, pngSize, analyzePNG, validateDebugListener, run };
