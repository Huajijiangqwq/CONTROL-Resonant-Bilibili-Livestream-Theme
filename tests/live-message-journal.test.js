'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createMessageJournal } = require('../app/live-message-journal');
test('new views restore recent messages and unexpired SC without retaining credentials', () => {
  let time = 1000000;
  const journal = createMessageJournal({ now: () => time });
  journal.status({ phase: 'connected', roomInput: '12', roomId: '123', received: 0 });
  journal.message({ kind: 'sc', sender: '支持者', body: 'SC', eventId: 'paid', scId: '42', receivedAt: time, expiresAt: time + 3600000, session: 'never-copy' });
  for (let i = 0; i < 100; i++) journal.message({ kind: 'normal', sender: '观众', body: '' + i, eventId: 'normal' + i, receivedAt: ++time });
  const value = journal.snapshot();
  assert.equal(value.items.length, 80);
  assert(value.items.some(item => item.scId === '42'));
  assert(value.items.every(item => item.restored));
  assert(!JSON.stringify(value).includes('never-copy'));
  const copy = createMessageJournal({ now: () => time });
  copy.replace(value);
  assert.deepEqual(copy.snapshot(), value);
  time += 300001;
  assert.equal(journal.snapshot().items.length, 1);
  journal.message({ kind: 'delete', scIds: ['42'] });
  assert.equal(journal.snapshot().items.length, 0);
});
test('retries retain live context while explicit disconnects and room switches clear it', () => {
  const journal = createMessageJournal({ now: () => 1000 });
  journal.status({ phase: 'connected', roomInput: '123', roomId: '123', received: 1 });
  journal.message({ kind: 'normal', sender: '观众', receivedAt: 900, eventId: 'one', body: '一次' });
  journal.status({ phase: 'retrying', roomInput: '123', roomId: '123', received: 1 });
  journal.status({ phase: 'connected', roomInput: '123', roomId: '123', received: 1 });
  assert.equal(journal.snapshot().items.length, 1);
  journal.status({ phase: 'connecting', roomInput: '456', roomId: null, received: 0 });
  assert.equal(journal.snapshot().items.length, 0);
  journal.message({ kind: 'normal', sender: '新房间', receivedAt: 1000, eventId: 'two' });
  journal.status({ phase: 'idle', roomInput: '456', roomId: '456', received: 1 });
  assert.equal(journal.snapshot().items.length, 0);
});

test('restored fleet and gift lifetime uses message age instead of restarting the hold', () => {
  const lifetime = require('../app/notice-lifetime');
  for (const kind of ['fleet', 'gift']) {
    const before = { kind }, restored = { kind };
    lifetime.start(before, 1000, 2000, {});
    lifetime.start(restored, 300, 2000, {}, 6000);
    assert.equal(restored.noticeExitAt - 300, before.noticeExitAt - 7000);
    const old = { kind };
    lifetime.start(old, 300, 2000, {}, 60000);
    assert.equal(lifetime.finished(old, 300), true);
    const held = { kind };
    lifetime.start(held, 300, 2000, { [kind + 'Hold']: 0 }, 60000);
    assert.equal(held.noticeExitAt, Infinity);
  }
});
