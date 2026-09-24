(() => {
  'use strict';
  const $ = (id) => document.getElementById(id),
    key = 'hiss-main-live-v1',
    params = new URLSearchParams(location.search),
    obs = params.has('obs');
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(key) || '{}') || {};
  } catch {}
  let state = LiveState.fromQuery(params, LiveState.normalize(obs ? {} : stored)),
    chatReady = false,
    chatInstance = null,
    chatProbe = null,
    chatPaused = false,
    chatAuto = false,
    liveMode = params.get('source') === 'live',
    pending = [],
    previewGame = true;
  const draftKey = 'hiss-main-composer-v1',
    draftFields = {
      sender: 'sendName',
      giftName: 'giftName',
      quantity: 'giftCount',
      value: 'giftValue',
      duration: 'scDuration',
      tier: 'scTier',
      rank: 'fleetRank',
    };
  let savedDraft = {};
  try {
    if (!obs) savedDraft = JSON.parse(localStorage.getItem(draftKey) || '{}');
  } catch {}
  let draft = LiveComposer.normalize(savedDraft);
  const deliveries = LiveDelivery.create((receipt, item) => post('live', { receipt, item }));
  const previews = LiveDelivery.create((receipt, item) => post('manual', { receipt, item }), {
    limit: 50,
  });
  let previewGeneration = 0,
    previewAttempt = 0;
  function resetPreviews() {
    previewGeneration++;
    previews.clear();
  }
  const queryFPS = Number(params.get('fps'));
  const fps = () =>
    obs && Number.isInteger(queryFPS) && queryFPS >= 1 && queryFPS <= 240
      ? queryFPS
      : FrameRate.fps;
  function tell(text, tone = 'info') {
    $('editorStatus').textContent = text;
    $('editorStatus').dataset.tone = tone;
  }
  function persist() {
    if (obs) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }
  function setText(id, value) {
    const el = $(id);
    if (el.textContent !== value) el.textContent = value;
  }
  function syncTimer() {
    const value = LiveState.format(LiveState.elapsed(state));
    const parts = value.split(':');
    for (const [i, id] of ['timerH', 'timerM', 'timerS'].entries()) setText(id, parts[i]);
    setText('timerControl', value);
    setText('timerState', state.startedAt === null ? '已暂停' : '计时中');
    setText('timerToggle', state.startedAt === null ? '继续计时' : '暂停计时');
  }
  function sync() {
    $('hostText').textContent = state.host || '调查员';
    $('topicText').textContent = state.topic;
    $('topicText').hidden = !state.topic.trim();
    document.querySelector('.header-separator').hidden = !state.topic.trim();
    $('hostInput').value = state.host;
    $('topicInput').value = state.topic;
    $('scene').dataset.splitTopic = String(state.splitTopic);
    if ($('splitTopicEnabled')) $('splitTopicEnabled').checked = state.splitTopic;
    syncTimer();
    syncNowPlaying();
    window.CustomLayout?.apply();
  }
  function syncNowPlaying() {
    const enabled =
        state.nowPlaying ||
        (window.LiveLayout?.current === 'custom' &&
          window.CustomLayout?.value.elements.music.enabled),
      container = $('nowPlayingSlot');
    $('nowPlayingEnabled').checked = enabled;
    $('scene').classList.toggle('has-now-playing', enabled);
    container.hidden = !enabled;
    if (enabled && !$('nowPlayingFrame')) {
      const frame = document.createElement('iframe');
      frame.id = 'nowPlayingFrame';
      frame.title = '正在播放音乐';
      frame.src = 'now-playing.html?v=production46-1&obs=1&embedded=1&fps=' + fps();
      container.append(frame);
    }
    if (!enabled && $('nowPlayingFrame')) $('nowPlayingFrame').remove();
  }
  window.addEventListener('live-layout-change', () => {
    syncNowPlaying();
    window.CustomLayout?.apply();
  });
  $('splitTopicEnabled')?.addEventListener('change', () => {
    state = LiveState.normalize({ ...state, splitTopic: $('splitTopicEnabled').checked });
    sync();
    persist();
  });
  $('nowPlayingEnabled').addEventListener('change', () => {
    state = LiveState.normalize({ ...state, nowPlaying: $('nowPlayingEnabled').checked });
    sync();
    persist();
    tell(
      state.nowPlaying
        ? '已开启 Now Playing，按当前布局显示。'
        : '已关闭 Now Playing，恢复原来的底部排版。',
      'success',
    );
  });
  function fit() {
    if (window.ThemeOutput?.fit()) return;
    const monitor = document.querySelector('.monitor'),
      pure = document.documentElement.classList.contains('pure'),
      available =
        monitor.clientWidth - (pure ? 0 : parseFloat(getComputedStyle(monitor).paddingLeft) * 2),
      height = monitor.clientHeight - (pure ? 0 : 84);
    const width =
      matchMedia('(max-width:760px)').matches && !pure
        ? available
        : Math.min(available, (Math.max(1, height) * 16) / 9);
    $('sceneViewport').style.width = width + 'px';
    $('scene').style.transform = 'scale(' + width / 1920 + ')';
  }
  function post(command, data) {
    const bus = command === 'live' ? deliveries : command === 'manual' ? previews : null;
    if (bus && !bus.has(data?.receipt)) return;
    if (!chatReady) {
      if (bus)
        pending = pending.filter((entry) =>
          entry.command === 'live'
            ? deliveries.has(entry.data?.receipt)
            : entry.command === 'manual'
              ? previews.has(entry.data?.receipt)
              : true,
        );
      if (command === 'fps' || command === 'liveStatus')
        pending = pending.filter((entry) => entry.command !== command);
      pending.push({ command, data });
      return;
    }
    window.ThemeRenderer?.broadcast(command, data);
    $('chatFrame').contentWindow.postMessage(
      { channel: 'hiss-main', command, data },
      location.origin,
    );
  }
  function probeChat() {
    $('chatFrame').contentWindow.postMessage(
      { channel: 'hiss-main', command: 'hello' },
      location.origin,
    );
  }
  window.addEventListener('message', (event) => {
    if (
      event.source !== $('chatFrame').contentWindow ||
      event.origin !== location.origin ||
      event.data?.channel !== 'hiss-main-reply'
    )
      return;
    if (event.data.type === 'ready') {
      // The child may announce before this script has loaded. Repeated probes must
      // recover that race without clearing a message stream already in progress.
      if (chatReady && event.data.instance === chatInstance) return;
      chatReady = true;
      chatInstance = event.data.instance;
      clearInterval(chatProbe);
      chatProbe = null;
      post('fps', fps());
      post('source', liveMode);
      if (!liveMode && !obs) post('demo');
      const queued = pending;
      pending = [];
      for (const item of queued) post(item.command, item.data);
      $('previewStatus').textContent = liveMode
        ? '等待直播间消息'
        : obs
          ? '等待第一条消息'
          : '四类弹幕已载入 · 可手动发送';
    } else if (event.data.type === 'receipt')
      deliveries.acknowledge(event.data.receipt, event.data.accepted);
    else if (event.data.type === 'manual-receipt')
      previews.acknowledge(event.data.receipt, event.data.accepted);
    else if (event.data.type === 'notice') LiveMotion.notice(event.data.kind, event.data.tier);
    else if (event.data.type === 'exit-preview') exitPreview();
    else if (event.data.type === 'status') $('previewStatus').textContent = event.data.text;
    else if (event.data.type === 'flow') {
      const flow = event.data.state;
      if (!flow || typeof flow.following !== 'boolean') return;
      chatPaused = !!flow.paused;
      chatAuto = !!flow.auto;
      $('pauseChat').textContent = chatPaused ? '继续' : '暂停';
      $('autoChat').textContent = chatAuto ? '停止自动发送' : '自动发送示例';
      $('autoChat').setAttribute('aria-pressed', String(chatAuto));
      $('latestChat').hidden = flow.following || obs;
      const unread = Math.max(0, Math.floor(Number(flow.unread) || 0));
      $('latestChat').textContent = unread
        ? '回到最新 · ' + (unread > 999 ? '999+' : unread) + ' 条新消息'
        : '回到最新弹幕';
      if (liveMode && flow.live) {
        const shown = Math.max(0, Math.floor(Number(flow.displayed) || 0)),
          queued = Math.max(0, Math.floor(Number(flow.queued) || 0));
        const phase =
          flow.phase === 'connected'
            ? shown || queued
              ? ''
              : '等待消息'
            : {
                connecting: '连接中',
                retrying: '重连中',
                error: '连接失败',
                offline: '等待接入服务',
                idle: '等待连接',
              }[flow.phase] || '等待连接';
        $('previewStatus').textContent = [
          flow.roomId ? '直播间 ' + flow.roomId : '直播弹幕',
          phase,
          '画面 ' + shown + ' 条',
          queued ? '排队 ' + queued + ' 条' : '',
          chatPaused ? '已暂停' : flow.following ? '' : '查看历史',
        ]
          .filter(Boolean)
          .join(' · ');
      }
    }
  });
  $('chatFrame').addEventListener('load', probeChat);
  function sourceUI() {
    $('zoneReplay').disabled = liveMode;
    $('scCarouselDemo').disabled = liveMode;
    $('localControls').hidden = liveMode;
    $('liveControls').hidden = !liveMode;
    $('messageSource').value = liveMode ? 'live' : 'simulation';
    chatPaused = false;
    chatAuto = false;
    $('pauseChat').textContent = '暂停';
    $('autoChat').textContent = '自动发送示例';
    $('autoChat').setAttribute('aria-pressed', 'false');
    $('latestChat').hidden = true;
  }
  function sourceChanged(on) {
    resetPreviews();
    deliveries.clear();
    liveMode = on;
    sourceUI();
    post('source', on);
    tell(on ? '已切换到真实弹幕。' : '已切换到本地模拟。');
  }
  BilibiliLive.mount({
    setSource: sourceChanged,
    reset() {
      resetPreviews();
      deliveries.clear();
      post('clear');
    },
    restore(items) {
      post('restore', items);
    },
    receive(item) {
      return deliveries.send(item);
    },
    remove(ids) {
      post('delete', ids);
    },
    status(phase, roomId) {
      post('liveStatus', { phase, roomId });
    },
  });
  for (const [id, property] of [
    ['hostInput', 'host'],
    ['topicInput', 'topic'],
  ]) {
    const field = $(id);
    let composing = false;
    function commit() {
      const next = LiveState.normalize({ ...state, [property]: field.value }),
        changed = next[property] !== state[property];
      state = next;
      sync();
      persist();
      if (changed) {
        if (property === 'topic') LiveMotion.topicUpdated();
        else LiveMotion.nameUpdated();
      }
    }
    field.addEventListener('compositionstart', () => {
      composing = true;
    });
    field.addEventListener('compositionend', () => {
      composing = false;
      commit();
    });
    field.addEventListener('input', (event) => {
      if (!composing && !event.isComposing) commit();
    });
  }
  $('timerToggle').addEventListener('click', () => {
    state = LiveState.toggle(state);
    syncTimer();
    persist();
  });
  $('timerReset').addEventListener('click', () => {
    state = LiveState.reset(state);
    syncTimer();
    persist();
    tell(
      state.startedAt === null ? '直播计时已归零，当前保持暂停。' : '直播计时已归零并继续计时。',
    );
  });
  function applyTimer() {
    const value = LiveState.parseDuration($('timerOffset').value);
    if (value === null) {
      $('timerHint').textContent = '请按 时:分:秒 填写，例如 01:28:36。';
      $('timerOffset').setAttribute('aria-invalid', 'true');
      tell('已播时长格式不正确，请按 时:分:秒 填写。', 'error');
      $('timerOffset').focus();
      return;
    }
    state = { ...state, elapsedMs: value, startedAt: state.startedAt === null ? null : Date.now() };
    $('timerOffset').value = LiveState.format(value);
    $('timerOffset').removeAttribute('aria-invalid');
    $('timerHint').textContent = '已更新时长，刷新后保留计时状态。';
    syncTimer();
    persist();
    tell(
      '已播时长已设为 ' +
        LiveState.format(value) +
        (state.startedAt === null ? '（暂停中）。' : '。'),
      'success',
    );
  }
  $('timerApply').addEventListener('click', applyTimer);
  $('timerOffset').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      applyTimer();
    }
  });
  $('gamePreview').addEventListener('change', () => {
    previewGame = $('gamePreview').checked;
    document.documentElement.classList.toggle('no-game', !previewGame);
  });
  $('previewButton').addEventListener('click', () => {
    document.documentElement.classList.add('pure');
    fit();
  });
  function exitPreview() {
    if (obs || !document.documentElement.classList.contains('pure')) return;
    document.documentElement.classList.remove('pure');
    fit();
    $('previewButton').focus({ preventScroll: true });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') exitPreview();
  });
  $('scCarouselDemo').addEventListener('click', () => {
    if (liveMode) return;
    resetPreviews();
    chatPaused = false;
    $('pauseChat').textContent = '暂停';
    post('sc-carousel-demo');
    tell('3 条 SC 正在轮播；每条独立倒计时。');
  });
  $('zoneReplay').addEventListener('click', () => {
    if (liveMode) return;
    resetPreviews();
    post('zone-demo');
    tell('四类提示正在各自区域播放。');
  });
  $('demoButton').addEventListener('click', () => {
    resetPreviews();
    chatPaused = false;
    $('pauseChat').textContent = '暂停';
    post('demo');
    tell('已恢复示例。');
  });
  $('clearButton').addEventListener('click', () => {
    resetPreviews();
    post('clear');
    tell('弹幕已清空。');
  });
  $('pauseChat').addEventListener('click', () => {
    chatPaused = !chatPaused;
    post('pause', chatPaused);
    $('pauseChat').textContent = chatPaused ? '继续' : '暂停';
  });
  $('autoChat').addEventListener('click', () => {
    if (liveMode || obs) return;
    chatAuto = !chatAuto;
    post('auto', chatAuto);
  });
  $('latestChat').addEventListener('click', () => post('latest'));
  function composer() {
    const kind = $('sendKind').value;
    $('bodyField').hidden = !['normal', 'sc'].includes(kind);
    $('giftFields').hidden = kind !== 'gift';
    $('scFields').hidden = kind !== 'sc';
    $('fleetField').hidden = kind !== 'fleet';
    $('sendBody').maxLength = kind === 'sc' ? 1600 : 300;
    for (const id of ['giftName', 'giftCount', 'giftValue']) $(id).disabled = kind !== 'gift';
    for (const id of ['scTier', 'scDuration']) $(id).disabled = kind !== 'sc';
  }
  function saveComposer() {
    if (obs) return;
    draft.kind = $('sendKind').value;
    if (draft.kind === 'normal' || draft.kind === 'sc')
      draft.bodies[draft.kind] = $('sendBody').value;
    for (const [key, id] of Object.entries(draftFields)) draft[key] = $(id).value;
    draft = LiveComposer.normalize(draft);
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {}
  }
  function restoreComposer() {
    $('sendKind').value = draft.kind;
    for (const [key, id] of Object.entries(draftFields)) $(id).value = draft[key];
    $('sendBody').value = draft.bodies[draft.kind] ?? '';
    composer();
  }
  $('sendKind').addEventListener('change', () => {
    if (draft.kind === 'normal' || draft.kind === 'sc')
      draft.bodies[draft.kind] = $('sendBody').value;
    draft.kind = $('sendKind').value;
    $('sendBody').value = draft.bodies[draft.kind] ?? '';
    composer();
    saveComposer();
  });
  for (const type of ['input', 'change'])
    $('messageForm').addEventListener(type, (event) => {
      if (event.target.id !== 'sendKind') saveComposer();
    });
  function manual(short = false) {
    if (liveMode) return;
    const kind = short ? 'sc' : $('sendKind').value,
      body = $('sendBody').value;
    if (kind === 'normal' && !body.trim()) {
      tell('先写一条弹幕。', 'error');
      $('sendBody').focus();
      return;
    }
    if (chatPaused) {
      chatPaused = false;
      post('pause', false);
      $('pauseChat').textContent = '暂停';
    }
    const generation = previewGeneration,
      attempt = ++previewAttempt;
    const result = previews.send({
      kind,
      sender: $('sendName').value,
      body,
      tier: Number($('scTier').value),
      duration: short ? 3 : Number($('scDuration').value),
      rank: $('fleetRank').value,
      giftName: $('giftName').value,
      quantity: Number($('giftCount').value),
      value: Number($('giftValue').value),
    });
    tell('正在加入预览队列…', 'pending');
    Promise.resolve(result).then((accepted) => {
      if (generation !== previewGeneration || attempt !== previewAttempt || liveMode) return;
      tell(
        accepted
          ? short
            ? '3 秒 SC 已加入预览队列，到期后自动消散。'
            : '已加入预览队列。'
          : '未能加入预览队列，请稍后再试；输入内容已保留。',
        accepted ? 'success' : 'error',
      );
    });
  }
  $('messageForm').addEventListener('submit', (e) => {
    e.preventDefault();
    manual();
  });
  $('shortSc').addEventListener('click', () => manual(true));
  $('sendBody').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $('messageForm').requestSubmit();
    }
  });
  function syncMusicFps() {
    const frame = $('nowPlayingFrame');
    if (frame)
      frame.contentWindow.postMessage({ channel: 'hiss-music-host', fps: fps() }, location.origin);
  }
  window.addEventListener('hiss-frame-rate', () => {
    post('fps', fps());
    syncMusicFps();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === key && !obs) {
      try {
        state = LiveState.normalize(JSON.parse(event.newValue) || {});
        sync();
      } catch {}
    }
    if (event.key === 'hiss-animation-frame-rate-v1')
      setTimeout(() => {
        post('fps', fps());
        syncMusicFps();
      }, 0);
  });
  $('copyObs').addEventListener('click', async () => {
    const url = new URL('live.html', location.href);
    url.search = new URLSearchParams({
      obs: '1',
      layout: LiveLayout.current,
      ...LiveState.query(state),
      fps: String(fps()),
      motion: LiveMotion.enabled ? '1' : '0',
      resonance: String(LiveMaterial.intensity),
      source: liveMode ? 'live' : 'simulation',
      notices: JSON.stringify(window.LiveNoticeSettings?.value || {}),
    }).toString();
    if (LiveLayout.current === 'custom' && window.CustomLayout)
      url.hash = CustomLayout.exportHash();
    $('obsUrl').value = url.href;
    try {
      await navigator.clipboard.writeText(url.href);
      tell('OBS 地址已复制，已包含当前布局。');
    } catch {
      tell('请复制下方地址。');
    }
    $('urlDialog').showModal();
    $('obsUrl').select();
  });
  $('closeDialog').addEventListener('click', () => $('urlDialog').close());
  window.ThemeLiveBridge = {
    get timer() {
      return { elapsedMs: state.elapsedMs, startedAt: state.startedAt };
    },
    setTimer(value) {
      state = LiveState.normalize({ ...state, ...value });
      syncTimer();
    },
  };
  new ResizeObserver(fit).observe(document.querySelector('.monitor'));
  window.addEventListener('resize', fit);
  setInterval(syncTimer, 200);
  sync();
  sourceUI();
  restoreComposer();
  persist();
  fit();
  LiveMotion.replay();
  chatProbe = setInterval(probeChat, 1000);
  probeChat();
  window.addEventListener('pagehide', () => {
    clearInterval(chatProbe);
    deliveries.clear();
    resetPreviews();
  });
})();
