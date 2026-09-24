'use strict';
const { packet, decodePackets, Deduplicator } = require('./bilibili-protocol');
const { config, requestBody, sign, normalizeOpen } = require('./bilibili-open-protocol');
class OpenError extends Error {
  constructor(message, retry = false) { super(message); this.retry = retry; }
}
class BilibiliOpenRelay {
  constructor(publish, { fetch: request = globalThis.fetch, WebSocket: Socket = globalThis.WebSocket,
    appBeatMs = 20000, socketBeatMs = 30000, retryMs = 1500 } = {}) {
    Object.assign(this, { publish, request, Socket, appBeatMs, socketBeatMs, retryMs });
    this.generation = 0; this.wanted = false; this.retries = 0; this.settled = Promise.resolve();
    this.state = { mode: 'open', phase: 'idle', message: '尚未通过身份码连接', roomInput: '', roomId: null,
      title: '', received: 0, skipped: 0, lastMessageAt: null, lastHeartbeatAt: null, authenticated: false };
  }
  status(patch) { Object.assign(this.state, patch); this.publish('status', this.state); }
  socketCleanup() {
    clearTimeout(this.retryTimer); clearTimeout(this.authTimer); clearInterval(this.wsBeat);
    const ws = this.ws; this.ws = null;
    try { ws?.close(); } catch {}
  }
  async api(operation, value, gameId = '') {
    const body = requestBody(operation, value, gameId);
    let response;
    try {
      response = await this.request('https://live-open.biliapi.com/v2/app/' + operation, {
        method: 'POST', headers: sign(body, value), body, redirect: 'error',
        signal: AbortSignal.timeout(operation === 'end' ? 5000 : 12000),
      });
    } catch { throw new OpenError('开放平台网络连接失败或超时。', true); }
    if (!response.ok) { await response.body?.cancel(); throw new OpenError('开放平台请求失败（HTTP ' + response.status + '）。', response.status >= 500 || response.status === 429); }
    let result;
    try { result = await response.json(); } catch { throw new OpenError('开放平台响应格式不正确。'); }
    if (result?.code !== 0) {
      // Do not echo untrusted responses: they may contain submitted credentials.
      const code = Number.isSafeInteger(result?.code) ? result.code : '未知';
      throw new OpenError(`开放平台拒绝了请求（${code}）。请检查身份码、应用状态、密钥与消息权限。`);
    }
    return result.data;
  }
  end(session) {
    return session ? this.api('end', session.config, session.id).catch(() => {}) : Promise.resolve();
  }
  disconnect() {
    this.wanted = false; this.generation++; this.socketCleanup(); clearInterval(this.appBeat);
    const old = this.session; this.session = null; this.credentials = null;
    this.settled = Promise.allSettled([this.settled, this.end(old)]).then(() => {});
    this.status({ phase: 'idle', message: '已断开身份码接入', authenticated: false });
    return this.settled;
  }
  connect(input) {
    const value = config(input);
    this.disconnect();
    this.wanted = true; this.credentials = value; this.retries = 0; this.dedup = new Deduplicator();
    const generation = this.generation;
    this.status({ phase: 'connecting', message: '正在通过身份码申请官方消息通道', roomInput: '', roomId: null,
      title: '', received: 0, skipped: 0, lastMessageAt: null, lastHeartbeatAt: null, authenticated: false, liveStatus: null });
    const previous = this.settled;
    this.settled = previous.then(() => this.start(generation, value));
  }
  active(generation) { return this.wanted && generation === this.generation; }
  async start(generation, value) {
    if (!this.active(generation)) return;
    try {
      const data = await this.api('start', value), id = data?.game_info?.game_id;
      const session = id && { id: String(id), config: value };
      if (!this.active(generation)) { await this.end(session); return; }
      if (!session) throw new OpenError('开放平台未返回有效场次，请检查应用是否可用。');
      this.session = session;
      const info = data?.websocket_info, roomId = Number(data?.anchor_info?.room_id);
      const links = Array.isArray(info?.wss_link) ? info.wss_link.filter(link => {
        try { const u = new URL(link); return u.protocol === 'wss:' && !u.username && !u.password && !u.hash; } catch { return false; }
      }) : [];
      if (!links.length || typeof info.auth_body !== 'string' || info.auth_body.length > 16384 ||
        !Number.isSafeInteger(roomId) || roomId < 1) throw new OpenError('官方消息通道信息不完整。');
      JSON.parse(info.auth_body);
      Object.assign(session, { links, authBody: info.auth_body, lastBeat: Date.now(), beating: false });
      this.status({ roomId, roomInput: String(roomId), title: String(data.anchor_info?.uname || '').slice(0, 100), message: '正在验证官方消息通道' });
      this.appBeat = setInterval(() => this.beat(generation, session), this.appBeatMs);
      this.openSocket(generation, session);
    } catch (error) { if (this.active(generation)) this.fail(error, generation, false); }
  }
  async beat(generation, session) {
    if (!this.active(generation) || session !== this.session || session.beating) return;
    session.beating = true;
    try {
      await this.api('heartbeat', session.config, session.id);
      if (this.active(generation) && session === this.session) {
        session.lastBeat = Date.now(); this.status({ lastAppHeartbeatAt: session.lastBeat });
      }
    } catch (error) {
      if (this.active(generation) && (!error.retry || Date.now() - session.lastBeat > 100000)) this.fail(error, generation, false);
    } finally { session.beating = false; }
  }
  openSocket(generation, session) {
    if (!this.active(generation) || this.session !== session) return;
    this.socketCleanup();
    let ws;
    try { ws = new this.Socket(session.links[this.retries % session.links.length]); }
    catch { this.fail(new OpenError('官方消息连接创建失败。', true), generation, true); return; }
    this.ws = ws; ws.binaryType = 'arraybuffer';
    let authorized = false, failed = false, lastReply = Date.now();
    const active = () => this.active(generation) && this.ws === ws && !failed;
    const fail = error => { if (!active()) return; failed = true; this.fail(error, generation, true); };
    this.authTimer = setTimeout(() => fail(new OpenError('官方消息通道鉴权超时。', true)), 15000);
    ws.addEventListener('open', () => { if (active()) ws.send(packet(7, Buffer.from(session.authBody))); });
    ws.addEventListener('message', event => {
      if (!active()) return;
      try {
        for (const p of decodePackets(event.data)) {
          if (p.op === 8) {
            if (p.data.code !== 0) { fail(new OpenError('官方长连接鉴权失败，请重新连接身份码。')); return; }
            if (authorized) continue;
            authorized = true; clearTimeout(this.authTimer); this.retries = 0; lastReply = Date.now();
            this.status({ phase: 'connected', authenticated: true, message: '已通过主播身份码连接，等待实时消息' });
            ws.send(packet(2));
            this.wsBeat = setInterval(() => {
              if (!active()) return;
              if (Date.now() - lastReply > 75000) { fail(new OpenError('官方消息心跳中断。', true)); return; }
              if (ws.readyState === 1) ws.send(packet(2));
            }, this.socketBeatMs);
          } else if (p.op === 3) { lastReply = Date.now(); this.status({ lastHeartbeatAt: lastReply }); }
          else if (p.op === 5 && authorized) {
            if (p.invalid) { this.status({ skipped: this.state.skipped + 1 }); continue; }
            this.command(p.data, generation);
          }
        }
      } catch { fail(new OpenError('官方消息格式异常，请更新接入模块。')); }
    });
    ws.addEventListener('error', () => fail(new OpenError('官方消息连接中断。', true)));
    ws.addEventListener('close', () => fail(new OpenError('官方消息通道已关闭。', true)));
  }
  command(command, generation) {
    const cmd = command?.cmd;
    if (cmd === 'LIVE_OPEN_PLATFORM_INTERACTION_END') {
      this.fail(new OpenError('本次身份码授权会话已结束，请重新连接。'), generation, false); return;
    }
    if (cmd === 'LIVE_OPEN_PLATFORM_LIVE_START') this.status({ liveStatus: 1 });
    if (cmd === 'LIVE_OPEN_PLATFORM_LIVE_END') this.status({ liveStatus: 0 });
    if (command?.data?.room_id && String(command.data.room_id) !== String(this.state.roomId)) return;
    for (const item of normalizeOpen(command)) {
      if (!this.dedup.accept(item)) continue;
      this.state.lastMessageAt = Date.now(); if (item.kind !== 'delete') this.state.received++;
      this.publish('message', { ...item, roomId: this.state.roomId }); this.publish('status', this.state);
    }
  }
  fail(error, generation, reconnectSocket) {
    if (!this.active(generation)) return;
    this.socketCleanup();
    if (error.retry && reconnectSocket && this.session && this.retries < 8) {
      const wait = Math.min(30000, this.retryMs * 2 ** this.retries++);
      this.status({ phase: 'retrying', message: error.message + ' 正在自动重连。', authenticated: false });
      this.retryTimer = setTimeout(() => this.openSocket(generation, this.session), wait);
    } else {
      this.disconnect();
      this.status({ phase: 'error', message: error instanceof OpenError ? error.message : '身份码接入失败，请检查应用配置。' });
    }
  }
}
module.exports = { BilibiliOpenRelay };
