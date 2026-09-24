'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const { config } = require('./bilibili-open-protocol');
// Windows DPAPI: credentials are bound to this Windows account. No bundled key.
// Input travels over stdin, never a process argument, command substitution or log.
function protect(text, decrypt = false) {
  if (process.platform !== 'win32') throw Error('本机加密保存目前需要 Windows；可取消记住配置，仅本次连接。');
  const method = decrypt ? 'Unprotect' : 'Protect';
  const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; ` +
    `$data=[Convert]::FromBase64String([Console]::In.ReadToEnd()); ` +
    `$entropy=[Text.Encoding]::UTF8.GetBytes('ControlResonant.Bilibili.Open.v1'); ` +
    `$out=[Security.Cryptography.ProtectedData]::${method}($data,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); ` +
    `[Console]::Out.Write([Convert]::ToBase64String($out))`;
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true, input: Buffer.from(text).toString('base64'), encoding: 'utf8', timeout: 10000, maxBuffer: 131072,
  });
  if (result.status !== 0 || !result.stdout.trim()) throw Error('本机凭据加密操作失败，请检查 Windows 账户权限。');
  return Buffer.from(result.stdout.trim(), 'base64');
}
function createStore({ file, seal = protect, unseal = bytes => protect(bytes, true) } = {}) {
  file ||= path.join(process.env.CONTROL_DATA || path.join(process.env.LOCALAPPDATA || os.homedir(), 'ControlResonant', 'data'), 'bilibili-open-credentials.enc');
  let saved = null, error = '';
  try {
    if (fs.existsSync(file)) {
      if (fs.statSync(file).size > 65536) throw Error('size');
      saved = config(JSON.parse(unseal(fs.readFileSync(file)).toString('utf8')), false);
    }
  } catch { error = '无法读取保存的身份码配置；请重新填写并保存，或清除旧配置。'; }
  return {
    read: () => saved ? { ...saved } : {},
    info: () => ({ saved: !!saved, appId: saved?.appId || '', hasCode: !!saved?.code,
      hasKeys: !!saved?.accessKeySecret, autoConnect: !!saved?.autoConnect,
      canRemember: process.platform === 'win32', error }),
    save(value) {
      const checked = config(value, false), bytes = seal(JSON.stringify(checked));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temp = file + '.tmp';
      fs.writeFileSync(temp, bytes, { mode: 0o600 });
      fs.renameSync(temp, file);
      saved = checked; error = '';
    },
    clear() { fs.rmSync(file, { force: true }); saved = null; error = ''; },
  };
}
module.exports = { createStore, protect };
