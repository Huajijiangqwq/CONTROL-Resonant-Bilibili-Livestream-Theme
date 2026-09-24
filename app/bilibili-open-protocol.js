'use strict';
// Independently implemented from Bilibili's OpenLive API and official C# sample.
const crypto = require('node:crypto');
const { normalize } = require('./bilibili-protocol');

function config(input, requireCode = true) {
  const value = {};
  for (const [key, label, max] of [
    ['appId', 'App ID', 20], ['accessKeyId', 'Access Key ID', 256],
    ['accessKeySecret', 'Access Key Secret', 512], ['code', '主播身份码', 256],
  ]) {
    if (input[key] !== undefined && typeof input[key] !== 'string') throw Error(label + '格式不正确。');
    value[key] = (input[key] || '').trim();
    if ((!value[key] && (key !== 'code' || requireCode)) || value[key].length > max || /[\s\x00-\x1f]/.test(value[key]))
      throw Error('请填写有效的' + label + '。');
  }
  // App IDs are int64, not JavaScript numbers. Serialize their decimal digits directly.
  if (!/^[1-9]\d{0,18}$/.test(value.appId) || BigInt(value.appId) > 9223372036854775807n)
    throw Error('App ID 应为开放平台分配的有效整数。');
  value.autoConnect = input.autoConnect === true;
  if (value.autoConnect && !value.code) throw Error('启动自动连接需要先填写主播身份码。');
  return value;
}

function requestBody(operation, value, gameId = '') {
  if (operation === 'start') return `{"code":${JSON.stringify(value.code)},"app_id":${value.appId}}`;
  if (operation === 'end') return `{"app_id":${value.appId},"game_id":${JSON.stringify(gameId)}}`;
  if (operation === 'heartbeat') return JSON.stringify({ game_id: gameId });
  throw Error('不支持的开放平台操作。');
}
function sign(body, value, timestamp = Math.floor(Date.now() / 1000), nonce = crypto.randomUUID()) {
  const headers = {
    'x-bili-accesskeyid': value.accessKeyId,
    'x-bili-content-md5': crypto.createHash('md5').update(body).digest('hex'),
    'x-bili-signature-method': 'HMAC-SHA256',
    'x-bili-signature-nonce': String(nonce),
    'x-bili-signature-version': '1.0',
    'x-bili-timestamp': String(timestamp),
  };
  const canonical = Object.keys(headers).sort().map(k => k + ':' + headers[k]).join('\n');
  headers.Authorization = crypto.createHmac('sha256', value.accessKeySecret).update(canonical).digest('hex');
  headers['Content-Type'] = 'application/json';
  headers.Accept = 'application/json';
  return headers;
}
function normalizeOpen(command, now = Date.now()) {
  const d = command?.data || {}, cmd = command?.cmd,
    u = d.user_info || d, uid = u.open_id || u.uid || '', name = u.uname || '匿名观众';
  let legacy;
  switch (cmd) {
    case 'LIVE_OPEN_PLATFORM_DM':
      legacy = { cmd: 'DANMU_MSG', info: [[], d.msg, [uid, name]] }; break;
    case 'LIVE_OPEN_PLATFORM_SEND_GIFT': {
      const count = Number(d.gift_num), price = Number(d.r_price ?? d.price);
      if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(price) || price < 0) return [];
      const coins = d.total_coin !== undefined ? Number(d.total_coin) : price * count;
      if (!Number.isSafeInteger(coins) || coins < 0 || typeof d.paid !== 'boolean') return [];
      legacy = { cmd: 'SEND_GIFT', data: { uname: name, uid, giftId: d.gift_id, giftName: d.gift_name,
        num: count, total_coin: coins, coin_type: d.paid ? 'gold' : 'silver' } }; break;
    }
    case 'LIVE_OPEN_PLATFORM_SUPER_CHAT':
      legacy = { cmd: 'SUPER_CHAT_MESSAGE', data: { uid, user_info: { uname: name }, id: d.message_id,
        message: d.message, price: d.rmb, start_time: d.start_time, end_time: d.end_time } }; break;
    case 'LIVE_OPEN_PLATFORM_SUPER_CHAT_DEL':
      legacy = { cmd: 'SUPER_CHAT_MESSAGE_DELETE', data: { ids: d.message_ids } }; break;
    case 'LIVE_OPEN_PLATFORM_GUARD':
      legacy = { cmd: 'GUARD_BUY', data: { username: name, uid, guard_level: d.guard_level, start_time: d.timestamp } }; break;
    default: return [];
  }
  return normalize(legacy, now).map(item => ({ ...item,
    ...(item.kind === 'delete' ? {} : { userId: String(uid).slice(0, 100), source: 'bilibili-open' }),
    eventId: d.msg_id ? 'open:' + String(d.msg_id).slice(0, 200) : item.eventId,
  }));
}
module.exports = { config, requestBody, sign, normalizeOpen };
