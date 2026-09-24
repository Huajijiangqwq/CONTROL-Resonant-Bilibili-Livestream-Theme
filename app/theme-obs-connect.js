(function () {
  'use strict';
  const toolbar = document.querySelector('.appbar-end');
  if (!toolbar) return;
  const button = document.createElement('button');
  button.id = 'obsConnect';
  button.className = 'obs-connect';
  button.innerHTML = '<span class="obs-led" aria-hidden="true"></span><span>一键接入 OBS</span>';
  toolbar.insertBefore(button, document.getElementById('publish'));
  const dialog = document.createElement('dialog');
  dialog.id = 'obsConnectDialog';
  dialog.setAttribute('aria-labelledby', 'obsConnectTitle');
  dialog.innerHTML = `<div class="dialog-head"><div><span class="obs-eyebrow">LOCAL CONNECTION</span><h2 id="obsConnectTitle">接入 OBS</h2></div><button type="button" data-obs-close aria-label="关闭 OBS 接入面板">×</button></div>
  <div class="obs-body"><section class="obs-state" aria-live="polite"><span class="obs-state-dot" aria-hidden="true"></span><div><strong id="obsStateTitle">正在检测本机 OBS…</strong><p id="obsStateDetail">读取本机连接配置</p></div></section>
  <div id="obsFirstRun" class="obs-first-run" hidden><h3>首次连接：开启 OBS 的连接服务</h3><ol><li>在 OBS 顶部打开 <b>工具 → WebSocket 服务器设置</b>。</li><li>勾选 <b>启用 WebSocket 服务器</b>，保留身份验证，然后点确定。</li><li>回到这里点 <b>重新连接</b>。标准安装的端口和密码会自动读取。</li></ol></div>
  <section class="obs-install" id="obsInstallPanel" hidden><div class="obs-section-title"><h3>把主题放进 OBS</h3><span id="obsVersion"></span></div><p class="obs-note">创建一个独立场景，主题在上，游戏画面在下。当前直播画面保持原样。</p>
  <label>游戏来源<select id="obsGameSource" aria-label="OBS 游戏来源"><option value="">只添加主题</option></select></label>
  <p id="obsSourceHint" class="obs-note"></p>
  <label id="obsChatChoice" hidden>输出范围<select id="obsChatOutput" aria-label="OBS 输出范围"><option value="scene">完整主题 · 1920 × 1080</option><option value="chat">当前组合弹幕区</option></select></label>
  <div class="obs-facts"><div><span>当前 OBS 场景</span><strong id="obsCurrentScene">—</strong></div><div><span>OBS 画布</span><strong id="obsCanvasSize">—</strong></div><div><span>录制状态</span><strong id="obsRecording">—</strong></div></div>
  <button type="button" class="primary" id="obsInstall">创建 OBS 场景</button>
  <div id="obsInstalled" class="obs-installed" hidden role="status"><strong id="obsInstalledTitle"></strong><p id="obsInstalledDetail"></p><input id="obsSceneName" readonly aria-label="已创建的 OBS 场景名"><button type="button" id="obsCopyScene">复制场景名</button></div></section>
  <details id="obsManual"><summary>手动连接 / 便携版 OBS</summary><form id="obsManualForm"><label>本机端口<input id="obsPort" type="number" min="1" max="65535" value="4455" required aria-label="OBS 端口"></label><label>连接密码<input id="obsPassword" type="password" maxlength="2048" autocomplete="off" aria-label="OBS 连接密码" placeholder="OBS 设置中显示的密码"></label><button type="submit">使用这些设置连接</button></form><p class="obs-note">密码只用于本机连接，不写入主题、分享地址或版本存档。</p></details>
  <p class="obs-footnote">开启实时同步后，编辑会直接更新到绑定场景。游戏画面仍由 OBS 采集。</p>
  </div><div class="obs-actions"><button type="button" id="obsDisconnect" hidden>断开连接</button><button type="button" id="obsRefresh" hidden>刷新来源</button><button type="button" id="obsRetry" class="primary">重新连接</button></div>`;
  document.body.append(dialog);
  const $ = (id) => document.getElementById(id);
  let connected = false,
    busy = false,
    data = null,
    disposed = false;
  function setBusy(value) {
    busy = value;
    dialog.setAttribute('aria-busy', String(value));
    for (const id of ['obsRetry', 'obsRefresh', 'obsDisconnect', 'obsInstall'])
      $(id).disabled = value || (id === 'obsInstall' && (!connected || !window.ThemeEditor));
    $('obsManualForm').querySelector('button').disabled = value;
  }
  function state(title, detail, phase) {
    $('obsStateTitle').textContent = title;
    $('obsStateDetail').textContent = detail;
    dialog.dataset.phase = phase;
    button.dataset.phase = phase;
    button.lastElementChild.textContent =
      phase === 'connected' ? 'OBS 已连接' : phase === 'connecting' ? '连接 OBS…' : '一键接入 OBS';
  }
  async function request(action, body = {}) {
    const response = await fetch('/api/obs/' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Theme-Obs': '1' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(action === 'install' ? 120000 : 15000),
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error('主题服务需要更新。请重新运行“启动主题预览.cmd”后重试。');
    }
    if (!response.ok)
      throw Object.assign(new Error(result.error || '操作未完成，请重试。'), { code: result.code });
    return result;
  }
  function project() {
    if (!window.ThemeEditor) throw new Error('编辑器仍在载入，请稍后重试。');
    return window.ThemeEditor.project;
  }
  function selectedChat(doc) {
    if (location.pathname.endsWith('chat-editor.html')) {
      const active = doc.layers.find(
        (l) => l.type === 'chat' && l.id === document.getElementById('chatInstancePicker')?.value,
      );
      if (active) return active;
    }
    const selected = doc.layers.find((l) => window.ThemeEditor.selection.includes(l.id));
    return (
      window.ThemeInstances.owner(doc, selected || {}) || doc.layers.find((l) => l.type === 'chat')
    );
  }
  function render(info) {
    data = info;
    connected = info.connected;
    state('已连接 OBS', '本机连接正常 · ' + info.port, 'connected');
    $('obsFirstRun').hidden = true;
    $('obsInstallPanel').hidden = false;
    $('obsDisconnect').hidden = false;
    $('obsRefresh').hidden = false;
    $('obsRetry').hidden = true;
    $('obsVersion').textContent = 'OBS ' + info.version;
    $('obsCurrentScene').textContent = info.currentScene || '—';
    $('obsCanvasSize').textContent = info.video.width + ' × ' + info.video.height;
    $('obsRecording').textContent = info.recording
      ? '正在录制 · ' + info.recordTime.split('.')[0]
      : '未录制';
    const select = $('obsGameSource'),
      previous = select.value;
    select.replaceChildren(new Option('只添加主题', ''));
    for (const item of info.sources)
      select.append(
        new Option(item.name + (item.kind === 'game_capture' ? ' · 游戏采集' : ''), item.name),
      );
    if (info.sources.some((s) => s.name === previous)) select.value = previous;
    else {
      const games = info.sources.filter((s) => s.kind === 'game_capture');
      if (games.length === 1) select.value = games[0].name;
    }
    $('obsSourceHint').textContent = info.sources.length
      ? '复用所选采集来源，在新场景内按当前主题的位置和尺寸排版。'
      : '未找到游戏、窗口或屏幕采集来源。可先只添加主题，或在 OBS 添加采集来源后刷新。';
    const doc = window.ThemeEditor?.project,
      chat = doc ? selectedChat(doc) : null;
    $('obsChatChoice').hidden = !chat;
    if (!chat) $('obsChatOutput').value = 'scene';
    else if (location.pathname.endsWith('chat-editor.html')) $('obsChatOutput').value = 'chat';
    sourceState();
    window.dispatchEvent(new CustomEvent('obs-connected', { detail: info }));
  }
  function sourceState() {
    $('obsGameSource').disabled = $('obsChatOutput').value === 'chat';
  }
  function error(error, isConnection = false) {
    if (isConnection) {
      connected = false;
      $('obsInstallPanel').hidden = true;
      $('obsFirstRun').hidden = false;
      $('obsRetry').hidden = false;
      $('obsDisconnect').hidden = true;
      $('obsRefresh').hidden = true;
      state('尚未接通 OBS', error.message, 'error');
      if (error.code === 'AUTH') $('obsManual').open = true;
    } else state('操作未完成', error.message, connected ? 'connected' : 'error');
  }
  async function connect(manual) {
    if (busy) return;
    setBusy(true);
    $('obsInstalled').hidden = true;
    state(
      '正在连接本机 OBS…',
      manual ? '正在验证连接设置' : '自动读取本机端口和认证配置',
      'connecting',
    );
    try {
      render(await request('connect', manual || {}));
    } catch (e) {
      error(e, true);
    } finally {
      $('obsPassword').value = '';
      setBusy(false);
    }
  }
  button.onclick = async () => {
    if (!dialog.open) dialog.showModal();
    if (!busy) {
      if (connected) await refresh();
      else await connect();
    }
  };
  $('obsRetry').onclick = () => connect();
  window.addEventListener('obs-request-connect', () => connect());
  dialog.querySelector('[data-obs-close]').onclick = () => {
    $('obsPassword').value = '';
    dialog.close();
  };
  dialog.addEventListener('close', () => {
    $('obsPassword').value = '';
  });
  $('obsManualForm').onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    // Switching credentials requires closing the old control connection first.
    if (connected) {
      try {
        await window.ThemeObsLive?.pause();
        await request('disconnect');
      } catch (e) {
        error(e, true);
        return;
      }
      connected = false;
    }
    await connect({
      manual: true,
      port: Number($('obsPort').value),
      password: $('obsPassword').value,
    });
  };
  async function refresh() {
    if (busy) return;
    setBusy(true);
    try {
      render(await request('refresh'));
    } catch (e) {
      error(e, true);
    } finally {
      setBusy(false);
    }
  }
  $('obsRefresh').onclick = refresh;
  $('obsChatOutput').onchange = sourceState;
  $('obsDisconnect').onclick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await window.ThemeObsLive?.pause();
      await request('disconnect');
      connected = false;
      $('obsInstallPanel').hidden = true;
      $('obsDisconnect').hidden = true;
      $('obsRefresh').hidden = true;
      $('obsRetry').hidden = false;
      state('已断开连接', 'OBS 的场景、录制和直播继续正常运行。', 'idle');
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };
  $('obsInstall').onclick = async () => {
    if (busy || !connected) return;
    setBusy(true);
    $('obsInstalled').hidden = true;
    state('正在创建主题场景…', '保存主题、添加来源并对齐游戏区域', 'connected');
    try {
      await window.ThemeObsLive?.pause();
      const doc = project(),
        result = await request('install', {
          document: doc,
          source: $('obsGameSource').disabled ? '' : $('obsGameSource').value,
          output: $('obsChatOutput').value,
          chatId: selectedChat(doc)?.id,
        });
      $('obsSceneName').value = result.sceneName;
      $('obsInstalled').hidden = false;
      $('obsInstalledTitle').textContent = result.reused ? '这个版本已经就绪' : '主题已安装到 OBS';
      $('obsInstalledDetail').textContent = result.message;
      state('已连接 OBS', '主题场景已就绪，正在建立实时同步。', 'connected');
      await window.ThemeObsLive?.bindInstalled(result);
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };
  $('obsCopyScene').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('obsSceneName').value);
      $('obsCopyScene').textContent = '已复制';
    } catch {
      $('obsSceneName').focus();
      $('obsSceneName').select();
    }
  };
  const poll = setInterval(async () => {
    if (disposed || busy || !connected) return;
    try {
      const response = await fetch('/api/obs/status', { signal: AbortSignal.timeout(3000) }),
        info = await response.json();
      if (!info.connected) error(new Error(info.message || 'OBS 连接已断开。'), true);
      else if (window.ThemeEditor) setBusy(false);
    } catch {
      error(new Error('本地主题服务未响应，请检查服务后重新连接。'), true);
    }
  }, 4000);
  window.addEventListener(
    'pagehide',
    () => {
      disposed = true;
      clearInterval(poll);
    },
    { once: true },
  );
})();
