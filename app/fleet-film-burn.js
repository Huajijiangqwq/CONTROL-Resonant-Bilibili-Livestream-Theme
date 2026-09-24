(() => {
  'use strict';
  const W = 192,
    H = 320,
    clamp = (x) => Math.max(0, Math.min(1, x)),
    hash = (n) => {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
  function noise(x, y) {
    const ix = Math.floor(x),
      iy = Math.floor(y),
      u = x - ix,
      v = y - iy,
      a = u * u * (3 - 2 * u),
      b = v * v * (3 - 2 * v),
      n = (x, y) => hash(x + y * 193);
    return (
      (n(ix, iy) * (1 - a) + n(ix + 1, iy) * a) * (1 - b) +
      (n(ix, iy + 1) * (1 - a) + n(ix + 1, iy + 1) * a) * b
    );
  }
  let field, front, grains;
  const frames = new Map();
  // Uneven held exposures imitate a splice. They never interpolate or sweep.
  const beats = [
    { end: 0.22, reach: 0.12, gain: 0.22, flip: false },
    { end: 0.44, reach: 0.76, gain: 1.08, flip: false },
    { end: 0.61, reach: 0.31, gain: 0.26, flip: true },
    { end: 0.86, reach: 1.02, gain: 1.24, flip: true },
    { end: 1.01, reach: 0.74, gain: 0.97, flip: false },
  ];
  const beatAt = (progress) => beats.findIndex((b) => clamp(progress) < b.end);
  function prepare() {
    if (field) return;
    field = new Float32Array(W * H);
    front = new Float32Array(H);
    grains = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const v = y / H;
      front[y] = (noise(4, v * 9) - 0.5) * 0.21 + (noise(7, v * 21) - 0.5) * 0.045;
      for (let x = 0; x < W; x++) {
        const u = x / W,
          i = y * W + x;
        field[i] =
          noise(u * 5.2, v * 6.3) * 0.6 +
          noise(u * 12.7 + 31, v * 14.1) * 0.27 +
          noise(u * 29 + 7, v * 27) * 0.13;
        grains[i] = hash(i + 117) - 0.5;
      }
    }
  }
  function frame(progress) {
    const index = beatAt(progress),
      beat = beats[index];
    if (frames.has(index)) return frames.get(index);
    prepare();
    const p = beat.reach,
      canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const c = canvas.getContext('2d'),
      image = c.createImageData(W, H),
      data = image.data;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const u = beat.flip ? 1 - x / W : x / W,
          v = y / H,
          i = y * W + x,
          n = i * 4,
          cloud = field[((y + index * 37) % H) * W + ((x + index * 23) % W)],
          edge = 1.18 - p * 0.72 + front[(y + index * 29) % H] + (cloud - 0.5) * 0.15;
        const through = Math.exp(-Math.pow(Math.max(0, edge - u) * 7.1, 1.6)),
          body = 0.47 + 0.53 * cloud;
        const corner =
          Math.exp(-Math.pow((u - 0.02) / 0.27, 2) - Math.pow((v + 0.07) / 0.43, 2)) *
          0.53 *
          Math.sin(p * Math.PI);
        const exposure = clamp((through * body * 1.36 + corner) * beat.gain);
        const grain = grains[i] * (0.018 + exposure * 0.038),
          warm = clamp(exposure + grain);
        data[n] = Math.min(255, Math.pow(warm, 0.65) * 370);
        data[n + 1] = Math.min(255, Math.pow(Math.max(0, warm - 0.09), 1.32) * 400);
        data[n + 2] = Math.min(255, Math.pow(Math.max(0, warm - 0.2), 1.7) * 470);
        data[n + 3] = 255;
      }
    c.putImageData(image, 0, 0);
    frames.set(index, canvas);
    return canvas;
  }
  function draw(c, { x, y, width, height, progress }) {
    c.save();
    c.globalCompositeOperation = 'screen';
    c.globalAlpha = 0.94;
    c.filter = 'none';
    c.imageSmoothingEnabled = true;
    c.drawImage(frame(progress), x, y, width, height);
    c.restore();
  }
  let ready = false;
  const loading = new Promise((resolve) => {
    let i = 0;
    const warm = () => {
      frame((i ? beats[i - 1].end : 0) + 0.01);
      if (++i < beats.length) setTimeout(warm, 0);
      else {
        ready = true;
        resolve(true);
      }
    };
    setTimeout(warm, 0);
  });
  window.FleetFilmBurn = {
    draw,
    loading,
    get ready() {
      return ready;
    },
    impulse: (progress) => Math.min(1, beats[beatAt(progress)].gain),
  };
})();
