(function (root) {
  'use strict';
  const W = 1920,
    H = 560,
    clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)),
    TAU = Math.PI * 2;
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  function rand(seed) {
    let n = seed | 0;
    return () => {
      n = (Math.imul(n, 1664525) + 1013904223) | 0;
      return (n >>> 0) / 4294967296;
    };
  }
  const timeText = (v) => {
    v = Math.max(0, Math.floor(v || 0));
    return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
  };
  class HissSpectrum {
    constructor() {
      this.particles = [];
      this.emit = new Float32Array(48);
      this.random = rand(619);
      this.clock = 0;
    }
    reset() {
      this.particles.length = 0;
      this.emit.fill(0);
    }
    draw(ctx, levels, dt, speed) {
      this.clock += dt * speed;
      const x0 = 590,
        y0 = 451,
        width = 1276,
        step = width / 48,
        maxH = 102;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 - 8, y0 - maxH - 3, width + 16, maxH + 10);
      ctx.clip();
      // Each plume is rooted in its measured band; curl changes locally along its height.
      // No minimum fake energy: silence removes both the body and the emitted strands.
      for (let i = 0; i < 48; i++) {
        const e = clamp(levels[i] || 0);
        if (e < 0.012) continue;
        const height = maxH * Math.pow(e, 0.62),
          center = x0 + (i + 0.5) * step,
          phase = i * 2.399,
          t = this.clock;
        const body = ctx.createLinearGradient(0, y0 - height, 0, y0);
        body.addColorStop(0, 'rgba(108,18,14,0)');
        body.addColorStop(0.65, 'rgba(137,24,18,' + e * 0.13 + ')');
        body.addColorStop(1, 'rgba(171,32,23,' + e * 0.17 + ')');
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(center - step * 0.44, y0);
        ctx.bezierCurveTo(
          center + 6,
          y0 - height * 0.23,
          center - 8,
          y0 - height * 0.8,
          center,
          y0 - height,
        );
        ctx.bezierCurveTo(
          center + 7,
          y0 - height * 0.75,
          center + step * 0.15,
          y0 - height * 0.2,
          center + step * 0.44,
          y0,
        );
        ctx.fill();
        for (let strand = 0; strand < 4; strand++) {
          const side = strand % 2 ? 1 : -1;
          ctx.beginPath();
          for (let j = 0; j <= 22; j++) {
            const u = j / 22,
              taper = Math.pow(1 - u, 0.8),
              turn = u * 12 - t * 3.4 + phase + strand * 0.85;
            const spread = (4 + e * 12) * taper;
            const bend = Math.sin(u * 8.5 - t * 2.2 + phase) * Math.sin(u * Math.PI) * (2 + e * 6);
            const x =
              center +
              bend +
              side *
                spread *
                (0.42 + 0.46 * Math.sin(turn) + 0.12 * Math.sin(u * 31 + t * 4 + phase));
            const y =
              y0 - u * height + Math.sin(turn * 1.8) * Math.sin(u * Math.PI) * height * 0.032;
            if (!j) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle =
            strand < 2
              ? 'rgba(133,26,20,' + (0.24 + e * 0.28) + ')'
              : 'rgba(229,57,43,' + (0.32 + e * 0.36) + ')';
          ctx.lineWidth = strand < 2 ? 2.8 : 1.2;
          ctx.stroke();
        }
        this.emit[i] += dt * (18 + e * 86) * speed;
        while (this.emit[i] >= 1) {
          this.emit[i]--;
          const r = this.random;
          this.particles.push({
            bin: i,
            x: center + (r() - 0.5) * step * 0.75,
            y: y0 - 1,
            vx: (r() - 0.5) * 30,
            vy: -(35 + e * 210) * speed,
            age: 0,
            life: 0.4 + e * 0.35 + r() * 0.18,
            phase: r() * TAU,
            energy: e,
            history: [],
          });
        }
      }
      const survivors = [];
      ctx.globalCompositeOperation = 'screen';
      const buckets = Array.from({ length: 5 }, () => []);
      for (const p of this.particles) {
        p.age += dt;
        const energy = levels[p.bin] || 0;
        if (p.age > p.life || energy < 0.006) continue;
        const center = x0 + (p.bin + 0.5) * step,
          relative = (y0 - p.y) / maxH,
          travel = this.clock * 2.6 + p.phase;
        const curl =
          Math.sin(relative * 19 + travel) * Math.cos((p.x - center) * 0.11 - travel * 0.7);
        p.vx += (curl * 620 - (p.x - center) * 14 - p.vx * 3) * dt * speed;
        p.vy += (105 + relative * 200 + Math.cos((p.x - center) * 0.2 + travel) * 75) * dt * speed;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y > y0 + 2 || p.y < y0 - maxH) continue;
        p.history.push([p.x, p.y, p.age]);
        while (p.history.length > 1 && p.history[0][2] < p.age - 0.34) p.history.shift();
        const fade =
          Math.sin(Math.PI * clamp(p.age / p.life)) *
          Math.min(1, energy / Math.max(0.06, p.energy));
        buckets[Math.min(4, Math.floor(fade * 5))].push(p);
        survivors.push(p);
      }
      // Batch equal-opacity trails to keep many fine fibres affordable at 60 FPS.
      for (let b = 0; b < 5; b++) {
        ctx.beginPath();
        for (const p of buckets[b])
          for (let j = 0; j < p.history.length; j++) {
            const v = p.history[j];
            if (!j) ctx.moveTo(v[0], v[1]);
            else ctx.lineTo(v[0], v[1]);
          }
        ctx.strokeStyle = 'rgba(240,69,49,' + (0.065 + b * 0.072) + ')';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
      this.particles = survivors.slice(-1500);
      const average = levels.reduce((a, b) => a + b, 0) / 48;
      if (average > 0.002)
        for (let strand = 0; strand < 3; strand++) {
          ctx.beginPath();
          for (let i = 0; i <= 240; i++) {
            const band = Math.min(47, Math.floor(i / 5)),
              e = levels[band] || 0,
              x = x0 + (width * i) / 240,
              y =
                y0 -
                Math.abs(Math.sin(i * 0.27 + this.clock * 1.8 + strand)) * e * (3 + strand * 2);
            if (!i) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = 'rgba(161,42,28,' + Math.min(0.4, average) + ')';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      ctx.restore();
    }
  }
  class NowPlayingRenderer {
    constructor(target) {
      this.canvas = target;
      this.ctx = target.getContext('2d', { alpha: false });
      this.scene = canvas(W, H);
      this.base = this.scene.getContext('2d');
      this.hiss = new HissSpectrum();
      this.material = NowPlayingMaterial.shared();
      this.cover = null;
      this.coverKey = '';
      this.track = null;
      this.switched = -Infinity;
      this.last = NaN;
      this.reference = new Image();
      this.reference.src = 'assets/cover-placeholder.svg';
    }
    setTrack(track, coverUrl, now) {
      const identity = track.id + '|' + track.title;
      if (this.track && identity !== this.track.id + '|' + this.track.title) this.switched = now;
      this.track = track;
      const words = (track.title || '等待音乐') + ' ' + (track.artist || '打开播放器');
      if (this.fontRequest !== words) {
        this.fontRequest = words;
        this.typeKey = '';
        const specs = [
          NowPlayingType.style(track.title || '等待音乐'),
          NowPlayingType.style(track.artist || '打开播放器'),
        ];
        Promise.all(
          specs.map((spec) =>
            document.fonts.load(spec.weight + ' 80px ' + spec.family.split(',')[0], words),
          ),
        ).then(() => {
          this.typeKey = '';
        });
      }
      if (coverUrl !== this.coverKey) {
        this.coverKey = coverUrl;
        this.cover = null;
        if (coverUrl) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            if (this.coverKey === coverUrl) this.cover = img;
          };
          img.src = coverUrl;
        }
      }
    }
    replay(now) {
      this.switched = now;
    }
    draw(now, levels, settings, position) {
      const ctx = this.base,
        dt = Number.isFinite(this.last) ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
      this.last = now;
      const texture = clamp(settings.texture);
      this.material.backdrop(ctx);
      const coverSource =
        this.cover ||
        (this.reference.complete && this.reference.naturalWidth ? this.reference : null);
      if (coverSource !== this.coverSurfaceSource || !this.coverSurface) {
        this.coverSurfaceSource = coverSource;
        this.coverSurface = canvas(480, 480);
        const c = this.coverSurface.getContext('2d');
        c.filter = 'saturate(.65) contrast(1.08) brightness(.95)';
        if (this.cover) {
          const side = Math.min(this.cover.naturalWidth, this.cover.naturalHeight);
          c.drawImage(
            this.cover,
            (this.cover.naturalWidth - side) / 2,
            (this.cover.naturalHeight - side) / 2,
            side,
            side,
            0,
            0,
            480,
            480,
          );
        } else if (coverSource) {
          c.drawImage(
            coverSource,
            coverSource.width * 0.037,
            coverSource.height * 0.164,
            coverSource.width * 0.264,
            coverSource.height * 0.708,
            0,
            0,
            480,
            480,
          );
        } else {
          c.fillStyle = '#222720';
          c.fillRect(0, 0, 480, 480);
          c.fillStyle = '#babbaa';
          c.beginPath();
          c.moveTo(132, 143);
          c.lineTo(348, 143);
          c.lineTo(240, 328);
          c.fill();
        }
      }
      ctx.drawImage(this.coverSurface, 42, 32);
      const glass = ctx.createLinearGradient(42, 0, 522, 0);
      glass.addColorStop(0, '#090b0980');
      glass.addColorStop(0.035, '#090b0900');
      glass.addColorStop(0.94, '#090b0900');
      glass.addColorStop(1, '#090b0950');
      ctx.fillStyle = glass;
      ctx.fillRect(42, 32, 480, 480);
      ctx.strokeStyle = '#a19b7b55';
      ctx.lineWidth = 1;
      ctx.strokeRect(42.5, 32.5, 480, 480);
      const track = this.track || {},
        title = track.hasSong ? track.title : '等待音乐',
        artist = track.hasSong ? track.artist : '打开播放器，开始播放',
        typeKey = title + '|' + artist;
      if (this.typeKey !== typeKey) {
        ctx.font = NowPlayingType.font(NowPlayingType.style(artist), 62);
        const longArtist = ctx.measureText(artist).width > 1270;
        this.titleBox = { x: 580, y: 40, width: 1290, height: longArtist ? 190 : 220 };
        this.artistBox = {
          x: 590,
          y: longArtist ? 250 : 264,
          width: 1270,
          height: longArtist ? 92 : 78,
          color: '#dddacf',
        };
        this.titleLayout = NowPlayingType.layout(ctx, title, {
          ...this.titleBox,
          maxSize: 238,
          minSize: 70,
          maxLines: 2,
        });
        this.artistLayout = NowPlayingType.layout(ctx, artist, {
          ...this.artistBox,
          maxSize: 112,
          minSize: 30,
          maxLines: 2,
        });
        this.typeLayer = this.material.typography(
          this.titleLayout,
          this.titleBox,
          this.artistLayout,
          this.artistBox,
        );
        this.typeKey = typeKey;
        this.canvas.setAttribute('aria-label', title + ' / ' + artist);
      }
      this.material.type(ctx, this.typeLayer, texture);
      this.hiss.draw(ctx, levels, dt, settings.flow);
      const row = 493;
      ctx.fillStyle = track.paused ? '#a8a99c' : '#c75642';
      if (track.paused) {
        ctx.fillRect(590, row - 13, 9, 29);
        ctx.fillRect(607, row - 13, 9, 29);
      } else {
        ctx.beginPath();
        ctx.moveTo(590, row - 17);
        ctx.lineTo(590, row + 18);
        ctx.lineTo(625, row);
        ctx.fill();
      }
      ctx.font = '39px Consolas, monospace';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#d7d5c7';
      ctx.fillText(timeText(position), 658, row - 22);
      ctx.fillText(timeText(track.duration), 1762, row - 22);
      ctx.fillStyle = '#aaa899';
      ctx.fillRect(790, row - 3, 921, 3);
      ctx.fillStyle = '#c55748';
      ctx.fillRect(790, row - 5, 921 * clamp(position / (track.duration || 1)), 6);
      this.material.finish(this.ctx, this.scene, now, texture);
      const out = this.ctx,
        transition = (now - this.switched) / 1000;
      out.save();
      out.beginPath();
      out.rect(10, 10, 1900, 538);
      out.clip();
      if (transition >= 0 && transition < 0.66) {
        const t = Math.floor(transition * 20);
        if (t < 4 || t === 7) {
          for (let i = 0; i < 7; i++) {
            const y = 25 + ((i * 93 + t * 39) % 460),
              h = 4 + (i % 3) * 9;
            out.globalAlpha = 0.6;
            out.drawImage(this.scene, 0, y, W, h, (i % 2 ? 1 : -1) * (8 + t * 4), y, W, h);
          }
          out.fillStyle = 'rgba(191,201,191,.09)';
          out.fillRect(10, 10, 1900, 538);
        }
        if (t === 0 || t === 2) {
          out.fillStyle = '#0a0c0b';
          out.fillRect(550, 27, 1335, 304);
        }
      }
      out.restore();
    }
  }
  root.NowPlayingRenderer = NowPlayingRenderer;
})(window);
