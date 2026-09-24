/* SC parts are painted into the native refraction input, never above it. */
(() => {
  'use strict';
  const family = '"Microsoft YaHei","PingFang SC","Segoe UI",sans-serif',
    mc = document.createElement('canvas').getContext('2d');
  const setFont = (c, size, weight, face = family) => (c.font = weight + ' ' + size + 'px ' + face);
  const time = (n) => {
    n = Math.max(0, Math.ceil(n));
    return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  };
  function measure({ width, data, style, viewportHeight, halo }) {
    const parts = style.parts.map((p) =>
        window.ThemeKeyframes ? ThemeKeyframes.remember(p) : { ...p },
      ),
      get = (id) => parts.find((p) => p.id === id),
      base = style.fontSize || 28,
      pad = 18,
      inside = width - pad * 2,
      weight = style.bodyWeight || 600,
      linePercent = style.linePercent || 146;
    const position = (p, x, y) => {
      p.layoutX = x;
      p.layoutY = y;
      p.x += p.placement === 'free' ? 0 : x;
      p.y += p.placement === 'free' ? 0 : y;
    };
    const text = (p, value, x, y, size, maxWidth, color = '#f0f0e6', autoWeight = weight) => {
      if (!p) return;
      value = window.ThemeBindings?.render(p, 'sc', data, value) ?? value;
      position(p, x, y);
      p.size = p.size || size;
      p.weight = p.weight || autoWeight;
      p.color = p.color || color;
      p.w = Math.max(12, Math.min(p.w || maxWidth, width - pad - p.x));
      p.face = window.ThemeTypography?.family(p.font) || family;
      p.lineLimit = p.kind === 'body' ? 0 : p.maxLines || (p.kind === 'name' ? 3 : 0);
      p.lines =
        p.kind === 'body'
          ? NormalNotice.wrap(value, p.w, p.size, p.weight, false, p.face)
          : NormalNotice.textLines(
              p,
              value,
              p.w,
              p.size,
              p.weight,
              false,
              p.face,
              p.kind === 'name' ? 3 : 0,
            );
      p.lineH = (p.size * (p.linePercent || linePercent)) / 100;
      p.h = p.lines.length * p.lineH;
    };
    const signal = get('signal');
    if (signal) {
      position(signal, pad, 25);
      signal.w = signal.size || 16;
      signal.h = signal.w * 0.866;
      signal.color = signal.color || '#ee4d41';
    }
    text(get('label'), '异常通讯 / SC', pad + 32, 22, 19, inside - 32, '#f05245', 600);
    const amount = get('amount'),
      price =
        window.ThemeBindings?.render(amount, 'sc', data, '¥ ' + data.amount) ?? '¥ ' + data.amount;
    setFont(
      mc,
      amount?.size || base + 4,
      amount?.weight || 600,
      window.ThemeTypography?.family(amount?.font) || family,
    );
    const priceW = mc.measureText(price).width;
    const name = get('name'),
      stacked = width < 300;
    text(
      name,
      data.sender,
      pad,
      57,
      base + 1,
      stacked ? inside : Math.max(80, inside - priceW - 18),
      '#eff0e7',
    );

    const nameBottom = name?.visible ? name.y + name.h : 57;
    text(
      amount,
      price,
      stacked ? pad : width - pad - priceW,
      stacked ? nameBottom + 4 : 55,
      base + 4,
      priceW + 1,
      '#f3f1e8',
      600,
    );
    const body = get('body');
    text(
      body,
      data.body,
      pad,
      Math.max(nameBottom, amount?.visible ? amount.y + amount.h : 0) + 17,
      base + 1,
      inside,
    );
    const reading = SCReading.build(body?.visible ? body.lines : [''], {
      bodyY: body?.y || 80,
      lineHeight: body?.lineH || base * 1.46,
      viewportHeight,
      halo,
      enabled: true,
    });
    if (body) body.h = reading.rows * body.lineH;
    const expand = (text) =>
      window.ThemeBindings?.expand(text, data) ??
      String(text).replace(/\{(用户名|消息|金额)\}/g, (_, key) =>
        key === '用户名' ? data.sender : key === '金额' ? String(data.amount) : data.body,
      );
    for (const p of parts.filter(
      (p) =>
        ![
          'card',
          'signal',
          'label',
          'name',
          'amount',
          'body',
          'progress',
          'timer',
          'page',
        ].includes(p.id),
    )) {
      if (p.kind === 'text') text(p, expand(p.text), pad, 22, base, inside);
      else {
        position(p, pad, 22);
        p.w = p.w || inside;
        p.h = p.kind === 'line' ? p.strokeWidth : p.h;
        p.color = p.color || '#9caaa1';
      }
    }
    const page = get('page');
    if (page) {
      text(
        page,
        (data.page + 1 || 1) + ' / ' + reading.pages.length,
        width - pad - 60,
        25,
        13,
        60,
        '#a5a999',
        500,
      );
      page.requestedVisible = page.visible;
      page.visible = page.requestedVisible && (reading.pages.length > 1 || page.template !== null);
    }
    const card = get('card');
    let height = Math.max(
      reading.height,
      card?.h || 0,
      ...parts
        .filter((p) => p.visible && !['card', 'progress', 'timer', 'page'].includes(p.id))
        .map((p) => p.y + p.h + 57),
    );
    const progress = get('progress');
    if (progress) {
      position(progress, pad, height - 27);
      progress.w = Math.max(0, Math.min(progress.w || inside - 77, width - pad - progress.x));
      progress.h = progress.strokeWidth;
      progress.color = progress.color || '#f1493c';
    }
    const timer = get('timer');
    text(
      timer,
      '00:00',
      progress ? progress.x + progress.w + 17 : width - pad - 60,
      progress ? progress.y - 7 : height - 34,
      13,
      60,
      '#ef5145',
      500,
    );
    height = Math.max(
      height,
      ...parts
        .filter((p) => p.visible && ['timer', 'progress'].includes(p.kind))
        .map((p) => p.y + p.h + 12),
    );
    if (card) {
      position(card, 0, 0);
      card.w = card.w || width;
      card.h = card.h || height;
      card.color = card.color || '#141614';
    }
    const p = get('progress'),
      progressSpec =
        p?.visible && p.strokeWidth > 0
          ? {
              x: p.x,
              y: p.y,
              width: p.w,
              height: p.strokeWidth,
              color: p.color,
              opacity: p.opacity,
              delay: p.delay,
              duration: data.duration,
            }
          : null;
    return {
      width,
      height,
      parts,
      reading,
      bodyY: body?.y || 80,
      nameBand: name?.visible ? [name.y - 4, name.y + name.h] : [0, 0],
      progress: progressSpec,
      mediaEnd: Math.max(
        0,
        ...parts
          .filter((p) => p.visible && p.kind === 'image')
          .map((p) => 520 + p.delay + (p.imageMode === 'evidence' ? 595 : 220)),
      ),
      maxDelay: Math.max(0, ...parts.filter((p) => p.visible).map((p) => p.delay || 0)),
    };
  }
  const textSource = (p) => p.template ?? (p.kind === 'text' ? p.text : null);
  function dynamicSource(p) {
    const source = textSource(p);
    return typeof source === 'string' && /\{(?:剩余时间|页码|页数|序号|总数)\}/.test(source)
      ? source
      : null;
  }
  function dynamicRows(p, data) {
    const value = ThemeBindings.expand(textSource(p), data);
    if (value !== p.liveValue) {
      p.liveValue = value;
      p.liveLines =
        p.kind === 'body'
          ? NormalNotice.wrap(value, p.w, p.size, p.weight, false, p.face)
          : NormalNotice.textLines(p, value, p.w, p.size, p.weight, false, p.face, p.lineLimit);
    }
    return p.liveLines;
  }
  function refreshDynamicBody(layout, data, remaining) {
    const body = layout.parts.find((p) => p.kind === 'body' && p.visible);
    if (!body || dynamicSource(body) === null || !window.ThemeBindings) return;
    const reading = layout.reading;
    // Dynamic counters do not resize the card. Reuse its measured rows and page
    // through any additional wrapped lines using the normal native SC reader.
    for (let pass = 0; pass < 2; pass++) {
      const lines = dynamicRows(body, { ...data, remaining, pages: reading.pages.length }),
        rows = Math.max(1, reading.rows),
        pages = [];
      for (let at = 0; at < lines.length; at += rows) pages.push(lines.slice(at, at + rows));
      if (!pages.length) pages.push(['']);
      const count = reading.pages.length;
      reading.pages = pages;
      reading.durations = pages.map((p) =>
        Math.min(12000, Math.max(6500, 2500 + Array.from(p.join('')).length * 75)),
      );
      reading.cycle = reading.durations.reduce((sum, n) => sum + n, 0);
      if (count === pages.length) break;
    }
  }
  function paint(c, r, layout, data, remaining, age, motionTime = age, motionExit = -1) {
    refreshDynamicBody(layout, data, remaining);
    const pagePart = layout.parts.find((p) => p.id === 'page');
    if (pagePart)
      pagePart.visible =
        pagePart.requestedVisible &&
        (layout.reading.pages.length > 1 || pagePart.template !== null);
    data = { ...data, page: (data.page || 0) % Math.max(1, layout.reading.pages.length) };
    const bindingData = { ...data, remaining, pages: layout.reading.pages.length };
    c.save();
    c.translate(r.x, r.y);
    c.textAlign = 'left';
    c.textBaseline = 'top';
    for (const p of layout.parts) {
      if (!p.visible || (p.delay > 0 && age < 520 + p.delay)) continue;
      c.save();
      const anim = window.ThemeKeyframes?.part(p, motionTime, motionExit) || {
        dx: 0,
        dy: 0,
        opacity: p.opacity,
      };
      c.translate(anim.dx, anim.dy);
      c.globalAlpha *= anim.opacity;
      if (p.kind === 'card') {
        c.fillStyle = p.color;
        c.fillRect(p.x, p.y, p.w, p.h);
        const g = c.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
        g.addColorStop(0, '#ffffff02');
        g.addColorStop(1, '#0000000a');
        c.fillStyle = g;
        c.fillRect(p.x, p.y, p.w, p.h);
      } else if (p.kind === 'signal' && p.strokeWidth > 0) {
        c.strokeStyle = p.color;
        c.lineWidth = p.strokeWidth;
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(p.x + p.w, p.y);
        c.lineTo(p.x + p.w * 0.5, p.y + p.h);
        c.closePath();
        c.stroke();
      } else if (p.kind === 'progress' && p.strokeWidth > 0) {
        c.strokeStyle = '#30372f';
        c.lineWidth = p.strokeWidth;
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(p.x + p.w, p.y);
        c.stroke();
      } else if (p.kind === 'image') {
        window.ThemePartMedia?.draw(c, p, Math.max(0, age - 520 - (p.delay || 0)));
      } else if (p.kind === 'line' || p.kind === 'shape') {
        c.fillStyle = p.color;
        c.fillRect(p.x, p.y, p.w, p.h);
      } else {
        setFont(c, p.size, p.weight, p.face);
        c.fillStyle = p.color;
        let rows =
          p.kind === 'body'
            ? layout.reading.pages[(data.page || 0) % layout.reading.pages.length] || []
            : p.kind === 'timer'
              ? [time(remaining)]
              : p.kind === 'page'
                ? [(data.page || 0) + 1 + ' / ' + layout.reading.pages.length]
                : p.lines || [];
        if (p.kind !== 'body' && typeof textSource(p) === 'string' && window.ThemeBindings) {
          rows = dynamicRows(p, bindingData);
        }
        if (p.kind === 'label' && p.template === null && data.count > 1)
          rows = ['异常通讯 / SC ' + data.index + '/' + data.count];
        c.beginPath();
        c.rect(p.x - 1, p.y - 2, p.w + 2, p.h + 5);
        c.clip();
        rows.forEach((s, i) => {
          const dx =
            (p.w - c.measureText(s).width) *
            (p.align === 'center' ? 0.5 : p.align === 'right' ? 1 : 0);
          c.fillText(s, p.x + dx, p.y + i * p.lineH);
        });
      }
      c.restore();
    }
    c.restore();
  }
  window.SCComponentParts = { measure, paint };
})();
