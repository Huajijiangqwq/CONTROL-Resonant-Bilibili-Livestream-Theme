/* Shared local draft with atomic revisions and explicit same-property conflicts. */
(() => {
  'use strict';
  function create({ key, initial, base, get, apply, status, conflict }) {
    const S = ThemeEditorStorage,
      M = ThemeDocumentMerge,
      id = crypto.randomUUID(),
      channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(key) : null;
    let revision = initial?.revision || 0,
      initialized = !!initial,
      baseline = structuredClone(base),
      pending = Promise.resolve(),
      blocked = null;
    const enqueue = (fn) => {
      const result = pending.then(fn, fn);
      pending = result.catch(() => {});
      return result;
    };
    async function retain(document = get(), suffix = '') {
      await S.put(key + '-recovery-' + id + suffix, {
        time: new Date().toLocaleString('zh-CN'),
        project: structuredClone(document),
        recovered: true,
        stamp: Date.now(),
      });
    }
    async function receive(current) {
      if (!current || current.revision <= revision) return;
      const merged = M.merge(baseline, get(), current.document);
      if (merged.conflicts.length) {
        blocked = current;
        await retain();
        if (merged.conflicts.some((c) => c.reason === 'capacity'))
          await retain(current.document, '-remote');
        conflict(merged.conflicts);
        status(
          merged.conflicts.some((c) => c.reason === 'capacity')
            ? '合并后的内容超过容量，请选择保留版本'
            : '另一页有相同参数的修改',
        );
        return false;
      }
      revision = current.revision;
      initialized = true;
      baseline = structuredClone(current.document);
      blocked = null;
      conflict([]);
      if (!M.same(get(), merged.value)) apply(merged.value);
      status('✓ 已同步另一编辑器');
      return true;
    }
    async function flush() {
      if (blocked) {
        await retain();
        return false;
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        const local = structuredClone(get());
        if (initialized && M.same(local, baseline)) {
          status('✓ 草稿已保存');
          return true;
        }
        const result = await S.commitDraft(key, local, revision, id);
        if (result.ok) {
          revision = result.current.revision;
          initialized = true;
          baseline = local;
          channel?.postMessage({ writer: id, revision });
          status(M.same(get(), local) ? '✓ 草稿已保存' : '保存中…');
          return true;
        }
        if ((await receive(result.current)) === false) return false;
      }
      status('等待另一编辑器完成保存…');
      return false;
    }
    const save = () =>
      enqueue(flush).catch((error) => {
        status('草稿未保存：' + (error.message || '存储不可用'));
        return false;
      });
    channel?.addEventListener('message', (event) => {
      if (event.data?.writer === id || event.data?.revision <= revision) return;
      enqueue(async () => {
        const current = await S.draft(key);
        if ((await receive(current)) !== false && !blocked) await flush();
      }).catch((error) => status('同步失败：' + error.message));
    });
    async function resolve(preference) {
      return enqueue(async () => {
        if (!blocked) return true;
        const latest = await S.draft(key),
          remote = latest?.revision > blocked.revision ? latest : blocked;
        const merged = M.merge(baseline, get(), remote.document, preference);
        revision = remote.revision;
        initialized = true;
        baseline = structuredClone(remote.document);
        blocked = null;
        conflict([]);
        apply(merged.value);
        return flush();
      });
    }
    return {
      save,
      resolve,
      get revision() {
        return revision;
      },
      get blocked() {
        return !!blocked;
      },
      close() {
        channel?.close();
      },
    };
  }
  window.ThemeEditorSync = { create };
})();
