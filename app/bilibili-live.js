(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  window.BilibiliLive = {
    mount(callbacks) {
      const base = window.ThemeServices?.bilibili || 'http://127.0.0.1:8793';
      const roomRow = $('liveRoom').closest('label'), sessionRow = $('liveSession').closest('details');
      const methodRow = document.createElement('label');
      methodRow.className = 'field';
      methodRow.innerHTML = '<span>接入方式</span><select id="liveMethod"><option value="web">房间号 / 扫码登录</option><option value="open" disabled>主播身份码（暂未开放）</option></select>';
      roomRow.before(methodRow);
      const loginPanel = document.createElement('div');
      loginPanel.id = 'liveLoginPanel';
      sessionRow.before(loginPanel);
      const login = window.BilibiliLogin.mount(loginPanel, { base });
      sessionRow.id = 'liveManualLogin';
      const openPanel = document.createElement('div');
      openPanel.id = 'liveOpenPanel'; openPanel.hidden = true;
      openPanel.innerHTML = `
        <label class="field"><span>主播身份码</span><input id="liveIdentityCode" type="password" autocomplete="off" maxlength="256" placeholder="填写自己的主播身份码"></label>
        <details id="liveOpenAdvanced"><summary>应用配置（首次使用）</summary>
          <p class="hint">需要已获准使用的直播开放平台应用。应用配置完成后，日常连接只需身份码。</p>
          <label class="field"><span>App ID</span><input id="liveOpenAppId" inputmode="numeric" maxlength="19" autocomplete="off" placeholder="开放平台应用 ID"></label>
          <label class="field"><span>Access Key ID</span><input id="liveOpenKeyId" type="password" autocomplete="off" maxlength="256"></label>
          <label class="field"><span>Access Key Secret</span><input id="liveOpenSecret" type="password" autocomplete="off" maxlength="512"></label>
          <p class="hint">密钥由本机服务用于签名，不会写入主题、OBS 地址或导出文件。</p>
        </details>
        <label class="check"><input id="liveOpenRemember" type="checkbox" checked> 在本机加密记住配置</label>
        <label class="check"><input id="liveOpenAuto" type="checkbox"> 启动服务后自动连接</label>
        <div class="button-row tools"><button type="button" id="liveOpenSave">保存配置</button><button type="button" id="liveOpenForget">清除已保存配置</button></div>
        <p class="hint" id="liveOpenSaved" role="status"></p>
        <p class="hint"><a href="https://open-live.bilibili.com/open-manage" target="_blank" rel="noreferrer">应用管理</a> · <a href="https://play-live.bilibili.com/" target="_blank" rel="noreferrer">获取身份码</a> · <a href="https://open-live.bilibili.com/document/849b924b-b421-8586-3e5e-765a72ec3840" target="_blank" rel="noreferrer">申请与接入说明</a></p>`;
      methodRow.after(openPanel);
      let openSettings = {}, methodEdited = false, openSettingsLoaded = false;
      const openMode = () => $('liveMethod').value === 'open';
      function chooseMethod() {
        openPanel.hidden = !openMode(); roomRow.hidden = openMode(); sessionRow.hidden = openMode(); loginPanel.hidden = openMode();
        roomError = false; localError = ''; display();
      }
      function clearOpenInputs() {
        for (const id of ['liveIdentityCode', 'liveOpenKeyId', 'liveOpenSecret']) $(id).value = '';
      }
      function readOpenInputs() {
        return { code: $('liveIdentityCode').value.trim(), appId: $('liveOpenAppId').value.trim(),
          accessKeyId: $('liveOpenKeyId').value.trim(), accessKeySecret: $('liveOpenSecret').value.trim(),
          autoConnect: $('liveOpenRemember').checked && $('liveOpenAuto').checked };
      }
      function applyOpenSettings(next) {
        if (!next) return;
        openSettings = next;
        if (!openSettingsLoaded) {
          openSettingsLoaded = true;
          if (!$('liveOpenAppId').value) $('liveOpenAppId').value = next.appId || '';
          $('liveOpenAuto').checked = !!next.autoConnect;
          if (next.canRemember === false) $('liveOpenRemember').checked = false;
          if (next.available && !methodEdited && (next.saved || current?.mode === 'open')) $('liveMethod').value = 'open';
          $('liveOpenAdvanced').open = !next.hasKeys;
          chooseMethod();
        }
        $('liveIdentityCode').placeholder = next.hasCode ? '已加密保存；留空使用已保存身份码' : '填写自己的主播身份码';
        for (const id of ['liveOpenKeyId', 'liveOpenSecret']) $(id).placeholder = next.hasKeys ? '已加密保存；留空使用原值' : '填写开放平台开发者凭据';
        $('liveOpenSaved').textContent = next.error || (next.saved ? '已在当前 Windows 账户下加密保存。重启后可直接连接。' : '尚未保存应用配置。申请通过后，在上方填写应用凭据。');
        $('liveOpenForget').disabled = !next.saved && !next.error;
        const openOption = $('liveMethod').querySelector('option[value="open"]');
        openOption.disabled = !next.available;
        openOption.textContent = next.available ? '主播身份码（开发测试）' : '主播身份码（暂未开放）';
      }
      let token = '',
        stream = null,
        current = null,
        busy = false,
        loss = 0,
        source = 'simulation',
        bridge = false,
        roomEdited = false,
        localError = '',
        localErrorIsOffline = false,
        roomError = false;
      let storage;
      try {
        storage = sessionStorage;
      } catch {}
      const recovery = LiveRecovery.create(storage);
      let restored = false,
        statusRevision = 0;
      let serviceVersion = null,
        healthSequence = 0,
        versionSequence = 0;
      let sourceRevision = 0,
        deliveryGeneration = 0;
      const inFlight = new Map();
      function resetDeliveries() {
        deliveryGeneration++;
        inFlight.clear();
      }
      try {
        $('liveRoom').value = localStorage.getItem('hiss-bilibili-room') || '';
      } catch {}
      const sourceName = () => source === 'live';
      function changeSource(value) {
        if (source === value) return;
        sourceRevision++;
        resetDeliveries();
        source = value;
        restored = false;
        recovery.select(sourceName());
        $('messageSource').value = value;
        loss = 0;
        callbacks.setSource(sourceName());
        display();
        recover();
      }
      function recover() {
        if (
          !sourceName() ||
          !bridge ||
          current?.phase !== 'connected' ||
          !current.roomId ||
          restored
        )
          return;
        recovery.room(current.roomId);
        restored = true;
        const items = recovery.snapshot();
        if (items.length) callbacks.restore?.(items);
      }
      function applyStatus(next) {
        const reset =
          current?.roomInput &&
          (next.roomInput !== current.roomInput ||
            (next.phase === 'connecting' && current.phase !== 'connecting' && next.received === 0));
        if (reset) {
          resetDeliveries();
          recovery.clear();
          restored = false;
          loss = 0;
          if (sourceName()) callbacks.reset();
        }
        if (next.phase === 'idle') {
          resetDeliveries();
          recovery.clear();
          restored = false;
          loss = 0;
        }
        current = next;
        bridge = true;
        statusRevision++;
        if (localErrorIsOffline) {
          localError = '';
          localErrorIsOffline = false;
        }
        if (!roomEdited && !$('liveRoom').value && next.roomInput) {
          $('liveRoom').value = next.roomInput;
          roomError = false;
          $('liveRoom').removeAttribute('aria-invalid');
        }
        display();
        recover();
      }
      function display() {
        $('liveDisconnect').disabled =
          !bridge || busy || !['connecting', 'connected', 'retrying'].includes(current?.phase);
        $('liveConnect').disabled = busy;
        $('liveConnect').textContent = busy
          ? '正在连接…'
          : current?.phase === 'connected'
            ? '切换 / 重新连接'
            : openMode() ? '身份码连接' : '连接直播间';
        $('liveOpenSave').disabled = busy;
        $('liveMethod').disabled = busy;
        $('liveStatus').textContent = roomError
          ? '先填写房间号或直播间链接。'
          : localError ||
            (bridge ? current?.message || '尚未连接直播间' : '等待本地接入服务，启动后将自动接续');
        $('liveStatus').style.color =
          roomError || localError || current?.phase === 'error'
            ? '#f1a394'
            : current?.phase === 'connected' && bridge
              ? '#9bdeba'
              : '';
        $('liveHelp').hidden = bridge;
        const updateHint = $('liveUpdate');
        if (updateHint)
          updateHint.hidden = !bridge || serviceVersion === null || serviceVersion >= 3;
        const pieces = [];
        if (current?.roomId) {
          pieces.push('房间 ' + current.roomId);
          if (current.liveStatus !== null && current.liveStatus !== undefined) pieces.push(
            current.liveStatus === 1 ? '直播中' : current.liveStatus === 2 ? '轮播中' : '未开播');
          if (current.mode === 'open') pieces.push('官方身份码');
          if (current.title) pieces.push(current.title);
        }
        if (current?.received) pieces.push('收到 ' + current.received + ' 条');
        if (Number.isFinite(current?.skipped) && current.skipped > 0)
          pieces.push('跳过 ' + Math.floor(current.skipped) + ' 条格式异常消息');
        if (current?.lastHeartbeatAt)
          pieces.push(
            '心跳 ' +
              new Date(current.lastHeartbeatAt).toLocaleTimeString('zh-CN', { hour12: false }),
          );
        if (loss) pieces.push('画面未接收 ' + loss + ' 条（队列已满或响应超时）');
        if (current?.phase === 'connected' && !sourceName()) pieces.push('当前画面仍为本地模拟');
        $('liveDetail').textContent = pieces.join(' · ');
        callbacks.status(
          sourceName() ? (bridge ? current?.phase || 'idle' : 'offline') : 'simulation',
          current?.roomId,
        );
      }
      async function health() {
        const revision = statusRevision,
          request = ++healthSequence;
        const response = await fetch(base + '/api/health', {
          cache: 'no-store',
          signal: AbortSignal.timeout(3500),
        });
        const data = await response.json();
        if (!response.ok || data.service !== 'hiss-bilibili') throw new Error('接入服务不可用');
        if (request >= versionSequence) {
          versionSequence = request;
          serviceVersion = Number.isFinite(Number(data.version)) ? Number(data.version) : 1;
        }
        token = data.token;
        login.apply(data.login);
        applyOpenSettings(data.openSettings);
        if (revision === statusRevision) applyStatus(data.status);
        else {
          bridge = true;
          display();
          recover();
        }
        return data;
      }
      function probe() {
        const revision = statusRevision;
        health().catch(() => {
          if (revision === statusRevision) {
            bridge = false;
            display();
          }
        });
      }
      function deliver(item) {
        const id = item.kind === 'sc' && item.scId ? 'sc:' + item.scId : item.eventId || Symbol();
        if (recovery.has(item) || inFlight.has(id)) return;
        const generation = deliveryGeneration;
        inFlight.set(id, generation);
        const settle = (accepted) => {
          if (generation !== deliveryGeneration || inFlight.get(id) !== generation) return;
          inFlight.delete(id);
          if (accepted === true) recovery.remember(item);
          else {
            loss++;
            display();
          }
        };
        try {
          const result = callbacks.receive(item);
          if (result && typeof result.then === 'function')
            Promise.resolve(result).then(settle, () => settle(false));
          else settle(result);
        } catch {
          settle(false);
        }
      }
      function listen() {
        if (stream) return;
        stream = new EventSource(base + '/api/events');
        stream.addEventListener('open', probe);
        stream.addEventListener('status', (event) => {
          try {
            applyStatus(JSON.parse(event.data));
          } catch {}
        });
        stream.addEventListener('message', (event) => {
          try {
            const item = JSON.parse(event.data);
            if (recovery.room(item.roomId || current?.roomId)) resetDeliveries();
            if (item.kind === 'delete') {
              recovery.remove(item.scIds);
              if (sourceName()) callbacks.remove(item.scIds);
              return;
            }
            if (!sourceName()) return;
            recover();
            deliver(item);
          } catch {}
        });
        stream.addEventListener('error', () => {
          bridge = false;
          display();
        });
      }
      async function action(endpoint, payload) {
        await health();
        listen();
        const revision = statusRevision;
        const response = await fetch(base + endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Control-Token': token },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '操作没有完成。');
        applyOpenSettings(data.openSettings);
        if (revision === statusRevision) applyStatus(data.status);
        else {
          // The event stream may already have progressed beyond this HTTP snapshot.
          // Recheck current state; a failed recheck must not undo a successful action.
          try {
            await health();
          } catch {}
        }
        return data;
      }
      async function connect() {
        const room = $('liveRoom').value.trim();
        if (!openMode() && !room) {
          roomError = true;
          $('liveRoom').setAttribute('aria-invalid', 'true');
          display();
          $('liveRoom').focus();
          return;
        }
        roomError = false;
        $('liveRoom').removeAttribute('aria-invalid');
        const chosenSource = sourceRevision;
        busy = true;
        localError = '';
        localErrorIsOffline = false;
        display();
        try {
          if (openMode()) {
            const value = readOpenInputs();
            await health();
            if (serviceVersion < 3) throw Error('请重新启动桌面客户端，使新版身份码接入服务生效。');
            await action('/api/connect', { mode: 'open', open: value, remember: $('liveOpenRemember').checked });
            clearOpenInputs();
            await health();
          } else {
            const session = $('liveSession').value.trim();
            $('liveSession').value = '';
            await action('/api/connect', { mode: 'web', room, session, guest: $('liveGuest').checked });
          }
          // applyStatus resets the stream at the actual room transition. Repeating
          // that reset here could discard messages received before the HTTP reply.
          if (chosenSource === sourceRevision && !sourceName()) changeSource('live');
          try {
            if (!openMode()) localStorage.setItem('hiss-bilibili-room', room);
          } catch {}
        } catch (e) {
          localErrorIsOffline = !bridge;
          localError = bridge ? e.message : '本地接入服务未启动，请先打开启动文件。';
        } finally {
          busy = false;
          display();
        }
      }
      $('liveRoom').addEventListener('input', () => {
        roomEdited = true;
        if (roomError && $('liveRoom').value.trim()) {
          roomError = false;
          $('liveRoom').removeAttribute('aria-invalid');
          display();
        }
      });
      $('liveRoom').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing && !busy) {
          e.preventDefault();
          connect();
        }
      });
      $('messageSource').addEventListener('change', () => changeSource($('messageSource').value));
      $('liveMethod').addEventListener('change', () => { methodEdited = true; chooseMethod(); });
      $('liveOpenRemember').addEventListener('change', () => {
        $('liveOpenAuto').disabled = !$('liveOpenRemember').checked;
        if (!$('liveOpenRemember').checked) $('liveOpenAuto').checked = false;
      });
      $('liveIdentityCode').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.isComposing && !busy) { e.preventDefault(); connect(); }
      });
      for (const [id, endpoint] of [['liveOpenSave', '/api/open-settings'], ['liveOpenForget', '/api/open-forget']]) {
        $(id).addEventListener('click', async () => {
          busy = true; localError = ''; display();
          try {
            await health();
            if (serviceVersion < 3) throw Error('请重新启动桌面客户端以更新接入服务。');
            if (id === 'liveOpenSave' && !$('liveOpenRemember').checked) throw Error('请先勾选“在本机加密记住配置”；不保存可直接连接。');
            await action(endpoint, id === 'liveOpenSave' ? readOpenInputs() : {});
            clearOpenInputs();
            if (id === 'liveOpenForget') {
              $('liveOpenAppId').value = ''; $('liveOpenAuto').checked = false;
              $('liveOpenAdvanced').open = true;
            }
          } catch (e) { localError = bridge ? e.message : '本地接入服务未启动。'; }
          finally { busy = false; display(); }
        });
      }
      $('liveConnect').addEventListener('click', connect);
      $('liveDisconnect').addEventListener('click', async () => {
        busy = true;
        localError = '';
        localErrorIsOffline = false;
        roomError = false;
        $('liveRoom').removeAttribute('aria-invalid');
        display();
        try {
          await action('/api/disconnect', {});
          $('liveSession').value = '';
        } catch (e) {
          localErrorIsOffline = !bridge;
          localError = bridge
            ? '断开未完成：' + e.message
            : '本地接入服务未启动，无法确认断开结果。';
        } finally {
          busy = false;
          display();
        }
      });
      window.addEventListener('pagehide', () => {
        sourceRevision++;
        resetDeliveries();
        stream?.close();
        stream = null;
        $('liveSession').value = '';
        clearOpenInputs();
      });
      window.addEventListener('pageshow', () => {
        listen();
        probe();
      });
      const requestedSource = new URLSearchParams(location.search).get('source');
      if (requestedSource === 'live' || (requestedSource === null && recovery.selected))
        changeSource('live');
      else if (requestedSource === 'simulation') recovery.select(false);
      listen();
      probe();
      return { isLive: sourceName };
    },
  };
})();
