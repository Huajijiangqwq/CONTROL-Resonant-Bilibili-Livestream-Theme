'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), M = require('../app/theme-editor-model'),
  C = require('../app/theme-layer-clipboard');
const near = (a, b) => assert(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test('aspect lock is opt-in and size edits preserve the captured ratio in either direction', () => {
  const legacy = M.layer({ type: 'image', w: 640, h: 360 });
  assert.equal(legacy.aspectLocked, false);
  const locked = M.layer({ ...legacy, aspectLocked: true });
  const width = M.resizeAspect(locked, 'w', 800), height = M.resizeAspect(locked, 'h', 300);
  near(width.h, 450); near(height.w, 1600 / 3);
  near(width.w / width.h, 16 / 9); near(height.w / height.h, 16 / 9);
  assert.equal(M.layer({ type: 'group', aspectLocked: true }).aspectLocked, undefined);
});
test('maximum and minimum dimensions clamp both axes together without distorting the ratio', () => {
  for (const ratio of [.01, .2, 1, 16 / 9, 100]) {
    for (const axis of ['w', 'h']) for (const value of [-2, 0, 1, 400, 100000]) {
      const size = M.resizeAspect({ w: 400, h: 200, aspectRatio: ratio }, axis, value);
      assert(size.w >= 2 - 1e-8 && size.w <= 1920 + 1e-8);
      assert(size.h >= 2 - 1e-8 && size.h <= 1080 + 1e-8);
      near(size.w / size.h, ratio);
    }
  }
});
test('intermediate small input, normalized roundtrip and clipboard retain the locked ratio', () => {
  let item = M.layer({ id: 'image', type: 'image', w: 640, h: 360, aspectLocked: true, src: 'assets/game-placeholder.svg' });
  for (const w of [1, 12, 128, 1280]) item = M.layer({ ...item, ...M.resizeAspect(item, 'w', w) });
  near(item.w, 1280); near(item.h, 720);
  const document = M.normalize({ layers: [item] });
  assert.deepEqual(M.normalize(document), document);
  const pasted = C.paste(M.normalize(), C.encode(document, ['image']), { id: () => 'pasted' }).items[0];
  assert.equal(pasted.aspectLocked, true); near(pasted.aspectRatio, 16 / 9);
});
