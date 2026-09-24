(() => {
  'use strict';
  const hash = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const signalCopies = new WeakMap();
  let noiseTiles;
  function tapeNoise() {
    if (noiseTiles) return noiseTiles;
    return (noiseTiles = Array.from({ length: 4 }, (_, frame) => {
      const tile = document.createElement('canvas');
      tile.width = 192;
      tile.height = 96;
      const ink = tile.getContext('2d'),
        pixels = ink.createImageData(192, 96);
      for (let n = 0; n < 192 * 96; n++) {
        const value = hash(n + frame * 19471),
          i = n * 4;
        pixels.data[i] = 194;
        pixels.data[i + 1] = 204;
        pixels.data[i + 2] = 207;
        pixels.data[i + 3] = value > 0.56 ? Math.round((value - 0.56) * 115) : 0;
      }
      ink.putImageData(pixels, 0, 0);
      return tile;
    }));
  }
  function drawSignal(
    context,
    { x = 0, y = 0, width, height, quality = 1, age = 0, rank = 'captain', signal: envelope },
  ) {
    const cut = window.FleetInterlude?.state(age, rank);
    if (cut?.plate) {
      FleetInterlude.draw(context, { x, y, width, height, quality, age, rank });
      return;
    }
    const f = envelope || window.FleetNotice?.signal(age, rank);
    if (!f) return;
    if (!f.flash && !f.glitch && !f.vhs) return;
    const q = Math.max(0.1, quality),
      left = Math.max(0, Math.round(x * q)),
      top = Math.max(0, Math.round(y * q)),
      w = Math.max(0, Math.min(context.canvas.width - left, Math.round(width * q))),
      h = Math.max(0, Math.min(context.canvas.height - top, Math.round(height * q)));
    if (!w || !h) return;
    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    let cached = signalCopies.get(context);
    if (!cached) {
      cached = { scene: document.createElement('canvas'), tone: document.createElement('canvas') };
      signalCopies.set(context, cached);
    }
    const scratch = cached.scene;
    if (scratch.width !== w || scratch.height !== h) {
      scratch.width = w;
      scratch.height = h;
      cached.tone.width = w;
      cached.tone.height = h;
    }
    const ink = scratch.getContext('2d');
    ink.clearRect(0, 0, w, h);
    ink.drawImage(context.canvas, left, top, w, h, 0, 0, w, h);
    const tape =
      f.vhs > 0.001 &&
      window.FleetVHS?.draw(context, scratch, {
        x,
        y,
        width: w / q,
        height: h / q,
        age,
        amount: f.vhs,
        wear: f.level === 2 ? 1.3 : 1.08,
      });
    if (f.vhs > 0.001 && !tape) {
      // Luma drag and weak chroma ghosts use the same untouched scene. Thresholding
      // keeps dark pixels dark instead of exposing a rectangular filter overlay.
      context.globalCompositeOperation = 'lighter';
      context.globalAlpha = f.vhs * 0.35;
      context.filter = 'contrast(2) grayscale(1) blur(1px)';
      context.drawImage(scratch, 0, 0, w, h, x + 2 + f.level, y, w / q, h / q);
      context.filter = 'none';
      if (f.level === 2) {
        const tone = cached.tone,
          ink = tone.getContext('2d');
        for (const [color, offset] of [
          ['#7cbbc9', 1.6],
          ['#bf718d', -1.2],
        ]) {
          ink.globalCompositeOperation = 'source-over';
          ink.clearRect(0, 0, w, h);
          ink.filter = 'contrast(2)';
          ink.drawImage(scratch, 0, 0);
          ink.filter = 'none';
          ink.globalCompositeOperation = 'multiply';
          ink.fillStyle = color;
          ink.fillRect(0, 0, w, h);
          context.globalAlpha = f.vhs * 0.5;
          context.drawImage(tone, 0, 0, w, h, x + offset, y, w / q, h / q);
        }
      }
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = f.vhs * 0.4;
      context.fillStyle = '#020606';
      const scan = (age / 160) % 3;
      for (let sy = y + scan; sy < y + height; sy += 3) context.fillRect(x, sy, width, 0.8);
      if (!cached.noise)
        cached.noise = tapeNoise().map((tile) => context.createPattern(tile, 'repeat'));
      const pattern = cached.noise[Math.floor(age / 55) % 4];
      pattern.setTransform(
        new DOMMatrix().translate(Math.floor(age / 41) % 192, Math.floor(age / 73) % 96),
      );
      context.fillStyle = pattern;
      context.globalAlpha = f.vhs * 0.62;
      context.fillRect(x, y, width, height);
      if (f.level === 2) {
        const tick = Math.floor(age / 110),
          by = y + height * (0.76 + hash(tick + 110) * 0.12),
          bh = 4 + hash(tick + 611) * 9,
          sy = Math.min(h - 1, Math.floor((by - y) * q)),
          sh = Math.min(h - sy, Math.ceil(bh * q)),
          shift = (hash(tick + 32) - 0.5) * 22 * f.vhs;
        context.globalAlpha = 0.65 * f.vhs;
        context.drawImage(scratch, 0, sy, w, sh, x + shift, by, w / q, sh / q);
        context.fillStyle = '#adbbc6';
        context.globalAlpha = f.vhs * (hash(tick + 523) > 0.62 ? 0.19 : 0.045);
        context.fillRect(x, by + bh * 0.6, width, 1.1);
      }
    }
    if (f.glitch > 0.001) {
      context.globalCompositeOperation = 'source-over';
      context.filter = 'none';
      const tick = Math.floor(age / 45);
      for (let i = 0; i < f.bands; i++) {
        const position = 0.06 + hash(i * 31 + tick) * 0.85,
          by = y + position * height,
          bh = 3 + hash(i + tick * 11) * 17,
          dx = (hash(i + tick * 3) > 0.5 ? 1 : -1) * f.shift * f.glitch;
        const local = f.charge > 0.01,
          bx = local ? width * hash(i + tick * 17) * 0.4 : 0,
          bw = local ? width * (0.22 + hash(i * 7 + tick) * 0.36) : width;
        const sourceY = Math.max(0, Math.min(h - 1, Math.floor((by - y) * q))),
          sourceH = Math.min(h - sourceY, Math.ceil(bh * q)),
          sourceX = Math.min(w - 1, Math.round(bx * q)),
          sourceW = Math.min(w - sourceX, Math.round(bw * q));
        // Fade the displaced copy with its displacement; a fixed-opacity stamp
        // doubles translucent edges immediately before the final strip vanishes.
        context.globalAlpha = 0.78 * f.glitch;
        context.drawImage(
          scratch,
          sourceX,
          sourceY,
          sourceW,
          sourceH,
          x + bx + dx,
          by,
          sourceW / q,
          sourceH / q,
        );
        context.globalAlpha = f.glitch * 0.52;
        context.fillStyle = '#050808';
        context.fillRect(x + bx, by + bh, bw, 1.2);
      }
    }
    if (f.flash) {
      // Exposure comes from the already rendered flecks and glyph edges. A flat
      // white rectangle would hide their material contrast at the impact peak.
      // Isolate bright edges before adding their exposure; dark chat pixels must
      // not become a visible gray rectangle at the effect bounds.
      context.globalCompositeOperation = 'lighter';
      context.filter = 'contrast(2)';
      context.globalAlpha = f.flash * 0.62;
      context.drawImage(scratch, 0, 0, w, h, x, y, w / q, h / q);
      context.filter = 'contrast(2) blur(3px)';
      context.globalAlpha = f.flash * 0.2;
      context.drawImage(scratch, 0, 0, w, h, x, y, w / q, h / q);
      context.filter = 'none';
    }
    if (cut?.active) FleetInterlude.draw(context, { x, y, width, height, quality, age, rank });
    context.restore();
  }

  window.FleetSignal = { draw: drawSignal };
})();
