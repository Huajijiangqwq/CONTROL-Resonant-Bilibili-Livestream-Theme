(function (root) {
  'use strict';
  const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, Number.isFinite(n) ? n : a));
  function create() {
    let level = 0,
      hit = 0,
      baseline = 0,
      last = null;
    const bands = [0, 0, 0],
      bandBaselines = [0, 0, 0],
      bandHits = [0, 0, 0];
    return {
      sample(peak, time, gain = 2, amount = 0.8, spectrum = [], config = []) {
        // Exponential envelopes remain stable across a long gap. Let them settle
        // toward the fresh sample instead of reviving a stale pre-background beat.
        const dt = last === null ? 1 / 60 : clamp((time - last) / 1000, 0, 5);
        last = time;
        const target = 1 - Math.exp(-Math.max(0, clamp(peak) - 0.006) * clamp(gain, 0.5, 5) * 4.5);
        // Peaks push the field quickly; the optical mass then relaxes gradually.
        const input = clamp(peak);
        baseline += (input - baseline) * (1 - Math.exp(-dt / 0.8));
        hit = Math.max(
          hit * Math.exp(-dt / 0.22),
          Math.max(0, (input - baseline) * clamp(gain, 0.5, 5) - 0.025) * 3.5,
        );
        level += (target - level) * (1 - Math.exp(-dt / (target > level ? 0.055 : 0.42)));
        // Band RMS is independent of the peak meter; high frequencies need more
        // gain because their energy is typically much lower than bass and voice.
        for (let i = 0; i < 3; i++) {
          const target =
            1 -
            Math.exp(
              -Math.max(0, clamp(spectrum[i]) - 0.001) *
                clamp(gain, 0.5, 5) *
                [14, 18, 38][i] *
                clamp(config[i]?.gain ?? 1, 0.25, 4),
            );
          bandBaselines[i] += (target - bandBaselines[i]) * (1 - Math.exp(-dt / 0.35));
          bandHits[i] = Math.max(
            bandHits[i] * Math.exp(-dt / 0.2),
            Math.max(0, target - bandBaselines[i] - 0.03) * 2.4,
          );
          const tau = target > bands[i] ? [0.065, 0.09, 0.025][i] : [0.52, 0.34, 0.14][i];
          bands[i] += (target - bands[i]) * (1 - Math.exp(-dt / tau));
        }
        const values = bands.map((v, i) => v * clamp(amount) * clamp(config[i]?.max ?? 1));
        const result = {
          level: clamp(level) * clamp(amount),
          hit: clamp(hit) * clamp(amount),
          spreadHit: 0,
          bass: 0,
          mid: 0,
          high: 0,
          optics: 0,
          glow: 0,
          bands: values,
        };
        const names = {
          spread: 'bass',
          flow: 'mid',
          fibers: 'high',
          optics: 'optics',
          glow: 'glow',
        };
        for (let i = 0; i < 3; i++) {
          const key = names[config[i]?.target ?? ['spread', 'flow', 'fibers'][i]];
          if (key) result[key] = Math.max(result[key], values[i]);
          if (key === 'bass')
            result.spreadHit = Math.max(
              result.spreadHit,
              clamp(bandHits[i]) * clamp(amount) * clamp(config[i]?.max ?? 1),
            );
        }
        return result;
      },
    };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AudioEnvelope = api;
})(typeof window === 'object' ? window : globalThis);
