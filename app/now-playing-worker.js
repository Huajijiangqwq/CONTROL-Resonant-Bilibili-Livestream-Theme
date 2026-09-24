'use strict';
const { parentPort } = require('node:worker_threads');
const { SpectrumAnalyzer } = require('./now-playing-dsp');
let analyzer = null;
parentPort.on('message', (message) => {
  try {
    if (message.type === 'reset') {
      analyzer = null;
      return;
    }
    if (!analyzer || analyzer.rate !== message.rate || analyzer.channels !== message.channels)
      analyzer = new SpectrumAnalyzer(message.rate, message.channels);
    const samples = new Float32Array(message.samples),
      started = performance.now(),
      result = analyzer.push(samples);
    parentPort.postMessage({
      type: 'result',
      result,
      computeMs: performance.now() - started,
      received: message.received,
      generation: message.generation,
    });
  } catch (error) {
    parentPort.postMessage({
      type: 'failure',
      error: error.message,
      generation: message.generation,
    });
  }
});
