'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const M = require('../app/theme-editor-model');
const protocol = require('../app/bilibili-protocol');
const DSP = require('../app/now-playing-dsp');
const { excluded } = require('../scripts/package');

test('all production layouts normalize and retain component instances', () => {
  for (const kind of ['classic', 'game', 'split', 'custom']) {
    const doc = M.create(kind),
      normalized = M.normalize(doc);
    assert.equal(normalized.format, 'control-theme');
    assert.equal(normalized.version, 1);
    assert(normalized.layers.length > 0);
    assert.equal(new Set(normalized.layers.map((l) => l.id)).size, normalized.layers.length);
    const game = normalized.layers.find((l) => l.type === 'game');
    assert(game);
    const two = M.normalize({
      ...normalized,
      layers: [...normalized.layers, { ...game, id: 'second-game', x: 300 }],
    });
    assert.equal(two.layers.filter((l) => l.type === 'game').length, 2);
  }
});
test('invalid imports are bounded and executable image URLs rejected', () => {
  const doc = M.create('classic');
  doc.layers[0].x = Infinity;
  assert(Number.isFinite(M.normalize(doc).layers[0].x));
  assert(!M.source('javascript:alert(1)'));
  assert(!M.source('file:///private/photo.png'));
  assert(M.capacityIssue({ ...doc, layers: Array.from({ length: 101 }, () => doc.layers[0]) }));
});
test('room input accepts IDs and Bilibili links, rejects arbitrary hosts', () => {
  assert.equal(String(protocol.roomNumber('12345')), '12345');
  assert.equal(String(protocol.roomNumber('https://live.bilibili.com/12345')), '12345');
  assert.throws(() => protocol.roomNumber('https://example.org/12345'));
});
test('silent and synthetic audio can be analyzed without external dependencies', () => {
  const analyzer = new DSP.SpectrumAnalyzer(48000, 2);
  assert(analyzer.fft);
  assert.equal(analyzer.size, 4096);
  const envelope = new DSP.SpectrumEnvelope();
  envelope.feed(Array(48).fill(-100), 0, 0);
  assert([...envelope.sample(20)].every((v) => Number.isFinite(v) && v >= 0 && v <= 1));
  envelope.feed(Array(48).fill(-20), 100, 0.5);
  assert([...envelope.sample(150)].some((v) => v > 0));
});
test('archive policy excludes credentials, published themes, logs and builds', () => {
  for (const rel of [
    'app/theme-live/binding.json',
    'app/theme-projects/theme.json',
    'app/audio-settings.json',
    'app/now-playing-settings.json',
    'app/now-playing-capture.exe',
    '.runtime/service-8791.json',
    'app/debug.log',
    'app/.env',
  ])
    assert(excluded(rel), rel);
  for (const rel of [
    'app/now-playing-fft.js',
    'app/theme-editor.js',
    'licenses/fft.js-MIT.txt',
    'app/assets/game-placeholder.svg',
  ])
    assert(!excluded(rel), rel);
});
