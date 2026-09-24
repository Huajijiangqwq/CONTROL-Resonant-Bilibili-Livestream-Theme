(() => {
  'use strict';
  const data = {
      frames: [
        [17, 427, 218, 0, 0],
        [18, 402, 225, 0, 0],
        [19, 394, 227, 0, 0],
        [20, 370, 234, 0, 0],
        [21, 362, 236, 0, 0],
        [22, 337, 244, 0, 0],
        [23, 330, 246, 0, 0],
        [24, 433, 216, 305, 253],
        [25, 419, 220, 298, 255],
        [26, 357, 238, 265, 264],
        [27, 309, 251, 241, 271],
        [28, 293, 256, 234, 274],
        [29, 249, 269, 210, 280],
        [30, 232, 274, 202, 283],
        [31, 0, 0, 190, 288],
        [32, 413, 218, 186, 290],
        [33, 391, 224, 186, 290],
        [34, 383, 227, 186, 290],
        [35, 364, 232, 186, 290],
        [36, 354, 234, 186, 290],
        [37, 332, 240, 184, 288],
        [38, 328, 243, 184, 288],
        [39, 302, 248, 185, 289],
        [40, 299, 251, 185, 289],
        [41, 280, 257, 184, 288],
        [106, 280, 257, 184, 288],
      ],
      crop: [850, 0, 850, 660],
      fps: 60,
      start: 5.65,
      center: 429.5,
    },
    cx = data.center,
    names = { captain: '舰长', admiral: '提督', governor: '总督' },
    family = '"Microsoft YaHei","PingFang SC","Segoe UI",sans-serif';
  const sat = (x) => Math.max(0, Math.min(1, x)),
    smooth = (a, b, x) => {
      const v = sat((x - a) / (b - a));
      return v * v * (3 - 2 * v);
    };
  const sheets = [];
  let ready = false,
    failed = false,
    c,
    options,
    componentAlpha = 1;
  let segmenter;
  try {
    segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
  } catch {}
  const graphemes = (text) =>
    segmenter
      ? Array.from(segmenter.segment(String(text)), (v) => v.segment)
      : Array.from(String(text));
  function cut(text, width, continued = false) {
    const parts = graphemes(text);
    if (!continued && c.measureText(text).width <= width) return text;
    while (parts.length && c.measureText(parts.join('') + '…').width > width) parts.pop();
    return parts.join('') + '…';
  }
  // Text stays fixed while SC effects redraw the shared canvas. Bound each
  // context's name cache so a long session does not retain every viewer name.
  const labelCaches = new WeakMap();
  function labelLayout(context = c, settings = options) {
    const titleSize = settings.titleSize || 46,
      nameSize = settings.nameSize || 34,
      nameWidth = settings.nameWidth || 460;
    const key = JSON.stringify([
      !!settings.sideLabel,
      !!settings.feed,
      settings.rank,
      settings.username,
      titleSize,
      nameSize,
      nameWidth,
      settings.unboundedTitle,
      settings.titleWeight,
      settings.nameWeight,
      settings.titleText,
      settings.nameText,
      settings.titleFace,
      settings.nameFace,
      settings.nameLinePercent,
      settings.nameMaxLines,
      settings.nameOverflow,
      window.ThemeTypography?.revision,
    ]);
    let cache = labelCaches.get(context);
    if (!cache) {
      cache = new Map();
      labelCaches.set(context, cache);
    }
    if (cache.has(key)) return cache.get(key);
    let layout;
    if (settings.sideLabel) {
      context.font = '400 58px ' + family;
      const saved = c;
      c = context;
      layout = { username: cut(settings.username, 600) };
      c = saved;
    } else {
      context.font =
        (settings.titleWeight || 900) + ' ' + titleSize + 'px ' + (settings.titleFace || family);
      const title = settings.titleText ?? '开通' + names[settings.rank],
        targetW = Math.max(
          133,
          Math.min(settings.unboundedTitle ? 10000 : 620, context.measureText(title).width + 27),
        );
      context.font =
        (settings.nameWeight || 500) + ' ' + nameSize + 'px ' + (settings.nameFace || family);
      const letters = graphemes(settings.nameText ?? settings.username),
        lines = [];
      let line = '';
      for (const ch of letters) {
        if (ch === '\n') {
          lines.push(line);
          line = '';
          continue;
        }
        if (line && context.measureText(line + ch).width > nameWidth) {
          lines.push(line);
          line = ch;
        } else line += ch;
      }
      lines.push(line);
      const saved = c;
      c = context;
      const barH = titleSize + 17,
        nameY = settings.feed ? 493.5 + barH / 2 + 22 + nameSize / 2 : 563,
        lineGap = settings.nameLinePercent
          ? (nameSize * settings.nameLinePercent) / 100
          : nameSize + (settings.feed ? 8 : 6);
      const maxLines = settings.nameMaxLines || 2;
      layout = {
        title,
        targetW,
        titleSize,
        nameSize,
        barH,
        nameY,
        lineGap,
        lines: lines
          .slice(0, maxLines)
          .map((v, i) =>
            i === maxLines - 1 && lines.length > maxLines && settings.nameOverflow !== 'clip'
              ? cut(v, nameWidth, true)
              : v,
          ),
      };
      c = saved;
    }
    if (cache.size >= 64) cache.delete(cache.keys().next().value);
    cache.set(key, layout);
    return layout;
  }
  const measureContext = document.createElement('canvas').getContext('2d');
  function measureFeed({
    width = 440,
    fontSize = 21,
    main = false,
    rank = 'captain',
    username = '观众',
    iconSize,
    titleSize,
    nameSize,
    nameWidth,
    parts,
  }) {
    rank = names[rank] ? rank : 'captain';
    const sizeOverride = parts?.find((p) => p.id === 'badge')?.size,
      baseScale = iconSize
        ? iconSize / 560
        : ((width - (main ? 46 : 30)) / 680) * { captain: 1, admiral: 1.08, governor: 1.18 }[rank],
      scale = sizeOverride ? sizeOverride / 280 : baseScale,
      particleScale = parts?.find((p) => p.id === 'particles')?.size
        ? parts.find((p) => p.id === 'particles').size / 360
        : baseScale;
    const label = {
      titleFace: window.ThemeTypography?.family(parts?.find((p) => p.id === 'title')?.font),
      nameFace: window.ThemeTypography?.family(parts?.find((p) => p.id === 'name')?.font),
      nameLinePercent: parts?.find((p) => p.id === 'name')?.linePercent,
      nameMaxLines: parts?.find((p) => p.id === 'name')?.maxLines,
      nameOverflow: parts?.find((p) => p.id === 'name')?.overflow,
      feed: true,
      rank,
      username: String(username || '观众'),
      titleSize:
        (parts?.find((p) => p.id === 'title')?.size || titleSize || fontSize * 1.13) / scale,
      nameSize: (parts?.find((p) => p.id === 'name')?.size || nameSize || fontSize * 0.98) / scale,
      nameWidth:
        Math.min(width - 54, parts?.find((p) => p.id === 'name')?.w || nameWidth || width - 94) /
        scale,
      unboundedTitle: !!parts?.length,
      titleWeight: parts?.find((p) => p.id === 'title')?.weight || 900,
      nameWeight: parts?.find((p) => p.id === 'name')?.weight || 500,
      titleText: window.ThemeBindings?.render(
        parts?.find((p) => p.id === 'title'),
        'fleet',
        { rank, username },
        '开通' + names[rank],
      ),
      nameText: window.ThemeBindings?.render(
        parts?.find((p) => p.id === 'name'),
        'fleet',
        { rank, username },
        username,
      ),
    };
    const text = labelLayout(measureContext, label),
      top = main ? 24 : 20,
      bottom = main ? 28 : 22,
      offsetY = top - 257 * scale;
    let height =
      offsetY +
      (text.nameY + (text.lines.length - 1) * text.lineGap + text.nameSize * 0.6) * scale +
      bottom;
    let measuredParts;
    if (parts?.length) {
      const titleTop = top + 280 * 0.866 * scale + 14,
        titleShift = titleTop - (offsetY + (493.5 - text.barH / 2) * scale),
        nameTop = titleTop + text.barH * scale + 12;
      measureContext.font =
        label.nameWeight + ' ' + text.nameSize + 'px ' + (label.nameFace || family);
      const actualNameW = Math.min(
        label.nameWidth * scale,
        Math.max(12, ...text.lines.map((line) => measureContext.measureText(line).width * scale)),
      );
      const canonical = {
        badge: { x: width / 2 - 140 * scale - 27, y: top, w: 280 * scale, h: 280 * 0.866 * scale },
        particles: {
          x: width / 2 - 180 * particleScale - 27,
          y: top - 45 * particleScale,
          w: 360 * particleScale,
          h: 330 * particleScale,
        },
        title: {
          x: width / 2 - (text.targetW * scale) / 2 - 27,
          y: titleTop,
          w: text.targetW * scale,
          h: text.barH * scale,
          size: text.titleSize * scale,
        },
        name: {
          x: width / 2 - actualNameW / 2 - 27,
          y: nameTop,
          w: actualNameW,
          h: ((text.lines.length - 1) * text.lineGap + text.nameSize * 1.2) * scale,
          size: text.nameSize * scale,
          weight: label.nameWeight,
          color: parts.find((p) => p.id === 'name')?.color || '#e4e3ec',
          lineH: text.lineGap * scale,
          lineLimit: label.nameMaxLines || 2,
          lines: text.lines,
        },
      };
      const extras = parts.filter((p) => !canonical[p.id]);
      const extraModel =
        extras.length && window.NormalNotice
          ? NormalNotice.measure({
              sender: username,
              body: '开通' + names[rank],
              bindings: { rank },
              width,
              fontSize,
              lineHeight: 146,
              main: true,
              parts: extras,
            })
          : null;
      measuredParts = parts
        .filter((p) => canonical[p.id])
        .map((p) => {
          const r = canonical[p.id];
          return {
            ...(window.ThemeKeyframes ? ThemeKeyframes.remember(p) : p),
            ...r,
            layoutX: r.x,
            layoutY: r.y,
            x: p.placement === 'free' ? p.x : r.x + p.x,
            y: p.placement === 'free' ? p.y : r.y + p.y,
            shiftX: p.placement === 'free' ? p.x - r.x : p.x,
            shiftY:
              (p.placement === 'free' ? p.y - r.y : p.y) +
              (p.id === 'title'
                ? titleShift
                : p.id === 'name'
                  ? nameTop - (offsetY + (text.nameY - text.nameSize * 0.6) * scale)
                  : 0),
          };
        });
      if (extraModel) measuredParts.push(...extraModel.parts);
      Object.assign(label, {
        particleScale,
        parts,
        partLayout: measuredParts,
        extraModel,
        componentWidth: width,
        componentOffsetY: offsetY,
      });
      height = Math.max(
        top + 28,
        ...measuredParts
          .filter((p) => p.visible && p.kind !== 'particles')
          .map((p) => p.y + p.h + bottom),
      );
    }
    return { scale, offsetY, label, height, parts: measuredParts };
  }
  const loading=Promise.all(Array.from({length:4},(_,i)=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{sheets[i]=im;resolve();};im.onerror=reject;im.src='fleet-material-'+i+'.webp';}))).then(()=>{ready=true;return true;}).catch(()=>{failed=true;return false;});

  const rankStyle = {
    captain: { duration: 2200, count: 88, spread: 1, ambient: 14, gain: 1 },
    admiral: { duration: 2800, count: 160, spread: 1.18, ambient: 28, gain: 1.3 },
    governor: { duration: 3400, count: 248, spread: 1.38, ambient: 48, gain: 1.65 },
  };
  const profile = (rank) => rankStyle[rank] || rankStyle.captain;
  const baseDuration = (rank) => profile(rank).duration;
  const duration = (rank) => baseDuration(rank) + (window.FleetInterlude?.extra(rank) || 0);
  const motionAge = (age, rank) => window.FleetInterlude?.motionAge(age, rank) ?? age;
  // Time is spent on the approach and the scattered-light tail. The original
  // short reveal remains a fast passage through its own source keyframes.
  const timeX = [0, 0.12, 0.29, 0.32, 0.47, 0.72, 1],
    timeY = [250, 395, 490, 585, 800, 1230, 1750];
  const timeSlopes = timeX.slice(1).map((x, i) => (timeY[i + 1] - timeY[i]) / (x - timeX[i]));
  const timeTangents = timeX.map((x, i) =>
    i === 0
      ? timeSlopes[0]
      : i === timeX.length - 1
        ? timeSlopes.at(-1)
        : 2 / (1 / timeSlopes[i - 1] + 1 / timeSlopes[i]),
  );
  function sourceAt(age, rank) {
    const p = sat(motionAge(age, rank) / baseDuration(rank));
    let i = 0;
    while (i < timeX.length - 2 && p > timeX[i + 1]) i++;
    const h = timeX[i + 1] - timeX[i],
      u = (p - timeX[i]) / h,
      u2 = u * u,
      u3 = u2 * u;
    return (
      (2 * u3 - 3 * u2 + 1) * timeY[i] +
      (u3 - 2 * u2 + u) * h * timeTangents[i] +
      (-2 * u3 + 3 * u2) * timeY[i + 1] +
      (u3 - u2) * h * timeTangents[i + 1]
    );
  }
  function phase(age, rank) {
    const cut = window.FleetInterlude?.state(age, rank);
    if (cut?.active) return cut.plate ? '档案徽记 · 动画暂停' : '录像带漏光切断';
    const p = motionAge(age, rank) / baseDuration(rank);
    return p < 0.12
      ? '轮廓显形'
      : p < 0.29
        ? '碎光聚集'
        : p < 0.38
          ? '徽记闪现'
          : p < 1
            ? '碎光扩散'
            : '稳定显示 · 微光留驻';
  }
  const hash = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const flecks = Array.from({ length: 248 }, (_, i) => ({
    angle: [-2.7, -2.05, -1.25, -0.25, 0.65, 1.35, 2.4][i % 7] + (hash(i + 1) - 0.5) * 0.57,
    radius: 100 + hash(i + 30) * 80,
    depth: hash(i + 55),
    delay: hash(i + 80) * 0.18,
    size: 5 + hash(i + 112) * 14,
    turn: (hash(i + 134) - 0.5) * 1.8,
    seed: hash(i + 161),
    cell: i % 8,
  }));
  let fleckSheet, softFleckSheet, softFleckSource;
  function speckSheet() {
    if (fleckSheet) return fleckSheet;
    const sheet = document.createElement('canvas');
    sheet.width = 256;
    sheet.height = 32;
    const ink = sheet.getContext('2d');
    for (let i = 0; i < 8; i++) {
      const x = i * 32 + 16;
      ink.save();
      ink.translate(x, 16);
      ink.rotate(hash(i + 12) * 6.28);
      ink.fillStyle = 'rgba(225,228,245,.60)';
      ink.shadowColor = 'rgba(220,225,250,.55)';
      ink.shadowBlur = 3.5 + (i % 3);
      ink.beginPath();
      ink.moveTo(-3 - hash(i) * 2, -3);
      ink.lineTo(3, -4 + hash(i + 2) * 3);
      ink.lineTo(5, 1);
      ink.lineTo(1, 4);
      ink.lineTo(-4, 2);
      ink.closePath();
      ink.fill();
      ink.shadowBlur = 0;
      ink.fillStyle = 'rgba(246,247,255,.65)';
      ink.fillRect(-1, -1, 2, 1.4);
      ink.restore();
    }
    return (fleckSheet = sheet);
  }
  function softSpeckSheet() {
    const source = speckSheet();
    if (softFleckSource !== source) {
      softFleckSource = source;
      softFleckSheet = document.createElement('canvas');
      softFleckSheet.width = 256;
      softFleckSheet.height = 32;
      const ink = softFleckSheet.getContext('2d');
      ink.filter = 'blur(1.5px)';
      ink.drawImage(source, 0, 0);
    }
    return softFleckSheet;
  }
  function smallLight(x, y, size, alpha, cell, turn, soft = false) {
    if (alpha <= 0.001) return;
    const protection = options.sideLabel
        ? x > 580 && y > 275 && y < 435
          ? 0.1
          : 1
        : y > 465
          ? 0.16
          : 1,
      edge = options.sideLabel
        ? 1
        : smooth(70, 125, y) *
          (1 - smooth(650, 710, y)) *
          smooth(10, 65, x) *
          (1 - smooth(780, 840, x));
    c.save();
    c.globalAlpha =
      Math.min(1, alpha * protection * edge) *
      (options.exitProgress >= 0 ? 1 - smooth(0, 0.82, options.exitProgress) : 1) *
      componentAlpha;
    c.translate(x, y);
    c.rotate(turn);
    c.drawImage(
      soft ? softSpeckSheet() : speckSheet(),
      cell * 32,
      0,
      32,
      32,
      -size * 1.6,
      -size * 1.6,
      size * 3.2,
      size * 3.2,
    );
    c.restore();
  }
  function scatteredLight(age) {
    const nativeStyle = profile(options.rank),
      style = {
        ...nativeStyle,
        count: Math.min(
          flecks.length,
          Math.round(nativeStyle.count * (options.particleAmount ?? 1)),
        ),
        ambient: Math.min(
          flecks.length,
          Math.round(nativeStyle.ambient * (options.particleAmount ?? 1)),
        ),
        spread: nativeStyle.spread * (options.particleSpread ?? 1),
        gain: nativeStyle.gain * (options.effectGain ?? 1),
      },
      p = motionAge(age, options.rank) / style.duration;
    if (p < 1.02) {
      for (let i = 0; i < style.count; i++) {
        const f = flecks[i],
          begin = 0.015 + f.delay * 0.3,
          release = 0.291 + f.delay * 0.16,
          kick = smooth(release, release + 0.055, p),
          coast = smooth(release + 0.055, 0.96 - f.delay * 0.18, p),
          u = kick * 0.65 + coast * 0.35,
          charge = smooth(begin, release, p),
          theta = f.angle + f.turn * (0.1 * charge + 0.22 * u);
        const r =
          (f.radius + 34 - 66 * charge + (48 + f.depth * 87) * kick + (25 + f.depth * 50) * coast) *
          style.spread;
        const x = cx + Math.cos(theta) * r,
          y = 352 + Math.sin(theta) * r * 0.91 + u * u * (f.depth - 0.2) * 26;
        const alpha =
          smooth(begin, begin + 0.12, p) *
          (1 - smooth(0.58 + f.delay, 0.98, p)) *
          (0.2 + 0.52 * f.depth) *
          style.gain *
          (0.48 + 0.52 * smooth(0.27, 0.34, p));
        const size = f.size * (0.68 + 0.35 * f.depth) * (i % 11 === 0 ? 1.65 : 1),
          trail = 18 * Math.sin(kick * Math.PI) ** 2 * (0.6 + f.depth);
        if (trail > 2)
          smallLight(
            x - Math.cos(theta) * trail,
            y - Math.sin(theta) * trail * 0.91,
            size * 0.85,
            alpha * 0.25,
            f.cell,
            theta + f.turn * u,
          );
        smallLight(x, y, size, alpha, f.cell, theta + f.turn * u);
      }
    }
    // Stable traces have independent depth and local drift. Their birth/expiry
    // is dark, so the optical field has no visible reset at the cycle boundary.
    const settle = smooth(0.72, 1, p);
    if (settle > 0) {
      const t = age / 1000,
        rank = options.rank,
        level = rank === 'governor' ? 2 : rank === 'admiral' ? 1 : 0;
      for (let i = 0; i < style.ambient; i++) {
        const f = flecks[(i * 37) % flecks.length],
          period = 4.8 + f.depth * 2.8 - level * 0.35,
          life = (t / period + f.seed) % 1;
        const drift = Math.sin(life * Math.PI) * Math.sin(t * 0.53 + f.seed * 18),
          a = f.angle + f.turn * life * 0.16 + drift * 0.026,
          r = (142 + f.depth * 70 + (life - 0.5) * (42 + level * 8)) * style.spread;
        const x = cx + Math.cos(a) * r + Math.sin(t * 0.61 + f.seed * 20) * 9,
          y = 350 + Math.sin(a) * r * 0.9 - life * (20 + f.depth * 27);
        const exposure = 0.84 + 0.16 * hash(Math.floor(t * 11) + i * 73),
          alpha =
            Math.sin(life * Math.PI) ** 2 *
            (0.22 + f.depth * 0.22) *
            (1 + level * 0.48) *
            settle *
            exposure;
        const size = (5.6 + f.depth * 8) * (1 + level * 0.2),
          soft = i % 5 === 0;
        if (soft)
          smallLight(x + 3, y - 2, size * 1.75, alpha * 0.27, f.cell, a + life * 0.17, true);
        smallLight(x, y, size, alpha * (soft ? 0.63 : 1), f.cell, a + life * 0.17);
      }
    }
  }
  function edgeLight(age) {
    const rank = options.rank,
      level = rank === 'governor' ? 2 : rank === 'admiral' ? 1 : 0,
      p = motionAge(age, rank) / baseDuration(rank);
    if (p < 0.72) return;
    const vertices = [
        [cx - 140, 257],
        [cx + 140, 257],
        [cx, 499],
      ],
      time = age / 1000,
      settle = smooth(0.72, 1, p);
    c.save();
    c.lineCap = 'round';
    for (let packet = 0; packet <= level + 1; packet++) {
      const phase = (time / (8.2 - level * 0.9 + packet * 0.7) + packet * 0.371) % 1,
        at = phase * 3,
        span = 0.24 + 0.075 * level;
      const light =
        Math.sin(phase * Math.PI) ** 2 *
        settle *
        (0.54 + level * 0.15) *
        (0.84 + 0.16 * Math.sin(time * 0.7 + packet * 4));
      let cursor = at,
        remaining = span;
      while (remaining > 0.0001) {
        const side = Math.floor(cursor) % 3,
          u = cursor - Math.floor(cursor),
          length = Math.min(remaining, 1 - u),
          a = vertices[side],
          b = vertices[(side + 1) % 3];
        const x = a[0] + (b[0] - a[0]) * u,
          y = a[1] + (b[1] - a[1]) * u,
          x2 = a[0] + (b[0] - a[0]) * (u + length),
          y2 = a[1] + (b[1] - a[1]) * (u + length);
        const gradient = c.createLinearGradient(x, y, x2, y2);
        gradient.addColorStop(0, '#e9efff00');
        gradient.addColorStop(0.55, '#f1f3ff');
        gradient.addColorStop(1, '#e9efff00');
        c.strokeStyle = gradient;
        for (const [width, alpha] of [
          [7.0, 0.16],
          [2.4, 0.95],
        ]) {
          c.globalAlpha =
            light *
            alpha *
            (options.exitProgress >= 0 ? 1 - smooth(0, 0.35, options.exitProgress) : 1) *
            componentAlpha;
          c.lineWidth = width;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x2, y2);
          c.stroke();
        }
        if (packet === 0 && u > 0.08 && u < 0.78)
          smallLight(
            x2,
            y2,
            3.4 + level * 0.8,
            light * 0.32,
            (side + level) % 8,
            Math.atan2(y2 - y, x2 - x),
          );
        cursor += length;
        remaining -= length;
        if (length <= 0) break;
      }
    }
    c.restore();
  }
  let labelPaper;
  const labelPaperPatterns = new WeakMap();
  function paperPattern(context) {
    if (!labelPaper) {
      labelPaper = document.createElement('canvas');
      labelPaper.width = 192;
      labelPaper.height = 96;
      const ink = labelPaper.getContext('2d'),
        im = ink.createImageData(192, 96);
      for (let i = 0; i < 192 * 96; i++) {
        const n = hash(i + 713);
        im.data[i * 4] = 41;
        im.data[i * 4 + 1] = 43;
        im.data[i * 4 + 2] = 47;
        im.data[i * 4 + 3] = Math.round(Math.pow(n, 5) * 27);
      }
      ink.putImageData(im, 0, 0);
    }
    let pattern = labelPaperPatterns.get(context);
    if (!pattern) {
      pattern = context.createPattern(labelPaper, 'repeat');
      labelPaperPatterns.set(context, pattern);
    }
    return pattern;
  }
  // Original project material atlas, retained for visual fidelity.
  let materialBlend;
function materialFrame(sourceTime,alpha=1,energy=0){
 if(!ready||sourceTime<250||sourceTime>=1750)return;const frame=Math.min(52,sourceTime*.03),first=Math.floor(frame),mix=frame-first;
 if(!materialBlend){materialBlend=document.createElement('canvas');materialBlend.width=510;materialBlend.height=396;}
 const ink=materialBlend.getContext('2d');ink.clearRect(0,0,510,396);ink.globalCompositeOperation='lighter';
 for(const [n,weight] of [[first,1-mix],[Math.min(52,first+1),mix]]){if(weight<=.001)continue;const cell=n%16,sheet=sheets[Math.floor(n/16)];ink.globalAlpha=weight;ink.drawImage(sheet,(cell%4)*510,Math.floor(cell/4)*396,510,396,0,0,510,396);}
 c.save();c.globalAlpha=(alpha)*componentAlpha;c.drawImage(materialBlend,0,0,850,660);if(energy>.001){c.globalCompositeOperation='lighter';for(let gain=energy;gain>.001;gain-=1){c.globalAlpha=(Math.min(1,gain)*alpha)*componentAlpha;c.drawImage(materialBlend,0,0,850,660);}}c.restore();
}

  function geometry(t) {
    const n = t * 0.06 + 1,
      frames = data.frames;
    if (n < 17) return [0, 0, 0, 0];
    for (let i = 0; i < frames.length - 1; i++) {
      const a = frames[i],
        b = frames[i + 1];
      if (n >= a[0] && n < b[0]) {
        const u = (n - a[0]) / (b[0] - a[0]);
        return a.slice(1).map((v, j) => {
          const k = j < 2 ? 1 : 3;
          return a[k] === 0 || b[k] === 0 ? v : v + (b[j + 1] - v) * u;
        });
      }
    }
    return frames.at(-1).slice(1);
  }
  function triangle(w, y, opacity, fill = 0) {
    if (w <= 0 || opacity <= 0) return;
    w += 5;
    c.save();
    c.globalAlpha = opacity * componentAlpha;
    c.beginPath();
    c.moveTo(cx - w / 2 + 4, y);
    c.lineTo(cx + w / 2 - 4, y);
    c.quadraticCurveTo(cx + w / 2 + 2, y, cx + w / 2 - 1, y + 6);
    c.lineTo(cx + 3, y + w * 0.866 - 5);
    c.quadraticCurveTo(cx, y + w * 0.866 + 1, cx - 3, y + w * 0.866 - 5);
    c.lineTo(cx - w / 2 + 1, y + 6);
    c.quadraticCurveTo(cx - w / 2 - 2, y, cx - w / 2 + 4, y);
    c.closePath();
    if (fill) {
      c.fillStyle = 'rgba(223,224,236,' + fill + ')';
      c.fill();
    }
    c.strokeStyle = options.partColor || '#e7e7f2';
    c.lineWidth = options.rank === 'governor' ? 2.5 : options.rank === 'admiral' ? 2.1 : 1.8;
    c.lineJoin = 'round';
    c.stroke();
    c.restore();
  }
  function icon(t, innerWidth, innerTop) {
    const reveal = smooth(465, 585, t);
    if (reveal <= 0 || innerWidth <= 0) return;
    const rank = options.rank;
    c.save();
    c.globalAlpha =
      (options.exitProgress >= 0 ? 1 - smooth(0.08, 0.55, options.exitProgress) : 1) *
      componentAlpha;
    c.strokeStyle = options.partColor || '#f4f4f8';
    c.fillStyle = options.partColor || '#f4f4f8';
    c.lineWidth = 7;
    c.lineJoin = 'bevel';
    c.lineCap = 'square';
    const iconScale = rank === 'governor' ? 1.32 : rank === 'admiral' ? 1.24 : 1.12;
    // The emblem occupies the inner triangle's moving coordinates. A narrow
    // central exposure opens into the anchor/crown during the same flash.
    const contraction = Math.max(0.8, Math.min(1.7, innerWidth / 184));
    c.translate(430, innerTop + innerWidth * (61 / 184));
    c.scale(iconScale * contraction, iconScale * contraction);
    c.translate(-430, -349);
    c.beginPath();
    c.rect(340, 349 - 65 * reveal, 180, 130 * reveal);
    c.clip();
    if (rank === 'governor') {
      c.beginPath();
      c.moveTo(405, 308);
      c.lineTo(416, 318);
      c.lineTo(430, 303);
      c.lineTo(444, 318);
      c.lineTo(455, 308);
      c.lineTo(451, 329);
      c.lineTo(409, 329);
      c.closePath();
      c.fill();
      c.fillRect(408, 333, 44, 4);
    } else {
      c.beginPath();
      c.arc(430, 316, 7, 0, Math.PI * 2);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(430, rank === 'governor' ? 337 : 327);
    c.lineTo(430, 385);
    c.moveTo(415, 341);
    c.lineTo(445, 341);
    c.moveTo(400, 357);
    c.bezierCurveTo(401, 373, 414, 379, 430, 389);
    c.bezierCurveTo(446, 379, 459, 373, 460, 357);
    c.stroke();
    for (const sign of [-1, 1]) {
      c.beginPath();
      c.moveTo(430 + sign * 30, 353);
      c.lineTo(430 + sign * 22, 364);
      c.lineTo(430 + sign * 35, 361);
      c.closePath();
      c.fill();
    }
    if (rank === 'admiral') {
      for (const sign of [-1, 1]) {
        c.beginPath();
        c.moveTo(430 + sign * 43, 310);
        c.lineTo(430 + sign * 57, 327);
        c.lineTo(430 + sign * 43, 344);
        c.lineWidth = 5;
        c.stroke();
      }
    }
    c.restore();
  }
  function label(t) {
    if (options.sideLabel) {
      c.save();
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillStyle = '#e4e3ec';
      c.globalAlpha = smooth(620, 820, t) * componentAlpha;
      c.font = '400 58px ' + family;
      c.fillText(labelLayout().username, 620, 327);
      c.globalAlpha = smooth(600, 780, t) * componentAlpha;
      c.fillStyle = '#f2f2f4';
      c.font = '700 64px ' + family;
      c.fillText('开通' + names[options.rank], 620, 397);
      c.restore();
      return;
    }
    const enter = smooth(433, 700, t);
    if (enter <= 0) return;
    c.save();
    const layout = labelLayout(),
      { title, targetW, barH } = layout;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 ' + layout.titleSize + 'px ' + family;
    const barWidth = 13 + (targetW - 13) * Math.pow(enter, 2.1);
    c.fillStyle = '#edecf1';
    c.fillRect(cx - barWidth / 2, 493.5 - barH / 2, barWidth, barH);
    c.fillStyle = paperPattern(c);
    c.fillRect(cx - barWidth / 2, 493.5 - barH / 2, barWidth, barH);
    c.save();
    c.beginPath();
    c.rect(cx - barWidth / 2, 493.5 - barH / 2, barWidth, barH);
    c.clip();
    c.globalAlpha = smooth(620, 750, t) * componentAlpha;
    c.fillStyle = '#15151b';
    c.fillText(title, cx, 494, targetW - 22);
    c.restore();
    c.globalAlpha = smooth(650, 820, t) * componentAlpha;
    c.fillStyle = '#e4e3ec';
    c.font = '500 ' + layout.nameSize + 'px ' + family;
    layout.lines.forEach((v, i) => c.fillText(v, cx, layout.nameY + i * layout.lineGap));
    c.restore();
  }
  function rankContour(t, width, top) {
    const rank = options.rank;
    if (rank === 'captain' || width <= 0) return;
    // These are parts of the moving silhouette, not a second opacity reveal.
    // The material's own width/top keyframes carry the corners through gathering,
    // overshoot and settling; the flash draws the remaining edge length.
    const exit = options.exitProgress ?? -1,
      gain = 1 - smooth(0.2, 0.53, exit),
      form = smooth(433, 585, t) * (1 - smooth(0, 0.5, exit)),
      governor = rank === 'governor',
      half = width / 2 + (governor ? 25 : 0),
      y = top - (governor ? 17 : 0),
      length = (governor ? 43 : 23) * (0.12 + 0.88 * form);
    c.save();
    c.globalAlpha = (governor ? 0.84 : 1) * gain * componentAlpha;
    c.strokeStyle = options.partColor || '#ececf5';
    c.lineWidth = governor ? 2.7 : 2.2;
    if (governor) {
      c.globalAlpha = 0.38 * gain * componentAlpha;
      c.lineWidth = 1.6;
      c.beginPath();
      for (const sign of [-1, 1]) {
        c.moveTo(cx + sign * half, y);
        c.lineTo(cx + sign * half * (1 - form), y);
        c.moveTo(cx + sign * half, y);
        c.lineTo(cx + sign * (half - (half - 48) * form), y + 204 * form);
      }
      c.stroke();
      c.globalAlpha = 0.84 * gain * componentAlpha;
      c.lineWidth = 2.7;
    }
    for (const sign of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + sign * (half - length), y);
      c.lineTo(cx + sign * half, y);
      c.lineTo(cx + sign * (half - length * 0.5), y + length * 0.866);
      c.stroke();
    }
    c.restore();
  }

  function drawExit(age, p) {
    if (p >= 1) return;
    // The outer contour withdraws before the inner outline turns. The icon and
    // ambient fragments keep their own coordinates; no whole-badge bitmap spin.
    const [ow, oy, iw, iy] = geometry(1750),
      outer = smooth(0.02, 0.51, p),
      inner = smooth(0.16, 0.76, p);
    if (!options.skipLegacyParticles) scatteredLight(age);
    c.save();
    c.setLineDash(outer > 0 ? [Math.max(0.01, ow * 3.02 * (1 - outer)), ow * 3.1] : []);
    triangle(
      ow,
      oy,
      (options.rank === 'governor' ? 0.83 : options.rank === 'admiral' ? 0.66 : 0.42) *
        (1 - smooth(0.3, 0.55, p)),
    );
    c.restore();
    rankContour(1750, ow, oy);
    edgeLight(age);
    c.save();
    const pivotY = iy + (iw * 0.866) / 3;
    c.translate(cx, pivotY);
    c.rotate(-Math.PI * 0.5 * inner);
    c.translate(-cx, -pivotY);
    triangle(iw, iy, (options.rank === 'captain' ? 0.8 : 0.98) * (1 - smooth(0.37, 0.81, p)));
    c.restore();
    icon(1750, iw, iy);
    if (options.skipLegacyLabel) return;
    const l = labelLayout(),
      close = smooth(0.48, 0.91, p),
      height = Math.max(0.001, l.barH * (1 - close)),
      finish = 1 - smooth(0.9, 1, p);
    c.save();
    c.globalAlpha = finish * componentAlpha;
    c.beginPath();
    c.rect(cx - l.targetW / 2, 493.5 - height / 2, l.targetW, height);
    c.clip();
    c.fillStyle = '#edecf1';
    c.fillRect(cx - l.targetW / 2, 493.5 - l.barH / 2, l.targetW, l.barH);
    c.fillStyle = paperPattern(c);
    c.fillRect(cx - l.targetW / 2, 493.5 - l.barH / 2, l.targetW, l.barH);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 ' + l.titleSize + 'px ' + family;
    c.fillStyle = '#15151b';
    c.fillText(l.title, cx, 494, l.targetW - 22);
    c.restore();
    c.save();
    c.globalAlpha = (1 - smooth(0.6, 1, p)) * componentAlpha;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#e4e3ec';
    c.font = '500 ' + l.nameSize + 'px ' + family;
    l.lines.forEach((v, i) => c.fillText(v, cx, l.nameY + i * l.lineGap));
    c.restore();
  }

  function componentPart(id, draw) {
    if (options.onlyPart && options.onlyPart !== id) return;
    const part = options.partLayout?.find((p) => p.id === id);
    if (!part?.visible) return;
    const previous = componentAlpha,
      color = options.partColor;
    const anim = window.ThemeKeyframes?.part(
      part,
      options.motionTime ?? options.age,
      options.motionExit,
    ) || { dx: 0, dy: 0, opacity: part.opacity ?? 1 };
    componentAlpha *= anim.opacity;
    options.partColor = part.color;
    c.save();
    c.translate(
      ((part.shiftX || 0) + anim.dx) / options.scale,
      ((part.shiftY || 0) + anim.dy) / options.scale,
    );
    if (id === 'particles') {
      c.translate(cx, 257);
      c.scale(options.particleScale / options.scale, options.particleScale / options.scale);
      c.translate(-cx, -257);
    }
    c.globalAlpha = componentAlpha;
    draw(part);
    c.restore();
    componentAlpha = previous;
    options.partColor = color;
  }
  function componentLabels(age, exit) {
    const l = labelLayout();
    componentPart('title', (part) => {
      const t = sourceAt(Math.max(0, age - (part.delay || 0)), options.rank),
        enter = smooth(433, 700, t);
      if (enter <= 0) return;
      const close = exit >= 0 ? smooth(0.48, 0.91, exit) : 0,
        barWidth = 13 + (l.targetW - 13) * Math.pow(enter, 2.1),
        height = Math.max(0.001, l.barH * (1 - close));
      c.save();
      c.beginPath();
      c.rect(cx - barWidth / 2, 493.5 - height / 2, barWidth, height);
      c.clip();
      c.globalAlpha = componentAlpha * (exit >= 0 ? 1 - smooth(0.9, 1, exit) : 1);
      c.fillStyle = part.fill || '#edecf1';
      c.fillRect(cx - barWidth / 2, 493.5 - l.barH / 2, barWidth, l.barH);
      c.fillStyle = paperPattern(c);
      c.fillRect(cx - barWidth / 2, 493.5 - l.barH / 2, barWidth, l.barH);
      c.globalAlpha *= smooth(620, 750, t);
      c.fillStyle = part.color || '#15151b';
      c.font = (part.weight || 900) + ' ' + l.titleSize + 'px ' + (options.titleFace || family);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(l.title, cx, 494, l.targetW - 22);
      c.restore();
    });
    componentPart('name', (part) => {
      c.beginPath();
      c.rect(
        cx - options.nameWidth / 2 - 1 / options.scale,
        l.nameY - l.nameSize,
        options.nameWidth + 2 / options.scale,
        Math.max(0, l.lines.length - 1) * l.lineGap + l.nameSize * 2,
      );
      c.clip();
      const t = sourceAt(Math.max(0, age - (part.delay || 0)), options.rank);
      c.globalAlpha =
        componentAlpha * smooth(650, 820, t) * (exit >= 0 ? 1 - smooth(0.6, 1, exit) : 1);
      c.fillStyle = part.color || '#e4e3ec';
      c.font = (part.weight || 500) + ' ' + l.nameSize + 'px ' + (options.nameFace || family);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      l.lines.forEach((v, i) => c.fillText(v, cx, l.nameY + i * l.lineGap));
    });
  }
  function renderComponentPart(age) {
    const exit = options.exitProgress ?? -1;
    componentPart('particles', (part) => {
      const a = age - (part.delay || 0);
      if (a < 0) return;
      const t = sourceAt(a, options.rank),
        legacy = t - 250,
        impact = Math.exp(
          -Math.pow((motionAge(a, options.rank) / baseDuration(options.rank) - 0.313) / 0.026, 2),
        );
      if (exit < 0)
        materialFrame(
          t,
          1 - smooth(1350, 1500, legacy),
          impact * (0.45 + profile(options.rank).gain * 0.28),
        );
      scatteredLight(a);
    });
    componentPart('badge', (part) => {
      const a = age - (part.delay || 0);
      if (a < 0) return;
      if (exit >= 0) {
        options.skipLegacyLabel = options.skipLegacyParticles = true;
        drawExit(a, exit);
        return;
      }
      const t = sourceAt(a, options.rank);
      if (t < 266) return;
      const [ow, oy, iw, iy] = geometry(t),
        line =
          t < 520
            ? 0.96
            : 1 -
              smooth(520, 760, t) *
                (options.rank === 'governor' ? 0.17 : options.rank === 'admiral' ? 0.34 : 0.58);
      triangle(ow, oy, line);
      triangle(
        iw,
        iy,
        t < 525 ? 0.97 : options.rank === 'captain' ? 0.8 : 0.98,
        smooth(478, 510, t) * (1 - smooth(545, 720, t)) * 0.14,
      );
      rankContour(t, ow, oy);
      edgeLight(a);
      icon(t, iw, iy);
    });
    componentLabels(age, exit);
    if (options.extraModel?.parts.some((p) => p.id === options.onlyPart)) {
      c.save();
      c.scale(1 / options.scale, 1 / options.scale);
      c.globalAlpha = exit >= 0 ? 1 - smooth(0.4, 1, exit) : 1;
      NormalNotice.draw(c, {
        x: cx * options.scale - options.componentWidth / 2 + 27,
        y: -options.componentOffsetY,
        motionTime: options.motionTime ?? age,
        motionExit: options.motionExit,
        model: {
          ...options.extraModel,
          parts: options.extraModel.parts.filter((p) => p.id === options.onlyPart),
        },
        age:
          (Math.max(0, age - baseDuration(options.rank) * 0.6) * 220) /
          (baseDuration(options.rank) * 0.4),
      });
      c.restore();
    }
  }
  function componentDraw(age) {
    for (const part of options.parts) {
      options.onlyPart = part.id;
      renderComponentPart(age);
    }
    options.onlyPart = null;
  }
  function draw(context, settings) {
    c = context;
    options = {
      ...settings,
      rank: names[settings.rank] ? settings.rank : 'captain',
      username: String(settings.username || '观众'),
    };
    const age = Math.max(0, options.age),
      sourceTime = sourceAt(age, options.rank);
    componentAlpha = 1;
    c.save();
    c.translate(options.x, options.y);
    c.scale(options.scale, options.scale);
    if (options.partLayout) {
      componentDraw(age);
      c.restore();
      return;
    }
    if (options.exitProgress >= 0) {
      drawExit(age, options.exitProgress);
      c.restore();
      return;
    }
    const legacyAge = sourceTime - 250,
      p = motionAge(age, options.rank) / baseDuration(options.rank),
      impact = Math.exp(-Math.pow((p - 0.313) / 0.026, 2));
    materialFrame(
      sourceTime,
      1 - smooth(1350, 1500, legacyAge),
      impact * (0.45 + profile(options.rank).gain * 0.28),
    );
    scatteredLight(age);
    if (sourceTime >= 266) {
      const [ow, oy, iw, iy] = geometry(sourceTime),
        lineOpacity =
          sourceTime < 520
            ? 0.96
            : 1 -
              smooth(520, 760, sourceTime) *
                (options.rank === 'governor' ? 0.17 : options.rank === 'admiral' ? 0.34 : 0.58);
      triangle(ow, oy, lineOpacity);
      const flash = smooth(478, 510, sourceTime) * (1 - smooth(545, 720, sourceTime)) * 0.14;
      triangle(iw, iy, sourceTime < 525 ? 0.97 : options.rank === 'captain' ? 0.8 : 0.98, flash);
      rankContour(sourceTime, ow, oy);
      edgeLight(age);
      icon(sourceTime, iw, iy);
      label(sourceTime);
    }
    c.restore();
  }
  function signal(age, rank) {
    const p = motionAge(age, rank) / baseDuration(rank),
      level = rank === 'governor' ? 2 : rank === 'admiral' ? 1 : 0;
    const flash = Math.exp(-Math.pow((p - 0.311) / 0.011, 2)) * (0.55 + level * 0.17);
    const charge = level ? smooth(0.015, 0.065, p) * (1 - smooth(0.29, 0.39, p)) : 0;
    const pulse = hash(Math.floor(age / 70) + 83) > 0.7 ? 1 : 0.18;
    const glitch = Math.max(
      smooth(0.273, 0.288, p) * (1 - smooth(0.335, 0.377, p)),
      charge * (level === 2 ? 0.7 : 0.27) * pulse,
    );
    const vhs = level
      ? smooth(0.015, 0.09, p) *
        (1 - smooth(0.35, level === 2 ? 0.72 : 0.5, p)) *
        (level === 2 ? 1 : 0.56)
      : 0;
    return {
      flash: flash < 0.0001 ? 0 : flash,
      glitch,
      charge,
      vhs,
      level,
      bands: 3 + level * 2,
      shift: 7 + level * 5,
    };
  }
  function drawSignal(...args) {
    return window.FleetSignal?.draw(...args);
  }

  window.FleetNotice = {
    draw,
    measureFeed,
    loading: Promise.all([
      loading,
      window.FleetInterlude?.loading,
      window.FleetFilmBurn?.loading,
    ]).then(([ok]) => ok),
    duration,
    baseDuration,
    phase,
    signal,
    drawSignal,
    get ready() {
      return (
        ready &&
        (!window.FleetInterlude || FleetInterlude.settled) &&
        (!window.FleetFilmBurn || FleetFilmBurn.ready)
      );
    },
    get failed() {
      return failed;
    },
    names,
  };
})();
