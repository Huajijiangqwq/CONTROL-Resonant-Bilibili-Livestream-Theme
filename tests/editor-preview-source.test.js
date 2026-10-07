'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { create } = require('../app/editor-preview-source');

test('authoring preview is explicit, isolated, and resumes the same shared source', () => {
  let source = 'live', clears = 0, restores = 0;
  const states = [], session = create({ enabled: true, source: () => source,
    clear() { clears++; }, restore() { restores++; }, changed(value) { states.push(value); } });
  assert.equal(session.inspecting, false); assert.equal(clears, 0);
  session.begin(); assert.deepEqual(session.state(), { mode: 'example', source: 'live' });
  session.begin('timeline'); assert.equal(clears, 1, 'stepping a timeline must retain its messages');
  assert.equal(source, 'live'); assert.equal(restores, 0);
  session.resume(); assert.equal(session.inspecting, false); assert.equal(clears, 2); assert.equal(restores, 1);
  assert.equal(source, 'live', 'returning to live must not toggle the shared source');
  assert.equal(session.resume(), false); assert.equal(restores, 1);
  source = 'simulation'; session.begin(); session.resume(); assert.equal(restores, 1);
  assert.equal(states.at(-1).source, 'simulation');
});

test('pausing for inspection retains visible content and output pages cannot start a local session', () => {
  let clears = 0;
  const s = create({ enabled: true, source: () => 'live', clear() { clears++; }, restore() {} });
  s.begin('timeline', { clear: false }); assert.equal(clears, 0); assert.equal(s.inspecting, true);
  s.sourceChanged(); assert.equal(s.inspecting, false);
  const output = create({ source: () => 'live', clear() { throw Error('output changed'); }, restore() {} });
  assert.equal(output.begin(), false); assert.equal(output.resume(), false);
});
