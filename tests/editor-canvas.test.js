'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../app/theme-editor-model'), C = require('../app/theme-canvas-workspace'),
  G = require('../app/theme-editor-geometry'), I = require('../app/theme-instances');
test('pasteboard positions survive save, reopen, cloning and still keep a fixed output', () => {
  const doc = M.normalize({ composition: 'layers', layers: [
    { id: 'title', type: 'text', x: -640, y: -220, w: 350, h: 80 },
    { id: 'card', type: 'sc', x: 2200, y: 1210, w: 380, h: 400 },
  ] });
  const reopened = M.normalize(JSON.parse(JSON.stringify(doc)));
  assert.equal(reopened.width, 1920); assert.equal(reopened.height, 1080);
  assert.deepEqual(reopened.layers.map(l => [l.x, l.y]), [[-640, -220], [2200, 1210]]);
  let id = 0;
  const copies = I.clone(reopened, reopened.layers, () => 'copy-' + ++id);
  assert.deepEqual(copies.items.map(l => [l.x, l.y]), [[-616, -196], [2224, 1234]]);
});
test('group movement retains member distances even at the pasteboard limit', () => {
  const a = M.layer({ type: 'text', x: 7679, y: 10 }),
    b = M.layer({ type: 'text', x: 7460, y: 10 }),
    delta = C.commonDelta([a, b], 'x', 30, M.positionRange);
  assert.equal(delta, 1);
  const normalized = M.normalize({ layers: [{ ...a, id: 'a', x: a.x + delta }, { ...b, id: 'b', x: b.x + delta }] });
  assert.equal(normalized.layers[0].x - normalized.layers[1].x, 219);
});
test('off-screen part animation retains its complete entry and exit path', () => {
  const layer = M.layer({ type: 'fleet', parts: [{ id: 'name', x: -980, y: 1300,
    tracks: [{ property: 'x', keys: [{ time: 0, value: -1800 }, { time: 1000, value: 0 }] }],
    exitTracks: [{ property: 'y', keys: [{ time: 0, value: 100 }, { time: 1000, value: 1600 }] }] }] });
  const part = layer.parts.find(p => p.id === 'name');
  assert.equal(part.x, -980); assert.equal(part.y, 1300);
  const rebased = G.rebasePart(part, 'free', { layoutX: 240, layoutY: 300 });
  assert.equal(rebased.x, -740); assert.equal(rebased.tracks[0].keys[0].value, -1560);
  assert.equal(rebased.exitTracks[0].keys[1].value, 1900);
  const copied = G.duplicatePartMotion(part, { x: -980, y: 1300 });
  assert.equal(copied.value.x, -968);
  assert.equal(copied.value.exitTracks[0].keys[1].value, 1612);
});
test('zoom stays anchored to the pointer while panned and focused on a chat', () => {
  const area = { width: 1200, height: 700 }, view = { x: 1444, y: 72, w: 458, h: 908 },
    point = { x: 310, y: 480 }, pan = { x: 177, y: -81 },
    before = C.camera(area, view, .4, pan),
    nextPan = C.zoomPan(area, point, .4, 1.25, pan),
    after = C.camera(area, view, 1.25, nextPan);
  for (const axis of ['x', 'y'])
    assert(Math.abs((point[axis] - before[axis]) / before.scale - (point[axis] - after[axis]) / after.scale) < 1e-8);
});
test('rulers include negative positions and only allocate visible ticks', () => {
  const ticks = C.rulerTicks(1200, 800, .1);
  assert(ticks.some(t => t.value < 0)); assert(ticks.some(t => t.value === 0));
  assert(ticks.every(t => t.pixel >= 22 && t.pixel <= 1200));
  assert(ticks.length < 30);
});
test('editing renderer is screen-sized and never patches an OBS output document', () => {
  const props = {}, noEditor = { documentElement: { classList: { contains: () => false } } },
    frame = { style: {}, contentDocument: noEditor },
    area = { width: 1200, height: 700 }, view = { x: 0, y: 0, w: 1920, h: 1080 };
  C.renderFrame(frame, area, view, C.camera(area, view, .05));
  assert.equal(frame.style.width, '1200px'); assert.equal(frame.style.height, '700px');
  assert.equal(C.mountFrame(frame), false);
  assert.equal(C.mountFrame({ contentDocument: { documentElement: null } }), false);
  assert.equal(C.mountFrame({ contentDocument: { documentElement: { classList: { contains: () => true } }, head: {}, body: null } }), false);
});
test('duplicating a selected group retains group membership and appearance', () => {
  const doc = M.normalize({ layers: [
    { id: 'group', type: 'group', opacity: .6 },
    { id: 'a', type: 'text', parent: 'group', x: 100, y: 100, opacity: .7 },
    { id: 'b', type: 'text', parent: 'group', x: 450, y: 200 },
  ] });
  let id = 0;
  const { items } = I.clone(doc, doc.layers, () => 'copy-' + ++id);
  const next = M.normalize({ layers: items }), group = next.layers.find(l => l.type === 'group');
  assert(group);
  assert.equal(next.layers.filter(l => l.parent === group.id).length, 2);
  assert.equal(M.effective(next, next.layers.find(l => l.type === 'text')).opacity, .42);
});
test('alignment treats a selected group as one visual unit without collapsing its children', () => {
  const layers = [
    { id: 'g', type: 'group' },
    { id: 'a', type: 'text', parent: 'g', x: 100, y: 100, w: 100, h: 40, rotation: 90 },
    { id: 'b', type: 'text', parent: 'g', x: 400, y: 220, w: 200, h: 60 },
  ];
  const units = G.selectionUnits(layers, new Set(['g', 'a']));
  assert.equal(units.length, 1); assert.equal(units[0].members.length, 2);
  const delta = G.alignmentDelta(units[0].bounds, { x: 0, y: 0, w: 1920, h: 1080 }, 'left');
  assert.equal(delta.x, -130);
  const beforeDistance = layers[2].x - layers[1].x;
  for (const member of units[0].members) member.x += delta.x;
  assert.equal(layers[2].x - layers[1].x, beforeDistance);
  assert(Math.abs(G.visualBounds(units[0].members).x) < 1e-8);
});
test('hollow and rotated borders do not steal interior clicks from text below', () => {
  const border = { type: 'border', x: 1444, y: 72, w: 458, h: 908, strokeWidth: 1.5, rotation: 0 };
  assert.equal(G.hitLayer(border, { x: 1490, y: 120 }, 10), false);
  assert.equal(G.hitLayer(border, { x: 1440, y: 400 }, 10), true);
  const turned = { ...border, rotation: 35 };
  assert.equal(G.hitLayer(turned, G.point(turned, 200, 450), 10), false);
  assert.equal(G.hitLayer(turned, G.point(turned, 1, 450), 10), true);
  const corners = { ...border, borderStyle: 'corners', cornerInset: 12, cornerLength: 24 };
  assert.equal(G.hitLayer(corners, G.point(corners, 12, 26), 5), true);
  assert.equal(G.hitLayer(corners, G.point(corners, 12, 450), 5), false);
  assert.equal(G.hitLayer({ ...border, strokeWidth: 0 }, { x: 1444, y: 400 }, 10), false);
});
test('ordinary marquee selects complete groups while modifier marquee can select individual members', () => {
  const layers = [{ id: 'group', type: 'group' },
    { id: 'a', type: 'text', parent: 'group', x: 0, y: 0, w: 100, h: 40 },
    { id: 'b', type: 'text', parent: 'group', x: 200, y: 0, w: 100, h: 40 },
    { id: 'c', type: 'text', x: 400, y: 0, w: 100, h: 40 }];
  assert.deepEqual(G.marqueeSelection(layers, { x: -1, y: -1, w: 310, h: 100 }), ['group']);
  assert.deepEqual(G.marqueeSelection(layers, { x: -1, y: -1, w: 120, h: 100 }), []);
  assert.deepEqual(G.marqueeSelection(layers, { x: -1, y: -1, w: 120, h: 100 }, { deep: true }), ['a']);
  assert.deepEqual(G.marqueeSelection(layers, { x: -1, y: -1, w: 510, h: 100 }).sort(), ['c', 'group']);
});
