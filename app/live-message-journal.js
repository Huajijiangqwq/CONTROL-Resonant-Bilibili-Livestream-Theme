(function(root) {
'use strict';
// Recent display state lives only in memory. New previews and OBS can restore
// the same messages without re-triggering entrances or exposing login data.
function createMessageJournal({ now = Date.now } = {}) {
  const keys = ['kind', 'sender', 'userId', 'source', 'receivedAt', 'eventId', 'roomId', 'body', 'scId', 'amount', 'duration', 'expiresAt', 'giftId', 'giftName', 'quantity', 'value', 'coinType', 'rank'];
  let room = '', input = '', phase = 'idle', items = [];
  const identity = item => item.kind === 'sc' && item.scId ? 'sc:' + item.scId : item.eventId;
  function prune() {
    const time = now(), active = items.filter(item => item.kind === 'sc' ? item.expiresAt > time : time - item.receivedAt < 300000);
    const paid = active.filter(item => item.kind === 'sc').slice(-64);
    const ordinary = active.filter(item => item.kind !== 'sc').slice(-(80 - paid.length));
    items = [...ordinary, ...paid].sort((a, b) => a.receivedAt - b.receivedAt);
  }
  function status(value) {
    const nextRoom = String(value.roomId || ''), nextInput = String(value.roomInput || '');
    if (value.phase === 'idle' || (input && nextInput && input !== nextInput) || (room && nextRoom && room !== nextRoom) || (value.phase === 'connecting' && phase !== 'connecting' && value.received === 0)) items = [];
    if (nextRoom) room = nextRoom;
    if (nextInput) input = nextInput;
    phase = value.phase;
  }
  function message(value) {
    if (value.kind === 'delete') { const ids = new Set(value.scIds || []); items = items.filter(item => item.kind !== 'sc' || !ids.has(item.scId)); return; }
    if (!['normal', 'sc', 'gift', 'fleet'].includes(value.kind) || typeof value.sender !== 'string' || !Number.isFinite(value.receivedAt)) return;
    const id = identity(value);
    if (id && items.some(item => identity(item) === id)) return;
    items.push(Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]])));
    prune();
  }
  function snapshot() { prune(); return { roomId: room, capturedAt: now(), items: items.map(item => ({ ...item, restored: true })) }; }
  function replace(value) {
    room = String(value.roomId || ''); items = [];
    for (const item of Array.isArray(value.items) ? value.items : []) message(item);
  }
  return { status, message, snapshot, replace };
}
if (typeof module === 'object' && module.exports) module.exports = { createMessageJournal };
else root.LiveMessageJournal = { create: createMessageJournal };
})(globalThis);
