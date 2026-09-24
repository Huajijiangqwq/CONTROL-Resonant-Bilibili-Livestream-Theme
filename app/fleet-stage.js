/* Full-screen split-layout notice. The original reference is 2558 x 1436:
   its badge axis is x=1279.5, outer triangle top y=257, title y=493.5.
   Keep that composition while allowing the signal pass to cross the canvas. */
(() => {
  'use strict';
  const scale = 1920 / 2558,
    geometry = { x: 960 - 429.5 * scale, y: 0, scale };
  const hash = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  function interference(c, width, height, age, signal) {
    if (!signal) return;
    const amount = signal.vhs || 0;
    c.save();
    c.globalCompositeOperation = 'source-over';
    // These are transparent recording marks over the game. Pixel displacement
    // still needs the real video as an input texture; do not fake that contract.
    if (amount > 0.002) {
      const frame = Math.floor(age / 58),
        bands = signal.level === 2 ? 9 : 4;
      for (let i = 0; i < bands; i++) {
        const seed = i * 23 + frame * 61,
          y = Math.floor(hash(seed) * height),
          x = hash(seed + 5) * width * 0.72;
        const length = width * (0.04 + hash(seed + 13) * 0.3);
        c.fillStyle = '#d3d9d5';
        c.globalAlpha = amount * (0.016 + hash(seed + 27) * 0.022);
        c.fillRect(x, y, length, hash(seed + 39) > 0.82 ? 2 : 1);
        c.fillStyle = '#020604';
        c.globalAlpha = amount * 0.055;
        c.fillRect(0, y + 2, width, 1 + Math.floor(hash(seed + 42) * 3));
      }
    }
    if (signal.flash > 0.001) {
      c.globalAlpha = signal.flash * 0.065;
      c.fillStyle = '#d4d9e6';
      c.fillRect(0, 0, width, height);
    }
    c.restore();
  }
  function draw(c, { message, clock, width = 1920, height = 1080, rect = null }) {
    if (!message) {
      c.canvas.dataset.editorMessages = '[]';
      return { active: false, plate: false };
    }
    const realAge = Math.max(0, clock - message.born),
      exitAge =
        Number.isFinite(message.noticeExitAt) && clock >= message.noticeExitAt
          ? clock - message.noticeExitAt
          : -1;
    if (rect?.pixelLayout) rect = ThemeKeyframes.component(rect, realAge, exitAge);
    const age = rect?.pixelLayout
        ? ThemeAnimation.age(
            realAge,
            rect,
            FleetNotice.duration(message.rank) +
              Math.max(0, ...(rect.parts || []).filter((p) => p.visible).map((p) => p.delay || 0)),
          )
        : realAge,
      rank = message.rank,
      rawSignal = FleetNotice.signal(age, rank),
      signal = {
        ...rawSignal,
        vhs: rawSignal.vhs * (rect?.vhsAmount ?? 1),
        glitch: rawSignal.glitch * (rect?.effectGain ?? 1),
        flash: rawSignal.flash * (rect?.effectGain ?? 1),
      },
      cut = FleetInterlude.state(age, rank);
    if (age < 0) return { active: true, delayed: true };
    c.save();
    const contentWidth = rect?.pixelLayout
        ? Math.max(120, Math.min(rect.w, rect.contentWidth || rect.w))
        : rect?.w,
      contentLeft = rect?.pixelLayout
        ? (rect.w - contentWidth) * (rect.align === 'center' ? 0.5 : rect.align === 'right' ? 1 : 0)
        : 0;
    const feed = rect?.pixelLayout
      ? FleetNotice.measureFeed({
          width: contentWidth,
          fontSize: rect.fontSize,
          main: true,
          rank,
          username: message.sender,
          iconSize: rect.iconSize,
          titleSize: rect.titleSize,
          nameSize: rect.nameSize,
          nameWidth: rect.nameWidth,
          parts: rect.parts,
        })
      : null;
    if (rect?.pixelLayout)
      c.canvas.dataset.editorMessages = JSON.stringify([
        {
          id: message.id,
          kind: 'fleet',
          effects: Object.fromEntries(
            ThemeKeyframes.componentProperties('fleet').map((k) => [k, rect[k]]),
          ),
          rank: message.rank,
          styleKey: message.previewStyleKey,
          width: contentWidth,
          font: rect.fontSize,
          height: feed.height,
          x: contentLeft,
          y: 0,
          visible: true,
          age: realAge,
          exitAge,
          motionAge: age,
          entryMs: ThemeAnimation.duration(
            rect,
            FleetNotice.duration(rank) +
              Math.max(0, ...(rect.parts || []).filter((p) => p.visible).map((p) => p.delay || 0)),
          ),
          exitAt: Number.isFinite(message.noticeExitAt) ? message.noticeExitAt - message.born : -1,
          exitMs: message.noticeExitMs || 0,
          motionEnd: Math.max(
            ThemeKeyframes.duration(rect),
            0,
            ...(rect.parts || []).map((p) => ThemeKeyframes.duration(p)),
          ),
          parts: feed.parts?.map((p) => {
            const a = ThemeKeyframes.part(p, realAge, exitAge);
            return { ...p, x: p.x + a.dx, y: p.y + a.dy, opacity: a.opacity };
          }),
        },
      ]);
    const ratio = rect ? Math.min(rect.w / 640, rect.h / 450) : 1,
      s = scale * ratio,
      g = rect
        ? { x: rect.x + rect.w / 2 - 429.5 * s, y: rect.y - 40 * ratio, scale: s }
        : geometry;
    FleetNotice.draw(c, {
      ...(feed
        ? {
            x: rect.x + contentLeft + contentWidth / 2 - 429.5 * feed.scale,
            y: rect.y + feed.offsetY,
            scale: feed.scale,
            ...feed.label,
          }
        : g),
      effectGain: rect?.effectGain,
      particleAmount: rect?.particleAmount,
      particleSpread: rect?.particleSpread,
      rank,
      username: message.sender,
      age,
      motionTime: realAge,
      motionExit: exitAge,
      exitProgress: NoticeLifetime.progress(message, clock),
      titleSize: feed?.label.titleSize ?? rect?.titleSize ?? 46,
      nameSize: feed?.label.nameSize ?? rect?.nameSize ?? 34,
      nameWidth: feed?.label.nameWidth ?? rect?.nameWidth ?? 460,
      sideLabel: false,
    });
    const region =
      rect?.effectScope === 'component'
        ? { x: rect.x + contentLeft, y: rect.y, w: contentWidth, h: feed?.height ?? rect.h }
        : rect?.effectScope === 'custom'
          ? { x: rect.effectX, y: rect.effectY, w: rect.effectW, h: rect.effectH }
          : { x: 0, y: 0, w: width, h: height };
    c.save();
    c.beginPath();
    c.rect(region.x, region.y, region.w, region.h);
    c.clip();
    FleetNotice.drawSignal(c, {
      x: region.x,
      y: region.y,
      width: region.w,
      height: region.h,
      quality: 1,
      age,
      rank,
      signal,
    });
    if (!cut.plate) {
      c.translate(region.x, region.y);
      interference(c, region.w, region.h, age, signal);
    }
    c.restore();
    c.restore();
    return {
      active: age < FleetNotice.duration(rank),
      plate: cut.plate,
      rank,
      age: Math.round(age),
      axis: 960,
      triangleTop: Math.round(257 * scale),
      titleY: Math.round(493.5 * scale),
    };
  }
  window.FleetStage = { draw, geometry };
})();
