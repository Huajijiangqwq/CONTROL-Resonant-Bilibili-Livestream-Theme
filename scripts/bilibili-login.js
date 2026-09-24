'use strict';
// Opens a local QR page. Credentials never appear in arguments, console or URLs.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { readConfig } = require('../desktop/core');
const { startServer } = require('../app/bilibili-server');
async function main() {
  if (process.platform !== 'win32') throw Error('扫码后加密保存目前需要 Windows。');
  const profile = path.join(process.env.APPDATA || os.homedir(), 'Control Resonant');
  const args = process.argv.slice(2), at = args.indexOf('--port');
  const explicit = at < 0 ? null : Number(args[at + 1]);
  if (explicit !== null && (!Number.isInteger(explicit) || explicit < 1024 || explicit > 65535)) throw Error('本地接入端口无效。');
  const config = readConfig(profile), ports = new Set();
  if (explicit !== null) ports.add(explicit);
  else {
    if (Number.isInteger(config.port)) ports.add(config.port + 2);
    const runtime = path.join(__dirname, '../.runtime');
    if (fs.existsSync(runtime)) for (const name of fs.readdirSync(runtime).filter(n => /^service-\d+\.json$/.test(n))) {
      try { const p = JSON.parse(fs.readFileSync(path.join(runtime, name), 'utf8')).port; if (Number.isInteger(p)) ports.add(p + 2); } catch {}
    }
    ports.add(8793);
  }
  let port;
  for (const candidate of ports) {
    try {
      const d = await fetch('http://127.0.0.1:' + candidate + '/api/health', { signal: AbortSignal.timeout(800) }).then(r => r.json());
      if (d.service === 'hiss-bilibili') {
        if (d.version < 4) throw Error('请先重启已打开的桌面客户端或本地接入服务，再扫码登录。');
        port = candidate; break;
      }
    } catch (e) { if (e.message.startsWith('请先重启')) throw e; }
  }
  if (!port) {
    port = explicit || (Number.isInteger(config.port) ? config.port + 2 : 8793);
    const app = startServer(port);
    await new Promise((resolve, reject) => { app.server.once('listening', resolve); app.server.once('error', () => reject(Error('端口被占用，请先启动桌面客户端，或指定 --port。'))); });
    const close = () => { app.relay.disconnect(); app.server.close(); app.server.closeAllConnections(); };
    process.once('SIGINT', close); process.once('SIGTERM', close);
    console.log('已临时启动扫码服务。登录完成后可按 Ctrl+C 关闭，再启动桌面客户端。');
  }
  const url = 'http://127.0.0.1:' + port + '/bilibili-login.html';
  console.log('已打开本机扫码页：' + url);
  const opener = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', "Start-Process -FilePath '" + url + "' -WindowStyle Hidden"], { windowsHide: true, stdio: 'ignore' });
  opener.on('error', () => console.log('请在浏览器中打开上述本机地址。'));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
