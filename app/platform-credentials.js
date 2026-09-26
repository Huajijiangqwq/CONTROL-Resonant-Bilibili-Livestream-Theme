'use strict';
const crypto = require('node:crypto');
let key = null;
function setKey(value) {
  const bytes = Buffer.from(value || '', 'base64');
  if (bytes.length !== 32) throw Error('凭据密钥无效');
  key?.fill(0); key = bytes;
}
function protect(text, decrypt = false) {
  if (!key) throw Error('系统钥匙串未就绪，请重新打开客户端。');
  const data = Buffer.from(text);
  if (decrypt) {
    if (data.length < 32 || data.subarray(0, 4).toString() !== 'CRK1') throw Error('凭据格式无效');
    const cipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(4, 16));
    cipher.setAuthTag(data.subarray(16, 32));
    return Buffer.concat([cipher.update(data.subarray(32)), cipher.final()]);
  }
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([Buffer.from('CRK1'), iv, cipher.getAuthTag(), encrypted]);
}
module.exports = { setKey, protect, available: () => !!key };
