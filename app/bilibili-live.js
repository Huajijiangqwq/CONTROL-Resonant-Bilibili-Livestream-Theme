(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  window.BilibiliLive = {
    mount(callbacks) {
      const base = window.ThemeServices?.bilibili || 'http://127.0.0.1:8793';
      const sessionRow = $('liveSession').closest('details');
      const loginPanel = document.createElement('div');
      loginPanel.id = 'liveLoginPanel';
      sessionRow.before(loginPanel);
      const login = window.BilibiliLogin.mount(loginPanel, { base });
      sessionRow.id = 'liveManualLogin';
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
      let serverSnapshot = null;
      const sharedHistory = window.LiveMessageJournal?.create();
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
        if (serverSnapshot && String(serverSnapshot.roomId) === String(current.roomId)) {
          restoreSnapshot(sharedHistory ? sharedHistory.snapshot() : serverSnapshot);
          return;
        }
        // Newer services supply a shared snapshot; per-tab recovery is only a
        // compatibility fallback for an older service.
        if (serviceVersion >= 5) return;
        recovery.room(current.roomId);
        restored = true;
        const items = recovery.snapshot();
        if (items.length) callbacks.restore?.(items);
      }
      function restoreSnapshot(value) {
        if (!sourceName() || !bridge || current?.phase !== 'connected' || String(value.roomId) !== String(current.roomId)) return;
        resetDeliveries();
        recovery.room(value.roomId); recovery.clear();
        callbacks.reset();
        const items = Array.isArray(value.items) ? value.items.slice(-80) : [];
        for (const item of items) recovery.remember(item);
        restored = true;
        callbacks.restore?.(items);
      }
      function applyStatus(next) {
        sharedHistory?.status(next);
        const reset =
          current?.roomInput &&
          (next.roomInput !== current.roomInput ||
            (next.phase === 'connecting' && current.phase !== 'connecting' && next.received === 0));
        if (reset) {
          serverSnapshot = null;
          resetDeliveries();
          recovery.clear();
          restored = false;
          loss = 0;
          if (sourceName()) callbacks.reset();
        }
        if (next.phase === 'idle') {
          serverSnapshot = null;
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
            : '连接直播间';
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
            sharedHistory?.message(item);
            if (recovery.room(item.roomId || current?.roomId)) resetDeliveries();
            if (item.kind === 'delete') {
              if (serverSnapshot) serverSnapshot.items = serverSnapshot.items.filter(value => value.kind !== 'sc' || !item.scIds?.includes(value.scId));
              recovery.remove(item.scIds);
              if (sourceName()) callbacks.remove(item.scIds);
              return;
            }
            if (!sourceName()) return;
            recover();
            deliver(item);
          } catch {}
        });
        stream.addEventListener('snapshot', event => {
          try {
            const value = JSON.parse(event.data);
            if (!value || !Array.isArray(value.items)) return;
            serverSnapshot = value;
            sharedHistory?.replace(value);
            restoreSnapshot(value);
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
        if (!room) {
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
          const session = $('liveSession').value.trim();
          $('liveSession').value = '';
          await action('/api/connect', { room, session, guest: $('liveGuest').checked });
          // applyStatus resets the stream at the actual room transition. Repeating
          // that reset here could discard messages received before the HTTP reply.
          if (chosenSource === sourceRevision && !sourceName()) changeSource('live');
          try {
            localStorage.setItem('hiss-bilibili-room', room);
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
      return {
        isLive: sourceName,
        restoreCurrent() {
          if (!sourceName()) return false;
          // Local timeline inspection does not disconnect the room or switch
          // the global source. Reuse the journal, including intervening SC
          // deletions and expiration, without replaying entrance animations.
          resetDeliveries();
          const snapshot = sharedHistory?.snapshot();
          const items = snapshot && String(snapshot.roomId) === String(current?.roomId)
            ? snapshot.items : recovery.snapshot();
          callbacks.reset();
          callbacks.restore?.(items);
          return true;
        },
      };
    },
  };
})();
