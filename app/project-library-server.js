'use strict';
// Named projects are private local documents, separate from automatic drafts and
// the explicitly published OBS document. Deleted projects remain recoverable.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const validation = require('./theme-document-validation.js');
const MAX_BYTES = 40 * 1024 * 1024;
const sensitive = /(?:sessdata|cookie|token|secret|password|credential|csrf|bili_jct|accesskey|identitycode|authorization)/i;
function issue(status, message) { return Object.assign(new Error(message), { status }); }
function cleanDocument(raw, model, options) {
  const problem = validation.issue(raw, model, options);
  if (problem) throw issue(400, problem);
  const doc = model.normalize(raw);
  for (const key of Object.keys(doc.settings || {}))
    if (sensitive.test(key) || /^live[A-Z]/.test(key) || key === 'messageSource') delete doc.settings[key];
  return doc;
}
function createProjectLibrary({ dataDirectory, model = () => require('./theme-editor-model.js'), now = Date.now } = {}) {
  const directory = path.join(dataDirectory, 'theme-live', 'project-library');
  const cache = new Map(), summaryCache = new Map();
  let queue = Promise.resolve();
  const serialize = work => {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
  };
  function target(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw issue(404, '找不到这个项目。');
    return path.join(directory, id + '.json');
  }
  function read(id) {
    const file = target(id);
    let stat;
    try { stat = fs.statSync(file); } catch (e) { if (e.code === 'ENOENT') throw issue(404, '项目已不存在，请刷新项目库。'); throw e; }
    if (!stat.isFile() || stat.size > MAX_BYTES) throw issue(422, '项目文件异常或超过读取上限，原文件已保留。');
    const previous = cache.get(id);
    if (previous?.stamp === stat.mtimeMs && previous?.bytes === stat.size) {
      cache.delete(id); cache.set(id, previous); return previous.record;
    }
    let record;
    try { record = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { throw issue(422, '项目文件无法读取；原文件已保留，请从导出的 JSON 恢复。'); }
    const doc = record.document;
    if (record.id !== id || record.format !== 'control-project-record' ||
        typeof record.name !== 'string' || !record.name.trim() || record.name.length > 80 ||
        !Number.isSafeInteger(record.revision) || record.revision < 1 ||
        !Number.isFinite(record.createdAt) || !Number.isFinite(record.updatedAt) ||
        !doc || doc.format !== 'control-theme' || doc.version !== 1 ||
        !Array.isArray(doc.layers) || doc.layers.length > (model().limits?.layers || 100) || doc.layers.some(layer => !layer || typeof layer !== 'object') ||
        ![doc.width, doc.height].every(value => Number.isFinite(value) && value >= 1 && value <= 16384))
      throw issue(422, '项目文件格式异常，原文件已保留。');
    cache.set(id, { stamp: stat.mtimeMs, bytes: stat.size, record });
    let retainedBytes = [...cache.values()].reduce((total, item) => total + item.bytes, 0);
    while (cache.size > 8 || retainedBytes > 80 * 1024 * 1024) {
      const oldest = cache.keys().next().value;
      retainedBytes -= cache.get(oldest).bytes; cache.delete(oldest);
    }
    return record;
  }
  function info(record) {
    const doc = record.document, M = model(), instances = require('./theme-instances.js');
    const visible = doc.layers.map(layer => M.effective(doc, layer)).filter(layer => layer.visible !== false && layer.opacity > 0 && layer.type !== 'group');
    return {
      id: record.id, name: record.name, revision: record.revision,
      createdAt: record.createdAt, updatedAt: record.updatedAt, deletedAt: record.deletedAt || null,
      width: doc.width, height: doc.height, layers: doc.layers.length,
      composition: doc.composition,
      bytes: cache.get(record.id)?.bytes || 0,
      assets: doc.layers.filter(layer => layer.src && ['image', 'video', 'background'].includes(layer.type)).length,
      thumbnail: visible.filter(layer => !instances.feed(doc, layer)).slice(0, 100).map(l => ({
        type: l.type, x: l.x, y: l.y, width: l.w, height: l.h,
        opacity: l.opacity,
        feedKinds: l.type === 'chat' ? visible.filter(layer => instances.feed(doc, layer) && instances.owner(doc, layer)?.id === l.id).map(layer => layer.type) : undefined,
        fill: /^#[0-9a-f]{6}$/i.test(l.fill || '') ? l.fill : undefined,
      })),
    };
  }
  function write(record) {
    fs.mkdirSync(directory, { recursive: true });
    const file = target(record.id), temp = file + '.' + crypto.randomUUID() + '.tmp';
    const data = JSON.stringify(record);
    if (Buffer.byteLength(data) > MAX_BYTES) throw issue(413, '项目超过 40 MB，请减少内嵌素材后重试。');
    try {
      const descriptor = fs.openSync(temp, 'wx', 0o600);
      try { fs.writeFileSync(descriptor, data); fs.fsyncSync(descriptor); }
      finally { fs.closeSync(descriptor); }
      fs.renameSync(temp, file);
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
    cache.delete(record.id);
    summaryCache.delete(record.id);
    return structuredClone(record);
  }
  function nameOf(value) {
    const name = String(value ?? '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, 80);
    if (!name) throw issue(400, '请填写项目名称。');
    return name;
  }
  function list({ trash = false } = {}) {
    if (!fs.existsSync(directory)) return { projects: [], unreadable: 0 };
    const projects = [];
    let unreadable = 0;
    for (const file of fs.readdirSync(directory)) {
      if (!/^[a-f0-9-]{36}\.json$/.test(file)) continue;
      try {
        const id = file.slice(0, -5), stat = fs.statSync(path.join(directory, file));
        let summary = summaryCache.get(id);
        if (!summary || summary.stamp !== stat.mtimeMs || summary.bytes !== stat.size) {
          summary = { stamp: stat.mtimeMs, bytes: stat.size, value: info(read(id)) };
          summaryCache.delete(id); summaryCache.set(id, summary);
          while (summaryCache.size > 2048) summaryCache.delete(summaryCache.keys().next().value);
        }
        if (!!summary.value.deletedAt === trash) projects.push(structuredClone(summary.value));
      } catch (e) { if (e.status === 422) unreadable++; else if (e.status !== 404 && e.code !== 'ENOENT') throw e; }
    }
    projects.sort((a, b) => (b.deletedAt || b.updatedAt) - (a.deletedAt || a.updatedAt));
    return { projects, unreadable };
  }
  const get = id => structuredClone(read(id));
  function create(input) {
    return serialize(() => {
      const document = cleanDocument(input?.document, model());
      const name = nameOf(input.name || document.name);
      document.name = name;
      const requested = input.requestId;
      if (requested !== undefined && (typeof requested !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requested))) throw issue(400, '保存请求标识无效，请重新打开保存窗口。');
      const id = requested ? requested.toLowerCase() : crypto.randomUUID();
      const creationHash = crypto.createHash('sha256').update(JSON.stringify({ name, document })).digest('hex');
      if (fs.existsSync(target(id))) {
        const existing = get(id);
        if (existing.creationHash === creationHash && existing.revision === 1 && !existing.deletedAt) return existing;
        throw issue(409, '这次保存的项目已经存在或已被修改。请在项目库打开，或另存一个新副本。');
      }
      const stamp = now();
      return write({ format: 'control-project-record', id, name, revision: 1, createdAt: stamp, updatedAt: stamp, deletedAt: null, creationHash, document });
    });
  }
  function change(id, input, action = 'update') {
    return serialize(() => {
      const record = get(id);
      if (input?.revision !== record.revision) throw Object.assign(issue(409, '另一个窗口已修改这个项目。请刷新后打开最新版本，或把当前内容另存为副本。'), { current: info(record) });
      if (record.deletedAt && action !== 'restore') throw issue(409, '项目已移入回收站。请先恢复，或将当前内容另存为副本。');
      if (action === 'restore') record.deletedAt = null;
      else if (action === 'delete') record.deletedAt = now();
      else {
        if (input.document) record.document = cleanDocument(input.document, model());
        record.name = nameOf(input.name ?? record.name);
        record.document.name = record.name;
      }
      record.revision++;
      record.updatedAt = now();
      return write(record);
    });
  }
  async function handle(req, res, url = new URL(req.url, 'http://' + req.headers.host)) {
    const match = /^\/api\/projects(?:\/([a-f0-9-]{36})(\/restore)?)?$/.exec(url.pathname);
    const json = (status, value) => { if (!res.writableEnded) res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(JSON.stringify(value)); };
    if (!match) { json(404, { error: '项目接口不存在。' }); return true; }
    const allowed = ['http://127.0.0.1:', 'http://localhost:', 'http://[::1]:'].map(x => x + req.socket.localPort);
    const origin = req.headers.origin;
    if (origin && !allowed.includes(origin)) { json(403, { error: '仅允许本机编辑器访问项目。' }); return true; }
    try {
      if (req.method === 'GET' && !match[2]) {
        await queue;
        json(200, match[1] ? get(match[1]) : list({ trash: url.searchParams.get('trash') === '1' }));
        return true;
      }
      if (!['POST', 'PUT', 'DELETE'].includes(req.method)) { json(405, { error: '不支持此操作。' }); return true; }
      if (!origin || !String(req.headers['content-type']).startsWith('application/json')) { json(403, { error: '请从本机编辑器保存项目。' }); return true; }
      const input = await new Promise((resolve, reject) => {
        const chunks = []; let bytes = 0, over = false;
        req.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > MAX_BYTES) { if (!over) reject(issue(413, '项目超过 40 MB，请减少内嵌素材。')); over = true; chunks.length = 0; }
          else if (!over) chunks.push(chunk);
        });
        req.on('error', reject);
        req.on('end', () => {
          if (over) return;
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
          catch { reject(issue(400, '项目数据不是有效 JSON。')); }
        });
      });
      let result;
      if (req.method === 'POST' && !match[1]) result = await create(input);
      else if (req.method === 'PUT' && match[1] && !match[2]) result = await change(match[1], input);
      else if (req.method === 'DELETE' && match[1] && !match[2]) result = await change(match[1], input, 'delete');
      else if (req.method === 'POST' && match[2]) result = await change(match[1], input, 'restore');
      else throw issue(405, '不支持此操作。');
      json(200, result);
    } catch (e) { json(e.status || 500, { error: e.status ? e.message : '本机项目保存失败，请检查磁盘空间和文件权限。当前草稿没有被覆盖。', current: e.current }); }
    return true;
  }
  return { handle, list, get, create, change, directory };
}
module.exports = { createProjectLibrary, cleanDocument };
