(function (root) {
  'use strict';
  // Text and effect parameters are immutable after insertion. Gift totals, SC
  // pages and stream geometry can change while the same records remain alive.
  function signature(messages, camera) {
    return (
      camera +
      '|' +
      messages
        .map((m) => [m.id, m.drawY, m.height, m.page, m.quantity, m.value].join(','))
        .join('|')
    );
  }
  function moving(messages, { clock, camera, viewTop, viewBottom, padding = 160 }) {
    for (const m of messages) {
      const y = viewTop + m.drawY - camera;
      if (m.kind === 'sc') {
        const top = y + m.inset - padding;
        if (top + m.cardHeight + padding * 2 >= viewTop && top <= viewBottom) return true;
        continue;
      }
      // A generous guard also includes the fleet material outside its layout box.
      if (y + m.height + padding < viewTop || y - padding > viewBottom) continue;
      if (m.kind === 'fleet' && m.fleetAmbient) return true;
      if (
        Number.isFinite(m.noticeExitAt) &&
        clock >= m.noticeExitAt &&
        clock < m.noticeExitAt + m.noticeExitMs
      )
        return true;
      if (m.motionLoop || clock - m.born < (m.motionEnd || 0)) return true;
      const duration =
        m.entryMs ?? (m.kind === 'fleet' ? m.fleetDuration || 1500 : m.kind === 'gift' ? 800 : 220);
      if (clock - m.born < duration) return true;
      if (m.kind === 'gift' && m.updatedAt !== undefined && clock - m.updatedAt < 340) return true;
    }
    return false;
  }
  const api = { signature, moving };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) root.RenderActivity = api;
})(typeof window === 'object' ? window : globalThis);
