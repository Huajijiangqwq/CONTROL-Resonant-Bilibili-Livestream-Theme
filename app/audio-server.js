'use strict';
const http = require('node:http'),
  path = require('node:path'),
  { spawn } = require('node:child_process');
const fs = require('node:fs'),
  AudioConfig = require('./audio-config');
function createService({ port = 8794, spawnMeter, settingsFile } = {}) {
  const clients = new Set();
  let worker = null,
    output = '',
    shutdown = false,
    lastLevel = 0,
    orphan = null;
  const state = {
    service: 'hiss-audio',
    version: 2,
    ready: false,
    enabled: false,
    source: 'desktop',
    gain: 2,
    amount: 0.8,
    peak: 0,
    bands: [0, 0, 0],
    spectrum: false,
    spectrumError: '',
    available: false,
    sources: [],
    error: '',
  };
  state.bandConfig = AudioConfig.defaults();
  if (settingsFile)
    try {
      const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      state.bandConfig = AudioConfig.validate(saved.bandConfig);
      if (/^desktop$|^pid:\d{1,10}$/.test(saved.source)) state.source = saved.source;
      if (saved.gain >= 0.5 && saved.gain <= 5) state.gain = saved.gain;
      if (saved.amount >= 0 && saved.amount <= 1) state.amount = saved.amount;
    } catch {}
  const clearLevels = () => {
    state.peak = 0;
    state.bands = [0, 0, 0];
  };
  const frequencyCommand = () =>
    command('bands:' + state.bandConfig.flatMap((b) => [b.from, b.to]).join(','));
  function saveSettings() {
    if (!settingsFile) return;
    try {
      const temporary = settingsFile + '.tmp';
      fs.writeFileSync(
        temporary,
        JSON.stringify(
          {
            source: state.source,
            gain: state.gain,
            amount: state.amount,
            bandConfig: state.bandConfig,
          },
          null,
          2,
        ),
      );
      fs.renameSync(temporary, settingsFile);
    } catch {
      state.error = '设置暂未保存到磁盘，本次预览仍然有效。';
    }
  }
  const send = (res, data) => res.write('data: ' + JSON.stringify(data) + '\n\n');
  function publish() {
    const data = { ...state, now: Date.now() };
    for (const res of clients) {
      if (res.writableLength > 32768) {
        res.destroy();
        clients.delete(res);
      } else send(res, data);
    }
  }
  function command(line) {
    if (worker?.stdin.writable) worker.stdin.write(line + '\n');
  }
  function startWorker() {
    if (worker || shutdown) return;
    state.error = '';
    state.ready = false;
    const child = (worker = spawnMeter
      ? spawnMeter()
      : spawn(
          'powershell.exe',
          [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-Mta',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            path.join(__dirname, 'audio-meter.ps1'),
          ],
          { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
        ));
    child.stdin.on('error', () => {});
    frequencyCommand();
    output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      let at;
      while ((at = output.indexOf('\n')) >= 0) {
        const line = output
          .slice(0, at)
          .replace(/^\uFEFF/, '')
          .trim();
        output = output.slice(at + 1);
        if (!line) continue;
        let data;
        try {
          data = JSON.parse(line);
        } catch {
          continue;
        }
        if (data.type === 'sources') {
          state.sources = data.sources;
          state.ready = true;
          state.error = '';
        }
        if (data.type === 'level') {
          if (state.enabled && data.source !== state.source) continue;
          state.peak = state.enabled ? Math.max(0, Math.min(1, Number(data.peak) || 0)) : 0;
          state.bands = [0, 1, 2].map((i) =>
            state.enabled ? Math.max(0, Math.min(1, Number(data.bands?.[i]) || 0)) : 0,
          );
          state.spectrum = !!data.spectrum;
          state.spectrumError = data.spectrumError || '';
          state.available = !!data.available;
          lastLevel = Date.now();
        }
        if (data.type === 'error') {
          state.error = data.message;
          clearLevels();
          state.available = false;
        }
        publish();
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text) => {
      state.error = '音频程序启动失败：' + text.slice(0, 200);
      publish();
    });
    function ended() {
      if (worker !== child) return;
      worker = null;
      state.ready = false;
      state.enabled = false;
      clearLevels();
      state.error = state.error || '音频程序已停止；点击刷新音源重试。';
      publish();
    }
    child.on('error', ended);
    child.on('exit', ended);
  }
  const originAllowed = (origin) => {
    if (!origin) return true;
    try {
      const u = new URL(origin);
      return (
        ['http:', 'https:'].includes(u.protocol) &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)
      );
    } catch {
      return false;
    }
  };
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin,
      host = (req.headers.host || '').split(':')[0];
    if (!['localhost', '127.0.0.1'].includes(host) || !originAllowed(origin)) {
      res.writeHead(403).end();
      return;
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'no-store');
    const json = (data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };
    if (req.method === 'OPTIONS') {
      res
        .writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Content-Type',
        })
        .end();
      return;
    }
    const route = new URL(req.url, 'http://127.0.0.1').pathname;
    if (req.method === 'GET' && route === '/api/health') {
      json({ ...state, pid: process.pid });
      return;
    }
    if (req.method === 'GET' && route === '/events') {
      clearTimeout(orphan);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
      });
      res.write('retry: 1500\n\n');
      clients.add(res);
      send(res, { ...state, now: Date.now() });
      res.on('close', () => {
        clients.delete(res);
        if (!clients.size)
          orphan = setTimeout(() => {
            state.enabled = false;
            clearLevels();
            command('stop');
          }, 30000);
      });
      return;
    }
    if (req.method !== 'POST' || route !== '/control') {
      json({ error: 'Not found' }, 404);
      return;
    }
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
      json({ error: 'JSON required' }, 415);
      return;
    }
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 2048) {
          json({ error: 'Too large' }, 413);
          return;
        }
      }
      const data = JSON.parse(body);
      if (data.command === 'refresh') {
        if (state.error && worker) {
          const previous = worker;
          worker = null;
          previous.kill();
        }
        startWorker();
        command('list');
        if (state.enabled) command('watch:' + state.source);
      } else if (data.command === 'configure') {
        const bandConfig =
          data.bandConfig === undefined ? null : AudioConfig.validate(data.bandConfig);
        if (data.source !== undefined && !/^desktop$|^pid:\d{1,10}$/.test(data.source))
          throw new Error('音源无效');
        if (
          data.gain !== undefined &&
          (!Number.isFinite(data.gain) || data.gain < 0.5 || data.gain > 5)
        )
          throw new Error('灵敏度无效');
        if (
          data.amount !== undefined &&
          (!Number.isFinite(data.amount) || data.amount < 0 || data.amount > 1)
        )
          throw new Error('响应强度无效');
        if (bandConfig) {
          state.bandConfig = bandConfig;
          clearLevels();
          frequencyCommand();
        }
        if (data.source !== undefined) {
          state.source = data.source;
          clearLevels();
          if (state.enabled) {
            startWorker();
            command('watch:' + state.source);
          }
        }
        if (data.gain !== undefined) state.gain = data.gain;
        if (data.amount !== undefined) state.amount = data.amount;
        saveSettings();
      } else if (data.command === 'start') {
        startWorker();
        state.enabled = true;
        clearLevels();
        command('watch:' + state.source);
      } else if (data.command === 'stop') {
        state.enabled = false;
        clearLevels();
        command('stop');
      } else throw new Error('未知操作');
      publish();
      json(state);
    } catch (error) {
      json({ error: error.message }, 400);
    }
  });
  const heartbeat = setInterval(() => {
    if (Date.now() - lastLevel > 600) clearLevels();
    publish();
  }, 1000);
  server.on('close', () => {
    shutdown = true;
    clearTimeout(orphan);
    clearInterval(heartbeat);
    for (const res of clients) res.end();
    command('quit');
    worker?.stdin.end();
  });
  return {
    server,
    state,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', reject);
          resolve(server.address());
        });
      }),
    close: () => {
      server.close();
      server.closeAllConnections();
    },
  };
}
if (require.main === module) {
  const service = createService({ settingsFile: path.join(__dirname, 'audio-settings.json') });
  service.listen().then(() => console.log('Hiss audio ready on 127.0.0.1:8794'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => service.close());
}
module.exports = { createService };
