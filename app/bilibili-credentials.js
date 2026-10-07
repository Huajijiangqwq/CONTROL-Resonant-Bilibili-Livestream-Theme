'use strict';
const { spawnSync } = require('node:child_process');
// Windows DPAPI: credentials are bound to this Windows account. No bundled key.
// Keep the original entropy identifier so existing encrypted QR logins remain readable.
// Input travels over stdin, never a process argument, command substitution or log.
function protect(text, decrypt = false) {
  if (process.platform === 'darwin') return require('./platform-credentials').protect(text, decrypt);
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
module.exports = { protect };
