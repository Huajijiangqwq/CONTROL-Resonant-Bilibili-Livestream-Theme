/* Shared import boundary. Reject invalid media instead of normalising it away. */
(function(root) {
  'use strict';
  const maxRequestBytes = 40 * 1024 * 1024;
  const maxBytes = maxRequestBytes - 64 * 1024;
  const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;
  const privateSetting = /(?:sessdata|cookie|token|secret|password|credential|csrf|bili_jct|accesskey|identitycode|authorization)/i;
  function utf8Length(text) {
    if (encoder) return encoder.encode(text).byteLength;
    let size = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c < 128) size++;
      else if (c < 2048) size += 2;
      else if (c >= 0xd800 && c <= 0xdbff && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { size += 4; i++; }
      else size += 3;
    }
    return size;
  }
  function estimateBytes(value, model = root.ThemeEditorModel, limit = maxBytes) {
    if (!(limit === Infinity || (Number.isFinite(limit) && limit >= 0))) throw new Error('无效的主题容量上限。');
    let bytes = 0, error = '', depth = 0;
    const parents = new WeakSet();
    const add = count => { bytes += count; return bytes <= limit; };
    function string(text) {
      // UTF-8 JSON can never use fewer bytes than its UTF-16 code units.
      if (text.length + 2 > limit - bytes) { add(text.length + 2); return; }
      if (text.startsWith('data:') && model?.source?.(text) === text) { add(text.length + 2); return; }
      if (text.length <= 16384) { add(utf8Length(JSON.stringify(text))); return; }
      // Untrusted long strings are counted in place, not serialized into another
      // multi-megabyte buffer. Well-formed JSON escapes lone surrogates.
      let count = 2;
      for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i), next = text.charCodeAt(i + 1);
        if (c === 34 || c === 92) count += 2;
        else if (c < 32) count += [8, 9, 10, 12, 13].includes(c) ? 2 : 6;
        else if (c >= 0xd800 && c <= 0xdbff) {
          if (next >= 0xdc00 && next <= 0xdfff) { count += 4; i++; } else count += 6;
        } else if (c >= 0xdc00 && c <= 0xdfff) count += 6;
        else count += c < 128 ? 1 : c < 2048 ? 2 : 3;
        if (bytes + count > limit) break;
      }
      add(count);
    }
    const omitted = item => item === undefined || typeof item === 'function' || typeof item === 'symbol';
    function visit(item, level, inArray = false) {
      if (bytes > limit || error) return;
      depth = Math.max(depth, level);
      if (level > 128) { error = '主题数据嵌套过深，未保存。'; return; }
      if (item === null) { add(4); return; }
      if (omitted(item)) { if (inArray) add(4); return; }
      if (typeof item === 'string') { string(item); return; }
      if (typeof item === 'boolean') { add(item ? 4 : 5); return; }
      if (typeof item === 'number') { add(Number.isFinite(item) ? String(item).length : 4); return; }
      if (typeof item !== 'object' || typeof item.toJSON === 'function') { error = '主题包含非 JSON 数据，请先转换后再保存。'; return; }
      if (parents.has(item)) { error = '主题包含循环引用，未保存。'; return; }
      const array = Array.isArray(item), tag = Object.prototype.toString.call(item);
      if (!array && tag !== '[object Object]') { error = '主题包含非 JSON 数据，请先转换后再保存。'; return; }
      parents.add(item);
      try {
        if (!add(1)) return;
        if (array) {
          for (let i = 0; i < item.length && bytes <= limit && !error; i++) { if (i && !add(1)) break; visit(item[i], level + 1, true); }
        } else {
          let count = 0;
          for (const key of Object.keys(item)) {
            if (bytes > limit || error) break;
            const member = item[key]; if (omitted(member)) continue;
            if (count++ && !add(1)) break;
            string(key); if (bytes > limit || !add(1)) break; visit(member, level + 1);
          }
        }
        if (bytes <= limit && !error) add(1);
      } finally { parents.delete(item); }
    }
    try { visit(value, 0); } catch { error = '主题数据无法读取，未保存。'; }
    return { bytes, complete: !error && bytes <= limit, tooLarge: bytes > limit, error, depth };
  }
  function jsonBytes(value, model = root.ThemeEditorModel, limit = maxBytes) {
    const result = estimateBytes(value, model, limit);
    if (result.error) throw new Error(result.error);
    return result.tooLarge ? limit + 1 : result.bytes;
  }
  function capacityIssue(raw, model = root.ThemeEditorModel) {
    const structure = model?.capacityIssue?.(raw); if (structure) return structure;
    const result = estimateBytes(raw, model);
    return result.error || (result.tooLarge ? '主题超过可保存容量（约 40 MB）。请减少内嵌素材或重复素材后重试；原草稿已保留。' : '');
  }
  function mediaIssue(raw, model = root.ThemeEditorModel) {
    if (!model || typeof model.source !== 'function') return '主题验证模块尚未准备好，请刷新页面后重试。';
    function media(node, label, scanParts = true) {
      if (!node || typeof node !== 'object') return '';
      const provided = typeof node.src === 'string' ? node.src.trim() : node.src;
      if (provided && (typeof node.src !== 'string' || !model.source(node.src)))
        return '「' + String(label || '素材').slice(0, 40) + '」含过大或不支持的素材，未导入。请替换素材后重试。';
      if (scanParts && Array.isArray(node.parts)) for (const part of node.parts) {
        const error = media(part, part?.name || label, false);
        if (error) return error;
      }
      return '';
    }
    for (const layer of Array.isArray(raw?.layers) ? raw.layers : []) {
      const error = media(layer, layer?.name);
      if (error) return error;
      for (const variant of Object.values(layer?.variants || {})) {
        const error = media(variant, layer?.name);
        if (error) return error;
      }
    }
    return '';
  }
  function issue(raw, model = root.ThemeEditorModel, { allowOversize = false } = {}) {
    if (!raw || raw.format !== 'control-theme' || raw.version !== 1 || !Array.isArray(raw.layers))
      return '请选择有效的 CONTROL 主题 JSON 文件。';
    return (allowOversize ? model?.capacityIssue?.(raw) : capacityIssue(raw, model)) || mediaIssue(raw, model);
  }
  function validate(raw, model = root.ThemeEditorModel, options) {
    const error = issue(raw, model, options);
    if (error) throw new Error(error);
    return raw;
  }
  function serializeForExport(raw, model = root.ThemeEditorModel) {
    if (!raw || raw.format !== 'control-theme' || raw.version !== 1 || !Array.isArray(raw.layers)) throw new Error('这不是可导出的 CONTROL 主题。');
    // A rescue export retains media and authored data even when an old draft is
    // above today's limit. Only connection credentials are removed.
    const document = { ...raw, settings: Object.fromEntries(Object.entries(raw.settings || {}).filter(([key]) => !privateSetting.test(key) && !/^live[A-Z]/.test(key) && key !== 'messageSource')) };
    const measured = estimateBytes(document, model, Infinity);
    if (measured.error) throw new Error(measured.error);
    let compact = measured.bytes > 512 * 1024 || measured.depth > 16;
    let text = JSON.stringify(document, null, compact ? undefined : 2);
    let bytes = compact ? measured.bytes : utf8Length(text);
    if (!compact && bytes > maxBytes) { compact = true; text = JSON.stringify(document); bytes = measured.bytes; }
    const oversized = bytes > maxBytes;
    return { text, bytes, compact, oversized, warning: oversized ? '已导出超限草稿的救援备份。需精简素材至约 40 MB 以内，才能重新导入或应用。' : '' };
  }
  const api = { maxBytes, maxRequestBytes, estimateBytes, jsonBytes, capacityIssue, issue, mediaIssue, validate, serializeForExport };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThemeDocumentValidation = api;
})(typeof window === 'object' ? window : {});
