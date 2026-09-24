'use strict';
// Web-room protocol and field numbers cross-checked against xfgryujk/blivedm.
// See ../THIRD_PARTY_NOTICES.md for upstream attribution and protocol limitations.
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const KEY_ORDER = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28,
  14, 39, 12, 38, 41, 13,
];
const MAX_PACKET = 8 * 1024 * 1024;
function roomNumber(input) {
  let value = String(input ?? '').trim();
  if (/^https?:\/\//i.test(value)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error('请输入有效的房间号或直播间链接。');
    }
    if (url.hostname !== 'live.bilibili.com' || !/^\/\d+\/?$/.test(url.pathname))
      throw new Error('请使用 live.bilibili.com 的直播间链接。');
    value = url.pathname.replaceAll('/', '');
  }
  if (!/^\d{1,15}$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1)
    throw new Error('房间号应为大于 0 的数字。');
  return Number(value);
}
function wbiSign(params, image, sub, timestamp = Math.floor(Date.now() / 1000)) {
  const key = [image, sub].map((s) => new URL(s).pathname.split('/').at(-1).split('.')[0]).join('');
  const mixin = KEY_ORDER.map((i) => key[i] || '').join('');
  if (mixin.length !== 32) throw new Error('未取得有效的连接签名。');
  const values = { ...params, wts: timestamp };
  const query = Object.keys(values)
    .sort()
    .map(
      (k) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(String(values[k]).replace(/[!'()*]/g, '')).replace(/%20/g, '+')}`,
    )
    .join('&');
  return (
    query +
    '&w_rid=' +
    crypto
      .createHash('md5')
      .update(query + mixin)
      .digest('hex')
  );
}
function packet(operation, value = {}) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(16);
  header.writeUInt32BE(16 + body.length);
  header.writeUInt16BE(16, 4);
  header.writeUInt16BE(1, 6);
  header.writeUInt32BE(operation, 8);
  header.writeUInt32BE(1, 12);
  return Buffer.concat([header, body]);
}
function decodePackets(bytes, depth = 0, budget = { remaining: MAX_PACKET }) {
  const buffer = Buffer.from(bytes),
    result = [];
  budget.remaining -= buffer.length;
  if (depth > 4 || budget.remaining < 0) throw new Error('消息数据过大。');
  for (let offset = 0; offset < buffer.length; ) {
    if (buffer.length - offset < 16) throw new Error('消息头不完整。');
    const length = buffer.readUInt32BE(offset),
      header = buffer.readUInt16BE(offset + 4),
      version = buffer.readUInt16BE(offset + 6),
      op = buffer.readUInt32BE(offset + 8);
    if (header < 16 || length < header || offset + length > buffer.length)
      throw new Error('消息长度不正确。');
    const body = buffer.subarray(offset + header, offset + length);
    offset += length;
    if (op === 5 && (version === 2 || version === 3)) {
      const options = { maxOutputLength: Math.max(1, budget.remaining) };
      const unpacked =
        version === 3 ? zlib.brotliDecompressSync(body, options) : zlib.inflateSync(body, options);
      result.push(...decodePackets(unpacked, depth + 1, budget));
    } else if (op === 5 && body.length) {
      // Valid frame boundaries let us discard one bad business payload while
      // preserving the following messages. Authentication remains strict.
      try {
        result.push({ op, data: JSON.parse(body.toString('utf8')) });
      } catch {
        result.push({ op, invalid: true });
      }
    } else if (op === 8 && body.length)
      result.push({ op, data: JSON.parse(body.toString('utf8')) });
    else if (op === 3) result.push({ op });
  }
  return result;
}
// Minimal bounded protobuf wire reader: only the published gift field numbers are consumed.
function protobuf(buffer) {
  const fields = new Map();
  let offset = 0;
  const varint = () => {
    let n = 0n;
    for (let i = 0; i < 10; i++) {
      if (offset >= buffer.length) throw new Error('礼物消息不完整。');
      const b = buffer[offset++];
      n |= BigInt(b & 127) << BigInt(i * 7);
      if (!(b & 128)) return n;
    }
    throw new Error('礼物数字格式错误。');
  };
  while (offset < buffer.length) {
    const key = Number(varint()),
      tag = key >>> 3,
      wire = key & 7;
    let value;
    if (!tag) throw new Error('礼物字段格式错误。');
    if (wire === 0) value = varint();
    else if (wire === 2) {
      const length = Number(varint());
      if (!Number.isSafeInteger(length) || offset + length > buffer.length)
        throw new Error('礼物数据长度错误。');
      value = buffer.subarray(offset, offset + length);
      offset += length;
    } else if (wire === 1 || wire === 5) {
      offset += wire === 1 ? 8 : 4;
      if (offset > buffer.length) throw new Error('礼物字段不完整。');
      continue;
    } else throw new Error('暂不支持的礼物编码。');
    if (!fields.has(tag)) fields.set(tag, []);
    fields.get(tag).push(value);
  }
  return fields;
}
const field = (p, n) => p.get(n)?.[0];
const str = (p, n) => {
  const v = field(p, n);
  return Buffer.isBuffer(v) ? v.toString('utf8') : String(v ?? '');
};
const num = (p, n) => Number(field(p, n) ?? 0);
const { take: limitText } = require('./text-limit.js');
const text = (v, max = 1600) => limitText(String(v ?? '').replace(/\u0000/g, ''), max);
function eventId(prefix, ...parts) {
  return (
    prefix +
    ':' +
    crypto
      .createHash('sha256')
      .update(JSON.stringify(parts.map((v) => String(v ?? ''))))
      .digest('hex')
      .slice(0, 28)
  );
}
function safeCount(v) {
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
function normalize(command, now = Date.now()) {
  const cmd = String(command?.cmd || '').split(':')[0],
    d = command?.data || {},
    i = command?.info || [];
  const user = (name, uid) => ({
    sender: text(name || '匿名观众', 80),
    userId: text(uid, 30),
    source: 'bilibili',
    receivedAt: now,
  });
  const gift = (g) => {
    const quantity = safeCount(g.num),
      coins = safeCount(g.total_coin);
    if (!quantity || coins === null || !['silver', 'gold'].includes(g.coin_type)) return [];
    const giftId = text(g.giftId, 30),
      key = g.tid || g.rnd;
    return [
      {
        kind: 'gift',
        ...user(g.uname, g.uid),
        giftId,
        giftName: text(g.giftName || '未知礼物', 100),
        quantity,
        value: g.coin_type === 'gold' ? coins / 100 : 0,
        coinType: g.coin_type,
        eventId: key ? eventId('gift', g.uid, giftId, key) : '',
        body: '',
      },
    ];
  };
  if (cmd === 'DANMU_MSG') {
    const body = text(i[1]);
    if (!body) return [];
    const nonce = i[0]?.[5],
      stamp = i[0]?.[4],
      uid = i[2]?.[0];
    return [
      {
        kind: 'normal',
        ...user(i[2]?.[1], uid),
        body,
        eventId: nonce && stamp ? eventId('dm', uid, stamp, nonce, body) : '',
      },
    ];
  }
  if (cmd === 'SEND_GIFT') return gift(d);
  if (cmd === 'SEND_GIFT_V2') {
    if (typeof d.pb !== 'string' || d.pb.length > MAX_PACKET) throw new Error('礼物编码不正确。');
    const p = protobuf(Buffer.from(d.pb, 'base64'));
    return (p.get(10) || []).flatMap((bytes) => {
      const g = protobuf(bytes);
      return gift({
        uid: str(p, 1),
        uname: str(p, 2),
        giftId: str(g, 1),
        giftName: str(g, 2),
        num: num(g, 3),
        total_coin: num(g, 7),
        coin_type: str(g, 8),
        tid: str(g, 9),
        rnd: str(g, 12),
      });
    });
  }
  if (cmd === 'SUPER_CHAT_MESSAGE') {
    const amount = Number(d.price);
    if (!Number.isFinite(amount) || amount <= 0) return [];
    const time = Number(d.time),
      start = Number(d.start_time),
      end = Number(d.end_time),
      span = end - start;
    const positive = (value) => Number.isFinite(value) && value > 0;
    const candidate = positive(time)
      ? time
      : positive(start) && positive(end) && positive(span)
        ? span
        : 60;
    const duration = Math.max(1, Math.min(86400, candidate)),
      deadline = end * 1000;
    // Use the same bounded duration for both display and fallback expiry.
    // Preserve genuine end times, including past ones, so stale SC stays expired.
    const expiresAt =
      positive(deadline) && deadline <= now + 86400000 ? deadline : now + duration * 1000;
    return [
      {
        kind: 'sc',
        ...user(d.user_info?.uname, d.uid),
        body: text(d.message),
        amount,
        duration,
        expiresAt,
        scId: text(d.id, 100),
        eventId: d.id ? eventId('sc', d.id) : '',
      },
    ];
  }
  if (cmd === 'SUPER_CHAT_MESSAGE_DELETE')
    return [{ kind: 'delete', scIds: Array.isArray(d.ids) ? d.ids.map((v) => text(v, 100)) : [] }];
  if (cmd === 'GUARD_BUY' || cmd === 'USER_TOAST_MSG_V2') {
    if (cmd === 'USER_TOAST_MSG_V2' && Number(d.option?.source) === 2) return [];
    const v2 = cmd === 'USER_TOAST_MSG_V2',
      level = Number(v2 ? d.guard_info?.guard_level : d.guard_level),
      rank = { 1: 'governor', 2: 'admiral', 3: 'captain' }[level];
    if (!rank) return [];
    const uid = v2 ? d.sender_uinfo?.uid : d.uid,
      name = v2 ? d.sender_uinfo?.base?.name : d.username,
      stamp = v2 ? d.guard_info?.start_time : d.start_time;
    return [
      {
        kind: 'fleet',
        ...user(name, uid),
        rank,
        body: '开通' + { 1: '总督', 2: '提督', 3: '舰长' }[level],
        eventId: stamp && uid ? eventId('guard', uid, level, stamp) : '',
        guardCommand: cmd,
      },
    ];
  }
  return [];
}
class Deduplicator {
  constructor() {
    this.seen = new Map();
  }
  accept(event, now = Date.now()) {
    const key = event.eventId;
    if (!key) return true;
    const time = this.seen.get(key);
    if (time !== undefined && now - time < 600000) return false;
    this.seen.set(key, now);
    for (const [id, at] of this.seen) {
      if (this.seen.size <= 10000 && now - at < 600000) break;
      this.seen.delete(id);
    }
    return true;
  }
}
module.exports = { roomNumber, wbiSign, packet, decodePackets, normalize, Deduplicator };
