/* Shared drafts catch up on activation and never interrupt an active gesture. */
(() => {
  'use strict';
  function create({ key, initial, base, get, apply, status, conflict, busy = () => false }) {
    const S = ThemeEditorStorage, M = ThemeDocumentMerge, id = crypto.randomUUID();
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(key) : null;
    let revision = initial?.revision || 0, epoch = initial?.epoch || null, initialized = !!initial;
    let baseline = structuredClone(base), pending = Promise.resolve(), blocked = null, resetConflict = false;
    let deferred = null, deferredTimer = 0, closed = false, safety = initial?.safety || 0;
    let saving = null, requests = 0, completedRequest = 0, busyCopy = '';
    const enqueue = fn => { const result = pending.then(fn, fn); pending = result.catch(() => {}); return result; };
    async function retain(document = get(), suffix = '') {
      await S.put(key + '-recovery-' + id + suffix, { time: new Date().toLocaleString('zh-CN'), project: structuredClone(document), recovered: true, stamp: Date.now() });
    }
    function suspendLive(generation = safety) {
      safety = Math.max(safety, Number(generation) || 0);
      window.dispatchEvent?.(new Event('theme-document-switch'));
    }
    function scheduleDeferred() {
      clearTimeout(deferredTimer);
      deferredTimer = setTimeout(() => {
        if (closed || !deferred) return;
        if (busy()) scheduleDeferred(); else refresh();
      }, 120);
    }
    async function receive(current) {
      if (closed) return false;
      if (!current) return;
      const replaced = !!(epoch && current.epoch && epoch !== current.epoch);
      if ((current.safety || 0) > safety || replaced) suspendLive(current.safety);
      if (!replaced && current.revision <= revision) { if (deferred?.revision <= revision) deferred = null; return; }
      if (busy()) {
        deferred = current; scheduleDeferred();
        const copy = JSON.stringify(get());
        if (copy !== busyCopy) { busyCopy = copy; await retain(JSON.parse(copy), '-busy'); }
        status('另一编辑器有更新，完成当前操作后同步');
        return false;
      }
      deferred = null; busyCopy = ''; clearTimeout(deferredTimer);
      if (replaced) {
        if (!M.same(get(), baseline)) {
          blocked = current; resetConflict = true;
          await retain(); await retain(current.document, '-remote');
          conflict([{ path: ['document'], reason: 'reset' }]); status('共享草稿已重建，请选择保留版本'); return false;
        }
        revision = current.revision; epoch = current.epoch; initialized = true; baseline = structuredClone(current.document);
        blocked = null; resetConflict = false; conflict([]); apply(structuredClone(current.document)); status('✓ 已载入重建后的共享草稿'); return true;
      }
      const merged = M.merge(baseline, get(), current.document);
      if (merged.conflicts.length) {
        blocked = current; resetConflict = false; await retain();
        if (merged.conflicts.some(value => value.reason === 'capacity')) await retain(current.document, '-remote');
        conflict(merged.conflicts); status(merged.conflicts.some(value => value.reason === 'capacity') ? '合并后的内容超过容量，请选择保留版本' : '另一页有相同参数的修改'); return false;
      }
      revision = current.revision; epoch = current.epoch || epoch; initialized = true; baseline = structuredClone(current.document);
      blocked = null; resetConflict = false; conflict([]);
      if (!M.same(get(), merged.value)) apply(merged.value);
      status('✓ 已同步另一编辑器'); return true;
    }
    async function flush() {
      if (closed) return false;
      if (blocked) { await retain(); return false; }
      for (let attempt = 0; attempt < 3; attempt++) {
        const local = structuredClone(get());
        if (initialized && M.same(local, baseline)) { status('✓ 草稿已保存'); return true; }
        const result = await S.commitDraft(key, local, revision, id, epoch);
        if (closed) return false;
        if (result.ok) {
          if ((result.current.safety || 0) > safety) suspendLive(result.current.safety);
          revision = result.current.revision; epoch = result.current.epoch || epoch; safety = result.current.safety || safety; initialized = true; baseline = local;
          channel?.postMessage({ writer: id, revision, epoch, safety });
          status(M.same(get(), local) ? '✓ 草稿已保存' : '保存中…'); return true;
        }
        if (!result.current) {
          await retain(); revision = 0; epoch = null; initialized = false;
          continue;
        }
        if ((await receive(result.current)) === false) return false;
      }
      status('等待另一编辑器完成保存…'); return false;
    }
    async function catchUp() {
      const current = await S.draft(key);
      if (closed) return false;
      if ((await receive(current)) === false) return false;
      return flush();
    }
    function save() {
      requests++;
      if (saving) return saving;
      saving = enqueue(async () => {
        let result;
        do { completedRequest = requests; result = await catchUp(); }
        while (!closed && !blocked && !deferred && completedRequest !== requests);
        return result;
      }).catch(error => { if (!closed) status('草稿未保存：' + (error.message || '存储不可用')); return false; }).finally(() => {
        saving = null;
        if (!closed && !blocked && !deferred && completedRequest !== requests) save();
      });
      return saving;
    }
    const refresh = () => save();
    channel?.addEventListener('message', event => {
      if (event.data?.writer === id) return;
      if (event.data?.action === 'document-switch') { suspendLive(event.data.safety); return; }
      if ((event.data?.safety || 0) > safety) suspendLive(event.data.safety);
      if (event.data?.epoch === epoch && event.data?.revision <= revision) return;
      refresh();
    });
    async function resolve(preference) {
      return enqueue(async () => {
        if (closed || !blocked) return !closed;
        const latest = await S.draft(key);
        const remote = latest && (latest.epoch !== blocked.epoch || latest.revision > blocked.revision) ? latest : blocked;
        if ((latest?.safety || remote.safety || 0) > safety || (epoch && remote.epoch && remote.epoch !== epoch))
          suspendLive(latest?.safety || remote.safety);
        const value = resetConflict ? structuredClone(preference === 'remote' ? remote.document : get()) : M.merge(baseline, get(), remote.document, preference).value;
        revision = remote.revision; epoch = remote.epoch || epoch; initialized = true; baseline = structuredClone(remote.document);
        blocked = null; resetConflict = false; conflict([]); apply(value); return flush();
      });
    }
    const focus = () => refresh();
    window.addEventListener('focus', focus);
    // A commit between the initial IndexedDB read and subscription used to be
    // lost forever when this page had no edits. Re-read after installation.
    queueMicrotask(refresh);
    async function announceSwitch() {
      const generation = await S.bumpSafety(key); suspendLive(generation);
      channel?.postMessage({ writer: id, action: 'document-switch', safety: generation });
      return generation;
    }
    return { save, refresh, resolve, announceSwitch, get revision() { return revision; }, get epoch() { return epoch; }, get blocked() { return !!blocked; },
      close() { closed = true; clearTimeout(deferredTimer); channel?.close(); window.removeEventListener('focus', focus); },
    };
  }
  window.ThemeEditorSync = { create };
})();
