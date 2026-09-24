(function (root) {
  'use strict';
  const W = 1920,
    H = 560,
    clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  const makeCanvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const timeText = (value) => {
    const raw = Number(value),
      n = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    return (
      Math.floor(n / 60)
        .toString()
        .padStart(2, '0') +
      ':' +
      (n % 60).toString().padStart(2, '0')
    );
  };
  // All editable elements enter the same live recording-signal path.
  class RecordingSource extends root.NowPlayingRenderer {
    constructor(target) {
      super(target);
      this.demoEnabled = true;
      this.demoArtwork = new Image();
      this.demoArtwork.addEventListener('load', () =>
        this.canvas.dispatchEvent(new Event('artworkload')),
      );
      this.demoArtwork.src = 'assets/cover-placeholder.svg';
    }
    artwork() {
      return (
        this.cover ||
        (this.demoEnabled && this.demoArtwork.complete && this.demoArtwork.naturalWidth
          ? this.demoArtwork
          : null)
      );
    }

    draw(now, levels, settings, position) {
      const ctx = this.base,
        dt = Number.isFinite(this.last) ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
      this.last = now;
      // The recording pass supplies live signal texture at native resolution.
      ctx.fillStyle = '#090909';
      ctx.fillRect(0, 0, W, H);
      const source = this.artwork();
      if (source !== this.coverSurfaceSource || !this.coverSurface) {
        this.coverSurfaceSource = source;
        this.coverSurface = makeCanvas(494, 476);
        const c = this.coverSurface.getContext('2d');
        if (source) {
          const ratio = 494 / 476,
            sw = source.naturalWidth,
            sh = source.naturalHeight,
            cw = Math.min(sw, sh * ratio),
            ch = cw / ratio;
          c.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, 494, 476);
        } else {
          c.fillStyle = '#222720';
          c.fillRect(0, 0, 494, 476);
          c.fillStyle = '#babbaa';
          c.beginPath();
          c.moveTo(136, 139);
          c.lineTo(358, 139);
          c.lineTo(247, 324);
          c.fill();
        }
      }
      ctx.drawImage(this.coverSurface, 68, 30);
      ctx.strokeStyle = '#a19b7b55';
      ctx.lineWidth = 1;
      ctx.strokeRect(68.5, 30.5, 494, 476);
      const track = this.track || {},
        title = track.hasSong ? track.title : '等待音乐',
        artist = track.hasSong ? track.artist : '打开播放器，开始播放',
        typeKey = title + '|' + artist;
      if (this.typeKey !== typeKey) {
        ctx.font = NowPlayingType.font(NowPlayingType.style(artist), 62);
        const longArtist = (this.longArtist = ctx.measureText(artist).width > 1270);
        this.titleBox = { x: 599, y: 40, width: 1270, height: longArtist ? 190 : 220 };
        this.artistBox = {
          x: 614,
          y: longArtist ? 250 : 264,
          width: 1260,
          height: longArtist ? 92 : 78,
          color: '#dddacf',
        };
        this.titleLayout = NowPlayingType.layout(ctx, title, {
          ...this.titleBox,
          maxSize: 234,
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
        // Find actual glyph bottoms once when the words change. Peaks are generated
        // with room for nearby letters; the finished spectrum is never cropped.
        const width = 1320,
          pixels = this.typeLayer.getContext('2d').getImageData(570, 245, width, 110).data,
          bottoms = new Int16Array(width).fill(-1);
        for (let y = 0; y < 110; y++)
          for (let x = 0; x < width; x++)
            if (pixels[(y * width + x) * 4 + 3] > 60) bottoms[x] = 245 + y;
        this.spectrumLimits = Float32Array.from({ length: 48 }, (_, i) => {
          const center = 590 + ((i + 0.5) * 1280) / 48;
          let bottom = -1;
          for (
            let x = Math.max(0, Math.floor(center - 570 - 44));
            x <= Math.min(width - 1, Math.ceil(center - 570 + 44));
            x++
          )
            bottom = Math.max(bottom, bottoms[x]);
          return bottom < 0 ? 132 : Math.max(65, Math.min(132, (451 - bottom - 8) / 1.03));
        });
      }
      this.material.type(ctx, this.typeLayer, clamp(settings.texture));
      this.hiss.heightLimits = this.spectrumLimits;
      this.hiss.draw(ctx, levels, dt, settings.flow);
      ctx.fillStyle = track.paused ? '#a8a99c' : '#c75642';
      if (track.paused) {
        ctx.fillRect(610, 467, 9, 29);
        ctx.fillRect(627, 467, 9, 29);
      } else {
        ctx.beginPath();
        ctx.moveTo(610, 464);
        ctx.lineTo(610, 499);
        ctx.lineTo(645, 481);
        ctx.fill();
        ctx.save();
        ctx.clip();
        for (let y = 464; y < 499; y += 1.4)
          for (let x = 610; x < 645; x += 1.4) {
            const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453,
              n = v - Math.floor(v);
            ctx.fillStyle =
              n > 0.5
                ? 'rgba(245,127,102,' + (n - 0.5) * 0.62 + ')'
                : 'rgba(48,11,13,' + (0.5 - n) * 0.8 + ')';
            ctx.fillRect(x, y, 1.8, 1.3);
          }
        ctx.restore();
      }
      // Printed controls use the same live recording path as cover and lettering.
      // An open condensed face avoids the computer-terminal slashed zero.
      ctx.save();
      ctx.textBaseline = 'alphabetic';
      ctx.letterSpacing = '1.5px';
      ctx.fillStyle = '#dfcebf';
      const timer = (value, x, width) => {
        const text = timeText(value);
        ctx.font = '400 39px NPCondensed, sans-serif';
        const measured = ctx.measureText(text).width;
        if (measured > width)
          ctx.font = '400 ' + (39 * width) / measured + 'px NPCondensed, sans-serif';
        ctx.fillText(text, x, 498);
      };
      timer(position, 678, 105);
      timer(track.duration, 1774, 122);
      ctx.restore();
      // Broken ink density belongs to the rule itself; moving signal damage is
      // generated later by the recording passes, not baked into a texture.
      const progress = clamp(position / (track.duration || 1)),
        end = 809 + 912 * progress;
      ctx.fillStyle = '#e6dfd5';
      ctx.fillRect(809, 480.5, 912, 3);
      ctx.fillStyle = '#c95645';
      ctx.fillRect(809, 479, 912 * progress, 6);
      for (let part = 0; part < 184; part++) {
        const n = part * 13.17,
          random = (v) => {
            const t = Math.sin(v * 127.1 + 91.7) * 43758.5453;
            return t - Math.floor(t);
          };
        const x = 809 + random(n) * 912,
          width = 1 + random(n + 3) * 10;
        ctx.fillStyle =
          x < end
            ? 'rgba(244,112,89,.28)'
            : random(n + 5) > 0.47
              ? 'rgba(255,249,238,.55)'
              : 'rgba(28,24,21,.25)';
        ctx.fillRect(x, 480 + random(n + 7) * 2.4, Math.min(width, 1721 - x), 0.6 + random(n + 9));
      }
      this.material.finish(this.ctx, this.scene, now, clamp(settings.texture));
      const transition = (now - this.switched) / 1000,
        out = this.ctx;
      if (transition >= 0 && transition < 0.66) {
        out.save();
        out.beginPath();
        out.rect(10, 10, 1900, 538);
        out.clip();
        const t = Math.floor(transition * 20);
        if (t < 4 || t === 7)
          for (let i = 0; i < 7; i++) {
            const y = 25 + ((i * 93 + t * 39) % 460),
              height = 4 + (i % 3) * 9;
            out.globalAlpha = 0.6;
            out.drawImage(
              this.scene,
              0,
              y,
              W,
              height,
              (i % 2 ? 1 : -1) * (8 + t * 4),
              y,
              W,
              height,
            );
          }
        out.restore();
      }
    }
  }
  root.RecordingSource = RecordingSource;
})(window);
