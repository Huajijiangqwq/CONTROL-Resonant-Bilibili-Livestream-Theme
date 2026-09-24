((root) => {
  'use strict';
  const KEY = 'hiss-live-recovery-v1',
    KINDS = ['normal', 'gift', 'sc', 'fleet'];
  const identity = (m) => (m.kind === 'sc' && m.scId ? 'sc:' + m.scId : m.eventId || '');
  function create(storage, now = Date.now) {
    let state = { room: '', selected: false, items: [], seen: [] };
    function valid(m) {
      return (
        m &&
        KINDS.includes(m.kind) &&
        typeof m.sender === 'string' &&
        Number.isFinite(m.receivedAt) &&
        (m.kind === 'sc'
          ? Number.isFinite(m.expiresAt) && m.expiresAt > now()
          : now() - m.receivedAt < 300000)
      );
    }
    function prune() {
      state.items = state.items.filter(valid).slice(-80);
      const unique = new Map(),
        time = now();
      for (const s of state.seen) {
        if (!s || typeof s.id !== 'string' || !Number.isFinite(s.until) || s.until <= time)
          continue;
        const until = Math.max(s.until, unique.get(s.id)?.until || 0);
        unique.delete(s.id);
        unique.set(s.id, { id: s.id, until });
      }
      // Ordinary bursts must not displace unexpired SC and removal records.
      const sc = [],
        ordinary = [];
      for (const s of unique.values()) (s.id.startsWith('sc:') ? sc : ordinary).push(s);
      const paid = sc.slice(-400),
        remaining = 400 - paid.length;
      state.seen = [...(remaining ? ordinary.slice(-remaining) : []), ...paid];
    }
    try {
      const saved = JSON.parse(storage?.getItem(KEY) || 'null');
      if (
        saved &&
        typeof saved.room === 'string' &&
        Array.isArray(saved.items) &&
        Array.isArray(saved.seen)
      ) {
        state = {
          room: saved.room.slice(0, 30),
          selected: !!saved.selected,
          items: saved.items,
          seen: saved.seen,
        };
        prune();
      }
    } catch {}
    function save() {
      prune();
      try {
        storage?.setItem(KEY, JSON.stringify(state));
      } catch {}
    }
    function room(value) {
      const next = String(value || '');
      if (!next || next === state.room) return false;
      state.room = next;
      state.items = [];
      state.seen = [];
      save();
      return true;
    }
    function clear() {
      state.items = [];
      state.seen = [];
      save();
    }
    function has(item) {
      prune();
      const id = identity(item);
      return !!id && state.seen.some((s) => s.id === id);
    }
    function remember(item) {
      if (!valid(item) || has(item)) return;
      const m = {};
      for (const key of [
        'kind',
        'sender',
        'userId',
        'source',
        'receivedAt',
        'eventId',
        'roomId',
        'body',
        'scId',
        'amount',
        'duration',
        'expiresAt',
        'giftId',
        'giftName',
        'quantity',
        'value',
        'coinType',
        'rank',
      ])
        if (item[key] !== undefined) m[key] = item[key];
      const id = identity(m);
      if (id) state.seen.push({ id, until: m.kind === 'sc' ? m.expiresAt : now() + 300000 });
      const prev = state.items.at(-1),
        same =
          m.kind === 'gift' &&
          prev?.kind === 'gift' &&
          m.userId &&
          m.userId !== '0' &&
          m.userId === prev.userId &&
          m.giftId &&
          m.giftId === prev.giftId &&
          m.coinType === prev.coinType;
      if (
        same &&
        m.receivedAt >= prev.receivedAt &&
        m.receivedAt - prev.receivedAt < 5000 &&
        prev.quantity + m.quantity <= 999999 &&
        prev.value + m.value <= 999999999
      ) {
        prev.quantity += m.quantity;
        prev.value = Math.round((prev.value + m.value) * 100) / 100;
        prev.receivedAt = m.receivedAt;
        prev.body =
          prev.giftName +
          ' × ' +
          prev.quantity +
          ' · ' +
          (prev.coinType === 'silver' ? '免费礼物' : prev.value + ' 电池');
      } else state.items.push(m);
      save();
    }
    function remove(ids) {
      if (!Array.isArray(ids)) return;
      const removed = new Set(ids);
      state.items = state.items.filter((m) => m.kind !== 'sc' || !removed.has(m.scId));
      for (const id of removed) state.seen.push({ id: 'sc:' + id, until: now() + 86400000 });
      save();
    }
    return {
      room,
      clear,
      has,
      remember,
      remove,
      get selected() {
        return state.selected;
      },
      select(on) {
        state.selected = !!on;
        save();
      },
      snapshot() {
        prune();
        return state.items.map((m) => ({ ...m, restored: true }));
      },
    };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LiveRecovery = api;
})(globalThis);
