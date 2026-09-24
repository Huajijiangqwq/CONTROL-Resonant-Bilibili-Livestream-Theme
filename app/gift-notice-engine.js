/* Shared, deterministic 800 ms dossier renderer. The evidence photograph is
   sampled from the approved concept; text and all motion are drawn live. */
(() => {
  'use strict';
  const family = '"Microsoft YaHei","PingFang SC","Segoe UI",sans-serif';
  const sat = (v) => Math.max(0, Math.min(1, v)),
    lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, t) => {
    const x = sat((t - a) / (b - a));
    return x * x * (3 - 2 * x);
  };
  // Hold authored exposures; only the dossier steps, never the surrounding feed.
  const stops = [0, 55, 90, 170, 240, 315, 400, 480, 580, 660, 735, 800];
  function held(t, frames = stops) {
    let frame = 0;
    for (const stop of frames) {
      if (t < stop) break;
      frame = stop;
    }
    return frame;
  }
  const make = (w, h = w) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const metrics = make(1).getContext('2d'),
    photoFrames = [],
    paper = make(160),
    grain = make(192);
  let ready = false,
    failed = false;
  let segmenter;
  try {
    segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
  } catch {}
  const letters = (t) =>
    segmenter ? Array.from(segmenter.segment(String(t)), (x) => x.segment) : Array.from(String(t));
  const font = (c, size, weight = 400, face = family) => {
    c.font = weight + ' ' + size + 'px ' + face;
  };
  function cut(text, width, size, weight = 400) {
    font(metrics, size, weight);
    const a = letters(text);
    if (metrics.measureText(a.join('')).width <= width) return a.join('');
    while (a.length && metrics.measureText(a.join('') + '…').width > width) a.pop();
    return a.join('') + '…';
  }
  function lines(text, width, size, weight = 400) {
    font(metrics, size, weight);
    const out = [];
    let row = '';
    for (const ch of letters(String(text).replace(/[\r\n]+/g, ' '))) {
      if (row && metrics.measureText(row + ch).width > width) {
        out.push(row);
        row = ch;
      } else row += ch;
    }
    out.push(row);
    return out.length > 2 ? [out[0], cut(out.slice(1).join(''), width, size, weight)] : out;
  }
  // A flowing SC redraws nearby dossiers. Reuse their text layout until names change;
  // weak keys let removed messages be collected without retaining their contents.
  const layoutCache = new WeakMap();
  function buildModel(giftName, sender, main) {
    if (main) {
      const title = lines(giftName, 330, 38, 700),
        senderLines = lines('赠送者：' + sender, 330, 27, 600),
        first = 88 + (title.length - 1) * 45,
        quantity = first + senderLines.length * 34 + 12,
        value = quantity + 40,
        note = value + 52;
      return { title, senderLines, first, quantity, value, note, height: Math.max(312, note + 44) };
    }
    const title = lines(giftName, 330, 28, 700),
      senderLines = lines('赠送者：' + sender, 330, 19),
      extra = (title.length - 1) * 34;
    const heading = 68 + extra,
      first = 105 + extra,
      quantity = first + senderLines.length * 27 + 7,
      value = quantity + 30,
      note = value + 47;
    return { title, senderLines, heading, first, quantity, value, note, height: note + 35 };
  }
  function model(data = {}, main = false) {
    const giftName = String(data.giftName || '礼物名称').trim() || '礼物名称',
      sender = String(data.sender || '观众').trim() || '观众';
    const cacheable = typeof data === 'object' || typeof data === 'function',
      key = main ? 1 : 0,
      entries = cacheable ? layoutCache.get(data) : undefined,
      entry = entries?.[key];
    if (entry && entry.giftName === giftName && entry.sender === sender) return entry.layout;
    const layout = buildModel(giftName, sender, main);
    if (cacheable) {
      const next = entries || [];
      next[key] = { giftName, sender, layout };
      layoutCache.set(data, next);
    }
    return layout;
  }
  function noise(canvas, seed, amount) {
    const c = canvas.getContext('2d'),
      p = c.createImageData(canvas.width, canvas.height);
    let n = seed;
    for (let i = 0; i < p.data.length; i += 4) {
      n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
      const v = n >>> 24;
      p.data[i] = p.data[i + 1] = p.data[i + 2] = v;
      p.data[i + 3] = amount;
    }
    c.putImageData(p, 0, 0);
  }
  noise(paper, 715, 13);
  noise(grain, 904, 90);
  // Solve a cubic Bezier time curve: a short hold, fast uncover, firm settle.
  function uncover(a, b, t) {
    const p = sat((t - a) / (b - a));
    if (p === 0 || p === 1) return p;
    const cubic = (u, v1, v2) =>
      3 * (1 - u) * (1 - u) * u * v1 + 3 * (1 - u) * u * u * v2 + u * u * u;
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (cubic(mid, 0.45, 0.12) < p) lo = mid;
      else hi = mid;
    }
    return cubic((lo + hi) / 2, 0, 1);
  }
  function ink(
    c,
    text,
    x,
    y,
    size,
    weight,
    age,
    start,
    end,
    maskAt = 100,
    underline = false,
    inkColor = '#151615',
    face = family,
  ) {
    if (age < maskAt) return;
    font(c, size, weight, face);
    const w = c.measureText(text).width,
      h = size * 1.14,
      p = uncover(start, end, age);
    c.fillStyle = inkColor;
    c.save();
    c.beginPath();
    c.rect(x - 1, y - 2, w * p + 1, h + 8);
    c.clip();
    c.fillText(text, x, y);
    if (underline) {
      c.fillRect(x, y + size + 5, w, 1.3);
    }
    c.restore();
    if (p < 1) {
      const left = x + w * p;
      c.fillStyle = '#101211';
      c.fillRect(left, y + 2, Math.max(0, w * (1 - p)), size * 0.84);
    }
  }
  function changingInk(
    c,
    text,
    old,
    x,
    y,
    age,
    start,
    end,
    updateAge,
    size = 19,
    weight = 400,
    inkColor = '#151615',
    face = family,
  ) {
    if (updateAge >= 0 && age >= 800) {
      if (updateAge < 65) {
        font(c, size, weight, face);
        c.fillStyle = inkColor;
        c.fillText(old, x, y);
        c.fillStyle = '#111311';
        c.fillRect(x, y + 2, c.measureText(text).width * smooth(0, 65, updateAge), size * 0.84);
      } else ink(c, text, x, y, size, weight, updateAge, 90, 320, 0, false, inkColor, face);
    } else ink(c, text, x, y, size, weight, age, start, end, 220, false, inkColor, face);
  }
  function buildPhoto(img) {
    const base = make(288),
      bc = base.getContext('2d');
    bc.drawImage(img, img.width*813/1254, img.height*544/1254, img.width*331/1254, img.height*322/1254, 0, 0, 288, 288);
    for (let i = 0; i < 9; i++) {
      const frame = make(288),
        c = frame.getContext('2d'),
        p = i / 8,
        tiny = make(Math.round(lerp(17, 288, p * p)));
      tiny.getContext('2d').drawImage(base, 0, 0, tiny.width, tiny.height);
      c.fillStyle = '#181a19';
      c.fillRect(0, 0, 288, 288);
      if (i) {
        c.filter =
          'grayscale(1) blur(' +
          ((1 - p) * (1 - p) * 7).toFixed(2) +
          'px) brightness(' +
          lerp(0.27, 1, p).toFixed(3) +
          ') contrast(' +
          lerp(1.5, 1, p).toFixed(3) +
          ')';
        c.drawImage(tiny, 0, 0, 288, 288);
        c.filter = 'none';
      }
      photoFrames.push(frame);
    }
  }
  const source = new Image();
  const loading = new Promise((resolve) => {
    source.onload = () => {
      try {
        buildPhoto(source);
        ready = true;
        resolve(true);
      } catch {
        failed = true;
        resolve(false);
      }
    };
    source.onerror = () => {
      failed = true;
      resolve(false);
    };
    source.src = 'gift-evidence-source.png';
  });
  function evidence(c, age) {
    const x = 385,
      y = 24,
      size = 190;
    if (age < 65) return;
    c.fillStyle = '#1a1c1b';
    c.fillRect(x, y, size, size);
    if (ready) {
      const i = Math.round(smooth(150, 595, age) * 8);
      c.drawImage(photoFrames[i], x, y, size, size);
    } else {
      c.save();
      c.globalAlpha *= smooth(180, 520, age);
      c.strokeStyle = '#7b7e77';
      c.lineWidth = 1;
      c.strokeRect(x + 48, y + 63, 94, 72);
      c.beginPath();
      c.moveTo(x + 48, y + 63);
      c.lineTo(x + 70, y + 45);
      c.lineTo(x + 156, y + 45);
      c.lineTo(x + 142, y + 63);
      c.moveTo(x + 142, y + 135);
      c.lineTo(x + 156, y + 115);
      c.lineTo(x + 156, y + 45);
      c.stroke();
      c.restore();
    }
    if (age < 640) {
      c.save();
      c.globalAlpha *= 0.34 * (1 - smooth(230, 640, age));
      c.beginPath();
      c.rect(x, y, size, size);
      c.clip();
      const offset = Math.floor(age / 34) % 4;
      c.drawImage(grain, x - offset * 2, y - offset * 2, size + 8, size + 8);
      c.restore();
    }
  }
  function compactModel(width, data) {
    const title = lines(data.giftName || '礼物', width - 98, 27, 700),
      sender = lines('赠送者：' + (data.sender || '观众'), width - 26, 21, 600);
    const senderY = 20 + Math.max(title.length * 33, 62) + 12,
      quantityY = senderY + sender.length * 28 + 8;
    const value = lines(
      data.coinType === 'silver'
        ? '价值：免费礼物'
        : '价值：' + String(data.value ?? 1000) + ' 电池',
      width - 26,
      22,
      600,
    );
    return {
      title,
      sender,
      senderY,
      quantityY,
      value,
      height: quantityY + 34 + value.length * 29 + 20,
    };
  }
  function drawCompact(
    c,
    { x = 0, y = 0, width = 226, age = 800, data = {}, updateAge = -1, previous = {} },
  ) {
    const g = compactModel(width, data),
      t = held(Math.max(0, age));
    c.save();
    c.translate(x, y);
    c.textAlign = 'left';
    c.textBaseline = 'top';
    if (t < 55) {
      c.strokeStyle = '#aab3a044';
      c.strokeRect(0, 0, width, g.height);
      c.restore();
      return;
    }
    const exposure = smooth(34, 90, t);
    c.fillStyle = `rgb(${22 + 211 * exposure},${24 + 209 * exposure},${23 + 203 * exposure})`;
    c.fillRect(0, 0, width, g.height);
    c.save();
    c.globalAlpha = 0.48;
    c.fillStyle = c.createPattern(paper, 'repeat');
    c.fillRect(0, 0, width, g.height);
    c.restore();
    g.title.forEach((s, i) =>
      ink(c, s, 13, 15 + i * 33, 27, 700, t, 170 + i * 12, 315 + i * 12, 80),
    );
    const photoY = 18;
    if (t >= 90) {
      c.save();
      c.translate(width - 75 - 385 * (62 / 190), photoY - 24 * (62 / 190));
      c.scale(62 / 190, 62 / 190);
      evidence(c, t);
      c.restore();
    }
    g.sender.forEach((s, i) =>
      ink(c, s, 13, g.senderY + i * 28, 21, 600, t, 315 + i * 16, 438 + i * 16, 205),
    );
    changingInk(
      c,
      '数量：' + (data.quantity ?? 10),
      '数量：' + (previous.quantity ?? data.quantity ?? 10),
      13,
      g.quantityY,
      t,
      420,
      555,
      updateAge,
      22,
      600,
    );
    g.value.forEach((s, i) => ink(c, s, 13, g.quantityY + 34 + i * 29, 22, 600, t, 525, 685, 220));
    c.restore();
  }

  function partsModel(width, data, style) {
    const parts = style.parts.map((p) =>
        window.ThemeKeyframes ? ThemeKeyframes.remember(p) : { ...p },
      ),
      find = (id) => parts.find((p) => p.id === id),
      pad = style.paperPadding ?? 16,
      base = style.fontSize ?? 20,
      titleSize = style.titleSize ?? 26;
    const position = (p, x, y) => {
      p.layoutX = x;
      p.layoutY = y;
      p.x += p.placement === 'free' ? 0 : x;
      p.y += p.placement === 'free' ? 0 : y;
    };
    const value = (key) =>
      ({
        用户名: data.sender || '观众',
        消息: data.giftName || '礼物',
        礼物: data.giftName || '礼物',
        数量: String(data.quantity ?? 10),
        价值: data.coinType === 'silver' ? '免费' : String(data.value ?? 1000) + ' 电池',
      })[key];
    const expand = (text) =>
      window.ThemeBindings?.expand(text, { ...data, body: data.giftName || '礼物' }) ??
      String(text).replace(/\{(用户名|消息|礼物|数量|价值)\}/g, (_, k) => value(k));
    const text = (p, value, x, y, size, autoWidth) => {
      if (!p) return;
      value = window.ThemeBindings?.render(p, 'gift', data, value) ?? value;
      position(p, x, y);
      p.size = p.size || size;
      p.weight = p.weight || (['title'].includes(p.kind) ? 700 : 600);
      p.color = p.color || style.inkColor || '#151615';
      p.w = Math.max(12, Math.min(p.w || autoWidth, width - pad - p.x));
      p.face = window.ThemeTypography?.family(p.font) || family;
      p.lineLimit = p.maxLines || 0;
      p.lines = NormalNotice.textLines(p, value, p.w, p.size, p.weight, false, p.face);
      p.lineH = (p.size * (p.linePercent || 140)) / 100;
      p.h = p.lines.length * p.lineH;
    };
    const bottom = (p) => (p?.visible ? p.y + p.h : pad);
    const photo = find('photo');
    if (photo) {
      photo.w = photo.size || photo.w || Math.min(style.photoSize || 110, width * 0.38);
      photo.w = Math.min(photo.w, width - pad * 2);
      photo.h = photo.w;
      position(photo, width - pad - photo.w, pad);
    }
    const title = find('title'),
      right = photo?.visible ? photo.x - 18 : width - pad;
    text(title, data.giftName || '礼物', pad, pad, titleSize, Math.max(40, right - pad));
    const name = find('name'),
      stacked = width < 360;
    text(
      name,
      '赠送者：' + value('用户名'),
      pad,
      Math.max(bottom(title), stacked ? bottom(photo) : pad) + 12,
      base,
      stacked ? width - pad * 2 : Math.max(40, right - pad),
    );
    const quantity = find('quantity');
    text(quantity, '数量：' + value('数量'), pad, bottom(name) + 9, base, width - pad * 2);
    const val = find('value');
    text(
      val,
      data.coinType === 'silver' ? '价值：免费礼物' : '价值：' + value('价值'),
      pad,
      bottom(quantity) + 6,
      base,
      width - pad * 2,
    );
    const note = find('note');
    text(note, '备注：', pad, bottom(val) + 12, base, width - pad * 2);
    if (note && !note.template) {
      note.w = Math.min(note.w, Math.max(90, note.size * 3.2 + 90));
      note.h = note.size * 1.2;
    }
    for (const p of parts.filter(
      (p) => !['paper', 'photo', 'title', 'name', 'quantity', 'value', 'note'].includes(p.id),
    )) {
      if (p.kind === 'text') text(p, expand(p.text), pad, pad, base, width - pad * 2);
      else {
        position(p, pad, pad);
        p.w = p.w || width - pad * 2;
        p.h = p.kind === 'line' ? p.strokeWidth : p.h;
        p.color = p.color || '#151615';
      }
    }
    const autoHeight = Math.max(
        pad * 2,
        ...parts.filter((p) => p.visible && p.id !== 'paper').map((p) => p.y + p.h + pad),
      ),
      paperPart = find('paper');
    if (paperPart) {
      position(paperPart, 0, 0);
      paperPart.w = paperPart.w || width;
      paperPart.h = paperPart.h || autoHeight;
      paperPart.fill = paperPart.color || style.paperColor || '#e9e9e2';
    }
    const height = Math.max(
      32,
      ...parts.filter((p) => p.visible).map((p) => p.y + p.h + (p.kind === 'paper' ? 0 : pad)),
    );
    return { parts, height, pad, size: base, photo: photo?.w || 0 };
  }
  function drawParts(
    c,
    {
      x = 0,
      y = 0,
      width = 440,
      age = 800,
      motionTime = age,
      motionExit = -1,
      data = {},
      style = {},
      updateAge = -1,
      previous = {},
    },
  ) {
    const g = responsiveModel(width, data, style);
    c.save();
    c.translate(x, y);
    c.textAlign = 'left';
    c.textBaseline = 'top';
    for (const p of g.parts) {
      const t = held(age - (p.delay || 0));
      if (!p.visible || age < (p.delay || 0)) continue;
      c.save();
      const anim = window.ThemeKeyframes?.part(p, motionTime, motionExit) || {
        dx: 0,
        dy: 0,
        opacity: p.opacity,
      };
      c.translate(anim.dx, anim.dy);
      c.globalAlpha *= anim.opacity;
      if (p.kind === 'paper') {
        if (t < 34) {
          c.strokeStyle = '#acafa044';
          c.lineWidth = 0.7;
          c.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
        } else {
          c.globalAlpha *= smooth(34, 76, t);
          c.fillStyle = p.fill;
          c.fillRect(p.x, p.y, p.w, p.h);
          c.globalAlpha *= 0.48;
          c.fillStyle = c.createPattern(paper, 'repeat');
          c.fillRect(p.x, p.y, p.w, p.h);
        }
      } else if (p.kind === 'photo' && p.src) {
        window.ThemePartMedia?.draw(c, p, t, 'evidence');
      } else if (p.kind === 'image') {
        window.ThemePartMedia?.draw(c, p, t);
      } else if (p.kind === 'photo') {
        c.translate(p.x - (385 * p.w) / 190, p.y - (24 * p.w) / 190);
        c.scale(p.w / 190, p.w / 190);
        evidence(c, t);
      } else if (p.kind === 'shape' || p.kind === 'line') {
        if (t >= 230) {
          c.fillStyle = p.color;
          c.fillRect(p.x, p.y, p.w, p.h);
        }
      } else {
        const times = {
            title: [170, 315, 80],
            name: [315, 438, 205],
            quantity: [420, 555, 220],
            value: [525, 685, 220],
            note: [370, 480, 230],
            text: [315, 525, 220],
          },
          [start, end, mask] = times[p.kind] || times.text;
        c.beginPath();
        c.rect(p.x - 1, p.y - 2, p.w + 2, p.h + 5);
        c.clip();
        p.lines.forEach((line, i) => {
          font(c, p.size, p.weight, p.face);
          const px =
            p.x +
            (p.w - c.measureText(line).width) *
              (p.align === 'center' ? 0.5 : p.align === 'right' ? 1 : 0);
          if (p.kind === 'value' && p.lines.length === 1)
            changingInk(
              c,
              line,
              window.ThemeBindings?.render(
                p,
                'gift',
                { ...data, ...previous },
                data.coinType === 'silver'
                  ? '价值：免费礼物'
                  : '价值：' + String(previous.value ?? data.value ?? 1000) + ' 电池',
              ) ?? line,
              px,
              p.y + i * p.lineH,
              t,
              start,
              end,
              updateAge,
              p.size,
              p.weight,
              p.color,
              p.face,
            );
          else if (p.kind === 'quantity' && p.lines.length === 1)
            changingInk(
              c,
              line,
              window.ThemeBindings?.render(
                p,
                'gift',
                { ...data, ...previous },
                '数量：' + String(previous.quantity ?? data.quantity ?? 10),
              ) ?? line,
              px,
              p.y + i * p.lineH,
              t,
              start,
              end,
              updateAge,
              p.size,
              p.weight,
              p.color,
              p.face,
            );
          else
            ink(
              c,
              line,
              px,
              p.y + i * p.lineH,
              p.size,
              p.weight,
              t,
              start + i * 12,
              end + i * 12,
              mask,
              false,
              p.color,
              p.face,
            );
        });
        if (p.kind === 'note' && t >= 230) {
          c.fillStyle = p.color;
          font(c, p.size, p.weight, p.face);
          const left = c.measureText(p.lines[0] || '').width + 4;
          c.fillRect(p.x + left, p.y + 2, Math.max(0, Math.min(90, p.w - left)), p.size);
        }
      }
      c.restore();
    }
    c.restore();
  }

  function responsiveModel(width, data, style = {}) {
    if (style.parts?.length) return partsModel(width, data, style);
    const pad = style.paperPadding ?? 16,
      size = style.fontSize ?? 20,
      titleSize = style.titleSize ?? 26,
      photo = Math.min(style.photoSize ?? 110, width * 0.38),
      stacked = width < 360,
      gap = 18;
    const textW = Math.max(70, width - pad * 2 - photo - gap),
      bodyW = stacked ? width - pad * 2 : textW,
      title = lines(data.giftName || '礼物', textW, titleSize, 700),
      titleH = title.length * (titleSize + 5);
    const sender = lines('赠送者：' + (data.sender || '观众'), bodyW, size, 600),
      senderY = pad + (stacked ? Math.max(titleH, photo) : titleH) + 15,
      lineH = size * 1.4,
      quantityY = senderY + sender.length * lineH + 9;
    const value = lines(
        data.coinType === 'silver'
          ? '价值：免费礼物'
          : '价值：' + String(data.value ?? 1000) + ' 电池',
        bodyW,
        size,
        600,
      ),
      valueY = quantityY + lineH + 6,
      noteY = valueY + value.length * lineH + 12;
    return {
      pad,
      size,
      titleSize,
      photo,
      textW,
      bodyW,
      title,
      sender,
      senderY,
      lineH,
      quantityY,
      value,
      valueY,
      noteY,
      height: Math.max(noteY + size + pad, pad * 2 + photo),
    };
  }
  function drawResponsive(c, options) {
    if (options.style.parts?.length) {
      drawParts(c, options);
      return;
    }
    return drawResponsiveLegacy(c, options);
  }
  function drawResponsiveLegacy(
    c,
    { x = 0, y = 0, width = 440, age = 800, data = {}, style = {}, updateAge = -1, previous = {} },
  ) {
    const g = responsiveModel(width, data, style),
      t = held(Math.max(0, age));
    c.save();
    c.translate(x, y);
    c.textAlign = 'left';
    c.textBaseline = 'top';
    if (t < 34) {
      c.strokeStyle = '#acafa044';
      c.lineWidth = 0.7;
      c.strokeRect(0.5, 0.5, width - 1, g.height - 1);
      c.restore();
      return;
    }
    const reveal = smooth(34, 76, t);
    c.globalAlpha = reveal;
    c.fillStyle = style.paperColor || '#e9e9e2';
    c.fillRect(0, 0, width, g.height);
    c.globalAlpha = reveal * 0.48;
    c.fillStyle = c.createPattern(paper, 'repeat');
    c.fillRect(0, 0, width, g.height);
    c.globalAlpha = 1;
    c.save();
    c.translate(width - g.pad - g.photo - (385 * g.photo) / 190, g.pad - (24 * g.photo) / 190);
    c.scale(g.photo / 190, g.photo / 190);
    evidence(c, t);
    c.restore();
    g.title.forEach((text, i) =>
      ink(
        c,
        text,
        g.pad,
        g.pad + i * (g.titleSize + 5),
        g.titleSize,
        700,
        t,
        170 + i * 12,
        315 + i * 12,
        80,
      ),
    );
    g.sender.forEach((text, i) =>
      ink(c, text, g.pad, g.senderY + i * g.lineH, g.size, 600, t, 315 + i * 16, 438 + i * 16, 205),
    );
    changingInk(
      c,
      '数量：' + String(data.quantity ?? 10),
      '数量：' + String(previous.quantity ?? data.quantity ?? 10),
      g.pad,
      g.quantityY,
      t,
      420,
      555,
      updateAge,
      g.size,
      600,
    );
    g.value.forEach((text, i) =>
      ink(c, text, g.pad, g.valueY + i * g.lineH, g.size, 600, t, 525, 685, 220),
    );
    ink(c, '备注：', g.pad, g.noteY, g.size, 600, t, 370, 480, 230);
    if (t >= 230) {
      c.fillStyle = '#101211';
      c.fillRect(g.pad + g.size * 3.2, g.noteY + 2, Math.min(90, g.bodyW - g.size * 3.4), g.size);
    }
    c.restore();
  }
  function draw(c, options) {
    if (options.style) {
      drawResponsive(c, options);
      return;
    }
    if (options.compact) {
      drawCompact(c, options);
      return;
    }
    const {
        x = 0,
        y = 0,
        width = 440,
        age = 800,
        data = {},
        updateAge = -1,
        previous = {},
        main = false,
      } = options,
      g = model(data, main),
      s = width / 600,
      t = held(Math.max(0, age)),
      ut = updateAge < 0 ? -1 : held(updateAge, [0, 45, 95, 160, 230, 320, 340]);
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.textAlign = 'left';
    c.textBaseline = 'top';
    if (t < 34) {
      c.strokeStyle = 'rgba(198,202,188,' + (0.03 + sat(t / 34) * 0.09) + ')';
      c.lineWidth = 0.7;
      c.strokeRect(0.5, 0.5, 599, g.height - 1);
      c.restore();
      return;
    }
    // A single local exposure settles to paper. Geometry never moves or deforms.
    const density = smooth(34, 76, t),
      flash = smooth(48, 82, t) * (1 - smooth(90, 175, t));
    c.fillStyle =
      'rgb(' +
      Math.round(lerp(22, 233, density) + flash * 17) +
      ',' +
      Math.round(lerp(24, 233, density) + flash * 17) +
      ',' +
      Math.round(lerp(23, 226, density) + flash * 18) +
      ')';
    c.fillRect(0, 0, 600, g.height);
    c.save();
    c.globalAlpha = density * 0.48;
    c.fillStyle = c.createPattern(paper, 'repeat');
    c.fillRect(0, 0, 600, g.height);
    c.restore();
    if (main) {
      c.save();
      c.translate(0, 12);
      evidence(c, t);
      c.restore();
    } else evidence(c, t);
    g.title.forEach((line, i) =>
      ink(
        c,
        line,
        25,
        21 + i * (main ? 45 : 34),
        main ? 38 : 28,
        700,
        t,
        170 + i * 12,
        315 + i * 12,
        80,
      ),
    );
    if (!main) ink(c, '异化物信息', 25, g.heading, 18, 400, t, 230, 345, 190, true);
    g.senderLines.forEach((line, i) =>
      ink(
        c,
        line,
        25,
        g.first + i * (main ? 34 : 27),
        main ? 27 : 19,
        main ? 600 : 400,
        t,
        315 + i * 16,
        438 + i * 16,
        205,
      ),
    );
    const quantity = '数量：' + String(data.quantity ?? 10),
      value =
        data.coinType === 'silver'
          ? '价值：免费礼物'
          : '价值：' + String(data.value ?? 1000) + ' 电池';
    changingInk(
      c,
      quantity,
      '数量：' + String(previous.quantity ?? data.quantity ?? 10),
      25,
      g.quantity,
      t,
      420,
      555,
      ut,
      main ? 27 : 19,
      main ? 600 : 400,
    );
    changingInk(
      c,
      value,
      data.coinType === 'silver'
        ? '价值：免费礼物'
        : '价值：' + String(previous.value ?? data.value ?? 1000) + ' 电池',
      25,
      g.value,
      t,
      525,
      685,
      ut,
      main ? 27 : 19,
      main ? 600 : 400,
    );
    ink(c, '备注：', 25, g.note, main ? 26 : 18, main ? 600 : 400, t, 370, 480, 230);
    if (t >= 230) {
      c.fillStyle = '#101211';
      c.fillRect(main ? 117 : 88, g.note + 2, main ? 135 : 64, main ? 27 : 19);
      if (!main) c.fillRect(160, g.note + 2, 78, 19);
    }
    c.restore();
  }
  function phase(t) {
    return t < 34
      ? '纸面轮廓'
      : t < 160
        ? '局部曝光'
        : t < 315
          ? '标题揭开'
          : t < 500
            ? '物证显影'
            : t < 800
              ? '字段展开'
              : '档案落定';
  }
  window.GiftNotice = {
    draw,
    phase,
    model,
    loading,
    get ready() {
      return ready;
    },
    get failed() {
      return failed;
    },
    duration: 800,
    responsiveModel,
    height: (width, data, main = false, compact = false, style = null) =>
      style
        ? responsiveModel(width, data, style).height
        : compact
          ? compactModel(width, data).height
          : (model(data, main).height * width) / 600,
  };
})();
