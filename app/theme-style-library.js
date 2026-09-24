/* Reusable native message styles; scene geometry and data sources stay outside. */
(() => {
  'use strict';
  const M = ThemeEditorModel,
    S = ThemeEditorStorage;
  const storageKey =
    'control-component-styles-v1' + (new URLSearchParams(location.search).has('qa') ? '-qa' : '');
  let pending = Promise.resolve();
  const watchers = new Set(),
    channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(storageKey) : null;
  const clean = (rows) =>
    (Array.isArray(rows) ? rows : []).filter((row) => M.normalizeStyle(row)).slice(0, 40);
  async function list() {
    return clean(await S.get(storageKey));
  }
  function notify() {
    for (const watcher of watchers) {
      if (watcher.section.isConnected) watcher.refresh();
      else watchers.delete(watcher);
    }
  }
  if (channel) channel.onmessage = notify;
  window.addEventListener('focus', notify);
  function write(fn) {
    const operation = pending
      .then(() =>
        S.update(storageKey, (current) => {
          const rows = clean(current),
            result = fn(rows);
          return { value: rows, result };
        }),
      )
      .then((result) => {
        channel?.postMessage('changed');
        return result;
      });
    pending = operation.catch(() => {});
    return operation;
  }
  function download(style) {
    const blob = new Blob([JSON.stringify(style, null, 2)], { type: 'application/json' }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = style.name.replace(/[<>:"/\\|?*]/g, '-') + '.control-style.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function mount(container, { owner, change, toast, locked = false }) {
    const type = owner().type,
      section = document.createElement('section');
    section.className = 'property-section component-styles';
    const h = document.createElement('h3');
    h.textContent = '组件样式库';
    section.append(h);
    container.append(section);
    const note = document.createElement('p');
    note.className = 'property-note';
    note.textContent = '保存部件、排版、特效与关键帧。应用到当前档位，保留画布位置和消息来源。';
    section.append(note);
    const row = document.createElement('div');
    row.className = 'style-actions';
    const select = document.createElement('select');
    select.setAttribute('aria-label', '已保存组件样式');
    select.disabled = locked;
    row.append(select);
    const apply = document.createElement('button');
    apply.textContent = '应用';
    apply.disabled = true;
    row.append(apply);
    section.append(row);
    const selected = () => items.find((x) => x.id === select.value);
    let items = [],
      refreshVersion = 0,
      selectedId = '';
    async function refresh(value) {
      if (value !== undefined) selectedId = value;
      const version = ++refreshVersion;
      try {
        const loaded = (await list()).filter((x) => x.type === type);
        if (version !== refreshVersion) return;
        items = loaded;
        select.replaceChildren();
        const none = document.createElement('option');
        none.value = '';
        none.textContent = items.length ? '选择已保存样式' : '还没有此类样式';
        select.append(none);
        for (const item of items) {
          const o = document.createElement('option');
          o.value = item.id;
          o.textContent = item.name;
          select.append(o);
        }
        if (selectedId && items.some((item) => item.id === selectedId)) select.value = selectedId;
        else selectedId = '';
        buttons();
      } catch {
        toast('样式库读取失败，当前画布仍可编辑。');
      }
    }
    function buttons() {
      apply.disabled = remove.disabled = locked || !selected();
    }
    select.onchange = () => {
      selectedId = select.value;
      buttons();
    };
    apply.onclick = () => {
      const saved = selected();
      if (!saved || locked) return;
      change((layer) => Object.assign(layer, structuredClone(M.normalizeStyle(saved).style)));
      toast('已应用样式，可撤销恢复。');
    };
    const name = document.createElement('input');
    name.type = 'text';
    name.maxLength = 60;
    name.placeholder = '给当前样式起个名字';
    name.value = '我的' + M.labels[type];
    name.setAttribute('aria-label', '新组件样式名称');
    name.disabled = locked;
    section.append(name);
    const saveRow = document.createElement('div');
    saveRow.className = 'style-actions';
    const save = document.createElement('button');
    save.textContent = '保存当前样式';
    save.disabled = locked;
    save.onclick = async () => {
      const label = name.value.trim();
      if (!label) {
        name.focus();
        return;
      }
      const snapshot = M.makeStyle(owner(), label);
      save.disabled = true;
      try {
        const id = await write((rows) => {
          if (rows.length >= 40) throw Error('样式库已满，请先导出并移除不需要的样式。');
          const id = crypto.randomUUID();
          rows.unshift({ ...snapshot, id });
          return id;
        });
        await refresh(id);
        toast('组件样式已保存。');
      } catch (e) {
        toast(e.message || '样式保存失败，请导出留档。');
      } finally {
        save.disabled = locked;
      }
    };
    const exportButton = document.createElement('button');
    exportButton.textContent = '导出当前';
    exportButton.onclick = () =>
      download(M.makeStyle(owner(), name.value.trim() || M.labels[type]));
    saveRow.append(save, exportButton);
    section.append(saveRow);
    const tools = document.createElement('div');
    tools.className = 'style-actions';
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.hidden = true;
    const importButton = document.createElement('button');
    importButton.textContent = '导入样式';
    importButton.disabled = locked;
    importButton.onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      try {
        if (f.size > 40 * 1024 * 1024) throw Error('文件超过 40 MB。');
        const style = M.normalizeStyle(JSON.parse(await f.text()));
        if (!style) throw Error('请选择组件样式文件。');
        if (style.type !== type)
          throw Error('这是' + M.labels[style.type] + '样式，请先选中对应组件。');
        const id = await write((rows) => {
          if (rows.length >= 40) throw Error('样式库已满。');
          const id = crypto.randomUUID();
          rows.unshift({ ...style, id });
          return id;
        });
        await refresh(id);
        toast('样式已导入，点“应用”使用。');
      } catch (e) {
        toast(e.message || '文件无法读取。');
      }
    };
    const remove = document.createElement('button');
    remove.textContent = '移除所选';
    remove.disabled = true;
    remove.onclick = async () => {
      const item = selected();
      if (!item) return;
      try {
        await write((rows) => {
          const at = rows.findIndex((x) => x.id === item.id);
          if (at >= 0) rows.splice(at, 1);
        });
        await refresh();
        toast('已从样式库移除，画布效果保持不变。');
      } catch {
        toast('样式移除失败。');
      }
    };
    tools.append(importButton, remove, file);
    section.append(tools);
    const reset = document.createElement('button');
    reset.textContent = '恢复此组件的原版样式';
    reset.className = 'wide';
    reset.disabled = locked;
    reset.onclick = () =>
      change((layer) =>
        Object.assign(
          layer,
          M.makeStyle(M.create('classic').layers.find((l) => l.type === type)).style,
        ),
      );
    section.append(reset);
    for (const watcher of watchers) if (!watcher.section.isConnected) watchers.delete(watcher);
    watchers.add({ section, refresh });
    refresh();
  }
  window.ThemeStyleLibrary = { mount, list };
})();
