'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const tick = () => new Promise(resolve => setImmediate(resolve));
const doc = name => ({ format: 'control-theme', version: 1, name, width: 1920, height: 1080, layers: [], settings: {} });
function harness({ initialResponse, applyError = false, existingSession = true, working = null, initialDocument = doc('旧项目'), legacyAssociation = false, listedProjects = [], model = null } = {}) {
  const nodes = new Map(), listeners = new Map(), channels = [], requests = [], records = new Map(), rendered = [], observers = [];
  let failList = false;
  const pendingTimers = new Map(); let timerSequence = 0, projectReads = 0, serializedCharacters = 0;
  function node(tag = 'div') {
    const classes = new Set();
    const e = { tag, value: '', textContent: '', hidden: false, open: false, dataset: {}, children: [], style: {}, clientWidth: 640, clientHeight: 360,
      classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value), toggle(value, yes) { (yes ?? !classes.has(value)) ? classes.add(value) : classes.delete(value); } },
      append(...items) { this.children.push(...items); for (const item of items) { item.parent = this; if (item.id) nodes.set(item.id, item); } },
      replaceChildren(...items) { this.children = items; for (const item of items) item.parent = this; }, setAttribute() {}, removeAttribute() {},
      remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); },
      querySelector(selector) { return this.children.find(item => item.className === selector.slice(1)) || null; },
      addEventListener(name, handler) { this['on' + name] = handler; }, showModal() { this.open = true; }, close() { this.open = false; this.onclose?.(); }, focus() {}, select() {},
      getContext() { return { fillRect() {}, strokeRect() {} }; },
    };
    if (tag === 'iframe') e.contentWindow = { ThemeRenderer: { apply: value => rendered.push(['apply', value]), preview: (...args) => rendered.push(['preview', ...args]), pause: value => rendered.push(['pause', value]) } };
    Object.defineProperty(e, 'innerHTML', { set(html) { for (const match of html.matchAll(/id="([^"]+)"/g)) { if (!nodes.has(match[1])) { const child = node(); child.id = match[1]; nodes.set(match[1], child); } } } });
    return e;
  }
  const session = new Map(existingSession ? [[legacyAssociation ? 'control-project-library-current-theme' : 'control-project-library-current-v2-theme', JSON.stringify({ id: 'old-id', name: '旧项目', revision: 1 })]] : []), local = new Map(working ? [[legacyAssociation ? 'control-project-library-working' : 'control-project-library-working-v2', JSON.stringify(working)]] : []);
  const storage = map => ({ getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) });
  const window = { addEventListener(name, handler) { listeners.set(name, handler); }, dispatchEvent() {}, ThemeEditorModel: model || { normalize: value => structuredClone(value) }, ThemeDocumentCompare: require('../app/theme-document-compare') };
  let project = structuredClone(initialDocument);
  const editor = { get project() { projectReads++; return structuredClone(project); }, async save() { return true; }, apply(value) { if (applyError) throw new Error('apply failed'); project = value; return true; } };
  const response = (status, value) => ({ ok: status < 400, status, async json() { return value; } });
  const fetch = async (url, options) => {
    requests.push({ url, ...options });
    if (url === '/api/projects/old-id' && options.method === 'GET') return records.has('old-id') ? response(200, records.get('old-id')) : initialResponse;
    if (url === '/api/projects/old-id' && options.method === 'PUT') {
      const body = JSON.parse(options.body), previous = records.get('old-id') || { document: structuredClone(initialDocument) };
      const record = { id: 'old-id', name: body.name, revision: body.revision + 1, document: { ...(body.document || previous.document), name: body.name } };
      records.set('old-id', record); return response(200, record);
    }
    if (failList && options.method === 'GET') throw new Error('offline');
    if (url === '/api/projects' && options.method === 'POST') {
      const body = JSON.parse(options.body), record = { id: 'new-id', revision: 1, name: body.name, document: body.document, updatedAt: 100 };
      records.set(record.id, record); return response(200, record);
    }
    return response(200, { projects: url.includes('?trash=1') ? [] : listedProjects, unreadable: 0 });
  };
  const document = { createElement: node, getElementById: id => nodes.get(id), body: node(), addEventListener() {}, querySelector: () => null };
  const context = vm.createContext({ window, document, location: { pathname: '/theme-editor.html', search: '' }, sessionStorage: storage(session), localStorage: storage(local),
    URLSearchParams, crypto: require('node:crypto').webcrypto, JSON: { parse: JSON.parse, stringify(...args) { const result = JSON.stringify(...args); serializedCharacters += result?.length || 0; return result; } }, Date, AbortSignal, structuredClone, fetch,
    setTimeout(fn, ms) { const id = ++timerSequence; pendingTimers.set(id, { fn, ms }); return id; }, clearTimeout(id) { pendingTimers.delete(id); }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    BroadcastChannel: class { constructor() { channels.push(this); } postMessage() {} addEventListener(name, handler) { this[name] = handler; } },
    ResizeObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/project-library.js'), 'utf8'), context);
  const api = window.ControlProjectLibrary; api.mount({ editor });
  return { api, nodes, requests, records, channels, response, session, local, rendered, observers, editor, setListError(value) { failList = value; },
    emitDocument(value) { project = value; listeners.get('theme-document-change')?.({ detail: { document: value } }); },
    flushTimers(ms) { for (const [id, timer] of [...pendingTimers]) if (timer.ms === ms) { pendingTimers.delete(id); timer.fn(); } },
    metrics() { return { projectReads, serializedCharacters }; },
  };
}
test('a slow initial project read cannot detach or mark a newly saved project dirty', async () => {
  for (const staleStatus of [200, 404]) {
    let release;
    const initialResponse = new Promise(resolve => { release = resolve; });
    const h = harness({ initialResponse });
    h.api.saveAs(); h.nodes.get('projectNameInput').value = '新项目';
    await h.nodes.get('projectNameForm').onsubmit({ preventDefault() {} });
    assert.equal(h.api.current.id, 'new-id'); assert.equal(h.api.dirty, false);
    release(h.response(staleStatus, staleStatus === 200 ? { id: 'old-id', name: '旧项目', revision: 1, document: doc('旧项目') } : { error: '旧项目不存在' }));
    await tick();
    assert.equal(h.api.current.id, 'new-id'); assert.equal(h.api.dirty, false);
  }
});
test('a successfully written copy survives a local apply failure and is not associated with the old project', async () => {
  const h = harness({ initialResponse: Promise.resolve({ ok: true, status: 200, async json() { return { id: 'old-id', document: doc('旧项目') }; } }), applyError: true });
  await tick(); h.api.saveAs(); h.nodes.get('projectNameInput').value = '已保存副本';
  await h.nodes.get('projectNameForm').onsubmit({ preventDefault() {} });
  assert.equal(h.records.get('new-id').document.name, '已保存副本');
  assert.equal(h.api.current, null);
  assert.match(h.nodes.get('projectNameError').textContent, /副本已保存/);
});
test('another window switching projects invalidates the old name and the next save asks for a new name', async () => {
  const h = harness({ initialResponse: Promise.resolve({ ok: true, status: 200, async json() { return { id: 'old-id', document: doc('旧项目') }; } }) });
  await tick();
  h.channels[0].message({ data: { writer: 'other-window', id: 'another-project' } });
  assert.equal(h.api.current, null);
  await h.api.save();
  assert.equal(h.nodes.get('projectNameDialog').open, true);
  assert(!h.requests.some(req => req.method === 'PUT'));
});
test('a fresh tab resumes a named project only when the persisted draft matches its contents exactly', async () => {
  const stored = { id: 'old-id', name: '旧项目', revision: 3, document: doc('旧项目') };
  const working = { id: 'old-id', project: { id: 'old-id', name: '旧项目', revision: 3 } };
  for (const differs of [false, true]) {
    const h = harness({ existingSession: false, working, initialDocument: doc(differs ? '未保存的本地修改' : '旧项目'), initialResponse: Promise.resolve({ ok: true, status: 200, async json() { return stored; } }) });
    await tick();
    if (differs) {
      assert.equal(h.api.current, null);
      assert.match(h.nodes.get('projectDraftName').textContent, /当前保留自动草稿/);
      assert(!h.requests.some(req => req.method === 'PUT'));
    } else { assert.equal(h.api.current.id, 'old-id'); assert.equal(h.api.current.revision, 3); assert.equal(h.api.dirty, false); }
  }
});
test('legacy associations migrate only after content verification and leave the old client metadata untouched', async () => {
  const h = harness({ legacyAssociation: true, initialResponse: Promise.resolve({ ok: true, status: 200, async json() { return { id: 'old-id', name: '旧项目', revision: 5, document: doc('旧项目') }; } }) });
  await tick();
  assert.equal(h.api.current.id, 'old-id'); assert.equal(h.api.current.revision, 5);
  assert.equal(JSON.parse(h.session.get('control-project-library-current-theme')).revision, 1);
  assert.equal(JSON.parse(h.session.get('control-project-library-current-v2-theme')).revision, 5);
});
test('read-only preview creates a single isolated renderer, replays locally and destroys all preview resources on close', async () => {
  const saved = { id: 'old-id', name: '预览对象', revision: 1, document: doc('预览对象') };
  const h = harness({ initialResponse: Promise.resolve({ ok: true, status: 200, async json() { return saved; } }), existingSession: false, listedProjects: [{ ...saved, layers: 0, width: 1920, height: 1080 }] });
  h.api.open(); await tick();
  const actions = h.nodes.get('projectDetail').children.find(node => node.className === 'project-actions');
  const preview = actions.children.find(node => node.textContent === '查看真实预览');
  await preview.onclick();
  const frame = h.nodes.get('projectPreviewSurface').children.find(node => node.tag === 'iframe');
  assert.match(frame.src, /libraryPreview=1/); assert.match(frame.src, /fps=30/);
  frame.onload(); frame.onload();
  assert.equal(h.rendered.filter(item => item[0] === 'apply').length, 1);
  assert.equal(h.editor.project.name, '旧项目');
  h.nodes.get('projectPreviewPause').onclick();
  assert(h.rendered.some(item => item[0] === 'pause' && item[1] === true));
  h.nodes.get('projectPreviewReplay').onclick();
  assert(h.rendered.some(item => item[0] === 'preview' && item[1] === 'clear'));
  h.nodes.get('projectPreviewClose').onclick();
  assert(frame.removed); assert(h.observers.every(observer => observer.disconnected));
  assert.equal(h.nodes.get('projectPreviewSurface').children.length, 0);
  assert(h.requests.every(request => request.method === 'GET'));
});
test('closing a loading preview discards a late project response without recreating an iframe', async () => {
  let release;
  const initialResponse = new Promise(resolve => { release = resolve; });
  const h = harness({ initialResponse, existingSession: false, listedProjects: [{ id: 'old-id', name: '预览对象', revision: 1, layers: 0 }] });
  h.api.open(); await tick();
  const actions = h.nodes.get('projectDetail').children.find(node => node.className === 'project-actions');
  const loading = actions.children.find(node => node.textContent === '查看真实预览').onclick();
  h.nodes.get('projectPreviewClose').onclick();
  release(h.response(200, { id: 'old-id', name: '预览对象', revision: 1, document: doc('预览对象') }));
  await loading;
  assert.equal(h.nodes.get('projectPreviewSurface').children.length, 0);
  assert.equal(h.nodes.get('projectPreviewDialog').open, false);
  assert.equal(h.rendered.length, 0);
});
test('a failed recycle-bin request cannot leave saved-project actions active under the wrong tab', async () => {
  const h = harness({ existingSession: false, listedProjects: [{ id: 'saved-id', name: '有效项目', revision: 1, layers: 0 }] });
  h.api.open(); await tick();
  assert(h.nodes.get('projectDetail').children.some(node => node.className === 'project-actions'));
  h.setListError(true); h.nodes.get('projectTabTrash').onclick(); await tick();
  assert.equal(h.nodes.get('projectLibraryCount').textContent, '读取失败');
  assert(!h.nodes.get('projectDetail').children.some(node => node.className === 'project-actions'));
  h.nodes.get('projectSearch').oninput();
  assert(!h.nodes.get('projectDetail').children.some(node => node.className === 'project-actions'));
  h.setListError(false); h.nodes.get('projectLibraryRefresh').onclick(); await tick();
  assert.equal(h.nodes.get('projectLibraryCount').textContent, '0 个可恢复项目');
});
test('renaming a current project never upgrades a stale editing revision past someone else\'s changes', async () => {
  const remote = { id:'old-id',name:'旧项目',revision:2,document:{...doc('旧项目'),layers:[{id:'remote-layer',type:'text'}]} };
  const h=harness({initialResponse:Promise.resolve({ok:true,status:200,async json(){return remote;}}),listedProjects:[{...remote,layers:1}]});
  await tick();h.api.open();await tick();
  const actions=h.nodes.get('projectDetail').children.find(node=>node.className==='project-actions');
  actions.children.find(node=>node.textContent==='重命名').onclick();h.nodes.get('projectNameInput').value='重命名';
  await h.nodes.get('projectNameForm').onsubmit({preventDefault(){}});
  assert.match(h.nodes.get('projectNameError').textContent,/较早/);
  assert.equal(h.api.current.revision,1);assert(!h.requests.some(request=>request.method==='PUT'));
});
test('renaming at the current revision updates only the name while retaining unsaved local content', async () => {
  for(const changed of [false,true]) {
    const original=doc('旧项目'),remote={id:'old-id',name:'旧项目',revision:1,document:original};
    const h=harness({initialResponse:Promise.resolve({ok:true,status:200,async json(){return remote;}}),listedProjects:[{...remote,layers:0}]});
    await tick();if(changed)h.editor.apply({...original,layers:[{id:'local-layer',type:'text'}]});
    h.api.open();await tick();
    const actions=h.nodes.get('projectDetail').children.find(node=>node.className==='project-actions');
    actions.children.find(node=>node.textContent==='重命名').onclick();h.nodes.get('projectNameInput').value='新名称';
    await h.nodes.get('projectNameForm').onsubmit({preventDefault(){}});
    assert.equal(h.api.current.revision,2);assert.equal(h.editor.project.name,'新名称');
    assert.equal(h.editor.project.layers.length,changed?1:0);assert.equal(h.api.dirty,changed);
    assert.equal(h.records.get('old-id').document.layers.length,0);
  }
});
test('the 20 MiB editor event chain updates dirty state without serializing media or cloning the editor document', async t => {
  const M = require('../app/theme-editor-model'), { performance } = require('node:perf_hooks');
  const initial = M.normalize({ format:'control-theme',version:1,name:'大素材项目',layers:[
    {id:'media-one',type:'image',x:80,src:'data:image/png;base64,'+'A'.repeat(10*1024*1024)},
    {id:'media-two',type:'image',x:400,src:'data:image/webp;base64,'+'B'.repeat(10*1024*1024)},
  ] });
  const remote = { id:'old-id',name:'大素材项目',revision:1,document:JSON.parse(JSON.stringify(initial)) };
  const h = harness({ initialDocument:initial,model:M,initialResponse:Promise.resolve({ok:true,status:200,async json(){return remote;}}) });
  await tick();assert.equal(h.api.dirty,false);
  const before=h.metrics(),heapBefore=process.memoryUsage().heapUsed,timings=[];
  let working=initial,heapPeak=heapBefore;
  for(let i=0;i<60;i++){
    const start=performance.now();working.layers[0].x=i%2?81:80;working=M.normalize(working);
    h.emitDocument(working);h.flushTimers(200);
    timings.push(performance.now()-start);assert.equal(h.api.dirty,!!(i%2));
    heapPeak=Math.max(heapPeak,process.memoryUsage().heapUsed);
  }
  assert.deepEqual(h.metrics(),before);
  const mean=timings.reduce((a,b)=>a+b,0)/timings.length;
  t.diagnostic('20 MiB normalize + editor event + dirty comparison: '+mean.toFixed(3)+' ms/event; peak heap growth '+((heapPeak-heapBefore)/1048576).toFixed(2)+' MiB; no editor getter or media JSON serialization.');
});
