/* Ordinary message entrance: rotating signal, two ink exposures, divider. */
(() => {
  'use strict';
  const family = '"Microsoft YaHei","PingFang SC","Segoe UI",sans-serif',
    measureCanvas = document.createElement('canvas'),
    mc = measureCanvas.getContext('2d');
  const sat = (t) => Math.max(0, Math.min(1, t));
  let segmenter;
  try {
    segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
  } catch {}
  const chars = (text) =>
    segmenter
      ? Array.from(segmenter.segment(String(text)), (s) => s.segment)
      : Array.from(String(text));
  const font = (c, size, weight = 400, face = family) => {
    c.font = weight + ' ' + size + 'px ' + face;
  };
  function wrap(text, width, size, weight = 400, hang = true, face = family) {
    font(mc, size, weight, face);
    const result = [];
    for (const paragraph of String(text).split('\n')) {
      let row = '';
      for (const ch of chars(paragraph)) {
        if (row && mc.measureText(row + ch).width > width) {
          const closing = /^[，。！？、；：）》」』】,.!?;:%]/;
          if (hang && closing.test(ch) && mc.measureText(row + ch).width <= width + size) row += ch;
          else if (!hang && closing.test(ch)) {
            // The embedded feed has an optical fade close to the text column.
            // Carry the preceding character with closing marks instead of entering it.
            const parts = chars(row);
            let split = parts.length - 1;
            while (split > 0 && closing.test(parts[split])) split--;
            const tail = parts.slice(split).join('') + ch;
            if (split > 0 && mc.measureText(tail).width <= width) {
              result.push(parts.slice(0, split).join(''));
              row = tail;
            } else {
              result.push(row);
              row = ch;
            }
          } else {
            result.push(row);
            row = ch;
          }
        } else row += ch;
      }
      if (row || paragraph === '') result.push(row);
    }
    return result;
  }
  function ellipsis(text, width, size, weight = 400, face = family) {
    font(mc, size, weight, face);
    const a = chars(text);
    if (mc.measureText(a.join('')).width <= width) return a.join('');
    while (a.length && mc.measureText(a.join('') + '…').width > width) a.pop();
    return a.join('') + '…';
  }
  function limitLines(
    lines,
    width,
    size,
    weight = 400,
    face = family,
    maxLines = 0,
    overflow = 'ellipsis',
  ) {
    if (!(maxLines > 0) || lines.length <= maxLines) return lines;
    const out = lines.slice(0, maxLines);
    if (overflow !== 'clip')
      out[out.length - 1] = ellipsis(out.at(-1) + '…', width, size, weight, face);
    return out;
  }
  function textLines(
    p,
    value,
    width,
    size,
    weight = 400,
    hang = false,
    face = family,
    defaultLimit = 0,
  ) {
    return limitLines(
      wrap(value, width, size, weight, hang, face),
      width,
      size,
      weight,
      face,
      p.maxLines || defaultLimit,
      p.overflow,
    );
  }
  function measure({
    sender = '观众',
    body = '',
    width = 440,
    fontSize = 21,
    lineHeight = 158,
    main = false,
    bodyWeight,
    nameColor,
    bodyColor,
    parts,
    bindings,
  }) {
    if (parts?.length)
      return measureParts({
        sender,
        body,
        width,
        fontSize,
        lineHeight,
        main,
        bodyWeight,
        nameColor,
        bodyColor,
        parts,
        bindings,
      });
    const nameSize = Math.max(15, fontSize * (main ? 0.96 : 0.76)),
      lineH = (fontSize * lineHeight) / 100,
      indent = main ? 42 : 0,
      weight = bodyWeight ?? (main ? 600 : 400),
      lines = wrap(body, width - 54 - indent, fontSize, weight, !main);
    return {
      lines,
      nameSize,
      lineH,
      fontSize,
      main,
      indent,
      weight,
      nameColor,
      bodyColor,
      contentWidth: width - 54,
      name: ellipsis(sender, width - (main ? 96 : 84), nameSize, weight),
      height: nameSize + 13 + lines.length * lineH + 27,
    };
  }
  function measureParts(o) {
    const { sender, body, width, fontSize, lineHeight, main, bodyWeight, nameColor, bodyColor } = o,
      bindings = { ...o.bindings, sender, body },
      available = Math.max(20, width - 54),
      parts = o.parts.map((p) => (window.ThemeKeyframes ? ThemeKeyframes.remember(p) : { ...p })),
      get = (id) => parts.find((p) => p.id === id),
      np = get('name'),
      bp = get('body'),
      sp = get('signal'),
      dp = get('divider'),
      baseWeight = bodyWeight ?? (main ? 600 : 400),
      nativeName = Math.max(15, fontSize * (main ? 0.96 : 0.76));
    const position = (p, x, y) => {
      p.layoutX = x;
      p.layoutY = y;
      p.x += p.placement === 'free' ? 0 : x;
      p.y += p.placement === 'free' ? 0 : y;
    };
    const text = (p, value, autoSize, autoColor, maxW, one = false) => {
      p.size = p.size || autoSize;
      p.weight = p.weight || baseWeight;
      p.color = p.color || autoColor;
      p.w = Math.max(12, Math.min(p.w || maxW, Math.max(12, available - p.x)));
      p.face = window.ThemeTypography?.family(p.font) || family;
      p.lineH = (p.size * (p.linePercent || lineHeight)) / 100;
      p.lineLimit = p.maxLines || (one ? 1 : 0);
      p.lines =
        one && !p.maxLines
          ? [ellipsis(value, p.w, p.size, p.weight, p.face)]
          : textLines(p, value, p.w, p.size, p.weight, !main, p.face, one ? 1 : 0);
      p.h = p.lines.length * p.lineH;
    };
    if (sp) {
      position(sp, 0, 3);
      sp.size = sp.size || (main ? 23 : 10);
      sp.w = sp.size;
      sp.h = (sp.size * Math.sqrt(3)) / 2;
    }
    if (np) {
      position(np, main ? 42 : 24, 0);
      text(
        np,
        window.ThemeBindings?.render(np, 'normal', bindings, sender) ?? sender,
        nativeName,
        nameColor || (main ? '#b8bcb5' : '#9ca89f'),
        available - np.x,
        true,
      );
      np.h = np.size + Math.max(0, np.lines.length - 1) * np.lineH;
    }
    const nameBottom = np?.visible ? np.y + np.h : 0;
    if (bp) {
      position(bp, main ? 42 : 0, nameBottom + (np?.visible ? 12 : 0));
      text(
        bp,
        window.ThemeBindings?.render(bp, 'normal', bindings, body) ?? body,
        fontSize,
        bodyColor || '#e5e8e0',
        available - bp.x,
      );
    }
    const expand = (value) =>
      window.ThemeBindings?.expand(value, bindings) ??
      String(value).replace(/\{(用户名|消息)\}/g, (_, key) => (key === '用户名' ? sender : body));
    for (const p of parts.filter((p) => !['signal', 'name', 'body', 'divider'].includes(p.id))) {
      position(p, 0, 0);
      if (p.kind === 'text')
        text(p, expand(p.text), fontSize, bodyColor || '#e5e8e0', available - p.x);
      else if (p.kind === 'signal') {
        p.size = p.size || (main ? 23 : 10);
        p.w = p.size;
        p.h = (p.size * Math.sqrt(3)) / 2;
      } else {
        p.w = p.w || available;
        p.color = p.color || (p.kind === 'shape' ? '#253129' : '#73877d');
        p.h = p.kind === 'line' ? p.strokeWidth : p.h;
      }
    }
    const contentBottom = Math.max(
        0,
        ...parts.filter((p) => p.visible && p.id !== 'divider').map((p) => p.y + p.h),
      ),
      height = contentBottom + 28;
    if (dp) {
      position(dp, 0, height - 14);
      dp.w = Math.max(0, Math.min(dp.w || available, available - dp.x));
      dp.h = dp.strokeWidth;
      dp.color = dp.color || (main ? '#73786d' : '#2a302c');
    }
    return {
      parts,
      main,
      lines: bp?.lines || [],
      fontSize,
      nameSize: np?.size || nativeName,
      lineH: bp?.lineH || (fontSize * lineHeight) / 100,
      height: Math.max(height, ...parts.filter((p) => p.visible).map((p) => p.y + p.h + 10)),
      contentWidth: available,
    };
  }
  function drawParts(c, x, y, age, model, motionTime = age, motionExit = -1) {
    const parentAlpha = c.globalAlpha;
    c.save();
    c.translate(x, y);
    c.textAlign = 'left';
    c.textBaseline = 'top';
    for (const p of model.parts) {
      const t = age - (p.delay || 0);
      if (!p.visible || t < 0) continue;
      c.save();
      const anim = window.ThemeKeyframes?.part(p, motionTime, motionExit) || {
        dx: 0,
        dy: 0,
        opacity: p.opacity,
      };
      c.globalAlpha = parentAlpha * anim.opacity;
      const px = p.x + anim.dx,
        py = p.y + anim.dy;
      if (p.kind === 'signal') {
        signal(c, px, py, t, p.size / 2, p.color, p.strokeWidth);
      } else if (p.kind === 'divider' || p.kind === 'line') {
        if (t >= 160 && p.strokeWidth > 0) {
          const extent = 1 - Math.pow(1 - sat((t - 160) / 60), 3);
          c.strokeStyle = p.color;
          c.lineWidth = p.strokeWidth;
          c.beginPath();
          c.moveTo(px, py);
          c.lineTo(px + p.w * extent, py);
          c.stroke();
        }
      } else if (p.kind === 'image') {
        window.ThemePartMedia?.draw(c, { ...p, x: px, y: py }, t);
      } else if (p.kind === 'shape') {
        if (t >= 45) {
          c.fillStyle = p.color;
          c.fillRect(px, py, p.w, p.h);
        }
      } else {
        c.beginPath();
        c.rect(px - 1, py - p.size, p.w + 2, p.h + p.size * 2);
        c.clip();
        font(c, p.size, p.weight, p.face);
        p.lines?.forEach((line, i) => {
          const begin = p.kind === 'name' ? 45 : 90 + Math.min(i * 15, 30);
          if (t < begin) return;
          c.fillStyle = t < begin + 45 ? '#89958b' : p.color;
          const dx =
            (p.w - c.measureText(line).width) *
            (p.align === 'center' ? 0.5 : p.align === 'right' ? 1 : 0);
          c.fillText(line, px + dx, py + i * p.lineH);
        });
      }
      c.restore();
    }
    c.restore();
  }
  function turn(age) {
    // A third-turn returns an equilateral triangle to its downward silhouette.
    const p = sat((age - 10) / 120),
      ease = p < 0.25 ? 8 * p * p * p : 1 - (Math.pow(1 - p, 2.15) * 0.875) / Math.pow(0.75, 2.15);
    return (sat(ease) * Math.PI * 2) / 3;
  }
  function signal(c, x, y, age, size = 5, color = '', strokeWidth = 1.6) {
    const h = size * Math.sqrt(3),
      angle = age >= 130 ? 0 : turn(age);
    c.save();
    c.translate(x + size, y + h / 3);
    c.rotate(angle);
    c.beginPath();
    c.moveTo(-size, -h / 3);
    c.lineTo(size, -h / 3);
    c.lineTo(0, (h * 2) / 3);
    c.closePath();
    c.lineWidth = strokeWidth;
    c.strokeStyle = color || (age < 30 ? '#385449' : age < 130 ? '#b6e8d7' : '#8ed4c4');
    c.stroke();
    c.restore();
  }
  function draw(c, { x = 0, y = 0, age = 220, model, motionTime = age, motionExit = -1 }) {
    if (model.parts) {
      drawParts(c, x, y, age, model, motionTime, motionExit);
      return;
    }
    const t = Math.max(0, age),
      m = model;
    c.save();
    c.textAlign = 'left';
    c.textBaseline = 'top';
    signal(c, x, y + 3, t, m.main ? 11.5 : 5);
    if (t >= 45) {
      font(c, m.nameSize, m.weight);
      c.fillStyle = t < 85 ? '#708177' : m.nameColor || (m.main ? '#b8bcb5' : '#9ca89f');
      c.fillText(m.name, x + (m.main ? 42 : 24), y);
    }
    font(c, m.fontSize, m.weight);
    m.lines.forEach((line, i) => {
      const begin = 90 + Math.min(i * 15, 30);
      if (t < begin) return;
      c.fillStyle = t < begin + 45 ? '#89958b' : m.bodyColor || '#e5e8e0';
      c.fillText(line, x + (m.indent || 0), y + m.nameSize + 12 + i * m.lineH);
    });
    if (t > 160) {
      const p = sat((t - 160) / 60),
        extent = 1 - Math.pow(1 - p, 3);
      c.beginPath();
      c.strokeStyle = m.main ? '#73786d' : '#2a302c';
      c.lineWidth = 1;
      c.moveTo(x, y + m.height - 14);
      c.lineTo(x + m.contentWidth * extent, y + m.height - 14);
      c.stroke();
    }
    c.restore();
  }
  function phase(t) {
    return t < 30
      ? '信号待入'
      : t < 90
        ? '三角转动 · 用户名显露'
        : t < 135
          ? '正文第一拍'
          : t < 160
            ? '正文第二拍'
            : t < 220
              ? '分隔线展开'
              : '记录落定';
  }
  window.NormalNotice = {
    measure,
    draw,
    phase,
    wrap,
    ellipsis,
    textLines,
    limitLines,
    duration: 220,
  };
})();
