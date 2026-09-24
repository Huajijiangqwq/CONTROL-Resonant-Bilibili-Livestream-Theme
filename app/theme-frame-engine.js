/* Screen-space strokes are redrawn at each rectangle's dimensions. No bitmap stretching. */
(() => {
  'use strict';
  const stills = new WeakMap();
  const hash = (n) => {
    const v = Math.sin(n * 127.1 + 9.37) * 43758.5453;
    return v - Math.floor(v);
  };
  function draw(canvas, l, time = 0) {
    if (!canvas) return;
    const q = 1.5,
      w = l.w,
      h = l.h,
      W = Math.ceil(w * q),
      H = Math.ceil(h * q);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const stamp = [
      W,
      H,
      l.stroke,
      l.strokeWidth,
      l.radius,
      l.borderStyle,
      l.cornerInset,
      l.cornerLength,
      l.grainAmount,
      l.traceAmount,
    ].join('|');
    if (!l.traceAmount && stills.get(canvas) === stamp) return;
    stills.set(canvas, l.traceAmount ? null : stamp);
    const c = canvas.getContext('2d');
    c.setTransform(q, 0, 0, q, 0, 0);
    c.clearRect(0, 0, w, h);
    const stroke = l.strokeWidth;
    canvas.dataset.strokeWidth = String(stroke);
    canvas.dataset.frameSize = Math.round(w) + 'x' + Math.round(h);
    if (!stroke) return;
    const inset = stroke / 2,
      round = Math.min(l.radius, w / 2, h / 2);
    c.strokeStyle = l.stroke;
    c.lineWidth = stroke;
    if (l.borderStyle === 'dashed') c.setLineDash([stroke * 5 + 3, stroke * 3 + 3]);
    if (l.borderStyle === 'corners') {
      const gap = Math.min(l.cornerInset, Math.min(w, h) / 2),
        len = Math.max(0, Math.min(l.cornerLength, (w - 2 * gap) / 2, (h - 2 * gap) / 2));
      c.beginPath();
      for (const [x, y, sx, sy] of [
        [gap, gap, 1, 1],
        [w - gap, gap, -1, 1],
        [gap, h - gap, 1, -1],
        [w - gap, h - gap, -1, -1],
      ]) {
        c.moveTo(x + sx * len, y);
        c.lineTo(x, y);
        c.lineTo(x, y + sy * len);
      }
      c.stroke();
    } else {
      c.beginPath();
      c.roundRect(inset, inset, Math.max(0, w - stroke), Math.max(0, h - stroke), round);
      c.stroke();
    }
    if (l.borderStyle === 'double') {
      const gap = stroke * 2 + 3;
      c.beginPath();
      c.roundRect(
        gap,
        gap,
        Math.max(0, w - gap * 2),
        Math.max(0, h - gap * 2),
        Math.max(0, round - gap),
      );
      c.stroke();
    }
    c.setLineDash([]);
    const amount = l.grainAmount || 0;
    if (amount) {
      c.save();
      c.globalCompositeOperation = 'destination-out';
      for (let edge = 0; edge < 4; edge++) {
        const length = edge < 2 ? w : h;
        for (let n = 0; n < length / 5; n++) {
          const seed = n * 31 + edge * 391,
            pos = hash(seed) * length,
            cut = 0.5 + hash(seed + 8) * 2.3;
          c.globalAlpha = amount * (0.12 + hash(seed + 3) * 0.62);
          if (edge < 2) c.fillRect(pos, edge ? h - stroke : 0, cut, stroke);
          else c.fillRect(edge === 2 ? 0 : w - stroke, pos, stroke, cut);
        }
      }
      c.restore();
    }
    if (l.traceAmount && l.borderStyle !== 'corners') {
      const perimeter = Math.max(1, 2 * (w + h) - 8 * round + 2 * Math.PI * round),
        length = Math.min(perimeter * 0.12, Math.max(14, perimeter * 0.034));
      c.save();
      c.globalAlpha = l.traceAmount;
      c.strokeStyle = '#eff4e4';
      c.lineWidth = Math.max(0.75, stroke * 0.8);
      c.setLineDash([length, Math.max(1, perimeter - length)]);
      c.lineDashOffset = -time * 0.00008 * (l.traceSpeed || 1) * perimeter;
      c.beginPath();
      c.roundRect(inset, inset, Math.max(0, w - stroke), Math.max(0, h - stroke), round);
      c.stroke();
      c.restore();
    }
    canvas.dataset.strokeWidth = String(stroke);
    canvas.dataset.frameSize = Math.round(w) + 'x' + Math.round(h);
    canvas.dataset.traceTime = String(Math.round(time));
  }
  window.ThemeFrame = { draw };
})();
