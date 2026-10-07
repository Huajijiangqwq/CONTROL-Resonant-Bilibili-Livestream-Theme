'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), M = require('../app/theme-editor-model'),
  H = require('../app/theme-editor-history');
const layer = (id, parent = '') => ({ id, name: id, type: 'shape', parent, x: 0, y: 0, w: 100, h: 100 });
const ids = layers => layers.map(l => l.id);
test('grouping nonadjacent layers forms one ordered render block at the highest selected member', () => {
  const layers = [layer('a'), layer('middle'), layer('b'), layer('top')];
  layers[0].parent = layers[2].parent = 'g';
  const grouped = M.stackGroup(layers, new Set(['a', 'b']), { ...layer('g'), type: 'group' });
  assert.deepEqual(ids(grouped), ['middle', 'a', 'b', 'g', 'top']);
  assert.deepEqual(ids(M.normalize({ layers: grouped }).layers), ids(grouped));
});
test('search retains matching children and their parent group, including parts', () => {
  const layers = [{ ...layer('g'), name: '品牌组', type: 'group' },
    { ...layer('a', 'g'), name: '字幕文字' }, { ...layer('b', 'g'), name: '边框' },
    { ...layer('fleet'), name: '上舰', parts: [{ name: '舰长用户名' }] }];
  assert.deepEqual([...M.matchingLayers(layers, '字幕')].sort(), ['a', 'g']);
  assert.deepEqual([...M.matchingLayers(layers, '品牌')].sort(), ['a', 'b', 'g']);
  assert.deepEqual([...M.matchingLayers(layers, '用户名')], ['fleet']);
  assert.equal(M.matchingLayers(layers, '不存在').size, 0);
});
test('stack ordering moves siblings without detaching a child, and moves groups as blocks', () => {
  const layers = [layer('a', 'g'), layer('b', 'g'), { ...layer('g'), type: 'group' }, layer('top')];
  assert.deepEqual(ids(M.orderLayers(layers, new Set(['a']), 1)), ['b', 'a', 'g', 'top']);
  assert.deepEqual(ids(M.orderLayers(layers, new Set(['b']), 1)), ['a', 'b', 'g', 'top']);
  assert.deepEqual(ids(M.orderLayers(layers, new Set(['g']), 1)), ['top', 'a', 'b', 'g']);
});
test('dragging between groups updates membership instead of separating tree order from painted order', () => {
  const layers = [layer('a', 'g'), layer('b', 'g'), { ...layer('g'), type: 'group' }, layer('top')];
  const outside = M.dropLayer(layers, 'a', 'top');
  assert.deepEqual(ids(outside), ['b', 'g', 'top', 'a']);
  assert.equal(outside.find(l => l.id === 'a').parent, '');
  const inside = M.dropLayer(outside, 'a', 'g');
  assert.deepEqual(ids(inside), ['b', 'a', 'g', 'top']);
  assert.equal(inside.find(l => l.id === 'a').parent, 'g');
  assert.equal(M.dropLayer(inside, 'g', 'b'), inside, 'group cannot be dropped into its own child');
});
test('undo and redo restore selection alongside layer data without exporting UI state', () => {
  const original = M.normalize({ layers: [layer('a')] }), changed = M.normalize({ layers: [layer('a'), layer('copy')] }), history = H.create();
  history.checkpoint(original, { selected: ['a'], part: null }); history.commit(changed);
  const restored = history.undo(changed, false, { selected: ['copy'], part: null });
  assert.deepEqual(ids(restored.layers), ['a']); assert.deepEqual(history.uiState.selected, ['a']);
  assert.equal(restored.uiState, undefined);
  const redone = history.undo(restored, true, { selected: ['a'] });
  assert.deepEqual(ids(redone.layers), ['a', 'copy']); assert.deepEqual(history.uiState.selected, ['copy']);
});
test('layer drag and ordering cannot bypass an inherited group lock', () => {
  const layers = [layer('a', 'g'), { ...layer('g'), type: 'group', locked: true }, layer('top')];
  assert.deepEqual(ids(M.orderLayers(layers, new Set(['g']), 1)), ids(layers));
  assert.equal(M.dropLayer(layers, 'a', 'top'), layers);
  assert.equal(M.dropLayer(layers, 'top', 'g'), layers);
});
