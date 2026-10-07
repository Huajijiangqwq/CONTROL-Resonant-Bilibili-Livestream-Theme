'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), M = require('../app/theme-editor-model'), H = require('../app/theme-editor-history');
test('position edits keep a supported 20 MiB media document validated without repeated full-source scans', () => {
  let document = M.normalize({ layers: [0, 1].map(i => ({ id: 'media-' + i, type: 'image',
    x: i * 450, y: 100, w: 400, h: 240, src: 'data:image/png;base64,' + String.fromCharCode(65 + i).repeat(10 * 1024 * 1024) })) });
  const before = M.sourceCacheStats, history = H.create(); history.checkpoint(document);
  for (let frame = 0; frame < 8; frame++) { document.layers[0].x++; document = M.normalize(document); history.commit(document); }
  const after = M.sourceCacheStats;
  assert.equal(after.checks, before.checks, 'moving a layer must not revalidate unchanged 10 MiB sources');
  assert.equal(after.hits - before.hits, 16);
  assert(after.characters <= after.limit);
  assert.equal(history.stats.undo, 1); assert.equal(history.stats.assets, 2);
  assert(history.stats.documentCharacters < 20000, 'undo snapshots reference media instead of serializing base64');
  assert.equal(history.undo(document).layers[0].x, 0);
});
