/* Optical bounds belong to the viewport, not the spacing between messages. */
((root) => {
  'use strict';
  function halo(fx, padding) {
    if (fx.strength <= 0) return 0;
    // Visible ink keeps breathing room; the renderer still samples its full padding.
    return Math.min(padding, fx.reach * 1.2 + 25, Math.ceil(70 + fx.reach * 0.4));
  }
  function bounds(messages, worldBase, height, padding) {
    let top = worldBase,
      bottom = worldBase;
    for (const m of messages) {
      const exiting =
        (m.kind === 'sc' && m.exitAt !== undefined) ||
        (['fleet', 'gift'].includes(m.kind) &&
          Number.isFinite(m.flowHeight) &&
          m.flowHeight < m.height);
      bottom = Math.max(bottom, exiting ? m.worldY + m.flowHeight : m.drawY + m.height);
      if (m.kind !== 'sc') continue;
      const occupied = exiting ? Math.max(0, Math.min(1, m.flowHeight / m.height)) : 1;
      const reserve = halo(m.fx, padding);
      top = Math.min(top, m.worldY - Math.max(0, reserve - m.inset) * occupied);
      bottom = Math.max(
        bottom,
        m.worldY +
          m.flowHeight +
          Math.max(0, m.inset + m.cardHeight + reserve - m.height) * occupied,
      );
    }
    return { minCamera: top, maxCamera: Math.max(top, bottom - height) };
  }
  function scroll(camera, delta, { minCamera, maxCamera }) {
    const next = Math.max(
      minCamera,
      Math.min(maxCamera, camera + (Number.isFinite(delta) ? delta : 0)),
    );
    return { camera: next, following: maxCamera - next <= 0.5 };
  }
  function captureAnchor(messages, camera) {
    const message = messages.find(
      (m) => Number.isFinite(m.drawY) && m.exitAt === undefined && m.drawY + m.height > camera,
    );
    return message ? { message, y: message.drawY } : null;
  }
  function anchorDelta(anchor) {
    return anchor ? anchor.message.drawY - anchor.y : 0;
  }
  const api = { bounds, scroll, captureAnchor, anchorDelta, halo };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChatViewport = api;
})(globalThis);
