'use strict';
// Observe the shell without granting its documents additional privileges.
function observe(contents, { log, onFailure, isClosing = () => false, reload = () => contents.reload() }) {
  let recoveries = 0;
  const failure = message => { if (!isClosing()) onFailure(message); };
  contents.on('dom-ready', () => log('Shell DOM ready'));
  contents.on('did-finish-load', () => log('Shell load finished'));
  contents.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
    log(`Page load failed code=${code} main=${mainFrame !== false} ${description}`);
    if (mainFrame !== false && code !== -3) failure(`主界面加载失败（${code}）。`);
  });
  contents.on('preload-error', (_event, _path, error) => {
    log('Shell preload failed: ' + (error?.message || 'unknown'));
    failure('主界面连接组件加载失败。');
  });
  contents.on('console-message', (details, legacyLevel, legacyMessage) => {
    const level = details?.level ?? (legacyLevel === 3 ? 'error' : legacyLevel === 2 ? 'warning' : 'info');
    if (level === 'error' || level === 'warning')
      log('Renderer ' + level + ': ' + (details?.message ?? legacyMessage ?? 'unknown'));
  });
  contents.on('render-process-gone', (_event, details) => {
    log(`Renderer exited reason=${details.reason} code=${details.exitCode}`);
    if (isClosing() || contents.isDestroyed()) return;
    if (recoveries++ === 0) {
      log('Retrying shell after renderer exit (1/1)');
      reload();
    } else failure('界面进程反复退出，已停止自动重试。');
  });
  return { reset() { recoveries = 0; } };
}
module.exports = { observe };
