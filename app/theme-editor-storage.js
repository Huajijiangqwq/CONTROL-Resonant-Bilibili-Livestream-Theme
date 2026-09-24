/* IndexedDB keeps embedded animated media out of localStorage's small quota. */
(() => {
  'use strict';
  let database = null;
  const opened = new Promise((resolve, reject) => {
    const request = indexedDB.open('control-theme-editor', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onsuccess = () => {
      database = request.result;
      resolve(database);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error('主题存储被另一个旧页面占用，请关闭旧的编辑器标签页。'));
  });
  function operation(mode, key, value) {
    const run = (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction('documents', mode),
          store = tx.objectStore('documents'),
          request = mode === 'readonly' ? store.get(key) : store.put(value, key);
        let result;
        request.onsuccess = () => (result = request.result);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('存储已取消'));
      });
    return database ? run(database) : opened.then(run);
  }
  async function draft(key) {
    const value = await operation('readonly', key);
    return value?.format === 'control-editor-draft' ? value : null;
  }
  function commitDraft(key, document, revision, writer) {
    return opened.then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction('documents', 'readwrite'),
            store = tx.objectStore('documents'),
            request = store.get(key);
          let result;
          request.onsuccess = () => {
            const current =
              request.result?.format === 'control-editor-draft' ? request.result : null;
            if ((current?.revision || 0) !== revision) {
              result = { ok: false, current };
              return;
            }
            const next = {
              format: 'control-editor-draft',
              revision: revision + 1,
              writer,
              updatedAt: Date.now(),
              document,
            };
            store.put(next, key);
            result = { ok: true, current: next };
          };
          tx.oncomplete = () => resolve(result);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('草稿保存已取消'));
        }),
    );
  }
  function entries(prefix) {
    return opened.then(
      (db) =>
        new Promise((resolve, reject) => {
          const found = [],
            tx = db.transaction('documents', 'readonly'),
            request = tx.objectStore('documents').openCursor();
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            if (String(cursor.key).startsWith(prefix)) found.push(cursor.value);
            cursor.continue();
          };
          tx.oncomplete = () => resolve(found);
          tx.onerror = () => reject(tx.error);
        }),
    );
  }
  function update(key, change) {
    return opened.then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction('documents', 'readwrite'),
            store = tx.objectStore('documents'),
            request = store.get(key);
          let result, failure;
          request.onsuccess = () => {
            try {
              const next = change(request.result);
              if (!next || typeof next.then === 'function') throw Error('存储更新必须同步完成');
              store.put(next.value, key);
              result = next.result;
            } catch (e) {
              failure = e;
              tx.abort();
            }
          };
          tx.oncomplete = () => resolve(result);
          tx.onerror = () => reject(failure || tx.error);
          tx.onabort = () => reject(failure || tx.error || new Error('样式保存已取消'));
        }),
    );
  }
  window.ThemeEditorStorage = {
    get: (key) => operation('readonly', key),
    put: (key, value) => operation('readwrite', key, value),
    update,
    draft,
    commitDraft,
    entries,
  };
})();
