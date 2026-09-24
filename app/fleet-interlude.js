(() => {
  'use strict';
  const cutAt = 1057,
    hold = 1500,
    lead = 180;
  const clamp = (x) => Math.max(0, Math.min(1, x)),
    smooth = (a, b, x) => {
      const t = clamp((x - a) / (b - a));
      return t * t * (3 - 2 * t);
    },
    hash = (n) => {
      const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return v - Math.floor(v);
    };
  function state(age, rank) {
    const active = rank === 'governor' && age >= cutAt - lead && age < cutAt + hold;
    return {
      active,
      plate: active && age >= cutAt,
      progress: clamp((age - cutAt + lead) / lead),
      remaining: Math.max(0, cutAt + hold - age),
    };
  }
  function motionAge(age, rank) {
    if (rank !== 'governor' || age < cutAt) return age;
    return age < cutAt + hold ? cutAt : age - hold;
  }
  const extra = (rank) => (rank === 'governor' ? hold : 0);
  // Existing FBC reference artwork; attribution is separate from the code license.
  let seal,ready=false,settled=false;const loading=new Promise(resolve=>{const image=new Image();image.onload=()=>{try{seal=document.createElement('canvas');seal.width=760;seal.height=760;const ink=seal.getContext('2d');ink.drawImage(image,900,310,760,760,0,0,760,760);const pixels=ink.getImageData(0,0,760,760);
 for(let n=0;n<pixels.data.length;n+=4){const light=(pixels.data[n]+pixels.data[n+1]+pixels.data[n+2])/765;pixels.data[n]=22;pixels.data[n+1]=22;pixels.data[n+2]=18;pixels.data[n+3]=(1-smooth(.12,.66,light))*255;}ink.putImageData(pixels,0,0);ready=true;resolve(true);}catch{resolve(false);}};image.onerror=()=>resolve(false);image.src='fbc-reference-frame.png';}).then(ok=>{settled=true;return ok;});
  const copies = new WeakMap();
  let grain;
  function noise() {
    if (grain) return grain;
    grain = document.createElement('canvas');
    grain.width = 128;
    grain.height = 128;
    const c = grain.getContext('2d'),
      pixels = c.createImageData(128, 128);
    for (let i = 0; i < 128 * 128; i++) {
      const n = i * 4,
        value = hash(i);
      pixels.data[n] = pixels.data[n + 1] = pixels.data[n + 2] = value > 0.5 ? 255 : 0;
      pixels.data[n + 3] = Math.abs(value - 0.5) * 22;
    }
    c.putImageData(pixels, 0, 0);
    return grain;
  }
  function draw(
    c,
    { x = 0, y = 0, width, height, age, rank = 'governor', quality = 1, overlayOnly = false },
  ) {
    const s = state(age, rank);
    if (!s.active) return false;
    c.save();
    c.globalCompositeOperation = 'source-over';
    c.filter = 'none';
    c.beginPath();
    c.rect(x, y, width, height);
    c.clip();
    if (s.plate) {
      c.globalAlpha = 1;
      c.fillStyle = '#d6ceb1';
      c.fillRect(x, y, width, height);
      const paper = c.createRadialGradient(
        x + width * 0.5,
        y + height * 0.44,
        width * 0.08,
        x + width * 0.5,
        y + height * 0.5,
        Math.max(width, height) * 0.72,
      );
      paper.addColorStop(0, '#ebe7cf55');
      paper.addColorStop(1, '#77744e32');
      c.fillStyle = paper;
      c.fillRect(x, y, width, height);
      const size = Math.min(width, height) * 0.72,
        driftX = (hash(Math.floor(age / 83) + 17) - 0.5) * 1.15,
        driftY = (hash(Math.floor(age / 113) + 23) - 0.5) * 0.75;
      c.globalAlpha = 0.96;
      if (ready)
        c.drawImage(
          seal,
          x + (width - size) / 2 + driftX,
          y + (height - size) / 2 + driftY,
          size,
          size,
        );
      else {
        c.fillStyle = '#24241e';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = '700 ' + Math.round(width * 0.17) + 'px Georgia,serif';
        c.fillText('FBC', x + width / 2, y + height / 2);
      }
      c.globalAlpha = 0.86;
      const pattern = c.createPattern(noise(), 'repeat');
      pattern.setTransform(
        new DOMMatrix().translate(Math.floor(age / 67) % 128, Math.floor(age / 97) % 128),
      );
      c.fillStyle = pattern;
      c.fillRect(x, y, width, height);
      c.globalAlpha = 0.13;
      c.fillStyle = '#292a22';
      for (let i = 0; i < 18; i++) {
        const n = i + Math.floor(age / 170) * 31;
        c.fillRect(
          x + hash(n) * width,
          y + hash(n + 73) * height,
          0.8 + hash(n + 39),
          0.5 + hash(n + 98) * 1.1,
        );
      }
      // The paper and seal are recorded through the same low-bandwidth tape pass.
      // Motion is deliberately limited to the recording, not an animated logo.
      const flutter = 0.012 + (Math.sin(age * 0.016) + Math.sin(age * 0.041)) * 0.004;
      c.globalAlpha = flutter;
      c.fillStyle = '#443c21';
      c.fillRect(x, y, width, height);
      let copy = copies.get(c);
      if (!copy) {
        copy = document.createElement('canvas');
        copies.set(c, copy);
      }
      const q = quality,
        left = Math.max(0, Math.round(x * q)),
        top = Math.max(0, Math.round(y * q)),
        w = Math.min(c.canvas.width - left, Math.round(width * q)),
        h = Math.min(c.canvas.height - top, Math.round(height * q));
      if (w > 0 && h > 0 && window.FleetVHS) {
        if (copy.width !== w || copy.height !== h) {
          copy.width = w;
          copy.height = h;
        }
        const ink = copy.getContext('2d');
        ink.clearRect(0, 0, w, h);
        ink.drawImage(c.canvas, left, top, w, h, 0, 0, w, h);
        FleetVHS.draw(c, copy, { x, y, width: w / q, height: h / q, age, amount: 0.9, wear: 1.18 });
      }
    } else {
      const p = s.progress,
        pulse = window.FleetFilmBurn?.impulse(p) ?? 1;
      if (!overlayOnly) {
        let copy = copies.get(c);
        if (!copy) {
          copy = document.createElement('canvas');
          copies.set(c, copy);
        }
        const q = quality,
          left = Math.max(0, Math.round(x * q)),
          top = Math.max(0, Math.round(y * q)),
          w = Math.min(c.canvas.width - left, Math.round(width * q)),
          h = Math.min(c.canvas.height - top, Math.round(height * q));
        if (w > 0 && h > 0) {
          if (copy.width !== w || copy.height !== h) {
            copy.width = w;
            copy.height = h;
          }
          const ink = copy.getContext('2d');
          ink.clearRect(0, 0, w, h);
          ink.drawImage(c.canvas, left, top, w, h, 0, 0, w, h);
          c.globalAlpha = 0.19 * pulse;
          c.drawImage(copy, 0, 0, w, h, x + width * 0.028, y + height * 0.007, width, height);
          for (let i = 0; i < 3; i++) {
            const by = Math.floor(h * (0.16 + i * 0.29)),
              bh = Math.max(1, Math.floor(h * 0.028));
            c.globalAlpha = 0.72 * pulse;
            c.drawImage(
              copy,
              0,
              by,
              w,
              bh,
              x + (i % 2 ? -1 : 1) * width * 0.06 * pulse,
              y + by / q,
              width,
              bh / q,
            );
          }
        }
      }
      window.FleetFilmBurn?.draw(c, { x, y, width, height, progress: p });
    }
    c.restore();
    return true;
  }
  window.FleetInterlude = {
    state,
    motionAge,
    extra,
    draw,
    loading,
    cutAt,
    hold,
    lead,
    get ready() {
      return ready;
    },
    get settled() {
      return settled;
    },
  };
})();
