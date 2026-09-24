'use strict';
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  { spawn } = require('node:child_process'),
  { Worker } = require('node:worker_threads');
const { normalizeTrack } = require('./now-playing-dsp');
const EMPTY = () => ({
  connected: false,
  hasSong: false,
  paused: true,
  title: '',
  artist: '',
  album: '',
  id: '',
  duration: 0,
  position: 0,
  cover: '',
  stamp: Date.now(),
});
function createService({
  port = 8795,
  settingsFile = path.join(__dirname, 'now-playing-settings.json'),
  capturePath = path.join(__dirname, 'now-playing-capture.exe'),
  defaultProvider = 'external',
  mediaProvider = null,
} = {}) {
  const builtin = mediaProvider || require('./windows-media').createWindowsMedia();
  const setupToken = require('node:crypto').randomBytes(24).toString('hex');
  const defaults = {
    musicProvider: defaultProvider,
    managedExternal: false,
    serviceUrl: 'http://127.0.0.1:9863',
    source: 'desktop',
    enabled: false,
    gain: 0,
    floor: -72,
    ceiling: -12,
    attack: 18,
    release: 135,
    tilt: 2,
    texture: 0.65,
    flow: 1,
    fps: 60,
  };
  let config = { ...defaults };
  try {
    config = { ...config, ...validate(JSON.parse(fs.readFileSync(settingsFile, 'utf8'))) };
  } catch {}
  const clients = new Set();
  let capture = null,
    worker = null,
    pending = 0,
    generation = 0,
    buffer = Buffer.alloc(0),
    lastAudio = 0,
    lastPublish = 0,
    closing = false,
    polling = false,
    coverCache = null,
    orphan = null,
    packetCount = 0;
  const state = {
    service: 'hiss-now-playing',
    version: 1,
    config,
    track: EMPTY(),
    musicError: '',
    audio: {
      running: false,
      ready: false,
      error: '',
      db: Array(48).fill(-120),
      rms: 0,
      rate: 0,
      channels: 0,
      computeMs: 0,
      pipeAgeMs: 0,
      packets: 0,
      stamp: 0,
    },
    sources: [{ id: 'desktop', name: '桌面音频（默认输出）' }],
  };
  function validate(input) {
    const result = {};
    if (!input || typeof input !== 'object') throw Error('设置无效');
    if (input.musicProvider !== undefined) {
      if (!['builtin', 'external'].includes(input.musicProvider)) throw Error('歌曲来源无效');
      result.musicProvider = input.musicProvider;
    }
    if (typeof input.managedExternal === 'boolean') result.managedExternal = input.managedExternal;
    if (input.serviceUrl !== undefined) {
      const url = new URL(input.serviceUrl);
      if (
        url.protocol !== 'http:' ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        url.username ||
        url.password
      )
        throw Error('请输入本机 Now Playing 地址');
      result.serviceUrl = url.origin;
    }
    if (input.source !== undefined) {
      if (!/^desktop$|^pid:[1-9]\d{0,9}$/.test(input.source)) throw Error('音源无效');
      result.source = input.source;
    }
    if (input.enabled !== undefined) {
      if (typeof input.enabled !== 'boolean') throw Error('开关无效');
      result.enabled = input.enabled;
    }
    const bounds = {
      gain: [-24, 24],
      floor: [-100, -25],
      ceiling: [-30, 0],
      attack: [5, 100],
      release: [40, 450],
      tilt: [0, 5],
      texture: [0, 1],
      flow: [0.2, 2],
      fps: [1, 240],
    };
    for (const [key, [lo, hi]] of Object.entries(bounds))
      if (input[key] !== undefined) {
        const n = Number(input[key]);
        if (!Number.isFinite(n) || n < lo || n > hi) throw Error('参数超出范围：' + key);
        result[key] = key === 'fps' ? Math.round(n) : n;
      }
    return result;
  }
  function publish(type = 'state', data = state) {
    const line = 'event: ' + type + '\ndata: ' + JSON.stringify(data) + '\n\n';
    for (const response of clients) {
      if (response.writableLength > 32000) {
        response.destroy();
        clients.delete(response);
      } else response.write(line);
    }
  }
  function save() {
    fs.writeFileSync(settingsFile + '.tmp', JSON.stringify(config, null, 2));
    fs.renameSync(settingsFile + '.tmp', settingsFile);
  }
  function silence() {
    state.audio.db = Array(48).fill(-120);
    state.audio.rms = 0;
    state.audio.stamp = Date.now();
    publish('audio', state.audio);
  }
  function stopCapture() {
    generation++;
    if (capture) {
      const old = capture;
      capture = null;
      old.stdin.end();
      setTimeout(() => {
        if (old.exitCode === null) old.kill();
      }, 600).unref();
    }
    if (worker) {
      worker.terminate();
      worker = null;
    }
    buffer = Buffer.alloc(0);
    pending = 0;
    state.audio.running = false;
    state.audio.ready = false;
    silence();
  }
  function startCapture() {
    stopCapture();
    if (!config.enabled || closing) return;
    state.audio.error = '';
    state.audio.running = true;
    const ownGeneration = generation;
    if (!fs.existsSync(capturePath)) {
      state.audio.running = false;
      state.audio.error = '请打开桌面客户端或运行“启动全部服务.cmd”，完成本机音频组件准备。';
      publish();
      return;
    }
    const dsp = (worker = new Worker(path.join(__dirname, 'now-playing-worker.js')));
    dsp.on('message', (message) => {
      if (ownGeneration !== generation) return;
      pending = Math.max(0, pending - 1);
      if (message.type === 'failure') {
        state.audio.error = message.error;
        publish();
        return;
      }
      if (message.result) {
        lastAudio = Date.now();
        Object.assign(state.audio, message.result, {
          stamp: lastAudio,
          computeMs: message.computeMs,
          pipeAgeMs: lastAudio - message.received,
          ready: true,
          packets: packetCount,
        });
        if (lastAudio - lastPublish >= 14) {
          lastPublish = lastAudio;
          publish('audio', state.audio);
        }
      }
    });
    dsp.on('error', (error) => {
      if (ownGeneration === generation) {
        state.audio.error = error.message;
        stopCapture();
        publish();
      }
    });
    const child = (capture = spawn(capturePath, [config.source], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    }));
    child.stdin.on('error', () => {});
    child.stdout.on('data', (chunk) => {
      if (ownGeneration !== generation) return;
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 2097152) {
        buffer = Buffer.alloc(0);
        state.audio.error = '音频数据积压，已丢弃旧数据。';
        return;
      }
      while (buffer.length >= 16) {
        if (buffer.readUInt32LE(0) !== 0x3153504e) {
          state.audio.error = '音频数据格式异常';
          stopCapture();
          publish();
          return;
        }
        const rate = buffer.readInt32LE(4),
          channels = buffer.readInt32LE(8),
          count = buffer.readInt32LE(12),
          bytes = count * channels * 4;
        if (
          rate < 8000 ||
          rate > 384000 ||
          channels < 1 ||
          channels > 32 ||
          count < 1 ||
          count > rate
        ) {
          state.audio.error = '音频格式超出范围';
          stopCapture();
          publish();
          return;
        }
        if (buffer.length < 16 + bytes) break;
        const pcm = buffer.subarray(16, 16 + bytes);
        buffer = buffer.subarray(16 + bytes);
        packetCount++;
        if (pending < 3) {
          const samples = new Float32Array(count * channels);
          for (let i = 0; i < samples.length; i++) samples[i] = pcm.readFloatLE(i * 4);
          pending++;
          dsp.postMessage(
            {
              rate,
              channels,
              samples: samples.buffer,
              received: Date.now(),
              generation: ownGeneration,
            },
            [samples.buffer],
          );
        } else {
          state.audio.dropped = (state.audio.dropped || 0) + 1;
        }
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (line) => {
      if (ownGeneration !== generation) return;
      if (line.includes('ERROR:')) {
        state.audio.error = line.trim().slice(0, 200);
        publish();
      }
    });
    const ended = () => {
      if (capture !== child) return;
      capture = null;
      state.audio.running = false;
      state.audio.ready = false;
      state.audio.error = state.audio.error || '音频连接已断开，点击重新捕获。';
      silence();
      publish();
    };
    child.on('exit', ended);
    child.on('error', ended);
    publish();
  }
  async function refreshSources() {
    if (!fs.existsSync(capturePath)) return;
    await new Promise((resolve) => {
      const process = spawn(capturePath, ['list'], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let text = '';
      const timeout = setTimeout(() => {
        process.kill();
        resolve();
      }, 3500);
      process.stdout.setEncoding('utf8');
      process.stdout.on('data', (chunk) => {
        text += chunk;
        const line = text.split('\n').find((s) => s.trim().startsWith('{'));
        if (!line) return;
        try {
          const info = JSON.parse(line.replace(/^\uFEFF/, ''));
          if (info.type === 'sources') {
            state.sources = info.sources.filter((s) => s.id !== 'pid:0');
            publish();
            process.stdin.end();
          }
        } catch {}
      });
      process.stdin.on('error', () => {});
      process.on('error', () => {
        clearTimeout(timeout);
        resolve();
      });
      process.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  async function pollMusic() {
    if (polling || closing) return;
    if (config.musicProvider === 'builtin') {
      const result = builtin.read();
      state.track = result.track;
      state.musicError = result.error || '';
      publish('track', state.track);
      return;
    }
    polling = true;
    const base = config.serviceUrl;
    try {
      const [query, progress] = await Promise.all([
        fetch(base + '/query', { signal: AbortSignal.timeout(1300) }).then((r) => {
          if (!r.ok) throw Error('HTTP ' + r.status);
          return r.json();
        }),
        fetch(base + '/query/progress', { signal: AbortSignal.timeout(1300) })
          .then((r) => r.json())
          .catch(() => null),
      ]);
      if (closing || base !== config.serviceUrl || config.musicProvider !== 'external') return;
      const next = normalizeTrack(query, progress);
      if (state.track.cover !== next.cover) coverCache = null;
      state.track = next;
      state.musicError = '';
      publish('track', next);
    } catch {
      if (closing || base !== config.serviceUrl || config.musicProvider !== 'external') return;
      state.track = { ...state.track, connected: false, paused: true, stamp: Date.now() };
      state.musicError = '未连接 Now Playing，请确认软件已打开并检查地址。';
      publish('track', state.track);
    } finally {
      polling = false;
    }
  }
  const origins = new Set(['localhost', '127.0.0.1', '[::1]']);
  const externalSetup = require('./now-playing-setup').createSetup({
    root: path.join(path.dirname(settingsFile), 'external-now-playing'),
    currentUrl: () => config.serviceUrl,
    configure: async (serviceUrl, managedExternal) => {
      if (closing) return;
      builtin.stop();
      config = { ...config, musicProvider: 'external', serviceUrl, managedExternal };
      state.config = config;
      save();
      await pollMusic();
      publish();
    },
  });
  const server = http.createServer(async (req, res) => {
    let requestUrl;
    try {
      requestUrl = new URL(req.url, 'http://' + req.headers.host);
      if (!origins.has(requestUrl.hostname)) throw Error();
      if (req.headers.origin && !origins.has(new URL(req.headers.origin).hostname)) throw Error();
    } catch {
      res.writeHead(403).end();
      return;
    }
    if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') {
      res
        .writeHead(204, {
          'Access-Control-Allow-Methods': 'GET,POST',
          'Access-Control-Allow-Headers': 'Content-Type, X-Setup-Token',
        })
        .end();
      return;
    }
    const json = (data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };
    const route = requestUrl.pathname;
    if (route === '/api/external-setup') {
      const ownPort = server.address()?.port || port;
      const allowed = [ownPort, ownPort - 4].flatMap(p =>
        ['http://127.0.0.1:' + p, 'http://localhost:' + p]);
      if (!allowed.includes(req.headers.origin)) { json({ error: '只允许当前客户端操作' }, 403); return; }
      if (req.method === 'POST') {
        if (req.headers['x-setup-token'] !== setupToken ||
            !/^application\/json\b/.test(req.headers['content-type'] || '')) {
          json({ error: '操作凭证失效，请刷新后重试' }, 403); return;
        }
        void externalSetup.start();
      } else if (req.method !== 'GET') { json({ error: 'Method not allowed' }, 405); return; }
      json({ ...externalSetup.snapshot(), token: setupToken });
      return;
    }
    if (req.method === 'GET' && route === '/api/health') {
      json({ ...state, pid: process.pid });
      return;
    }
    if (req.method === 'GET' && route === '/events') {
      clearTimeout(orphan);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
      res.write('retry: 1500\n\n');
      clients.add(res);
      res.write('event: state\ndata: ' + JSON.stringify(state) + '\n\n');
      if (config.enabled && !capture) startCapture();
      res.on('close', () => {
        clients.delete(res);
        if (!clients.size) orphan = setTimeout(stopCapture, 30000);
      });
      return;
    }
    if (req.method === 'GET' && route === '/api/cover') {
      try {
        if (config.musicProvider === 'builtin') {
          const cover = builtin.cover();
          if (!cover) { res.writeHead(404).end(); return; }
          res.writeHead(200, { 'Content-Type': cover.type, 'Cache-Control': 'no-store' });
          res.end(cover.bytes);
          return;
        }
        const cover = state.track.cover;
        if (!cover) {
          res.writeHead(404).end();
          return;
        }
        if (!coverCache || coverCache.url !== cover) {
          const url = new URL(cover, config.serviceUrl);
          if (!['http:', 'https:'].includes(url.protocol)) throw Error();
          const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
          const type = response.headers.get('content-type') || '';
          if (!response.ok || !/^image\/(png|jpe?g|webp|gif)/i.test(type)) throw Error();
          const chunks = [];
          let size = 0;
          for await (const chunk of response.body) {
            size += chunk.length;
            if (size > 8 * 1024 * 1024) throw Error();
            chunks.push(chunk);
          }
          coverCache = { url: cover, type, bytes: Buffer.concat(chunks) };
        }
        res.writeHead(200, {
          'Content-Type': coverCache.type,
          'Cache-Control': 'private, max-age=30',
        });
        res.end(coverCache.bytes);
      } catch {
        res.writeHead(502).end();
      }
      return;
    }
    if (req.method === 'POST' && route === '/control') {
      if (!/^application\/json\b/.test(req.headers['content-type'] || '')) {
        json({ error: 'JSON required' }, 415);
        return;
      }
      try {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 4096) throw Error('请求过大');
        }
        const data = JSON.parse(body);
        if (data.command === 'refresh') {
          await refreshSources();
          if (config.enabled) startCapture();
          pollMusic();
        } else {
          const updates = validate(data),
            next = { ...config, ...updates };
          if (next.floor >= next.ceiling - 6) throw Error('灵敏度范围太窄');
          const restart = next.source !== config.source || next.enabled !== config.enabled;
          if (next.musicProvider !== config.musicProvider) builtin.stop();
          config = next;
          state.config = config;
          save();
          if (restart) startCapture();
          pollMusic();
        }
        publish();
        json(state);
      } catch (error) {
        json({ error: error.message }, 400);
      }
      return;
    }
    json({ error: 'Not found' }, 404);
  });
  const watch = setInterval(() => {
    if (state.audio.rms && Date.now() - lastAudio > 110) silence();
  }, 40);
  const poll = setInterval(pollMusic, 500),
    heartbeat = setInterval(() => publish(), 3000);
  async function listen() {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    refreshSources();
    pollMusic();
    if (config.musicProvider === 'external' && config.managedExternal) void externalSetup.start(false);
    return server.address();
  }
  function close() {
    closing = true;
    externalSetup.close();
    builtin.close();
    clearTimeout(orphan);
    for (const timer of [watch, poll, heartbeat]) clearInterval(timer);
    stopCapture();
    for (const res of clients) res.end();
    server.close();
    server.closeAllConnections();
  }
  return { listen, close, server, state };
}
if (require.main === module) {
  const app = createService();
  app.listen().then(() => console.log('Now Playing skin service: http://127.0.0.1:8795'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close());
}
module.exports = { createService };
