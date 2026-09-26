'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
// Only the main process talks to Electron safeStorage / the macOS Keychain.
// The unwrapped key crosses the private parent/utility channel, never HTTP or env.
function loadKey(safeStorage, dataRoot) {
  if (!safeStorage.isEncryptionAvailable()) throw Error('系统钥匙串不可用，暂时无法保存登录。');
  const file = path.join(dataRoot, 'credential-key.enc');
  if (fs.existsSync(file)) {
    const key = Buffer.from(safeStorage.decryptString(fs.readFileSync(file)), 'base64');
    if (key.length !== 32) throw Error('本机登录密钥无效。');
    return key;
  }
  const key = crypto.randomBytes(32);
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.writeFileSync(file + '.tmp', safeStorage.encryptString(key.toString('base64')), { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
  return key;
}
module.exports = { loadKey };
