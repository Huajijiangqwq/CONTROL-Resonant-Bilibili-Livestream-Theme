/* Local authoring inspection never changes the shared message source. */
(function (root) {
  'use strict';
  function create({ enabled = false, source, clear, restore, changed = () => {} }) {
    let mode = 'follow';
    const state = () => ({ mode, source: source() === 'live' ? 'live' : 'simulation' });
    function begin(next = 'example', options = {}) {
      if (!enabled) return false;
      const first = mode === 'follow';
      mode = next === 'timeline' ? 'timeline' : 'example';
      if (first && options.clear !== false) clear();
      changed(state());
      return true;
    }
    function resume() {
      if (!enabled || mode === 'follow') return false;
      mode = 'follow';
      clear();
      if (source() === 'live') restore();
      changed(state());
      return true;
    }
    function sourceChanged() { mode = 'follow'; changed(state()); }
    return { state, begin, resume, sourceChanged, get inspecting() { return mode !== 'follow'; } };
  }
  if (typeof module === 'object' && module.exports) module.exports = { create };
  else root.EditorPreviewSource = { create };
})(globalThis);
