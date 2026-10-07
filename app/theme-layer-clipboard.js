/* Portable layer clipboard, deliberately excluding theme settings and credentials. */
(function (root) {
  'use strict';
  const node = typeof module === 'object' && module.exports,
    M = node ? require('./theme-editor-model.js') : root.ThemeEditorModel,
    I = node ? require('./theme-instances.js') : root.ThemeInstances,
    V = node ? require('./theme-document-validation.js') : root.ThemeDocumentValidation,
    maxBytes = 16 * 1024 * 1024;
  function bounded(text) {
    if (typeof text !== 'string' || text.length > maxBytes || new TextEncoder().encode(text).byteLength > maxBytes)
      throw Error('图层剪贴板超过 16 MB，请减少所选素材，或使用项目 JSON 导入。');
    return text;
  }
  function encode(document, selectedIds) {
    const ids = new Set(selectedIds), source = document.layers.filter(l => ids.has(l.id) || ids.has(l.parent));
    if (!source.length) throw Error('先选择需要复制的图层。');
    let serial = 0;
    const cloned = I.clone(document, source, () => 'clipboard-' + ++serial, 0);
    const raw = { format: 'control-theme', version: 1, name: '复制的图层', composition: document.composition, layers: cloned.items },
      capacity = V.issue(raw, M); if (capacity) throw Error(capacity);
    for (const layer of cloned.items) if (layer.name.endsWith(' 副本')) layer.name = layer.name.slice(0, -3);
    const doc = M.normalize(raw);
    const selection = cloned.selection.filter((_, index) => ids.has(source[index].id) && !ids.has(source[index].parent));
    return bounded(JSON.stringify({ format: 'control-layer-clipboard', version: 1, document: doc, selection }));
  }
  function decode(text) {
    bounded(text);
    let raw; try { raw = JSON.parse(text); } catch { throw Error('剪贴板不是 CONTROL 图层。请先选择图层并复制。'); }
    if (raw?.format !== 'control-layer-clipboard' || raw.version !== 1 || raw.document?.format !== 'control-theme' ||
        raw.document.version !== 1 || !Array.isArray(raw.document.layers) || !Array.isArray(raw.selection))
      throw Error('剪贴板不是受支持的 CONTROL 图层格式。');
    const issue = V.issue(raw.document, M); if (issue) throw Error(issue);
    for (const layer of raw.document.layers) {
      if (!layer || typeof layer !== 'object') throw Error('图层数据不完整，未粘贴。');
      if (layer.src !== undefined && typeof layer.src !== 'string') throw Error('图层素材字段不完整，未粘贴。');
      for (const style of [layer, ...Object.values(layer.variants || {})]) {
        if (style?.parts !== undefined && !Array.isArray(style.parts)) throw Error('图层部件数据不完整，未粘贴。');
        for (const part of style?.parts || [])
          if (!part || typeof part !== 'object' || part.src !== undefined && typeof part.src !== 'string')
            throw Error('图层部件数据不完整，未粘贴。');
      }
    }
    const document = M.normalize({ ...raw.document, settings: {} });
    if (document.layers.length !== raw.document.layers.length) throw Error('剪贴板包含重复的图层标识，请重新复制。');
    const available = new Set(document.layers.map(l => l.id)), selection = raw.selection.filter(id => typeof id === 'string' && available.has(id));
    if (!selection.length) throw Error('剪贴板没有可粘贴的图层。');
    return { document, selection };
  }
  function paste(document, text, { id, offset = 24 } = {}) {
    if (typeof id !== 'function') throw Error('缺少图层编号生成器。');
    const clip = decode(text), selected = new Set(clip.selection),
      source = clip.document.layers.filter(l => selected.has(l.id) || selected.has(l.parent)),
      result = I.clone(clip.document, source, id, offset);
    if (document.layers.length + result.items.length > M.limits.layers)
      throw Error('粘贴后超过 ' + M.limits.layers + ' 个图层，请先精简当前项目。');
    const used = new Set(document.layers.map(l => l.id));
    for (const layer of result.items) {
      if (used.has(layer.id)) throw Error('新的图层编号冲突，未粘贴。');
      used.add(layer.id);
    }
    const items = M.normalize({ layers: result.items, composition: clip.document.composition }).layers;
    if (document.composition === 'layers' && !I.primaryChat(document))
      for (const layer of items) if (layer.type === 'chat') layer.standalone = true;
    const capacity = V.capacityIssue({ ...document, layers: [...document.layers, ...items] }, M);
    if (capacity) throw Error(capacity);
    return { items, selection: result.selection.filter((_, index) => selected.has(source[index].id) && !selected.has(source[index].parent)) };
  }
  const api = { maxBytes, encode, decode, paste };
  if (node) module.exports = api; else root.ThemeLayerClipboard = api;
})(globalThis);
