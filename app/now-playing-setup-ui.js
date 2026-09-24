/* Optional official upstream installation, shared by the standalone music UI. */
(() => {
  'use strict';
  const button = document.getElementById('setupNowPlaying');
  const note = document.getElementById('setupNowPlayingStatus');
  if (!button || !note) return;
  const endpoint = (window.ThemeServices?.music || 'http://127.0.0.1:8795') + '/api/external-setup';
  let token = '', polling = null, lastPhase = '';
  function render(state) {
    token = state.token;
    button.disabled = state.busy;
    button.textContent = state.busy ? '正在配置…' : state.phase === 'ready' ? '重新检查并连接' : '自动下载并配置';
    note.textContent = state.message + (state.phase === 'downloading' ? ' ' + state.progress + '%' : '');
    note.dataset.error = String(state.phase === 'error');
    if (lastPhase !== 'ready' && state.phase === 'ready') {
      const provider = document.getElementById('musicProvider');
      if (provider) provider.value = 'external';
    }
    lastPhase = state.phase;
    clearTimeout(polling);
    if (state.busy) polling = setTimeout(refresh, 800);
  }
  async function refresh() {
    try {
      const r = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw Error();
      render(await r.json());
    } catch {
      button.disabled = false;
      note.textContent = '请保持最新版桌面客户端或音乐皮肤服务运行，再点击重试。';
    }
  }
  button.onclick = async () => {
    button.disabled = true;
    note.textContent = '正在检查官方服务…';
    try {
      if (!token) await refresh();
      if (!token) return;
      button.disabled = true;
      const r = await fetch(endpoint, { method: 'POST', headers: {
        'Content-Type': 'application/json', 'X-Setup-Token': token,
      }, body: '{}', signal: AbortSignal.timeout(5000) });
      const value = await r.json();
      if (!r.ok) throw Error(value.error || '操作失败');
      render(value);
    } catch (e) { button.disabled = false; note.textContent = e.message + '，可点击重试。'; }
  };
  if (!new URLSearchParams(location.search).has('obs')) void refresh();
  window.addEventListener('pagehide', () => clearTimeout(polling));
})();
