/* Presentation only: never changes message receipt times or expiry deadlines. */
((root) => {
  'use strict';
  const duration = 960;
  function create() {
    let current = null,
      turn = null,
      due = 0,
      startedAt = 0,
      pages = new Map();
    const pageOf = (m) => (pages.get(m.id) || 0) % Math.max(1, m.reading?.pages.length || 1);
    const hold = (m) => Math.max(6500, Math.min(10000, m.reading?.durations[pageOf(m)] || 6500));
    function reset() {
      current = null;
      turn = null;
      due = 0;
      startedAt = 0;
      pages.clear();
    }
    function update(items, now) {
      const all = new Map(items.map((m) => [m.id, m])),
        active = items.filter((m) => m.exitAt === undefined);
      for (const id of pages.keys()) if (!all.has(id)) pages.delete(id);
      if (turn) {
        // A removed / expired destination must never briefly reappear at the seam.
        if (!active.some((m) => m.id === turn.to)) {
          const next = active.find((m) => m.id !== turn.from) || active[0];
          if (next) {
            turn.to = next.id;
            turn.toPage = pageOf(next);
          } else {
            turn = null;
          }
        }
        if (turn && !all.has(turn.from) && now - turn.at < duration / 2)
          turn.at = now - duration / 2;
        if (turn && now - turn.at >= duration) {
          current = turn.to;
          turn = null;
          due = now + hold(all.get(current));
        }
      }
      if (!turn && !all.has(current)) {
        const next = active[0];
        current = next?.id ?? null;
        startedAt = now;
        due = now + (next ? hold(next) + 1000 : 0);
      }
      if (!turn && current !== null) {
        const m = all.get(current),
          index = active.findIndex((m) => m.id === current);
        if (active.length && (m.exitAt !== undefined || now >= due)) {
          const next = active[(index + 1) % active.length];
          if (next.id !== current || (m.reading?.pages.length || 1) > 1) {
            const fromPage = pageOf(m);
            pages.set(current, fromPage + 1);
            turn = { from: current, to: next.id, fromPage, toPage: pageOf(next), at: now };
          } else due = now + hold(m);
        }
      }
      const phase = turn ? Math.min(1, (now - turn.at) / duration) : -1;
      const id = turn ? (phase < 0.5 ? turn.from : turn.to) : current;
      const selected = all.get(id),
        index = active.findIndex((m) => m.id === id);
      return {
        id: selected ? id : null,
        page: turn ? (phase < 0.5 ? turn.fromPage : turn.toPage) : selected ? pageOf(selected) : 0,
        phase,
        count: active.length,
        index: selected ? Math.max(1, index + 1) : 0,
        from: turn?.from ?? null,
        to: turn?.to ?? null,
        startedAt,
      };
    }
    return { update, reset };
  }
  const api = { create, duration };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SCCarousel = api;
})(globalThis);
