'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Motion = require('../app/native-notice-motion');
test('fleet exit starts exactly at rest and finishes with no residual ink for all ranks', () => {
  for (const rank of ['captain', 'admiral', 'governor']) {
    const start = Motion.fleetExit(0, rank), end = Motion.fleetExit(1, rank);
    for (const key of ['outerScale', 'outerAlpha', 'innerScale', 'innerAlpha', 'iconAlpha', 'iconClip', 'titleWidth', 'titleHeight', 'titleAlpha', 'nameAlpha']) assert.equal(start[key], 1, key);
    for (const key of ['iconY', 'titleY', 'nameY', 'innerAngle']) assert(Math.abs(start[key]) < 1e-10);
    for (const key of ['outerAlpha', 'innerAlpha', 'iconAlpha', 'iconClip', 'titleHeight', 'titleAlpha', 'nameAlpha']) assert.equal(end[key], 0, key);
  }
});
test('fleet lettering, emblem and outline withdraw separately with stronger rank overlap', () => {
  const middle = Motion.fleetExit(.63, 'governor');
  assert.equal(middle.nameAlpha, 0); assert(middle.iconAlpha > 0); assert(middle.outerAlpha > middle.iconAlpha);
  assert(Motion.fleetExit(.75, 'governor').outerAlpha > Motion.fleetExit(.75, 'admiral').outerAlpha);
  assert(Motion.fleetExit(.75, 'admiral').outerAlpha > Motion.fleetExit(.75, 'captain').outerAlpha);
  const closingLabel = Motion.fleetExit(.75);
  assert.equal(closingLabel.titleInkAlpha, 0);
  assert(closingLabel.titleHeight < .06 && closingLabel.titleAlpha < .16, 'late labels must not leave a tall white strip of clipped letters');
  for (const p of [.02, .1, .14, .21, .27, .29, .42, .63, .79, .92, 1]) {
    const before = Motion.fleetExit(Math.max(0, p - .000001)), after = Motion.fleetExit(Math.min(1, p + .000001));
    for (const key of Object.keys(before).filter(key => typeof before[key] === 'number')) assert(Math.abs(before[key] - after[key]) < .001, key + ' at ' + p);
  }
});
test('SC titles lead body and timer within the original entrance; settles are deterministic', () => {
  assert(Motion.scPart('label', 600).alpha > Motion.scPart('body', 600).alpha);
  assert.equal(Motion.scPart('timer', 600).alpha, 0);
  for (const kind of ['label', 'name', 'amount', 'body', 'timer']) {
    assert.deepEqual(Motion.scPart(kind, 1100), { x: 0, y: 0, alpha: 1 });
    assert.equal(Motion.scPart(kind, 1100, 660).alpha, 0);
    const forward = [500, 620, 840, 1000].map(age => Motion.scPart(kind, age));
    assert.deepEqual([1000, 840, 620, 500].map(age => Motion.scPart(kind, age)).reverse(), forward);
  }
  assert.equal(Motion.scActive(1000), false); assert.equal(Motion.scActive(1000, -1, 200), true);
});
test('reduced-motion sampling removes spatial shifts, rotation and size accents', () => {
  for (const p of [0, .08, .3, .6, .95, 1]) {
    const fleet = Motion.fleetExit(p, 'governor', true);
    assert.equal(fleet.outerScale, 1); assert.equal(fleet.innerScale, 1);
    for (const key of ['innerAngle', 'iconY', 'titleY', 'nameY']) assert(Math.abs(fleet[key]) < 1e-10);
    const sc = Motion.scPart('body', p * 1000, -1, 6, true);
    assert.equal(sc.x, 0); assert.equal(sc.y, 0);
  }
});
