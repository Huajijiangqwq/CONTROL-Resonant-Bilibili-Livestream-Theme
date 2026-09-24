'use strict';
const crypto = require('node:crypto');
const qrcode = require('./qr-code-generator');
const { sessionValue } = require('./bilibili-session-store');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
const PASSPORT = 'https://passport.bilibili.com';
function trustedUrl(value) {
  let u; try { u = new URL(value); } catch { throw Error('登录地址无效，请重新扫码。'); }
  if (u.protocol !== 'https:' || !['passport.bilibili.com', 'account.bilibili.com', 'passport.biligame.com'].includes(u.hostname) || u.port || u.username || u.password)
    throw Error('登录地址不受支持，请重新扫码。');
  return u;
}
function sessionCookie(response) {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0], at = pair.indexOf('=');
    if (pair.slice(0, at).trim() === 'SESSDATA' && pair.slice(at + 1)) return sessionValue(pair.slice(at + 1));
  }
  return '';
}
function createQrAuth(store, { fetch: request = fetch, now = Date.now } = {}) {
  let current = null, generation = 0;
  const snapshot = q => ({ id: q.id, phase: q.phase, message: q.message, expiresAt: q.expiresAt });
  function cancel(id) {
    if (id && current?.id !== id) return;
    generation++; current?.abort.abort(); current = null;
  }
  async function get(url, q) {
    try {
      const response = await request(url, { headers: { 'User-Agent': UA, Referer: PASSPORT + '/' },
        redirect: 'manual', signal: AbortSignal.any([q.abort.signal, AbortSignal.timeout(12000)]) });
      if (response.status >= 400) { await response.body?.cancel(); throw Error('http'); }
      return response;
    } catch { throw Error('登录服务连接失败，请稍后重试。'); }
  }
  async function resolveSession(response, data, q) {
    let result = sessionCookie(response);
    if (result) return result;
    let url = trustedUrl(data.url);
    // Older responses carry the session in the callback; newer responses carry
    // a one-use cross-domain ticket. Keep both entirely inside the local server.
    for (let i = 0; i < 5; i++) {
      if (url.searchParams.get('SESSDATA')) return sessionValue(url.searchParams.get('SESSDATA'));
      const r = await get(url.href, q);
      result = sessionCookie(r); await r.body?.cancel();
      if (result) return result;
      const location = r.headers.get('location');
      if (r.status < 300 || r.status >= 400 || !location) break;
      url = trustedUrl(new URL(location, url).href);
    }
    throw Error('已确认登录，但没有取得有效登录凭据。请重新生成二维码。');
  }
  return {
    cancel,
    async start() {
      cancel(); const revision = generation;
      const q = { id: crypto.randomUUID(), phase: 'waiting', message: '使用哔哩哔哩 App 扫码，并在手机上确认登录。',
        abort: new AbortController(), expiresAt: now() + 180000, lastPoll: -Infinity, pending: null };
      current = q;
      try {
        const response = await get(PASSPORT + '/x/passport-login/web/qrcode/generate', q);
        const result = await response.json();
        if (revision !== generation) throw Error('二维码已取消。');
        if (result.code !== 0 || !/^[a-zA-Z0-9_-]{16,256}$/.test(result.data?.qrcode_key || '')) throw Error('二维码申请失败，请稍后重试。');
        const url = trustedUrl(result.data.url);
        if (!['passport.bilibili.com', 'account.bilibili.com'].includes(url.hostname) || url.href.length > 4096) throw Error('二维码地址无效。');
        q.key = result.data.qrcode_key;
        const qr = qrcode(0, 'M'); qr.addData(url.href); qr.make();
        const svg = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
        return { ...snapshot(q), image: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') };
      } catch (e) {
        if (current === q) cancel();
        throw Error(e instanceof SyntaxError ? '登录服务响应无法读取，请重试。' : e.message);
      }
    },
    async poll(id) {
      const q = current;
      if (!q || q.id !== id) return { phase: 'cancelled', message: '二维码已取消或已被更新，请重新生成。' };
      if (q.pending) return q.pending;
      if (!['waiting', 'scanned'].includes(q.phase)) return snapshot(q);
      if (now() >= q.expiresAt) { q.phase = 'expired'; q.message = '二维码已过期，请重新生成。'; q.key = ''; return snapshot(q); }
      if (now() - q.lastPoll < 1500) return snapshot(q);
      q.lastPoll = now();
      q.pending = (async () => {
        try {
          const response = await get(PASSPORT + '/x/passport-login/web/qrcode/poll?qrcode_key=' + encodeURIComponent(q.key), q);
          const result = await response.json();
          if (current !== q) return { phase: 'cancelled', message: '二维码已取消。' };
          if (result.code !== 0) throw Error('查询登录状态失败，请重新生成二维码。');
          const data = result.data || {};
          if (data.code === 86101) { q.phase = 'waiting'; q.message = '等待扫码，请使用哔哩哔哩 App。'; }
          else if (data.code === 86090) { q.phase = 'scanned'; q.message = '已扫码，请在手机上确认登录。'; }
          else if (data.code === 86038) { q.phase = 'expired'; q.message = '二维码已过期，请重新生成。'; q.key = ''; }
          else if (data.code === 0) {
            const value = await resolveSession(response, data, q);
            if (current !== q) return { phase: 'cancelled', message: '二维码已取消。' };
            try { store.save(value); } catch { throw Error('登录成功，但本机加密保存失败。请检查 Windows 账户权限后重试。'); }
            q.phase = 'success'; q.key = ''; q.message = '登录成功，已在本机加密保存。填写房间号后即可连接。';
          } else throw Error('登录未完成，请重新生成二维码。');
        } catch (e) {
          q.phase = 'error'; q.key = ''; q.message = e instanceof SyntaxError ? '登录服务响应无法读取，请重试。' : e.message;
        }
        return snapshot(q);
      })();
      try { return await q.pending; } finally { q.pending = null; }
    },
  };
}
module.exports = { createQrAuth, trustedUrl, sessionCookie };
