/* View instances share events, never mutable animation or layout state. */
(function (root) {
  'use strict';
  const kinds = ['normal', 'sc', 'gift', 'fleet'];
  const firstChat = (doc) =>
    doc.layers.find((l) => l.id === 'chat' && l.type === 'chat') ||
    doc.layers.find((l) => l.type === 'chat');
  function owner(doc, l) {
    if (l.type === 'chat') return l;
    if (l.standalone) return null;
    if (l.chatId) return doc.layers.find((c) => c.type === 'chat' && c.id === l.chatId) || null;
    return l.scope === 'chat' || (kinds.includes(l.type) && doc.composition === 'feed')
      ? firstChat(doc)
      : null;
  }
  function feed(doc, l) {
    const host = owner(doc, l);
    return (
      kinds.includes(l.type) &&
      !!host &&
      (doc.composition === 'feed' || host.id !== firstChat(doc)?.id)
    );
  }
  function project(doc, key = '') {
    if (!doc) return null;
    const target = doc.layers.find((l) => l.id === key),
      primary = firstChat(doc);
    let layers,
      composition = doc.composition;
    if (target?.type === 'chat') {
      layers = doc.layers.filter((l) => l.id === target.id || owner(doc, l)?.id === target.id);
      composition = 'feed';
    } else if (target && kinds.includes(target.type)) {
      layers = [target];
      composition = 'layers';
    } else {
      const used = new Set();
      layers = doc.layers.filter((l) => {
        if (l.type === 'chat') return l === primary;
        if (kinds.includes(l.type)) {
          if (l.standalone || (l.chatId && l.chatId !== primary?.id) || used.has(l.type))
            return false;
          used.add(l.type);
          return true;
        }
        return !l.chatId || l.chatId === primary?.id;
      });
    }
    // Flatten group appearance in a view, while preserving the authored project.
    layers = layers.map((l) => {
      const g = doc.layers.find((x) => x.id === l.parent);
      return {
        ...l,
        parent: '',
        visible: l.visible && g?.visible !== false,
        opacity: l.opacity * (g?.opacity ?? 1),
      };
    });
    return { ...doc, layers, composition };
  }
  function targets(doc) {
    const primary = project(doc),
      ids = new Set(primary.layers.map((l) => l.id)),
      chats = doc.layers.filter((l) => l.type === 'chat' && !ids.has(l.id));
    return [
      ...chats,
      ...doc.layers.filter(
        (l) =>
          kinds.includes(l.type) &&
          !ids.has(l.id) &&
          !chats.some((c) => owner(doc, l)?.id === c.id),
      ),
    ];
  }
  function matches(l, m) {
    return (
      !l ||
      l.messageFilter === 'all' ||
      !l.messageFilter ||
      (l.type === 'fleet'
        ? m.rank === l.messageFilter
        : l.type === 'sc'
          ? String(m.tier) === l.messageFilter
          : true)
    );
  }
  function clone(doc, source, id, offset = 24) {
    const items = [],
      mapping = new Map(),
      chosen = new Map();
    for (const l of source) {
      chosen.set(l.id, l);
      if (l.type === 'chat')
        for (const c of doc.layers)
          if (c.id !== l.id && owner(doc, c)?.id === l.id) chosen.set(c.id, c);
    }
    for (const l of chosen.values()) mapping.set(l.id, id());
    const visible = [...chosen.values()].filter(
        (l) =>
          l.type !== 'resonance' && !(kinds.includes(l.type) && mapping.has(owner(doc, l)?.id)),
      ),
      delta = {};
    for (const [axis, size, limit] of [
      ['x', 'w', 1920],
      ['y', 'h', 1080],
    ]) {
      const low = -Math.min(0, ...visible.map((l) => l[axis])),
        high = limit - Math.max(0, ...visible.map((l) => l[axis] + l[size]));
      delta[axis] = Math.max(low, Math.min(high, offset));
    }
    for (const l of chosen.values()) {
      const c = structuredClone(l);
      c.id = mapping.get(l.id);
      c.name = l.name + ' 副本';
      c.parent = mapping.get(l.parent) || '';
      if (!c.parent && l.parent) {
        const parent = doc.layers.find((p) => p.id === l.parent);
        c.opacity *= parent?.opacity ?? 1;
        c.visible = c.visible && parent?.visible !== false;
      }
      c.x += delta.x;
      c.y += delta.y;
      c.locked = false;
      const host = owner(doc, l);
      if (host && mapping.has(host.id) && l.type !== 'chat') {
        c.chatId = mapping.get(host.id);
        c.standalone = false;
      } else if (kinds.includes(l.type)) {
        c.chatId = '';
        c.standalone = true;
        c.scope = 'scene';
        c.attach = '';
      }
      if (l.type === 'hiss') {
        const M =
          root.ThemeEditorModel ||
          (typeof require === 'function' ? require('./theme-editor-model.js') : null);
        c.type = 'group';
        items.push(c);
        for (const f of M.splitHiss(doc, l)) {
          f.id = id();
          f.parent = c.id;
          f.x += delta.x;
          f.y += delta.y;
          f.opacity = 1;
          f.name += ' 副本';
          items.push(f);
        }
        continue;
      }
      items.push(c);
    }
    return { items, selection: source.map((l) => mapping.get(l.id)) };
  }
  const api = { kinds, owner, feed, project, targets, matches, clone };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThemeInstances = api;
})(globalThis);
