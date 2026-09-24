/* One local meter is shared by the editor and OBS. It sends numbers only. */
(() => {
  'use strict';
  const base = window.ThemeServices?.audio || 'http://127.0.0.1:8794',
    envelope = AudioEnvelope.create(),
    $ = (id) => document.getElementById(id);
  let state = {
      enabled: false,
      source: 'desktop',
      gain: 2,
      amount: 0.8,
      peak: 0,
      sources: [],
      bandConfig: AudioConfig.defaults(),
    },
    received = 0,
    online = false,
    stream = null,
    reconnect = null,
    closed = false,
    testAt = -Infinity,
    testBand = -1,
    sourceKey = '',
    lastUI = 0,
    bandKey = '',
    bandDirty = false,
    lastTestUI = 0,
    wasTesting = false;
  const controls = {
    source: $('audioSource'),
    toggle: $('audioToggle'),
    refresh: $('audioRefresh'),
    gain: $('audioGain'),
    amount: $('audioAmount'),
    status: $('audioStatus'),
    meter: $('audioLevel'),
    demo: $('audioTest'),
  };
  function ui() {
    if (!controls.source) return;
    const key = JSON.stringify([state.sources, state.source]);
    if (key !== sourceKey) {
      sourceKey = key;
      controls.source.replaceChildren();
      const sources = state.sources.length
        ? state.sources
        : [{ id: 'desktop', name: '桌面音频（默认输出）' }];
      for (const source of sources) {
        const option = document.createElement('option');
        option.value = source.id;
        option.textContent = source.name;
        controls.source.append(option);
      }
      if (!sources.some((s) => s.id === state.source)) {
        const option = document.createElement('option');
        option.value = state.source;
        option.textContent = '所选应用（暂未输出音频）';
        controls.source.append(option);
      }
      controls.source.value = state.source;
    }
    controls.toggle.textContent = state.enabled ? '关闭音频响应' : '开启音频响应';
    controls.toggle.setAttribute('aria-pressed', String(state.enabled));
    if (document.activeElement !== controls.gain)
      controls.gain.value = Math.round(state.gain * 100);
    if (document.activeElement !== controls.amount)
      controls.amount.value = Math.round(state.amount * 100);
    $('audioGainValue').textContent = state.gain.toFixed(1) + '×';
    $('audioAmountValue').textContent = Math.round(state.amount * 100) + '%';
    const config = state.bandConfig || AudioConfig.defaults(),
      nextKey = JSON.stringify(config);
    const targetNames = {
      spread: '涌出',
      flow: '翻卷',
      fibers: '细丝',
      optics: '折射',
      glow: '亮度',
      none: '关闭',
    };
    config.forEach((b, i) => {
      const label = $('audioBandLabel' + i);
      if (label) label.textContent = b.from + '–' + b.to + ' Hz · ' + targetNames[b.target];
    });
    if (!bandDirty && nextKey !== bandKey) {
      bandKey = nextKey;
      config.forEach((b, i) => {
        for (const key of ['from', 'to', 'target', 'gain', 'max']) {
          const input = $('band' + i + '-' + key);
          if (input) input.value = key === 'max' ? Math.round(b[key] * 100) : b[key];
        }
      });
    }
    controls.status.textContent = !online
      ? '音频服务未连接。双击同目录的“启动全部服务.cmd”后重试。'
      : state.error ||
        (!state.ready
          ? '点击刷新音源，读取可用应用。'
          : !state.enabled
            ? '已就绪。选择桌面或应用后开启。'
            : state.spectrumError ||
              (state.spectrum ? '三频段响应中 · 使用当前自定义设置' : '等待所选音源输出声音。'));
    testStatus(performance.now());
  }
  function testStatus(time) {
    const elapsed = (time - testAt) / 1000,
      testing = elapsed >= 0 && elapsed < 8;
    if (controls.demo) {
      controls.demo.textContent = testing ? '停止测试' : '分频测试 · 无声';
      controls.demo.setAttribute('aria-pressed', String(testing));
    }
    for (let i = 0; i < 3; i++)
      $('band' + i + '-test')?.setAttribute('aria-pressed', String(testing && testBand === i));
    if (testing && controls.status) {
      const phase = testBand < 0 ? Math.floor(elapsed / 2) : testBand;
      controls.status.textContent =
        '无声测试 · ' +
        (phase === 3 ? '三个频段合奏' : '频段 ' + (phase + 1)) +
        ' · 剩余 ' +
        Math.ceil(8 - elapsed) +
        ' 秒';
    }
    return testing;
  }
  function startTest(band) {
    if (window.LiveMotion?.enabled === false) {
      if (controls.status) controls.status.textContent = '请先开启“启用 HUD 动效”，再测试红纹。';
      return false;
    }
    if (window.LiveMaterial?.intensity === 0) {
      if (controls.status) controls.status.textContent = '请先提高“边角共振”强度，再测试红纹。';
      return false;
    }
    testBand = band;
    testAt = performance.now();
    wasTesting = true;
    ui();
    return true;
  }
  function connect() {
    if (closed) return;
    clearTimeout(reconnect);
    stream?.close();
    stream = new EventSource(base + '/events');
    stream.onmessage = (event) => {
      let value;
      try {
        value = JSON.parse(event.data);
      } catch {
        return;
      }
      if (value.service !== 'hiss-audio') return;
      state = value;
      received = performance.now();
      online = true;
      if (received - lastUI > 300) {
        lastUI = received;
        ui();
      }
    };
    stream.onerror = () => {
      online = false;
      state.peak = 0;
      stream.close();
      ui();
      reconnect = setTimeout(connect, 3000);
    };
  }
  async function control(command, values = {}) {
    try {
      const response = await fetch(base + '/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, ...values }),
        signal: AbortSignal.timeout(5000),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      state = value;
      online = true;
      ui();
      return true;
    } catch (error) {
      if (controls.status)
        controls.status.textContent = online
          ? error.message
          : '无法连接音频服务，请运行“启动全部服务.cmd”后重试。';
      return false;
    }
  }
  function sample(time = performance.now()) {
    const active = online && state.enabled && time - received < 650;
    let peak = active ? state.peak : 0,
      bands = active && state.spectrum ? state.bands : [];
    const demo = (time - testAt) / 1000;
    if (demo >= 0 && demo < 8) {
      const phase = testBand < 0 ? Math.floor(demo / 2) : testBand,
        pulse = 0.4 + 0.6 * Math.max(0, Math.sin(demo * Math.PI * 2)) ** 3;
      bands = [0, 1, 2].map((i) => (phase === 3 || phase === i ? pulse * 0.4 : 0));
      peak = Math.max(...bands);
    }
    const value = envelope.sample(peak, time, state.gain, state.amount, bands, state.bandConfig);
    if (controls.meter) {
      controls.meter.value = value.level;
      controls.meter.setAttribute('aria-valuetext', Math.round(value.level * 100) + '%');
    }
    ['bass', 'mid', 'high'].forEach((band, i) => {
      const meter = $('audioBand-' + band);
      if (meter) {
        meter.value = value.bands[i];
        meter.setAttribute('aria-valuetext', Math.round(value.bands[i] * 100) + '%');
      }
    });
    if (time - lastTestUI > 120) {
      lastTestUI = time;
      const testing = testStatus(time);
      if (wasTesting && !testing) {
        wasTesting = false;
        ui();
        if ($('bandSaveStatus') && !bandDirty)
          $('bandSaveStatus').textContent = '测试已结束 · 已返回当前音源';
      } else wasTesting = testing;
    }
    return value;
  }
  controls.toggle?.addEventListener('click', () => {
    testAt = -Infinity;
    control(state.enabled ? 'stop' : 'start');
  });
  controls.refresh?.addEventListener('click', () => control('refresh'));
  controls.source?.addEventListener('change', () =>
    control('configure', { source: controls.source.value }),
  );
  let settingTimer;
  function settings() {
    const gain = Number(controls.gain.value) / 100,
      amount = Number(controls.amount.value) / 100;
    state.gain = gain;
    state.amount = amount;
    ui();
    clearTimeout(settingTimer);
    settingTimer = setTimeout(() => control('configure', { gain, amount }), 100);
  }
  controls.gain?.addEventListener('input', settings);
  controls.amount?.addEventListener('input', settings);
  controls.demo?.addEventListener('click', () => {
    if (testStatus(performance.now())) {
      testAt = -Infinity;
      wasTesting = false;
      ui();
      if ($('bandSaveStatus') && !bandDirty)
        $('bandSaveStatus').textContent = '测试已停止 · 已返回当前音源';
    } else startTest(-1);
  });
  $('audioCustom')?.addEventListener('input', () => {
    bandDirty = true;
    $('bandSaveStatus').textContent = '有未应用的设置';
  });
  $('bandApply')?.addEventListener('click', async () => {
    let config;
    try {
      config = AudioConfig.validate(
        [0, 1, 2].map((i) => ({
          from: Number($('band' + i + '-from').value),
          to: Number($('band' + i + '-to').value),
          target: $('band' + i + '-target').value,
          gain: Number($('band' + i + '-gain').value),
          max: Number($('band' + i + '-max').value) / 100,
        })),
      );
    } catch (error) {
      $('bandSaveStatus').textContent = error.message;
      return;
    }
    if (await control('configure', { bandConfig: config })) {
      bandDirty = false;
      bandKey = '';
      ui();
      $('bandSaveStatus').textContent = '已应用并保存 · OBS 同步生效';
    }
  });
  $('bandReset')?.addEventListener('click', async () => {
    if (await control('configure', { bandConfig: AudioConfig.defaults() })) {
      bandDirty = false;
      bandKey = '';
      ui();
      $('bandSaveStatus').textContent = '已恢复推荐分频设置';
    }
  });
  for (let i = 0; i < 3; i++)
    $('band' + i + '-test')?.addEventListener('click', () => {
      if (startTest(i))
        $('bandSaveStatus').textContent =
          '正在测试频段 ' + (i + 1) + ' · 使用已应用的设置 · 不播放声音';
    });
  // Give meter outputs stable accessible labels, independent of their default value.
  $('audioGainValue')?.setAttribute('aria-label', '当前音频灵敏度');
  $('audioAmountValue')?.setAttribute('aria-label', '当前音频响应强度');
  window.LiveAudio = { sample };
  connect();
  ui();
  window.addEventListener('pagehide', () => {
    closed = true;
    stream?.close();
    clearTimeout(reconnect);
    clearTimeout(settingTimer);
  });
  window.addEventListener('pageshow', () => {
    if (closed) {
      closed = false;
      connect();
    }
  });
})();
