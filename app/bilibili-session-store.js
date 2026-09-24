'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { protect } = require('./bilibili-open-store');
function sessionValue(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\s;\x00-\x1f\x7f]/.test(value))
    throw Error('登录凭据格式无效，请重新扫码。');
  return value;
}
function defaultFile() {
  const root = process.env.CONTROL_DATA || path.join(process.env.APPDATA || os.homedir(), 'Control Resonant', 'data');
  return path.join(root, 'bilibili-session-credentials.enc');
}
function createSessionStore({ file = defaultFile(), seal = protect, unseal = b => protect(b, true) } = {}) {
  let saved = null, signature = '', error = '';
  function load() {
    try {
      if (!fs.existsSync(file)) { saved = null; signature = ''; error = ''; return; }
      const stat = fs.statSync(file), next = stat.mtimeMs + ':' + stat.size;
      if (signature === next) return;
      signature = next; saved = null;
      if (stat.size > 65536) throw Error('size');
      const data = JSON.parse(unseal(fs.readFileSync(file)).toString('utf8'));
      saved = { session: sessionValue(data.session), savedAt: Number(data.savedAt) || 0 };
      error = '';
    } catch { error = '保存的登录信息无法解密，请在当前 Windows 账户下重新扫码。'; }
  }
  return {
    read() { load(); if (error) throw Error(error); return saved?.session || ''; },
    info() { load(); return { saved: !!saved, savedAt: saved?.savedAt || null, error, canRemember: process.platform === 'win32' }; },
    save(value) {
      const checked = { session: sessionValue(value), savedAt: Date.now() };
      const bytes = seal(JSON.stringify(checked));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', bytes, { mode: 0o600 });
      fs.renameSync(file + '.tmp', file);
      saved = checked; error = '';
      const stat = fs.statSync(file); signature = stat.mtimeMs + ':' + stat.size;
    },
    clear() { fs.rmSync(file, { force: true }); fs.rmSync(file + '.tmp', { force: true }); saved = null; signature = ''; error = ''; },
  };
}
module.exports = { createSessionStore, sessionValue, defaultFile };
