/* Attached decoration geometry follows the container, unless the same edit
   explicitly moved/resized that decoration (multi-selection and groups). */
(function (root) {
  'use strict';
  function snapshot(doc) {
    return {
      chats: structuredClone(doc.layers.filter((l) => l.type === 'chat')),
      items: new Map(
        doc.layers
          .filter((l) => l.attach === 'chat')
          .map((l) => [l.id, { x: l.x, y: l.y, w: l.w, h: l.h }]),
      ),
    };
  }
  function reflow(doc, previous) {
    for (const chat of doc.layers.filter((l) => l.type === 'chat')) {
      const old = previous?.chats?.find((l) => l.id === chat.id) || previous?.chat;
      if (!old) continue;
      const dx = chat.x - old.x,
        dy = chat.y - old.y,
        dw = chat.w - old.w,
        dh = chat.h - old.h;
      if (!dx && !dy && !dw && !dh) continue;
      for (const l of doc.layers) {
        if (
          l.attach !== 'chat' ||
          (l.chatId ||
            doc.layers.find((c) => c.type === 'chat' && c.id === 'chat')?.id ||
            doc.layers.find((c) => c.type === 'chat')?.id) !== chat.id
        )
          continue;
        const before = previous.items.get(l.id);
        if (!before) continue;
        if (l.x === before.x) l.x += dx;
        if (l.y === before.y) l.y += dy;
        if (l.type === 'border') {
          if (l.w === before.w) l.w = Math.max(2, l.w + dw);
          if (l.h === before.h) l.h = Math.max(2, l.h + dh);
        } else if (l.type === 'text' && l.w === before.w) l.w = Math.max(2, l.w + dw);
        else if (l.type === 'line' && l.w === before.w && dw)
          l.w = Math.max(2, Math.min(l.w, chat.w - 52));
      }
    }
  }
  const api = { snapshot, reflow };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThemeAttachments = api;
})(globalThis);
