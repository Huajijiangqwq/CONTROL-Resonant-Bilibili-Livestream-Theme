'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), N = require('../app/theme-layer-navigation');
function fixture(count = 100) {
  const document = { activeElement: null }, handlers = {};
  const list = { ownerDocument: document, attributes: {}, rows: [], tabIndex: 0,
    addEventListener(key, fn) { handlers[key] = fn; }, setAttribute(k, v) { this.attributes[k] = v; },
    querySelectorAll() { return this.rows; }, closest() { return null; },
    contains(node) { return this.rows.includes(node) || this.rows.some(r => r.buttons.includes(node)); } };
  list.rows = Array.from({ length: count }, (_, i) => {
    const row = { dataset: { treeKey: 'layer-' + i, treeParent: '' }, tabIndex: 0,
      querySelectorAll() { return this.buttons; }, querySelector() { return null; },
      closest() { return this; }, focus() { document.activeElement = this; }, scrollIntoView() {} };
    row.buttons = Array.from({ length: 3 }, () => ({ tabIndex: 0, closest: () => row })); return row;
  });
  const send = (target, key, extra = {}) => {
    const event = { target, key, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
    handlers.keydown(event); return event;
  };
  return { document, list, send };
}
test('100 layers have one tab stop and arrows select rows without nudging canvas elements', () => {
  const f = fixture(), activated = [];
  N.refresh(f.list, { selectedKeys: ['layer-50'], activate: row => activated.push(row.dataset.treeKey) });
  assert.equal(f.list.rows.filter(r => r.tabIndex === 0).length, 1);
  assert(f.list.rows.every(r => r.buttons.every(b => b.tabIndex === -1)));
  const down = f.send(f.list.rows[50], 'ArrowDown');
  assert(down.prevented && down.stopped); assert.equal(activated.at(-1), 'layer-51');
  assert.equal(f.document.activeElement.dataset.treeKey, 'layer-51');
  f.send(f.document.activeElement, 'Home'); assert.equal(activated.at(-1), 'layer-0');
  f.send(f.document.activeElement, 'End', { ctrlKey: true });
  assert.equal(f.document.activeElement.dataset.treeKey, 'layer-99'); assert.equal(activated.at(-1), 'layer-0');
  const nativeButton = f.send(f.list.rows[99].buttons[0], 'Enter');
  assert.equal(nativeButton.prevented, false); assert.equal(nativeButton.stopped, false);
});
test('refresh restores the focused row and empty lists consume navigation keys', () => {
  const f = fixture(3); N.refresh(f.list, { selectedKeys: ['layer-1'] });
  f.list.rows[1].focus(); const restoreKey = N.capture(f.list);
  f.document.activeElement = null; N.refresh(f.list, { restoreKey });
  assert.equal(f.document.activeElement, f.list.rows[1]);
  f.list.rows = []; N.refresh(f.list);
  const event = f.send(f.list, 'ArrowDown'); assert(event.prevented && event.stopped);
});
