/* One keyboard stop for the layer list, independent of layer count. */
(function (root) {
  'use strict';
  const states = new WeakMap();
  function nextIndex(index, count, key) {
    if (!count) return -1;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    return Math.max(0, Math.min(count - 1, index + (key === 'ArrowUp' ? -1 : 1)));
  }
  function capture(list) {
    const active = list.ownerDocument.activeElement, row = active?.closest('[data-tree-key]');
    return row && list.contains(row) ? row.dataset.treeKey : '';
  }
  function refresh(list, { restoreKey = '', selectedKeys = [], activate, rename, menu, leave } = {}) {
    let state = states.get(list);
    if (!state) {
      state = { key: '', api: {} }; states.set(list, state);
      const rows = () => [...list.querySelectorAll('[data-tree-key]')];
      const focus = (key, options = null) => {
        let row = rows().find(n => n.dataset.treeKey === key); if (!row) return;
        state.key = key;
        rows().forEach(n => { n.tabIndex = n === row ? 0 : -1; });
        row.focus({ preventScroll: true });
        if (options) state.api.activate?.(row, options);
        row = rows().find(n => n.dataset.treeKey === key);
        row?.focus({ preventScroll: true }); row?.scrollIntoView({ block: 'nearest' });
      };
      list.addEventListener('focusin', event => {
        const row = event.target.closest('[data-tree-key]');
        if (!row || !list.contains(row)) return;
        state.key = row.dataset.treeKey;
        rows().forEach(n => { n.tabIndex = n === row ? 0 : -1; });
      });
      list.addEventListener('keydown', event => {
        let row = event.target.closest('[data-tree-key]');
        if (!row && event.target === list) row = rows().find(n => n.dataset.treeKey === state.key) || rows()[0];
        if (!row) {
          if (event.target === list && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); }
          return;
        }
        if (!list.contains(row) || event.altKey) return;
        if (event.target !== row && event.target !== list) {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); focus(row.dataset.treeKey); }
          if (!['ArrowUp', 'ArrowDown', 'Home', 'End', 'ArrowLeft', 'ArrowRight', 'F2', 'ContextMenu'].includes(event.key) && !(event.key === 'F10' && event.shiftKey))
            return; // Child buttons retain their native Enter/Space behavior.
        }
        const key = event.key, visible = rows(), at = visible.indexOf(row),
          handled = ['ArrowUp', 'ArrowDown', 'Home', 'End', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'F2', 'ContextMenu', 'Escape'].includes(key) || key === 'F10' && event.shiftKey;
        if (!handled) return;
        event.preventDefault(); event.stopPropagation();
        if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) {
          const target = visible[nextIndex(at, visible.length, key)];
          focus(target.dataset.treeKey, event.ctrlKey || event.metaKey ? null : { extend: event.shiftKey });
        } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
          const toggle = row.querySelector('.tree-toggle'), opened = toggle?.getAttribute('aria-expanded') === 'true';
          if (toggle && !toggle.disabled && ((key === 'ArrowRight' && !opened) || (key === 'ArrowLeft' && opened))) {
            toggle.click(); focus(row.dataset.treeKey);
          } else if (key === 'ArrowLeft' && row.dataset.treeParent) focus(row.dataset.treeParent, {});
          else if (key === 'ArrowRight' && visible[at + 1]?.dataset.treeParent === row.dataset.treeKey)
            focus(visible[at + 1].dataset.treeKey, {});
        } else if (key === 'F2') state.api.rename?.(row);
        else if (key === 'ContextMenu' || key === 'F10') state.api.menu?.(row);
        else if (key === 'Escape') state.api.leave?.();
        else focus(row.dataset.treeKey, { toggle: key === ' ', extend: event.shiftKey });
      });
    }
    state.api = { activate, rename, menu, leave };
    const rows = [...list.querySelectorAll('[data-tree-key]')], keys = new Set(rows.map(n => n.dataset.treeKey));
    state.key = keys.has(restoreKey) ? restoreKey : selectedKeys.find(key => keys.has(key)) || (keys.has(state.key) ? state.key : rows[0]?.dataset.treeKey || '');
    list.tabIndex = rows.length ? -1 : 0;
    list.setAttribute('aria-description', '上下键选择，左右键展开或返回父层，F2重命名，Shift F10打开操作菜单，Esc返回画布。');
    for (const row of rows) {
      row.tabIndex = row.dataset.treeKey === state.key ? 0 : -1;
      for (const button of row.querySelectorAll('button')) button.tabIndex = -1;
    }
    if (restoreKey) rows.find(n => n.dataset.treeKey === state.key)?.focus({ preventScroll: true });
  }
  const api = { nextIndex, capture, refresh };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThemeLayerNavigation = api;
})(globalThis);
