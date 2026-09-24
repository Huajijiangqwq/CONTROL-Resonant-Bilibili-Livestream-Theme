'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const appRoot = path.join(root, 'app');
const version = require('../package.json').version;
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = Number(portIndex >= 0 ? args[portIndex + 1] : process.env.THEME_PORT || 8791);
const previewOnly = args.includes('--preview-only');
const identity = crypto.createHash('sha256').update(root).digest('hex').slice(0, 24);
const runtime = path.join(root, '.runtime');
const services = [];
let stopping = false;

function available(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () =>
      reject(Error(`端口 ${port} 已被占用。请先停止旧副本，或使用 --port 指定另一组端口。`)),
    );
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(0), 2500);
  for (const service of services.reverse()) {
    try {
      service.close();
    } catch (error) {
      console.error(error.message);
    }
  }
  try {
    fs.unlinkSync(path.join(runtime, `service-${port}.json`));
  } catch {}
  setTimeout(() => {
    clearTimeout(timeout);
    process.exit(0);
  }, 700);
}
async function main() {
  if (Number(process.versions.node.split('.')[0]) < 24)
    throw Error('请安装 Node.js 24 或更高版本。');
  if (!Number.isInteger(port) || port < 1024 || port > 65531)
    throw Error('端口应为 1024–65531 的整数。');
  const used = previewOnly ? [port] : [port, port + 2, port + 3, port + 4];
  await Promise.all(used.map(available));
  if (!previewOnly) {
    if (process.platform !== 'win32')
      throw Error('完整服务需要 Windows。其他系统可使用 npm run preview 预览编辑器。');
    const compilation = spawnSync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(__dirname, 'compile-audio.ps1'),
      ],
      { windowsHide: true, encoding: 'utf8' },
    );
    if (compilation.status !== 0)
      throw Error(
        `音频组件准备失败：${compilation.stderr || compilation.stdout || compilation.error?.message}`,
      );
  }
  fs.mkdirSync(runtime, { recursive: true });
  const stopToken = crypto.randomBytes(32).toString('hex');
  const release = {
    name: require('../package.json').name,
    version,
    identity,
    pid: process.pid,
    port,
    previewOnly,
  };
  if (!previewOnly) {
    const bilibili = require('../app/bilibili-server').startServer(port + 2);
    services.push({
      close: () => {
        bilibili.relay.disconnect();
        bilibili.server.close();
        bilibili.server.closeAllConnections();
      },
    });
    if (!bilibili.server.listening)
      await new Promise((resolve, reject) => {
        bilibili.server.once('listening', resolve);
        bilibili.server.once('error', reject);
      });
    const audio = require('../app/audio-server').createService({
      port: port + 3,
      settingsFile: path.join(appRoot, 'audio-settings.json'),
    });
    services.push(audio);
    await audio.listen();
    const music = require('../app/now-playing-server').createService({ port: port + 4 });
    services.push(music);
    await music.listen();
  }
  const preview = require('../app/preview-server').createPreviewServer({
    port,
    release,
    stopToken,
    onStop: shutdown,
  });
  services.push(preview);
  await preview.listen();
  fs.writeFileSync(
    path.join(runtime, `service-${port}.json`),
    JSON.stringify({ ...release, stopToken }),
    { mode: 0o600 },
  );
  console.log(`Beta 1 已启动：http://127.0.0.1:${port}/theme-editor.html`);
  console.log(
    previewOnly
      ? '仅预览模式：不启动直播接入或音频捕获。'
      : '本地服务已就绪。捕获音频和连接直播间需在页面主动开启。',
  );
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, shutdown);
main().catch((error) => {
  console.error(error.message);
  for (const service of services) {
    try {
      service.close();
    } catch {}
  }
  setTimeout(() => process.exit(1), 200);
});
