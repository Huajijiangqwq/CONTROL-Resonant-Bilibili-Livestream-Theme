/* Undo documents share embedded media. This codec is private to history;
   exported projects always contain their original portable source strings. */
(function (root) {
  'use strict';
  function create(limit = 60) {
    const assets = new Map(),
      byValue = new Map(),
      past = [],
      future = [];
    let pending = null,
      nextId = 0;
    function capture(doc) {
      const refs = new Set(),
        text = JSON.stringify(doc, (key, value) => {
          if (key !== 'src' || typeof value !== 'string' || !/^data:(?:image|video)\//.test(value))
            return value;
          let entry = byValue.get(value);
          if (!entry) {
            entry = { id: String(++nextId), value, refs: 0 };
            assets.set(entry.id, entry);
            byValue.set(value, entry);
          }
          refs.add(entry.id);
          return { $historyAsset: entry.id };
        });
      for (const id of refs) assets.get(id).refs++;
      return { text, refs };
    }
    function release(snapshot) {
      if (!snapshot) return;
      for (const id of snapshot.refs) {
        const entry = assets.get(id);
        if (entry && --entry.refs === 0) {
          assets.delete(id);
          byValue.delete(entry.value);
        }
      }
    }
    function restore(snapshot) {
      return JSON.parse(snapshot.text, (key, value) => {
        if (
          key === 'src' &&
          value &&
          typeof value === 'object' &&
          Object.keys(value).length === 1 &&
          typeof value.$historyAsset === 'string'
        ) {
          const entry = assets.get(value.$historyAsset);
          if (!entry) throw Error('撤销素材已丢失');
          return entry.value;
        }
        return value;
      });
    }
    function clearList(list) {
      for (const snapshot of list) release(snapshot);
      list.length = 0;
    }
    function push(list, snapshot) {
      list.push(snapshot);
      while (list.length > limit) release(list.shift());
    }
    function checkpoint(doc) {
      release(pending);
      pending = capture(doc);
    }
    function commit(doc) {
      if (!pending) return false;
      const current = capture(doc),
        changed = current.text !== pending.text;
      release(current);
      if (!changed) return false;
      push(past, pending);
      pending = null;
      clearList(future);
      return true;
    }
    function undo(doc, redo = false) {
      commit(doc);
      release(pending);
      pending = null;
      const a = redo ? future : past,
        b = redo ? past : future;
      if (!a.length) return null;
      const current = capture(doc);
      let target;
      while (a.length) {
        const candidate = a.pop();
        if (candidate.text === current.text) {
          release(candidate);
          continue;
        }
        target = candidate;
        break;
      }
      if (!target) {
        release(current);
        return null;
      }
      const result = restore(target);
      push(b, current);
      release(target);
      return result;
    }
    function clear() {
      release(pending);
      pending = null;
      clearList(past);
      clearList(future);
    }
    return {
      checkpoint,
      commit,
      undo,
      clear,
      get canUndo() {
        return past.length > 0;
      },
      get canRedo() {
        return future.length > 0;
      },
      get stats() {
        return {
          undo: past.length,
          redo: future.length,
          pending: !!pending,
          assets: assets.size,
          assetCharacters: [...assets.values()].reduce((n, a) => n + a.value.length, 0),
          documentCharacters: [...past, ...future, ...(pending ? [pending] : [])].reduce(
            (n, a) => n + a.text.length,
            0,
          ),
        };
      },
    };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThemeEditorHistory = api;
})(globalThis);
