'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), { same } = require('../app/theme-document-compare'), M = require('../app/theme-editor-model');
test('document comparison ignores object key order and omitted fields, while preserving JSON array semantics', () => {
  assert(same({ x: 10, y: 20, missing: undefined }, { y: 20, x: 10 }));
  assert(!same({ x: undefined }, { x: null }));
  assert(same([undefined, , NaN], [null, null, null]));
  assert(!same([1, 2], [2, 1])); assert(!same([1], { 0: 1 }));
  assert(same({ infinity: Infinity }, { infinity: null }));
  assert(same({ omit: () => {} }, {}));
  assert(!same({ value: false }, { value: 0 }));
  assert(!same({ src: 'data:image/png;base64,AAAA' }, { src: 'data:image/png;base64,AAAB' }));
});
test('independently parsed theme documents compare equal but changed geometry, media, order, effects and crop do not', () => {
  const original = M.create('classic');
  original.layers.push(M.layer({ id: 'image', type: 'image', src: 'data:image/png;base64,aGVsbG8=', cropLeft: 20,
    effects: [{ id: 'fx', type: 'blur', value: 8 }] }));
  const copy = () => JSON.parse(JSON.stringify(original));
  assert(same(original, copy()));
  for (const alter of [
    d => { d.layers[0].x++; }, d => { d.layers.reverse(); },
    d => { d.layers.at(-1).src = 'data:image/png;base64,aGVsbG8h'; },
    d => { d.layers.at(-1).cropLeft++; }, d => { d.layers.at(-1).effects[0].value++; },
  ]) { const value = copy(); alter(value); assert(!same(original, value)); }
});
test('a lightweight normalized snapshot remains independent of the editor object modified on the following frame', () => {
  const editor = M.normalize({ layers: [{ id: 'image', type: 'image', x: 20, src: 'data:image/png;base64,aGVsbG8=' }] });
  const sent = M.normalize(editor);
  editor.layers[0].x = 42;
  assert.equal(sent.layers[0].x, 20); assert(!same(editor, sent));
  assert.equal(sent.layers[0].src, editor.layers[0].src);
});
