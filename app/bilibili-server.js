'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { BilibiliOpenRelay } = require('./bilibili-open-relay');
const { createStore } = require('./bilibili-open-store');
const { config: openConfig } = require('./bilibili-open-protocol');
const { createSessionStore } = require('./bilibili-session-store');
const { createQrAuth } = require('./bilibili-qr-auth');
const {
  roomNumber,
  wbiSign,
  packet,
  decodePackets,
  normalize,
  Deduplicator,
} = require('./bilibili-protocol');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
class ConnectionError extends Error {
  constructor(message, retry = false) {
    super(message);
    this.retry = retry;
  }
}
class BilibiliRelay {
  constructor(publish) {
    this.publish = publish;
    this.generation = 0;
    this.state = {
      phase: 'idle',
      message: '尚未连接直播间',
      roomInput: '',
      roomId: null,
      title: '',
      received: 0,
      skipped: 0,
      lastMessageAt: null,
      lastHeartbeatAt: null,
    };
    this.credentials = '';
    this.dedup = new Deduplicator();
    this.retries = 0;
    this.wanted = false;
  }
  status(patch) {
    Object.assign(this.state, patch);
    this.publish('status', this.state);
  }
  cleanup() {
    clearTimeout(this.retryTimer);
    clearTimeout(this.authTimer);
    clearInterval(this.heartbeat);
    this.abort?.abort();
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      try {
        ws.close();
      } catch {}
    }
  }
  disconnect() {
    this.wanted = false;
    this.generation++;
    this.cleanup();
    this.credentials = '';
    this.cookies = null;
    this.status({ phase: 'idle', message: '已断开连接。本机保存的登录信息仍可用于下次连接。' });
  }
  connect(input, session = '') {
    const room = roomNumber(input);
    if (typeof session !== 'string' || session.length > 4096 || /[\r\n;]/.test(session))
      throw new Error('登录信息格式不正确；这里只填写 SESSDATA 的值。');
    this.wanted = false;
    this.generation++;
    this.cleanup();
    this.credentials = session.trim();
    this.cookies = null;
    this.retries = 0;
    this.dedup = new Deduplicator();
    this.wanted = true;
    this.status({
      phase: 'connecting',
      message: '正在读取直播间信息',
      roomInput: String(room),
      roomId: null,
      title: '',
      received: 0,
      skipped: 0,
      lastMessageAt: null,
      lastHeartbeatAt: null,
      authenticated: false,
      liveStatus: null,
    });
    this.attempt(this.generation);
  }
  async request(url, signal, { json = true } = {}) {
    const headers = { 'User-Agent': UA, Referer: 'https://live.bilibili.com/' },
      cookies = this.cookies;
    if (cookies?.size) headers.Cookie = [...cookies].map(([k, v]) => k + '=' + v).join('; ');
    let response;
    try {
      response = await fetch(url, {
        headers,
        signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
        redirect: 'error',
      });
    } catch (e) {
      if (signal.aborted) throw e;
      throw new ConnectionError('网络连接失败或超时，将自动重试。', true);
    }
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0],
        at = pair.indexOf('=');
      if (at < 0) continue;
      const name = pair.slice(0, at);
      if (['buvid3', 'b_nut', 'buvid4'].includes(name)) cookies.set(name, pair.slice(at + 1));
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ConnectionError(
        'Bilibili 请求失败（HTTP ' +
          response.status +
          '）' +
          ([401, 403, 412].includes(response.status) ? '，请检查登录状态，稍后手动重试。' : '。'),
        response.status >= 500,
      );
    }
    if (!json) {
      await response.body?.cancel();
      return null;
    }
    try {
      return await response.json();
    } catch {
      throw new ConnectionError('Bilibili 返回了无法读取的响应，请稍后重试。');
    }
  }
  apiCheck(data, label) {
    if (data?.code !== 0)
      throw new ConnectionError(
        label +
          '失败（Bilibili ' +
          String(data?.code ?? '未知状态') +
          '）。' +
          ([-101, -352, -403].includes(data?.code)
            ? '可能需要登录或平台验证；请补充登录信息后手动重试。'
            : '请确认房间号，稍后再试。'),
      );
  }
  async attempt(generation) {
    if (!this.wanted || generation !== this.generation) return;
    const active = () => this.wanted && generation === this.generation;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.cookies = new Map();
    if (this.credentials) this.cookies.set('SESSDATA', this.credentials);
    try {
      const room = await this.request(
        'https://api.live.bilibili.com/room/v1/Room/get_info?room_id=' + this.state.roomInput,
        signal,
      );
      if (!active()) return;
      this.apiCheck(room, '读取房间');
      const roomId = Number(room.data.room_id);
      if (!Number.isSafeInteger(roomId) || roomId < 1)
        throw new ConnectionError('未找到有效直播间。');
      this.status({
        roomId,
        title: String(room.data.title || '').slice(0, 200),
        liveStatus: room.data.live_status,
        message: '正在申请实时消息连接',
      });
      const nav = await this.request('https://api.bilibili.com/x/web-interface/nav', signal);
      if (!active()) return;
      if (this.credentials && (nav.code !== 0 || !nav.data?.isLogin))
        throw new ConnectionError('登录信息未生效或已过期，请更新后连接。');
      const wbi = nav.data?.wbi_img;
      if (!wbi) throw new ConnectionError('未取得连接签名，请稍后再试。');
      await this.request('https://www.bilibili.com/', signal, { json: false });
      if (!active()) return;
      if (!this.cookies.has('buvid3')) throw new ConnectionError('未取得访客标识，请稍后再试。');
      const query = wbiSign({ id: roomId, type: 0 }, wbi.img_url, wbi.sub_url);
      const config = await this.request(
        'https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?' + query,
        signal,
      );
      if (!active()) return;
      this.apiCheck(config, '申请消息通道');
      const hosts = (config.data?.host_list || []).filter(
        (h) =>
          typeof h.host === 'string' &&
          /^[a-z0-9.-]+\.chat\.bilibili\.com$/i.test(h.host) &&
          Number(h.wss_port) > 0 &&
          Number(h.wss_port) <= 65535,
      );
      if (!hosts.length || !config.data.token)
        throw new ConnectionError('直播间没有返回有效消息通道。');
      const host = hosts[this.retries % hosts.length];
      this.status({ message: '正在验证消息通道', authenticated: !!nav.data?.isLogin });
      const ws = new WebSocket(`wss://${host.host}:${host.wss_port}/sub`);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      let failed = false,
        authorized = false,
        lastReply = Date.now();
      const fail = (error) => {
        if (failed || !active()) return;
        failed = true;
        this.fail(error, generation);
      };
      this.authTimer = setTimeout(
        () => fail(new ConnectionError('消息通道响应超时。', true)),
        15000,
      );
      ws.addEventListener('open', () => {
        if (!active()) return;
        ws.send(
          packet(7, {
            uid: nav.data?.isLogin ? nav.data.mid : 0,
            roomid: roomId,
            protover: 3,
            platform: 'web',
            type: 2,
            buvid: this.cookies.get('buvid3'),
            key: config.data.token,
          }),
        );
      });
      ws.addEventListener('message', (event) => {
        if (!active() || failed) return;
        try {
          for (const p of decodePackets(event.data)) {
            if (p.op === 8) {
              if (p.data.code !== 0) {
                fail(
                  new ConnectionError(
                    '消息通道鉴权失败（' + String(p.data.code) + '）。请检查登录信息后重试。',
                  ),
                );
                return;
              }
              if (authorized) continue;
              authorized = true;
              clearTimeout(this.authTimer);
              lastReply = Date.now();
              this.retries = 0;
              this.status({
                phase: 'connected',
                message: nav.data?.isLogin
                  ? '已连接，等待实时消息'
                  : '已连接（访客模式，用户名可能被平台打码）',
              });
              ws.send(packet(2));
              this.heartbeat = setInterval(() => {
                if (!active()) return;
                if (Date.now() - lastReply > 75000) {
                  fail(new ConnectionError('消息心跳中断。', true));
                  return;
                }
                if (ws.readyState === WebSocket.OPEN) ws.send(packet(2));
              }, 30000);
            } else if (p.op === 3) {
              lastReply = Date.now();
              this.status({ lastHeartbeatAt: lastReply });
            } else if (p.op === 5 && authorized) {
              if (p.invalid) this.skipMessage();
              else this.command(p.data);
            }
          }
        } catch {
          fail(new ConnectionError('消息格式发生变化，连接已停止；请更新接入模块后再试。'));
        }
      });
      ws.addEventListener('error', () => fail(new ConnectionError('实时消息连接中断。', true)));
      ws.addEventListener('close', () => fail(new ConnectionError('实时消息通道已关闭。', true)));
    } catch (e) {
      if (active()) this.fail(e, generation);
    }
  }
  skipMessage() {
    this.status({ skipped: this.state.skipped + 1 });
  }
  command(command) {
    if (command?.cmd === 'LIVE') this.status({ liveStatus: 1 });
    if (command?.cmd === 'PREPARING') this.status({ liveStatus: 0 });
    let items;
    try {
      items = normalize(command);
    } catch {
      this.skipMessage();
      return;
    }
    for (const item of items) {
      if (!this.dedup.accept(item)) continue;
      this.state.lastMessageAt = Date.now();
      if (item.kind !== 'delete') this.state.received++;
      this.publish('message', { ...item, roomId: this.state.roomId });
      this.publish('status', this.state);
    }
  }
  fail(error, generation) {
    if (generation !== this.generation || !this.wanted) return;
    this.generation++;
    this.cleanup();
    if (error.retry && this.retries < 8) {
      const wait = Math.min(30000, 1500 * 2 ** this.retries++),
        next = this.generation;
      this.status({
        phase: 'retrying',
        message: (error.message || '连接中断。') + ' ' + Math.ceil(wait / 1000) + ' 秒后重试。',
      });
      this.retryTimer = setTimeout(() => this.attempt(next), wait);
    } else {
      this.wanted = false;
      this.credentials = '';
      this.cookies = null;
      this.status({
        phase: 'error',
        message:
          (error instanceof ConnectionError ? error.message : '连接未完成，请稍后重试。') +
          (error.retry ? ' 已达到自动重试次数，请手动重新连接。' : ''),
      });
    }
  }
}
function startServer(port = 8793, options = {}) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
  const token = crypto.randomBytes(32).toString('hex'),
    clients = new Set();
  const origins = new Set(
    [port - 2, port - 1, port].flatMap((p) => ['http://127.0.0.1:' + p, 'http://localhost:' + p]),
  );
  const publish = (event, data) => {
    const body = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      if (client.writableLength > 1024 * 1024) {
        client.destroy();
        clients.delete(client);
      } else client.write(body);
    }
  };
  let active;
  const web = new BilibiliRelay((event, data) => {
    if (active === web) publish(event, event === 'status' ? { ...data, mode: 'web' } : data);
  });
  const open = new BilibiliOpenRelay((event, data) => {
    if (active === open) publish(event, data);
  }, options.open);
  const store = options.store || createStore({ file: options.settingsFile });
  const sessions = options.sessionStore || createSessionStore({ file: options.sessionFile });
  const qrAuth = createQrAuth(sessions, options.qr);
  const openAvailable = options.enableOpen === true;
  const openInfo = () => ({ ...store.info(), available: openAvailable });
  active = web;
  const relay = {
    get state() { return { ...active.state, mode: active === open ? 'open' : 'web' }; },
    disconnect() { return active.disconnect(); },
    connect(room, session) { roomNumber(room); open.disconnect(); active = web; web.connect(room, session); },
    connectOpen(value) { web.disconnect(); active = open; open.connect(value); },
  };
  function mergedConfig(input, requireCode) {
    const value = store.read();
    for (const key of ['appId', 'accessKeyId', 'accessKeySecret', 'code']) {
      if (input[key] !== undefined && typeof input[key] !== 'string') throw Error('身份码配置格式不正确。');
      if (input[key]?.trim()) value[key] = input[key].trim();
    }
    value.autoConnect = input.autoConnect === true;
    return openConfig(value, requireCode);
  }
  const json = (res, status, value) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(value));
  };
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.webm': 'video/webm',
    '.md': 'text/plain; charset=utf-8',
    '.woff2': 'font/woff2',
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['127.0.0.1:' + port, 'localhost:' + port].includes(req.headers.host)) {
      res.writeHead(403);
      return res.end();
    }
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) {
      res.writeHead(403);
      return res.end();
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Control-Token',
      });
      return res.end();
    }
    let url;
    try {
      url = new URL(req.url, 'http://127.0.0.1:' + port);
    } catch {
      return json(res, 400, { error: '无效地址。' });
    }
    if (url.pathname === '/api/health' && req.method === 'GET')
      return json(res, 200, { service: 'hiss-bilibili', version: 4, token, status: relay.state, openSettings: openInfo(), login: sessions.info() });
    if (url.pathname === '/api/events' && req.method === 'GET') {
      if (clients.size >= 16) return json(res, 429, { error: '预览窗口过多，请关闭部分窗口。' });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`event: status\ndata: ${JSON.stringify(relay.state)}\n\n`);
      clients.add(res);
      const keep = setInterval(() => res.write(': keepalive\n\n'), 15000);
      req.on('close', () => {
        clearInterval(keep);
        clients.delete(res);
      });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      if (
        req.method !== 'POST' ||
        req.headers['x-control-token'] !== token ||
        !String(req.headers['content-type']).startsWith('application/json')
      )
        return json(res, 403, { error: '请从本地控制页操作。' });
      let body = '',
        size = 0;
      try {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 8192) {
            res.writeHead(413);
            res.end();
            req.destroy();
            return;
          }
          body += chunk.toString();
        }
        body = JSON.parse(body || '{}');
      } catch {
        return json(res, 400, { error: '请求格式错误。' });
      }
      try {
        if (url.pathname === '/api/login/start')
          return json(res, 200, { ok: true, qr: await qrAuth.start(), login: sessions.info() });
        if (url.pathname === '/api/login/poll')
          return json(res, 200, { ok: true, qr: await qrAuth.poll(body.id), login: sessions.info() });
        if (url.pathname === '/api/login/cancel') {
          qrAuth.cancel(body.id);
          return json(res, 200, { ok: true, login: sessions.info() });
        }
        if (url.pathname === '/api/login/forget') {
          qrAuth.cancel(); sessions.clear();
          if (active === web) web.disconnect();
          return json(res, 200, { ok: true, login: sessions.info() });
        }
        if (url.pathname === '/api/connect') {
          if (body.mode === 'open') {
            if (!openAvailable) return json(res, 501, { error: '主播身份码接入暂未开放。请先使用房间号 / SESSDATA 接入。' });
            const value = mergedConfig(body.open || {}, true);
            if (body.remember === true) store.save(value);
            else store.clear();
            relay.connectOpen(value);
          } else if (body.mode === undefined || body.mode === 'web') {
            if (body.session !== undefined && typeof body.session !== 'string') throw Error('登录信息格式无效。');
            const session = body.guest === true ? '' : body.session?.trim() || sessions.read();
            relay.connect(body.room, session);
          }
          else throw Error('接入方式无效。');
          return json(res, 202, { ok: true, status: relay.state });
        }
        if (url.pathname === '/api/open-settings') {
          if (!openAvailable) return json(res, 501, { error: '主播身份码接入暂未开放。' });
          store.save(mergedConfig(body, false));
          return json(res, 200, { ok: true, status: relay.state, openSettings: openInfo() });
        }
        if (url.pathname === '/api/open-forget') {
          store.clear();
          return json(res, 200, { ok: true, status: relay.state, openSettings: openInfo() });
        }
        if (url.pathname === '/api/disconnect') {
          relay.disconnect();
          return json(res, 200, { ok: true, status: relay.state });
        }
        return json(res, 404, { error: '未找到操作。' });
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      return res.end();
    }
    let name;
    try {
      name = decodeURIComponent(url.pathname.slice(1)) || 'simulation.html';
    } catch {
      res.writeHead(400);
      return res.end();
    }
    const skinFont = /^now-playing-fonts\/[a-z0-9.-]+\.woff2$/.test(name);
    if (
      (name !== path.basename(name) && !skinFont) ||
      name.includes('\\') ||
      !mime[path.extname(name)] ||
      /^bilibili-(?:server|protocol|qr-auth|session-store|open-(?:store|protocol|relay))\.js$/.test(name)
    ) {
      res.writeHead(404);
      return res.end();
    }
    const file = path.join(__dirname, name);
    let stat;
    try {
      stat = fs.statSync(file);
      if (!stat.isFile()) throw 0;
    } catch {
      res.writeHead(404);
      return res.end();
    }
    res.setHeader('Content-Type', mime[path.extname(name)]);
    res.setHeader('Cache-Control', 'no-cache');
    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', stat.size);
      return res.end();
    }
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res);
  });
  server.listen(port, '127.0.0.1', () => {
    console.log('Bilibili 本地接入已启动，端口：' + port);
    if (openAvailable && store.info().autoConnect) relay.connectOpen(store.read());
  });
  server.on('close', () => {
    qrAuth.cancel();
    relay.disconnect();
    for (const client of clients) client.end();
  });
  server.on('error', (e) =>
    console.error(
      e.code === 'EADDRINUSE'
        ? '端口已被占用，请检查现有本地服务。'
        : '本地服务启动失败：' + e.code,
    ),
  );
  return { server, relay };
}
if (require.main === module) startServer(Number(process.env.HISS_BILIBILI_PORT || 8793));
module.exports = { BilibiliRelay, startServer };
