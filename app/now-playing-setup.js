'use strict';
// Optional upstream installer. Only this audited official release can execute.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const release = Object.freeze({
  author: 'Widdit', version: '2.2.0', license: 'MIT',
  project: 'https://github.com/Widdit/now-playing-service',
  url: 'https://github.com/Widdit/now-playing-service/releases/download/v2.2.0/NowPlaying_2.2.0-setup.exe',
  size: 75121471,
  sha256: '92529ff4425f98d8e7374dd358f5acfaf01ba9cc6782b76dbc49e0f5e30a72ab',
});
const ps = (script, env = {}) => promisify(execFile)('powershell.exe',
  ['-NoProfile', '-NonInteractive', '-Command', script],
  { windowsHide: true, env: { ...process.env, ...env }, timeout: 300000, maxBuffer: 16384 });
async function installedPath() {
  const { stdout } = await ps("$key='{356C26D7-6986-40D0-888E-DC42D0A82F4E}_is1'; foreach($root in @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\')) { $item=Get-ItemProperty -LiteralPath ($root+$key) -ErrorAction SilentlyContinue; if($item.InstallLocation){ [Console]::WriteLine($item.InstallLocation); break } }");
  return stdout.trim();
}
async function install(file, dir, log) {
  // Upstream requires administrative installation. Let Windows display its
  // normal UAC consent if needed; do not disable it or close other applications.
  await ps("$ErrorActionPreference='Stop'; $args=@('/VERYSILENT','/SP-','/SUPPRESSMSGBOXES','/NORESTART','/NOCLOSEAPPLICATIONS','/NORESTARTAPPLICATIONS','/NOICONS','/TASKS=\"\"',('/DIR=\"'+$env.CONTROL_NP_TARGET+'\"'),('/LOG=\"'+$env.CONTROL_NP_LOG+'\"')); $p=Start-Process -FilePath $env.CONTROL_NP_INSTALLER -ArgumentList $args -Verb RunAs -WindowStyle Hidden -Wait -PassThru; if($p.ExitCode -ne 0){throw ('安装未完成，代码 '+$p.ExitCode)}",
    { CONTROL_NP_INSTALLER: file, CONTROL_NP_TARGET: dir, CONTROL_NP_LOG: log });
}
async function probe(url, request = fetch) {
  try {
    const r = await request(url + '/query', { signal: AbortSignal.timeout(1800) });
    if (!r.ok) return false;
    const data = await r.json();
    return typeof data?.player?.hasSong === 'boolean' && data.track && typeof data.track === 'object';
  } catch { return false; }
}
async function verified(file, spec = release) {
  try {
    if (fs.statSync(file).size !== spec.size) return false;
    const hash = crypto.createHash('sha256');
    for await (const part of fs.createReadStream(file)) hash.update(part);
    return hash.digest('hex') === spec.sha256;
  } catch { return false; }
}
async function download(file, update, signal, request = fetch, spec = release) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (await verified(file, spec)) return;
  const tmp = file + '.part';
  const timeout = AbortSignal.timeout(300000);
  const response = await request(spec.url, { signal: AbortSignal.any([signal, timeout]) });
  if (!response.ok) throw Error('官方下载失败：HTTP ' + response.status);
  const handle = await fs.promises.open(tmp, 'w');
  const hash = crypto.createHash('sha256');
  let total = 0;
  try {
    for await (const chunk of response.body) {
      signal.throwIfAborted();
      total += chunk.length;
      if (total > spec.size) throw Error('下载文件大小不符，已停止');
      hash.update(chunk);
      await handle.writeFile(chunk);
      update(Math.round(total * 100 / spec.size));
    }
    if (total !== spec.size || hash.digest('hex') !== spec.sha256)
      throw Error('官方文件校验失败，未运行安装程序；请重试');
    await handle.close();
    await fs.promises.rename(tmp, file);
  } finally {
    await handle.close().catch(() => {});
    await fs.promises.unlink(tmp).catch(() => {});
  }
}
function createSetup({ root, configure, currentUrl = () => 'http://127.0.0.1:9863',
  request = fetch, installPackage = install, locate = installedPath,
  launch = (file, dir) => spawn(file, [], { cwd: dir, windowsHide: true, stdio: 'ignore' }),
  platform = process.platform, wait = ms => new Promise(r => setTimeout(r, ms)),
} = {}) {
  root = path.resolve(root);
  const manifest = path.join(root, 'managed.json');
  let child = null, running = null, disposed = false, controller;
  let state = { phase: 'idle', message: '可自动下载并配置 Widdit 的 Now Playing', progress: 0 };
  const update = value => { state = { ...state, ...value }; };
  const serviceAt = dir => path.isAbsolute(dir || '') && fs.existsSync(path.join(dir, 'NowPlayingService.exe'));
  async function run(allowInstall) {
    if (platform !== 'win32') throw Error('自动安装目前仅支持 Windows');
    update({ phase: 'checking', progress: 0, message: '正在检查已运行或已安装的 Now Playing…' });
    const urls = [...new Set([currentUrl(), 'http://127.0.0.1:9863'])];
    for (const url of urls) if (await probe(url, request)) {
      const existing = await locate().catch(() => '');
      if (serviceAt(existing)) {
        fs.mkdirSync(root, { recursive: true });
        fs.writeFileSync(manifest, JSON.stringify({ dir: existing, author: release.author, source: release.project }, null, 2));
      }
      await configure(url, fs.existsSync(manifest));
      update({ phase: 'ready', message: '已连接 Now Playing，歌曲信息会自动更新', progress: 100 });
      return;
    }
    controller.signal.throwIfAborted();
    let dir;
    try { dir = JSON.parse(fs.readFileSync(manifest, 'utf8')).dir; } catch {}
    if (!serviceAt(dir)) dir = await locate().catch(() => '');
    if (!serviceAt(dir)) {
      if (!allowInstall) throw Error('未找到已配置的 Now Playing，请点击自动下载并配置');
      const file = path.join(root, 'cache', 'NowPlaying_2.2.0-setup.exe');
      update({ phase: 'downloading', message: '正在下载官方 Now Playing 2.2.0…' });
      await download(file, progress => update({ progress }), controller.signal, request);
      controller.signal.throwIfAborted();
      dir = path.join(root, 'program');
      update({ phase: 'installing', message: '正在安装官方程序；如 Windows 请求许可，请确认', progress: 100 });
      await installPackage(file, dir, path.join(root, 'install.log'));
      if (!serviceAt(dir)) throw Error('安装未完成，请重试或从官方发布页手动安装');
    }
    controller.signal.throwIfAborted();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(manifest, JSON.stringify({ dir, author: release.author, source: release.project }, null, 2));
    update({ phase: 'starting', message: '正在启动并连接歌曲服务…' });
    let launchError = '';
    child = launch(path.join(dir, 'NowPlayingService.exe'), dir);
    child.on('error', () => { launchError = 'Now Playing 启动失败，请检查安装或系统权限'; });
    for (let i = 0; i < 40; i++) {
      controller.signal.throwIfAborted();
      if (launchError) throw Error(launchError);
      for (const url of urls) if (await probe(url, request)) {
        await configure(url, true);
        update({ phase: 'ready', message: '已安装并连接 Now Playing，重启客户端后自动接续', progress: 100 });
        return;
      }
      await wait(1000);
    }
    throw Error('已安装，但歌曲服务尚未响应。请检查 9863 端口或点击重试');
  }
  function start(allowInstall = true) {
    if (disposed) return Promise.resolve();
    if (running) return running;
    controller = new AbortController();
    running = run(allowInstall).catch(error => {
      if (!disposed) update({ phase: 'error', message: error.message.includes('canceled') ? '安装已取消，可随时重试' : error.message });
    }).finally(() => { running = null; });
    return running;
  }
  return {
    start,
    snapshot: () => ({ ...state, busy: !!running, author: release.author, project: release.project, version: release.version }),
    close() { disposed = true; controller?.abort(); if (child && child.exitCode === null) child.kill(); },
  };
}
module.exports = { createSetup, release, verified, download, probe };
