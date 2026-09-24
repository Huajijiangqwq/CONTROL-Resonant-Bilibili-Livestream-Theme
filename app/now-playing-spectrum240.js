(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('./now-playing-fft'));
  else root.NowPlayingFineDSP = factory(null);
})(typeof window === 'object' ? window : globalThis, function (FFT) {
  'use strict';
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));
  const BAND_COUNT = 240,
    MIN_HZ = 45,
    MAX_HZ = 16000;
  const frequencies = Array.from(
    { length: BAND_COUNT },
    (_, i) => MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, (i + 0.5) / BAND_COUNT),
  );
  class SpectrumAnalyzer {
    constructor(rate = 48000, channels = 2) {
      this.rate = rate;
      this.channels = channels;
      this.size = 4096;
      this.hop = 512;
      this.position = 0;
      this.filled = 0;
      this.since = 0;
      this.fft = new FFT(this.size);
      this.rings = Array.from({ length: channels }, () => new Float64Array(this.size));
      this.input = new Float64Array(this.size);
      this.output = this.fft.createComplexArray();
      this.power = new Float64Array(this.size / 2);
      this.window = Float64Array.from(
        { length: this.size },
        (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (this.size - 1)),
      );
      this.windowSum = this.window.reduce((a, b) => a + b, 0);
      this.total = 0;
      // Fractional-bin overlap avoids abrupt jumps at logarithmic band boundaries.
      this.filters = frequencies.map((freq, i) => {
        const lo = (MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, i / BAND_COUNT) * this.size) / rate,
          hi = (MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, (i + 1) / BAND_COUNT) * this.size) / rate;
        const weights = [];
        for (
          let bin = Math.max(1, Math.floor(lo - 0.5));
          bin <= Math.min(this.size / 2 - 1, Math.ceil(hi + 0.5));
          bin++
        ) {
          const weight = Math.max(0, Math.min(hi, bin + 0.5) - Math.max(lo, bin - 0.5));
          if (weight) weights.push([bin, weight]);
        }
        return weights;
      });
    }
    push(samples) {
      let result = null;
      for (let frame = 0; frame + this.channels <= samples.length; frame += this.channels) {
        for (let ch = 0; ch < this.channels; ch++)
          this.rings[ch][this.position] = clamp(samples[frame + ch], -1, 1);
        this.position = (this.position + 1) & (this.size - 1);
        this.filled = Math.min(this.size, this.filled + 1);
        this.since++;
        this.total++;
        if (this.filled === this.size && this.since >= this.hop) {
          this.since = 0;
          result = this.measure();
        }
      }
      return result;
    }
    measure() {
      this.power.fill(0);
      let rms = 0;
      for (const ring of this.rings) {
        for (let i = 0; i < this.size; i++) {
          const value = ring[(this.position + i) & (this.size - 1)];
          this.input[i] = value * this.window[i];
          rms += value * value;
        }
        this.fft.realTransform(this.output, this.input);
        for (let bin = 1; bin < this.size / 2; bin++)
          this.power[bin] +=
            ((this.output[bin * 2] ** 2 + this.output[bin * 2 + 1] ** 2) * 4) /
            (this.windowSum ** 2 * this.channels);
      }
      // Combine channel POWER, never sum samples: opposite-phase stereo stays visible.
      const db = this.filters.map((weights) => {
        let sum = 0,
          weight = 0;
        for (const [bin, w] of weights) {
          sum += this.power[bin] * w;
          weight += w;
        }
        return clamp(10 * Math.log10(sum / Math.max(0.001, weight) + 1e-14), -120, 6);
      });
      return {
        db,
        rms: Math.sqrt(rms / (this.size * this.channels)),
        rate: this.rate,
        channels: this.channels,
        windowMs: (this.size / this.rate) * 1000,
        hopMs: (this.hop / this.rate) * 1000,
        position: this.total / this.rate,
      };
    }
  }
  class SpectrumEnvelope {
    constructor() {
      this.values = new Float32Array(BAND_COUNT);
      this.target = new Float32Array(BAND_COUNT);
      this.stamp = -Infinity;
      this.previous = NaN;
      this.settings = { gain: 0, floor: -72, ceiling: -12, attack: 18, release: 135, tilt: 2 };
    }
    configure(settings) {
      for (const key of Object.keys(this.settings))
        if (Number.isFinite(settings[key])) this.settings[key] = settings[key];
    }
    feed(db, now, rms = 1) {
      const s = this.settings;
      for (let i = 0; i < BAND_COUNT; i++) {
        const tilt = s.tilt * Math.log2(frequencies[i] / 1000),
          raw = Number(db?.[i]),
          level = (Number.isFinite(raw) ? raw : -120) + s.gain + tilt;
        this.target[i] =
          rms < 0.000035 ? 0 : clamp((level - s.floor) / Math.max(6, s.ceiling - s.floor));
      }
      this.stamp = now;
    }
    sample(now) {
      const dt = Number.isFinite(this.previous)
        ? Math.min(2, Math.max(0, (now - this.previous) / 1000))
        : 1 / 60;
      this.previous = now;
      const stale = now - this.stamp > 160;
      for (let i = 0; i < BAND_COUNT; i++) {
        const target = stale ? 0 : this.target[i],
          tau = (target > this.values[i] ? this.settings.attack : this.settings.release) / 1000;
        this.values[i] += (target - this.values[i]) * -Math.expm1(-dt / Math.max(0.001, tau));
        if (this.values[i] < 0.0001) this.values[i] = 0;
      }
      return this.values;
    }
    reset() {
      this.values.fill(0);
      this.target.fill(0);
      this.stamp = -Infinity;
      this.previous = NaN;
    }
  }
  function normalizeTrack(query, progress, now = Date.now()) {
    const player = query?.player || {},
      track = query?.track || {};
    const number = (v) => Math.max(0, Number.isFinite(Number(v)) ? Number(v) : 0);
    const duration = number(track.duration),
      position = Number.isFinite(progress?.progress)
        ? progress.progress / 1000
        : number(player.seekbarCurrentPosition);
    return {
      connected: true,
      hasSong: player.hasSong === true && !!String(track.title || '').trim(),
      paused: player.isPaused !== false,
      title: String(track.title || '').slice(0, 500),
      artist: String(track.author || '').slice(0, 500),
      album: String(track.album || '').slice(0, 500),
      id: String(track.id || track.title || ''),
      duration,
      position: duration ? Math.min(duration, position) : position,
      cover: String(track.cover || ''),
      stamp: now,
    };
  }
  function positionAt(track, now) {
    return clamp(
      track.position + (track.hasSong && !track.paused ? Math.max(0, now - track.stamp) / 1000 : 0),
      0,
      track.duration || Number.MAX_SAFE_INTEGER,
    );
  }
  return {
    SpectrumAnalyzer,
    SpectrumEnvelope,
    normalizeTrack,
    positionAt,
    frequencies,
    BAND_COUNT,
  };
});
