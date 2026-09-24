(function (root) {
  'use strict';
  const W = 1920,
    H = 560,
    clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  function surface(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  function random(seed) {
    let n = seed;
    return () => {
      n = (Math.imul(n, 1664525) + 1013904223) | 0;
      return (n >>> 0) / 4294967296;
    };
  }
  function field(seed) {
    const r = random(seed),
      grid = Float32Array.from({ length: 128 * 128 }, r);
    return (x, y) => {
      const ix = Math.floor(x),
        iy = Math.floor(y);
      let fx = x - ix,
        fy = y - iy;
      fx = fx * fx * (3 - 2 * fx);
      fy = fy * fy * (3 - 2 * fy);
      const at = (a, b) => grid[(a & 127) + (b & 127) * 128];
      return (
        (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) +
        (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy
      );
    };
  }
  let shared;
  class NowPlayingMaterial {
    static shared() {
      return shared || (shared = new NowPlayingMaterial());
    }
    constructor() {
      const r = random(6729),
        noise = field(173),
        fibres = field(982);
      this.paper = surface(768, 224);
      this.substrate = surface(768, 224);
      const p = this.paper.getContext('2d'),
        s = this.substrate.getContext('2d'),
        pd = p.createImageData(768, 224),
        sd = s.createImageData(768, 224);
      for (let y = 0; y < 224; y++)
        for (let x = 0; x < 768; x++) {
          const warp = noise(x / 35, y / 25),
            coarse = noise(x / 18 + warp * 2, y / 14 + warp),
            fine = noise(x / 3.7, y / 2.9),
            vein = fibres(x / 8 + warp * 5, y / 7 + coarse * 3);
          const mottling = clamp((coarse - 0.5) * 2.5, -0.65, 0.65),
            crease = Math.pow(1 - Math.abs(vein - 0.5) * 2, 15);
          const v = clamp(
              222 + mottling * 49 + (fine - 0.5) * 26 - crease * 20 + (r() - 0.5) * 22,
              145,
              251,
            ),
            i = (y * 768 + x) * 4;
          pd.data.set([v, v * 0.973, v * 0.917, 255], i);
          const dark = 9 + coarse * 7 + fine * 3 + (r() - 0.5) * 5;
          sd.data.set([dark, dark * 1.015, dark * 0.94, 255], i);
        }
      p.putImageData(pd, 0, 0);
      s.putImageData(sd, 0, 0);
      // Fixed fibres belong to the printed surface; only the recorded signal noise moves.
      for (let i = 0; i < 1600; i++) {
        const x = r() * 768,
          y = r() * 224;
        p.strokeStyle = r() > 0.3 ? 'rgba(78,68,53,.16)' : 'rgba(255,252,232,.30)';
        p.lineWidth = 0.3 + r() * 0.65;
        p.beginPath();
        p.moveTo(x, y);
        p.lineTo(x + 1 + r() * 8, y + (r() - 0.5) * 3);
        p.stroke();
      }
      this.grain = [];
      for (let n = 0; n < 6; n++) {
        const c = surface(768, 224),
          g = c.getContext('2d'),
          d = g.createImageData(768, 224);
        for (let i = 0; i < d.data.length; i += 4) {
          const v = r() > 0.5 ? 230 : 14;
          d.data.set([v, v, v, 8 + r() * 23], i);
        }
        g.putImageData(d, 0, 0);
        this.grain.push(c);
      }
      this.scan = surface(W, H);
      const scan = this.scan.getContext('2d');
      for (let y = 12; y < 548; y += 3) {
        scan.fillStyle = 'rgba(0,0,0,' + (0.06 + r() * 0.05) + ')';
        scan.fillRect(11, y, W - 22, 1);
      }
      this.rim = surface(W, H);
      const rim = this.rim.getContext('2d');
      rim.strokeStyle = '#6b6558';
      rim.lineWidth = 3;
      rim.strokeRect(9, 9, W - 18, H - 20);
      rim.strokeStyle = '#d0c7b3';
      rim.lineWidth = 1.25;
      rim.strokeRect(9.5, 9.5, W - 19, H - 21);
      for (let edge = 0; edge < 4; edge++)
        for (let n = 0; n < 180; n++) {
          const horizontal = edge < 2,
            length = horizontal ? W - 22 : H - 24,
            at = 12 + r() * length,
            run = 0.7 + r() * 12;
          rim.fillStyle =
            r() > 0.4
              ? 'rgba(242,231,207,' + (0.12 + r() * 0.5) + ')'
              : 'rgba(11,13,11,' + (0.15 + r() * 0.65) + ')';
          if (horizontal) rim.fillRect(at, edge ? 548 + r() * 2 : 8 + r() * 2, run, 0.4 + r());
          else rim.fillRect(edge === 2 ? 8 + r() * 2 : 1908 + r() * 2, at, 0.4 + r(), run);
        }
    }
    backdrop(ctx) {
      ctx.drawImage(this.substrate, 0, 0, W, H);
      const vignette = ctx.createRadialGradient(930, 240, 140, 950, 275, 1150);
      vignette.addColorStop(0, '#0000');
      vignette.addColorStop(1, '#000b');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#050706';
      ctx.fillRect(33, 24, 499, 499);
    }
    typography(titleLayout, titleBox, artistLayout, artistBox) {
      const c = surface(W, H),
        ctx = c.getContext('2d');
      NowPlayingType.draw(ctx, titleLayout, titleBox);
      NowPlayingType.draw(ctx, artistLayout, artistBox);
      ctx.globalCompositeOperation = 'source-in';
      ctx.drawImage(this.paper, 0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      const recorded = surface(W, H),
        r = recorded.getContext('2d');
      r.globalAlpha = 0.1;
      r.drawImage(c, 1.6, 0.35);
      r.globalAlpha = 1;
      r.shadowColor = '#ebe0ce3d';
      r.shadowBlur = 1.4;
      r.drawImage(c, 0, 0);
      return recorded;
    }
    type(ctx, layer, amount) {
      ctx.drawImage(layer, 0, 0);
    }
    finish(out, scene, now, texture) {
      const tick = Math.floor(now / 83),
        r = random(tick + 920),
        amount = clamp(texture);
      out.drawImage(scene, 0, 0);
      out.save();
      out.beginPath();
      out.rect(10, 10, 1900, 538);
      out.clip();
      if (amount > 0.001) {
        // Small line-local time-base errors, never a whole-card shake or scale pulse.
        const active = tick % 73 < 4;
        if (active)
          for (let i = 0; i < 8; i++) {
            const y = 36 + Math.floor(r() * 463),
              height = 2 + r() * 8,
              shift = (r() - 0.5) * 4 * amount;
            out.drawImage(scene, 11, y, 1898, height, 11 + shift, y, 1898, height);
          }
        out.globalAlpha = amount * 0.62;
        out.drawImage(this.scan, 0, 0);
        out.globalCompositeOperation = 'soft-light';
        out.globalAlpha = amount * 0.63;
        out.drawImage(this.grain[tick % 6], 0, 0, W, H);
        out.globalCompositeOperation = 'source-over';
        const roll = ((now * 0.014) % 730) - 85,
          band = out.createLinearGradient(0, roll - 22, 0, roll + 22);
        band.addColorStop(0, '#ccd1c000');
        band.addColorStop(0.5, '#ccd1c007');
        band.addColorStop(1, '#ccd1c000');
        out.globalAlpha = amount;
        out.fillStyle = band;
        out.fillRect(11, roll - 22, 1898, 44);
        for (let j = 0; j < 2; j++) {
          const y = [91, 329][j] + (tick % 89 === 0 ? 1 : 0);
          out.globalAlpha = amount * (0.055 + r() * 0.06);
          out.fillStyle = '#c8c4af';
          out.fillRect(12, y, 1896, 0.7);
          for (let k = 0; k < 14; k++) {
            out.fillStyle = k % 3 ? '#638a92' : '#ad6552';
            out.fillRect(12 + r() * 1880, y + 0.6, 5 + r() * 48, 0.7);
          }
        }
        // Head switching stays near the lower edge, in short irregular packets.
        const bottom = 530 + (tick % 19 === 0 ? -2 : 0);
        for (let i = 0; i < 170; i++) {
          const x = 12 + r() * 1892,
            y = bottom + r() * 12;
          out.globalAlpha = amount * (0.09 + r() * 0.48);
          out.fillStyle = r() > 0.24 ? '#c7c8bd' : '#966448';
          out.fillRect(x, y, 1 + r() * 18, r() > 0.87 ? 1.7 : 0.8);
        }
        for (let i = 0; i < 20; i++) {
          out.globalAlpha = amount * 0.07;
          out.fillStyle = '#c4c1ab';
          out.fillRect(12 + r() * 1892, 16 + r() * 503, 1 + r() * 19, 0.65);
        }
      }
      out.restore();
      out.drawImage(this.rim, 0, 0);
    }
  }
  root.NowPlayingMaterial = NowPlayingMaterial;
})(window);
