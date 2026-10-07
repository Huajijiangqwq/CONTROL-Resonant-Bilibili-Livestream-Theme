'use strict';
const test = require('node:test'), assert = require('node:assert/strict'),
  fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'),
  Crop = require('../app/theme-media-crop'), M = require('../app/theme-editor-model'),
  History = require('../app/theme-editor-history');
const near = (a, b) => assert(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test('cropping persists in a portable project and undo restores crop without rewriting source or frame', () => {
  const source = 'data:image/png;base64,aGVsbG8=',
    original = M.normalize({ format: 'control-theme', layers: [
      { id: 'photo', type: 'image', src: source, x: -120, y: 90, w: 640, h: 360 },
    ] }), history = History.create();
  history.checkpoint(original);
  const next = M.normalize({ ...original, layers: [{ ...original.layers[0], cropLeft: 12.5, cropBottom: 30 }] });
  history.commit(next);
  const opened = M.normalize(JSON.parse(JSON.stringify(next))), layer = opened.layers[0];
  assert.equal(layer.src, source); assert.equal(layer.cropLeft, 12.5); assert.equal(layer.cropBottom, 30);
  assert.deepEqual([layer.x, layer.y, layer.w, layer.h], [-120, 90, 640, 360]);
  const restored = history.undo(opened).layers[0];
  assert.equal(restored.cropLeft, 0); assert.equal(restored.cropBottom, 0); assert.equal(restored.src, source);
});
test('normalization always retains at least 5 percent of source on each axis', () => {
  const value = Crop.normalize({ cropLeft: 95, cropRight: 95, cropTop: Infinity, cropBottom: -30 });
  assert.equal(value.cropLeft + value.cropRight, 95); assert.equal(value.cropTop, 0); assert.equal(value.cropBottom, 0);
  assert.equal(Crop.rect(0, 100, 100, 100), null);
  for (const fit of ['contain', 'cover', 'fill'])
    assert(Object.values(Crop.rect(1200, 800, 400, 240, fit, value)).every(Number.isFinite));
});
test('DOM media geometry and Canvas capture sample exactly the same cropped region', () => {
  for (const fit of ['contain', 'cover', 'fill']) {
    const crop = { cropLeft: 20, cropTop: 5, cropRight: 15, cropBottom: 25 },
      r = Crop.rect(1600, 1200, 500, 180, fit, crop),
      style = Crop.style(1600, 1200, 500, 180, fit, crop),
      sx = style.width / 1600, sy = style.height / 1200;
    near(style.left + r.sx * sx, r.dx); near(style.top + r.sy * sy, r.dy);
    near(r.sw * sx, r.dw); near(r.sh * sy, r.dh);
  }
});
test('uncropped legacy images retain centered fitting and gameplay is not falsely cropped', () => {
  assert.deepEqual(Crop.rect(800, 400, 400, 400, 'contain'), {
    sx: 0, sy: 0, sw: 800, sh: 400, dx: 0, dy: 100, dw: 400, dh: 200,
  });
  assert.deepEqual(Crop.rect(800, 400, 400, 400, 'cover'), {
    sx: 200, sy: 0, sw: 400, sh: 400, dx: 0, dy: 0, dw: 400, dh: 400,
  });
  assert.equal(Crop.enabled({ type: 'game' }), false);
  assert.equal(Crop.enabled({ type: 'background', mode: 'theme' }), false);
  assert.equal(Crop.enabled({ type: 'background', mode: 'video' }), true);
});
test('VHS decoration capture reads wrapped cropped media instead of dropping the image', () => {
  const window = { ThemeMediaCrop: Crop }, context = { window, ThemeMediaCrop: Crop };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/theme-decoration-paint.js'), 'utf8'), context);
  const image = { tagName: 'IMG', complete: true, naturalWidth: 1000, naturalHeight: 500 },
    wrapper = { tagName: 'DIV', matches: () => false, querySelector: () => image },
    layer = { type: 'image', w: 400, h: 300, fit: 'contain', cropLeft: 20, cropRight: 10, cropBottom: 15 };
  let draw;
  window.ThemeDecorationPaint.draw({ drawImage(...args) { draw = args; } }, wrapper, layer);
  const expected = Crop.rect(1000, 500, 400, 300, 'contain', layer);
  assert.equal(draw[0], image);
  assert.deepEqual(draw.slice(1), Object.values(expected));
});
