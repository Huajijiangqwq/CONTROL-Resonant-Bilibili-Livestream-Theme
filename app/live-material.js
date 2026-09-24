/* Screen-space print texture and two fixed fields outside the game capture. */
(() => {
  'use strict';
  const scene = document.getElementById('scene'),
    grain = document.getElementById('surfaceGrain');
  if (!scene || !grain) return;
  const ink = grain.getContext('2d'),
    tiles = [],
    params = new URLSearchParams(location.search),
    storageKey = 'hiss-main-material-v1',
    obs = params.has('obs') || scene.dataset.materialPreview === 'true';
  const normalize = (value) =>
    value !== null && String(value).trim() !== '' && Number.isFinite(Number(value))
      ? Math.max(0, Math.min(100, Math.round(Number(value))))
      : 60;
  let layoutConfig = window.LiveLayout?.config || {
      game: { x: 18, y: 72, w: 1408, h: 792 },
      panel: { x: 1444, y: 72, w: 458, h: 908 },
    },
    materialRevision = 0;
  const gameRect = () => {
    const theme = window.ThemeRenderer?.value;
    if (
      theme &&
      !theme.layers.some((l) => l.type === 'game' && ThemeEditorModel.effective(theme, l).visible)
    )
      return { x: 18, y: 72, w: 0, h: 0 };
    return window.LiveLayout?.game || layoutConfig.game;
  };
  let lastGrain = -1,
    disposed = false,
    lastTime = 0,
    intensity = 60,
    pulseAt = -Infinity,
    pulseAmount = 0;
  try {
    if (!obs) intensity = normalize(localStorage.getItem(storageKey));
  } catch {}
  if (params.has('resonance')) intensity = normalize(params.get('resonance'));
  function random(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }
  function tile(seed, paper = false) {
    const c = document.createElement('canvas');
    c.width = c.height = 384;
    const ctx = c.getContext('2d'),
      im = ctx.createImageData(384, 384),
      rand = random(seed);
    const clusters = Array.from({ length: 169 }, () => rand());
    for (let i = 0; i < im.data.length; i += 4) {
      const n = rand(),
        value = paper ? 30 : n > 0.5 ? 198 : 0;
      const x = (i / 4) % 384,
        y = Math.floor(i / 1536),
        gx = x / 32,
        gy = y / 32,
        ix = Math.floor(gx),
        iy = Math.floor(gy),
        u = (gx - ix) ** 2 * (3 - 2 * (gx - ix)),
        v = (gy - iy) ** 2 * (3 - 2 * (gy - iy));
      const density =
        (clusters[iy * 13 + ix] * (1 - u) + clusters[iy * 13 + ix + 1] * u) * (1 - v) +
        (clusters[(iy + 1) * 13 + ix] * (1 - u) + clusters[(iy + 1) * 13 + ix + 1] * u) * v;
      im.data[i] = value;
      im.data[i + 1] = paper ? 32 : value;
      im.data[i + 2] = paper ? 27 : value;
      im.data[i + 3] = paper
        ? Math.round(Math.pow(n, 6) * 28)
        : Math.round(
            Math.pow(Math.abs(n - 0.5) * 2, 4) *
              (n > 0.5 ? 57 : 44) *
              (0.1 + 1.8 * Math.pow(density, 2.8)),
          );
    }
    ctx.putImageData(im, 0, 0);
    if (!paper) {
      // Fine embedded fibres remain fixed to the substrate rather than swimming
      // with the exposure grain; the same tile is reused by the VHS compositor.
      for (let i = 0; i < 72; i++) {
        const x = rand() * 384,
          y = rand() * 384,
          length = 3 + rand() * 9;
        ctx.lineWidth = 0.35 + rand() * 0.35;
        ctx.strokeStyle = 'rgba(212,210,196,' + (0.018 + rand() * 0.025) + ')';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(
          x + length * 0.48,
          y + (rand() - 0.5) * 2,
          x + length,
          y + (rand() - 0.5) * 3,
        );
        ctx.stroke();
      }

      ctx.lineWidth = 0.55;
      for (let i = 0; i < 210; i++) {
        const x = rand() * 384,
          y = rand() * 384,
          length = 0.7 + rand() * 2.3;
        ctx.strokeStyle = 'rgba(211,208,188,' + (0.03 + rand() * 0.1) + ')';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + length, y + (rand() - 0.5) * 1.7);
        ctx.stroke();
      }
    }
    return c;
  }
  for (let i = 0; i < 5; i++) tiles.push(ink.createPattern(tile(1907 + i * 733), 'repeat'));
  const fixedGrain = ink.createPattern(tile(7315), 'repeat');
  // Persistent ink density supplies depth; the changing exposure is a small layer.
  const densityCanvas = document.createElement('canvas');
  densityCanvas.width = densityCanvas.height = 768;
  const densityContext = densityCanvas.getContext('2d'),
    densityImage = densityContext.createImageData(768, 768),
    densityRandom = random(821);
  const grid = Array.from({ length: 81 }, () => densityRandom());
  for (let y = 0; y < 768; y++)
    for (let x = 0; x < 768; x++) {
      const gx = x / 96,
        gy = y / 96,
        ix = Math.floor(gx),
        iy = Math.floor(gy),
        fx = gx - ix,
        fy = gy - iy,
        u = fx * fx * (3 - 2 * fx),
        v = fy * fy * (3 - 2 * fy);
      const n =
        (grid[iy * 9 + ix] * (1 - u) + grid[iy * 9 + ix + 1] * u) * (1 - v) +
        (grid[(iy + 1) * 9 + ix] * (1 - u) + grid[(iy + 1) * 9 + ix + 1] * u) * v;
      const i = (y * 768 + x) * 4;
      densityImage.data[i] = n > 0.5 ? 154 : 0;
      densityImage.data[i + 1] = n > 0.5 ? 153 : 0;
      densityImage.data[i + 2] = n > 0.5 ? 143 : 0;
      densityImage.data[i + 3] = Math.round(Math.abs(n - 0.5) * 17);
    }
  densityContext.putImageData(densityImage, 0, 0);
  const densityPattern = ink.createPattern(densityCanvas, 'repeat');
  // Sparse surface wear is fixed to the two worn corners, beneath the live content.
  const wearCanvas = document.createElement('canvas');
  wearCanvas.width = 1920;
  wearCanvas.height = 1080;
  const wear = wearCanvas.getContext('2d'),
    wearRandom = random(2881);
  for (let i = 0; i < 18000; i++) {
    const x = wearRandom() * 1920,
      y = wearRandom() * 1080;
    const density =
      Math.exp(-(((x - 15) / 310) ** 2 + ((y - 955) / 230) ** 2)) +
      0.6 * Math.exp(-(((x - 1426) / 175) ** 2 + (y / 155) ** 2));
    if (wearRandom() > density * 0.5) continue;
    const size = 0.5 + wearRandom();
    wear.fillStyle = 'rgba(220,217,196,' + (0.08 + wearRandom() * 0.23) + ')';
    wear.fillRect(x, y, size, size * 0.7);
  }
  scene.style.setProperty('--paper-texture', 'url("' + tile(418, true).toDataURL() + '")');
  const panelInk = tile(941);
  scene.style.setProperty('--ink-texture', 'url("' + panelInk.toDataURL() + '")');
  function surface(time) {
    const index = Math.floor(time / 125);
    if (index === lastGrain && !scene.dataset.layoutSwitching) return;
    lastGrain = index;
    ink.clearRect(0, 0, 1920, 1080);
    // The complete material stack keeps the exact game hole transparent.
    const g = gameRect(),
      p = layoutConfig.panel;
    ink.save();
    ink.beginPath();
    ink.rect(0, 0, 1920, 1080);
    ink.rect(g.x, g.y, g.w, g.h);
    ink.clip('evenodd');
    ink.fillStyle = densityPattern;
    ink.fillRect(0, 0, 1920, 1080);
    ink.fillStyle = fixedGrain;
    ink.fillRect(0, 0, 1920, 1080);
    ink.drawImage(wearCanvas, 0, 0);
    ink.globalAlpha = 0.08;
    ink.fillStyle = tiles[index % tiles.length];
    ink.fillRect(0, 0, 1920, 1080);
    ink.globalAlpha = 1;
    const shade = ink.createRadialGradient(260, 1004, 5, 260, 1004, 1040);
    shade.addColorStop(0, '#c6bda708');
    shade.addColorStop(0.35, '#7a7e6b03');
    shade.addColorStop(1, '#00000000');
    ink.fillStyle = shade;
    ink.fillRect(0, g.y + g.h + 1, p.x, 1080 - g.y - g.h);
    // Small changes of ink pressure are registered to the printed border.
    const marks = random(1784);
    for (let i = 0; i < 360; i++) {
      const edge = Math.floor(marks() * 4),
        p = marks(),
        length = 1 + marks() * 5;
      const bright = marks() > 0.38,
        pressure = 0.12 + marks() * 0.3;
      // Local changes in exposure catch the fixed nicks in the ink. Their
      // positions never travel around the frame and the text remains untouched.
      const exposure = Math.pow(Math.max(0, Math.sin(time / 2100 + edge * 2.1 + p * 9.6)), 14);
      ink.fillStyle = bright
        ? 'rgba(235,231,212,' + pressure * (0.84 + exposure * 0.8) + ')'
        : 'rgba(7,9,8,.7)';
      if (edge === 0) ink.fillRect(g.x + p * g.w, g.y - 1, length, 1);
      else if (edge === 1) ink.fillRect(g.x + p * g.w, g.y + g.h, length, 1);
      else if (edge === 2) ink.fillRect(g.x + g.w, g.y + p * g.h, 1, length);
      else
        ink.fillRect(
          layoutConfig.panel.x,
          layoutConfig.panel.y + p * layoutConfig.panel.h,
          1,
          length,
        );
    }
    ink.restore();
  }
  // Rebuild only the small corner surfaces when the shared grain changes.
  function printTexture(box) {
    const canvas = document.createElement('canvas');
    canvas.width = box.w;
    canvas.height = box.h;
    const ctx = canvas.getContext('2d'),
      panelPattern = ctx.createPattern(panelInk, 'repeat');
    let revision = 0,
      stamp = '';
    return () => {
      const next = [lastGrain + materialRevision, box.x, box.y, box.w, box.h].join(':');
      if (stamp !== next) {
        stamp = next;
        revision++;
        if (canvas.width !== box.w || canvas.height !== box.h) {
          canvas.width = box.w;
          canvas.height = box.h;
        }
        const g = gameRect(),
          p = layoutConfig.panel;
        ctx.save();
        ctx.translate(-box.x, -box.y);
        const coal = ctx.createLinearGradient(0, 0, 1920, 1080);
        coal.addColorStop(0, '#0b0e0d');
        coal.addColorStop(0.55, '#101211');
        coal.addColorStop(1, '#0a0c0c');
        ctx.fillStyle = coal;
        ctx.fillRect(box.x, box.y, box.w, box.h);
        ctx.globalAlpha = 0.88;
        ctx.drawImage(grain, 0, 0);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0e100f';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.save();
        ctx.translate(p.x + 1.6, p.y + 1.6);
        ctx.fillStyle = panelPattern;
        ctx.fillRect(0, 0, p.w - 3.2, p.h - 3.2);
        ctx.restore();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = '#d4d2c4e6';
        ctx.strokeRect(g.x - 0.8, g.y - 0.8, g.w + 1.6, g.h + 1.6);
        ctx.strokeStyle = '#c9c9bfe3';
        ctx.strokeRect(p.x + 0.8, p.y + 0.8, p.w - 1.6, p.h - 1.6);
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#a9ada17a';
        ctx.beginPath();
        ctx.moveTo(32, 58);
        ctx.lineTo(1884, 58);
        ctx.stroke();
        ctx.restore();
      }
      return { canvas, revision };
    };
  }
  const field = (canvas, box) =>
    HissCornerField.create(canvas, box, {
      texture: printTexture(box),
      gameRect,
      worldTransform() {
        const l = window.ThemeRenderer?.value?.layers.find((l) => l.type === 'hiss');
        if (!l) return null;
        const a = (l.rotation * Math.PI) / 180,
          co = Math.cos(a),
          si = Math.sin(a),
          sx = l.w / 1920,
          sy = l.h / 1080;
        return [
          co * sx,
          si * sx,
          -si * sy,
          co * sy,
          l.x + co * sx * box.x - si * sy * box.y,
          l.y + si * sx * box.x + co * sy * box.y,
        ];
      },
    });
  const boxes = [
    { x: 950, y: 0, w: 710, h: 420, ax: 1433, ay: 73, variant: 0 },
    { x: 0, y: 700, w: 650, h: 360, ax: 18, ay: 865, variant: 1 },
  ];
  const cornerCanvases = [
    document.getElementById('junctionResonance'),
    document.getElementById('footResonance'),
  ];
  const themeDocument =
    new URLSearchParams(location.search).has('editor') ||
    new URLSearchParams(location.search).has('theme') ||
    new URLSearchParams(location.hash.slice(1)).has('theme');
  const fields = themeDocument
    ? []
    : boxes.map((box, i) => field(cornerCanvases[i], box)).filter(Boolean);
  function ensureLegacyFields() {
    if (fields.length) return;
    fields.push(...boxes.map((box, i) => field(cornerCanvases[i], box)).filter(Boolean));
  }
  function setGeometry(g) {
    if (window.ThemeRenderer?.value) g = gameRect();
    const x = g.x + g.w - 476,
      y = g.y + g.h - 164;
    if (boxes[0].x === x && boxes[0].ay === g.y + 1 && boxes[1].y === y && boxes[1].ax === g.x)
      return;
    Object.assign(boxes[0], { x, y: 0, ax: g.x + g.w + 7, ay: g.y + 1 });
    Object.assign(boxes[1], { x: 0, y, ax: g.x, ay: g.y + g.h + 1 });
    boxes.forEach((b, i) =>
      Object.assign(cornerCanvases[i].style, { left: b.x + 'px', top: b.y + 'px' }),
    );
    materialRevision++;
  }
  function setLayout(config) {
    layoutConfig = config;
    setGeometry(gameRect());
    lastGrain = -1;
    materialRevision += 100000;
  }
  function draw(time) {
    if (disposed) return;
    lastTime = time;
    surface(time);
    if (
      ['split', 'custom'].includes(scene.dataset.layout) &&
      !scene.dataset.layoutSwitching &&
      !scene.dataset.editorTheme
    )
      return;
    const incomingAudio = window.LiveAudio?.sample(performance.now()) || { level: 0, hit: 0 },
      audio = window.ThemeRenderer?.audioSample(incomingAudio) || incomingAudio;
    const age = time - pulseAt,
      attack = Math.max(0, Math.min(1, (age - 70) / 390)),
      release = Math.max(0, Math.min(1, (age - 620) / 1850)),
      pulse = attack * attack * (3 - 2 * attack) * (1 - release * release * (3 - 2 * release));
    const legacyOn = themeDocument
      ? window.ThemeRenderer?.value?.layers.some((l) => l.type === 'hiss' && l.visible)
      : true;
    if (legacyOn) {
      ensureLegacyFields();
      for (const [i, f] of fields.entries())
        f.draw(time, (intensity / 60) * (1 + pulse * pulseAmount * (i === 0 ? 1 : 0.36)), audio);
    }
    window.ThemeRenderer?.drawFields?.(time, audio);
    scene.querySelector('.frame-material').dataset.flowTime = String(Math.round(time));
  }
  function pulse(tier = 0) {
    pulseAt = lastTime;
    pulseAmount = 0.3 + 0.065 * Math.max(0, Math.min(6, Number(tier) || 0));
  }
  function resetPulse() {
    pulseAt = -Infinity;
    pulseAmount = 0;
  }
  const slider = document.getElementById('resonanceStrength'),
    output = document.getElementById('resonanceValue');
  function sync() {
    if (slider) slider.value = intensity;
    if (output) output.textContent = intensity + '%';
  }
  function setIntensity(value) {
    intensity = normalize(value);
    if (!obs)
      try {
        localStorage.setItem(storageKey, String(intensity));
      } catch {}
    sync();
    draw(lastTime);
  }
  slider?.addEventListener('input', () => setIntensity(slider.value));
  window.addEventListener('storage', (event) => {
    if (!obs && event.key === storageKey) {
      intensity = normalize(event.newValue);
      sync();
      draw(lastTime);
    }
  });
  // The fleet post-process samples this exact CSS tile, not a second noise seed.
  window.LiveMaterial = {
    get legacyFieldCount() {
      return fields.length;
    },
    makeField: (canvas, box, style) =>
      HissCornerField.create(canvas, box, {
        texture: printTexture(box),
        gameRect: () =>
          style()?.avoidGame === false ? { x: -10, y: -10, w: 0, h: 0 } : gameRect(),
        style,
      }),
    draw,
    setLayout,
    setGeometry,
    setIntensity,
    pulse,
    resetPulse,
    get panelTexture() {
      return panelInk;
    },
    get intensity() {
      return intensity;
    },
  };
  sync();
  setLayout(layoutConfig);
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return;
    disposed = true;
    for (const f of fields) f.dispose();
  });
})();
