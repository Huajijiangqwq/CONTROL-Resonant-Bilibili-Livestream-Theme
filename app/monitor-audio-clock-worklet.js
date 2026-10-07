/* Silent audio clock: one tiny tick at 24/30/60 Hz, no PCM crosses to the UI. */
class ControlMonitorClock extends AudioWorkletProcessor {
  constructor() {
    super(); this.enabled = false; this.frames = 0; this.fps = 60;
    this.port.onmessage = event => {
      const data = event.data || {};
      if (typeof data.enabled === 'boolean') { this.enabled = data.enabled; if (!this.enabled) this.frames = 0; }
      if (Number.isFinite(data.fps)) this.fps = Math.max(15, Math.min(60, data.fps));
    };
  }
  process(inputs, outputs) {
    for (const bus of outputs) for (const channel of bus) channel.fill(0);
    if (!this.enabled) return true;
    this.frames += inputs[0]?.[0]?.length || outputs[0]?.[0]?.length || 128;
    const period = sampleRate / this.fps;
    if (this.frames >= period) { this.frames %= period; this.port.postMessage(0); }
    return true;
  }
}
registerProcessor('control-monitor-clock', ControlMonitorClock);
