(function () {
  'use strict';
  const $ = (id) => document.getElementById(id),
    base = window.ThemeServices?.music || 'http://127.0.0.1:8795',
    params = new URLSearchParams(location.search),
    renderer = new NowPlayingSignal.Renderer($('musicCanvas')),
    envelope = new NowPlayingDSP.SpectrumEnvelope(),
    fineEnvelope = new NowPlayingFineDSP.SpectrumEnvelope(),
    demoEnvelope = new NowPlayingFineDSP.SpectrumEnvelope();
  // The selected 46 renderer is used unchanged by the standalone and embedded skin.
  const signalKey = 'hiss-now-playing-signal-test-34';
  let signalConfig = NowPlayingSignal.settings({
    strength: 1.05,
    softness: 1.5,
    bleed: 4.5,
    offset: 1.8,
    motion: 1,
    hue: 1,
    noise: 1,
    frequency: 1,
  });
  try {
    const saved = JSON.parse(localStorage.getItem(signalKey) || 'null');
    if (saved) signalConfig = NowPlayingSignal.settings(saved);
  } catch {}
  window.addEventListener('storage', (event) => {
    if (event.key === signalKey) {
      try {
        signalConfig = NowPlayingSignal.settings(JSON.parse(event.newValue || '{}'));
      } catch {}
    }
  });
  let demoStarted = performance.now();
  // A deterministic synthetic signal: no recorded music or user audio is shipped.
  function recordedLevels(now) {
    const t = (now - demoStarted) / 1000,
      levels = new Float32Array(240),
      beat = Math.exp(-((t * 1.8) % 1) * 8);
    for (let i = 0; i < 240; i++) {
      const x = i / 239;
      levels[i] = Math.min(
        1,
        (0.12 +
          0.44 * beat * Math.exp(-x * 3) +
          0.24 * Math.pow(Math.sin(x * 18 - t * 1.7), 6) +
          0.11 * Math.pow(Math.sin(x * 43 + t * 2.4), 8)) *
          (1 - x * 0.7),
      );
    }
    return levels;
  }
  function feedAudio(frame, now) {
    envelope.feed(frame.db, now, frame.rms);
    if (frame.fineDb?.length === 240) fineEnvelope.feed(frame.fineDb, now, frame.rms);
  }
  let hostFps =
    params.has('embedded') && Number(params.get('fps')) >= 1 && Number(params.get('fps')) <= 240
      ? Number(params.get('fps'))
      : null;
  let settings = {
      gain: 0,
      floor: -72,
      ceiling: -12,
      attack: 18,
      release: 135,
      tilt: 2,
      texture: 0.65,
      flow: 1,
      fps: 60,
      enabled: false,
      source: 'desktop',
      serviceUrl: 'http://127.0.0.1:9863',
    },
    track = {
      hasSong: false,
      paused: true,
      title: '',
      artist: '',
      id: '',
      position: 0,
      duration: 0,
      stamp: Date.now(),
    },
    audio = {},
    demo = params.has('demo'),
    connected = false,
    lastFrame = NaN,
    nextFrame = NaN,
    frames = 0,
    lastFps = performance.now(),
    lastUi = 0,
    saveTimer = null;
  const demoTrack = {
    hasSong: true,
    paused: false,
    title: 'Resonance',
    artist: 'Theme Studio · Synthetic Demo',
    id: 'reference',
    duration: 475,
    position: 137,
    stamp: Date.now(),
  };
  const meters = Array.from({ length: 48 }, () => {
    const el = document.createElement('i');
    $('bandMeter').append(el);
    return el;
  });
  function status(message, error = false) {
    $('status').textContent = message;
    $('status').dataset.error = String(error);
  }
  function applySettings(next) {
    settings = { ...settings, ...next };
    if (hostFps !== null) settings.fps = hostFps;
    envelope.configure(settings);
    fineEnvelope.configure(settings);
    for (const key of [
      'gain',
      'floor',
      'ceiling',
      'attack',
      'release',
      'tilt',
      'texture',
      'flow',
    ]) {
      if (document.activeElement !== $(key)) $(key).value = settings[key];
    }
    $('serviceUrl').value = settings.serviceUrl;
    $('musicProvider').value = settings.musicProvider || 'external';
    $('serviceUrl').disabled = settings.musicProvider === 'builtin';
    $('saveConnection').hidden = settings.musicProvider === 'builtin';
    $('source').value = settings.source;
    $('fpsMode').value = [30, 60].includes(settings.fps) ? String(settings.fps) : 'custom';
    $('customFpsLabel').hidden = $('fpsMode').value !== 'custom';
    $('customFps').value = settings.fps;
    $('capture').textContent = settings.enabled ? '停止音频捕获' : '开启音频捕获';
    labels();
  }
  function labels() {
    $('gainValue').textContent = (settings.gain > 0 ? '+' : '') + settings.gain + ' dB';
    $('attackValue').textContent = settings.attack + ' ms';
    $('releaseValue').textContent = settings.release + ' ms';
    $('tiltValue').textContent = settings.tilt + ' dB / 倍频程';
    $('textureValue').textContent = Math.round(settings.texture * 100) + '%';
    $('flowValue').textContent = settings.flow + '×';
  }
  function applyMode() {
    envelope.reset();
    fineEnvelope.reset();
    demoEnvelope.reset();
    demoStarted = performance.now();
    renderer.base.hiss.reset();
    renderer.base.last = NaN;
    renderer.base.demoEnabled = demo;
    demoTrack.stamp = Date.now();
    $('modeLabel').textContent = demo ? '合成演示' : '实时歌曲';
    $('demoMode').setAttribute('aria-pressed', String(demo));
    $('liveMode').setAttribute('aria-pressed', String(!demo));
    $('previewNote').textContent = demo
      ? '当前为合成演示：曲目信息为示例，240 频带为程序合成信号，不播放声音。'
      : '当前为真实曲目信息。频谱独立捕获所选音源，OBS 中也能接收。';
    renderer.replay(performance.now());
    syncTrack();
  }
  function syncTrack() {
    const current = demo ? demoTrack : track;
    renderer.setTrack(
      current,
      demo
        ? ''
        : current.cover
          ? base + '/api/cover?v=' + encodeURIComponent(current.id + '|' + current.cover)
          : '',
      performance.now(),
    );
    $('trackCaption').textContent = current.hasSong
      ? current.title + ' / ' + current.artist
      : '暂无歌曲';
    $('playbackStatus').textContent = demo
      ? '示例正在播放'
      : !current.connected
        ? '歌曲服务未连接'
        : !current.hasSong
          ? '等待歌曲'
          : current.paused
            ? '已暂停'
            : '正在播放';
  }
  async function command(payload) {
    try {
      const response = await fetch(base + '/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(7000),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || '操作失败');
      applyState(result);
      status('设置已更新，OBS 纯画面同步生效。');
      return true;
    } catch (error) {
      status(
        error.message.includes('fetch')
          ? '皮肤服务未启动，请打开桌面客户端或运行“启动全部服务.cmd”。'
          : error.message,
        true,
      );
      return false;
    }
  }
  function applyState(state) {
    connected = true;
    applySettings(state.config);
    track = state.track;
    audio = state.audio || {};
    if (!demo && audio.db) feedAudio(audio, performance.now());
    if (state.sources) {
      const signature = JSON.stringify(state.sources);
      if ($('source').dataset.signature !== signature) {
        $('source').replaceChildren(
          ...state.sources.map((item) => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            return option;
          }),
        );
        $('source').dataset.signature = signature;
        $('source').value = settings.source;
      }
    }
    $('musicStatus').textContent =
      state.musicError ||
      (track.connected ? (settings.musicProvider === 'builtin' ? 'Windows 内置识别 · 自动同步歌曲和进度' : '已连接 Now Playing · 自动同步歌曲和进度') : '正在连接歌曲服务…');
    syncTrack();
  }
  const events = new EventSource(base + '/events');
  events.addEventListener('state', (event) => {
    applyState(JSON.parse(event.data));
    status(demo ? '合成演示已就绪。' : '皮肤服务已连接。');
  });
  events.addEventListener('track', (event) => {
    track = JSON.parse(event.data);
    syncTrack();
    $('musicStatus').textContent = track.connected
      ? (settings.musicProvider === 'builtin' ? 'Windows 内置识别 · 自动同步歌曲和进度' : '已连接 Now Playing · 自动同步歌曲和进度')
      : '歌曲服务已断开，请检查软件是否打开。';
  });
  events.addEventListener('audio', (event) => {
    audio = JSON.parse(event.data);
    if (!demo) feedAudio(audio, performance.now());
  });
  events.onerror = () => {
    connected = false;
    envelope.reset();
    fineEnvelope.reset();
    status(
      demo ? '合成演示可用；实时歌曲服务尚未启动。' : '皮肤服务未连接，请打开桌面客户端或运行“启动全部服务.cmd”。',
      !demo,
    );
  };
  $('demoMode').onclick = () => {
    demo = true;
    applyMode();
  };
  $('liveMode').onclick = () => {
    demo = false;
    applyMode();
  };
  $('replay').onclick = () => renderer.replay(performance.now());
  $('capture').onclick = () => command({ enabled: !settings.enabled });
  $('refresh').onclick = () => command({ command: 'refresh' });
  $('source').onchange = () => command({ source: $('source').value });
  $('saveConnection').onclick = () => command({ musicProvider: 'external', serviceUrl: $('serviceUrl').value.trim() });
  $('musicProvider').onchange = () => command({ musicProvider: $('musicProvider').value });
  for (const key of ['gain', 'attack', 'release', 'tilt', 'texture', 'flow'])
    $(key).oninput = () => {
      settings[key] = Number($(key).value);
      envelope.configure(settings);
      fineEnvelope.configure(settings);
      labels();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(
        () =>
          command(
            Object.fromEntries(
              ['gain', 'attack', 'release', 'tilt', 'texture', 'flow'].map((k) => [k, settings[k]]),
            ),
          ),
        180,
      );
    };
  $('saveRange').onclick = () =>
    command({ floor: Number($('floor').value), ceiling: Number($('ceiling').value) });
  $('fpsMode').onchange = () => {
    $('customFpsLabel').hidden = $('fpsMode').value !== 'custom';
    if ($('fpsMode').value !== 'custom') command({ fps: Number($('fpsMode').value) });
  };
  $('customFps').onchange = () => command({ fps: Number($('customFps').value) });
  $('copyObs').onclick = async () => {
    const url = new URL('now-playing.html?obs=1&v=production46-1', location.href).href;
    try {
      await navigator.clipboard.writeText(url);
      status('已复制 OBS 地址。浏览器源尺寸：1920 × 560。');
    } catch {
      status('OBS 地址：' + url);
    }
  };
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) {
      nextFrame = NaN;
      return;
    }
    const interval = 1000 / settings.fps;
    if (!Number.isFinite(nextFrame)) nextFrame = now;
    if (now + 0.1 < nextFrame) return;
    nextFrame += Math.max(1, Math.floor((now - nextFrame + 0.1) / interval) + 1) * interval;
    const levels = demo
        ? recordedLevels(now)
        : (audio.fineDb?.length === 240 ? fineEnvelope : envelope).sample(now),
      current = demo ? demoTrack : track;
    renderer.draw(
      now,
      levels,
      settings,
      NowPlayingDSP.positionAt(current, Date.now()),
      signalConfig,
      -Infinity,
    );
    lastFrame = now;
    frames++;
    if (now - lastUi > 150) {
      lastUi = now;
      for (let i = 0; i < 48; i++)
        meters[i].style.height =
          2 +
          (levels.length === 240 ? Math.max(...levels.subarray(i * 5, i * 5 + 5)) : levels[i]) *
            25 +
          'px';
      $('audioStatus').textContent = demo
        ? '合成演示信号 · 240频带（不播放声音）'
        : audio.error
          ? audio.error
          : !settings.enabled
            ? '未开启音频捕获'
            : !audio.ready
              ? '正在连接音频设备…'
              : (audio.rms > 0.0001 ? '正在捕获' : '已连接 · 当前静音') +
                ' · ' +
                audio.rate / 1000 +
                ' kHz / ' +
                audio.channels +
                ' 声道 · ' +
                (levels.length === 240 ? '240' : '48') +
                '频带';
    }
    if (now - lastFps > 1000) {
      $('performanceLabel').textContent =
        Math.round((frames * 1000) / (now - lastFps)) +
        ' FPS / 上限 ' +
        settings.fps +
        (audio.ready && !demo ? ' · 分析 ' + (audio.computeMs || 0).toFixed(1) + ' ms' : '');
      frames = 0;
      lastFps = now;
    }
  }
  document.addEventListener('visibilitychange', () => {
    nextFrame = NaN;
    renderer.base.last = NaN;
    envelope.previous = NaN;
    fineEnvelope.previous = NaN;
    if (!document.hidden) {
      renderer.base.hiss.reset();
      frames = 0;
      lastFps = performance.now();
    }
  });
  window.addEventListener('pagehide', (event) => {
    events.close();
    if (!event.persisted) renderer.dispose();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload();
  });
  window.addEventListener('message', (event) => {
    if (
      !params.has('embedded') ||
      event.source !== parent ||
      event.origin !== location.origin ||
      event.data?.channel !== 'hiss-music-host'
    )
      return;
    const fps = Number(event.data.fps);
    if (Number.isInteger(fps) && fps >= 1 && fps <= 240) {
      hostFps = fps;
      settings.fps = fps;
      nextFrame = NaN;
    }
  });
  applyMode();
  applySettings(settings);
  document.fonts.load('400 39px NPCondensed', '0123456789:');
  requestAnimationFrame(frame);
})();
