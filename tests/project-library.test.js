'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { createProjectLibrary } = require('../app/project-library-server');
const model = require('../app/theme-editor-model');
function context(t) {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'control-projects-'));
  t.after(() => fs.rmSync(dataDirectory, { recursive: true, force: true }));
  return { dataDirectory, library: createProjectLibrary({ dataDirectory }) };
}
test('named projects survive service restart, share metadata, strip login data and preserve media', async t => {
  const { dataDirectory, library } = context(t);
  const doc = model.create('classic');
  doc.settings.sessdata = 'must-not-export'; doc.settings.accessToken = 'must-not-export';
  doc.settings.liveSession = 'must-not-export'; doc.settings.bili_jct = 'must-not-export';
  doc.settings.messageSource = 'live';
  doc.layers.push(model.layer({ id: 'picture', type: 'image', src: 'data:image/png;base64,iVBORw0KGgo=' }));
  const created = await library.create({ name: '横版 · 我的主题', document: doc });
  assert.equal(created.revision, 1); assert.equal(created.document.name, '横版 · 我的主题');
  assert(!JSON.stringify(created).includes('must-not-export'));
  assert(created.document.layers.some(l => l.src?.startsWith('data:image/png')));
  const restarted = createProjectLibrary({ dataDirectory });
  assert.deepEqual(restarted.get(created.id), created);
  const list = restarted.list();
  assert.equal(list.projects.length, 1); assert.equal(list.projects[0].width, 1920);
  assert(list.projects[0].thumbnail.some(l => l.width > 100));
  assert.equal(list.projects[0].document, undefined);
  assert(require('../scripts/package').excluded('app/theme-live/project-library/' + created.id + '.json'));
});
test('revision conflicts never silently overwrite; rename, recycle and restore retain the document', async t => {
  const { library } = context(t);
  const original = await library.create({ name: '初稿', document: model.create('split') });
  const [first, second] = await Promise.allSettled([
    library.change(original.id, { revision: 1, name: '窗口一' }),
    library.change(original.id, { revision: 1, name: '窗口二' }),
  ]);
  assert.equal(first.status, 'fulfilled'); assert.equal(second.status, 'rejected'); assert.equal(second.reason.status, 409);
  assert.equal(library.get(original.id).name, '窗口一');
  const renamed = first.value;
  const removed = await library.change(original.id, { revision: renamed.revision }, 'delete');
  assert.equal(library.list().projects.length, 0); assert.equal(library.list({ trash: true }).projects.length, 1);
  assert.deepEqual(removed.document.layers, original.document.layers);
  await assert.rejects(library.change(original.id, { revision: removed.revision, name: '误改' }), e => e.status === 409);
  const restored = await library.change(original.id, { revision: removed.revision }, 'restore');
  assert.equal(restored.deletedAt, null); assert.equal(restored.revision, 4);
  assert.equal(library.list().projects[0].name, '窗口一');
  assert.equal(library.list({ trash: true }).projects.length, 0);
});
test('bad documents and corrupt files cannot replace an existing project; corrupt file remains for recovery', async t => {
  const { library } = context(t);
  const created = await library.create({ document: model.create('classic'), name: '保留' });
  await assert.rejects(library.change(created.id, { revision: 1, document: { format: 'unknown', layers: [] } }), e => e.status === 400);
  assert.equal(library.get(created.id).revision, 1);
  assert.throws(() => library.get('../../private'), e => e.status === 404);
  fs.writeFileSync(path.join(library.directory, created.id + '.json'), 'broken document');
  assert.throws(() => library.get(created.id), e => e.status === 422);
  assert.equal(library.list().unreadable, 1);
  assert.equal(fs.readFileSync(path.join(library.directory, created.id + '.json'), 'utf8'), 'broken document');
  const healthy = await library.create({ document: model.create('game'), name: '正常项目' });
  fs.writeFileSync(path.join(library.directory, created.id + '.json'), JSON.stringify({ ...created, document: { ...created.document, layers: {} } }));
  const remaining = library.list();
  assert.equal(remaining.unreadable, 1); assert.equal(remaining.projects.length, 1); assert.equal(remaining.projects[0].id, healthy.id);
});
test('same-name imports remain distinct and a failed disk replacement preserves the last good revision', async t => {
  const { library } = context(t);
  const first = await library.create({ name: '同名主题', document: model.create('classic') });
  const second = await library.create({ name: '同名主题', document: model.create('split') });
  assert.notEqual(first.id, second.id); assert.equal(library.list().projects.length, 2);
  const mutatedRead = library.get(first.id); mutatedRead.document.layers.length = 0;
  assert.equal(library.get(first.id).document.layers.length, first.document.layers.length);
  await assert.rejects(library.change(first.id, { revision: 1, name: ' ' }), e => e.status === 400);
  const realRename = fs.renameSync;
  const mocked = t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === path.join(library.directory, first.id + '.json')) throw Object.assign(new Error('disk unavailable'), { code: 'ENOSPC' });
    return realRename(from, to);
  });
  await assert.rejects(library.change(first.id, { revision: 1, name: '不应保存' }), e => e.code === 'ENOSPC');
  mocked.mock.restore();
  assert.deepEqual(library.get(first.id), first);
  assert(fs.readdirSync(library.directory).every(name => name.endsWith('.json')));
  const retried = await library.change(first.id, { revision: 1, name: '重试成功' });
  assert.equal(retried.revision, 2);
});
test('retrying the same named save after a lost response cannot create duplicates or revive a deleted project', async t => {
  const { library } = context(t), requestId = require('node:crypto').randomUUID();
  const input = { name: '网络重试', document: model.create('classic'), requestId };
  const first = await library.create(input);
  const repeat = await library.create(input);
  assert.equal(first.id, repeat.id); assert.equal(library.list().projects.length, 1);
  assert.equal((await library.create({ ...input, requestId: requestId.toUpperCase() })).id, first.id);
  await assert.rejects(library.create({ ...input, name: '变化的请求' }), e => e.status === 409);
  await library.change(first.id, { revision: 1 }, 'delete');
  await assert.rejects(library.create(input), e => e.status === 409);
  assert.equal(library.list().projects.length, 0); assert.equal(library.list({ trash: true }).projects.length, 1);
  await assert.rejects(library.create({ ...input, requestId: '../../invalid' }), e => e.status === 400);
  await assert.rejects(library.create({ ...input, requestId: [requestId] }), e => e.status === 400);
});
test('layout thumbnails retain visible group children and represent feed messages inside their host', async t => {
  const { library } = context(t);
  const document = model.create('classic');
  document.layers.push(model.layer({ id: 'named-group', type: 'group', visible: true }));
  document.layers.push(model.layer({ id: 'group-picture', parent: 'named-group', type: 'image', x: 33, y: 44, w: 55, h: 66 }));
  const record = await library.create({ name: '分组缩略图', document });
  const summary = library.list().projects[0];
  assert(summary.thumbnail.some(layer => layer.type === 'image' && layer.x === 33 && layer.width === 55));
  assert(!summary.thumbnail.some(layer => layer.type === 'fleet'));
  assert(summary.thumbnail.find(layer => layer.type === 'chat').feedKinds.includes('fleet'));
  assert(summary.bytes > 0);
  const updated = structuredClone(record.document); updated.layers.find(layer => layer.id === 'named-group').visible = false;
  await library.change(record.id, { revision: 1, document: updated });
  assert(!library.list().projects[0].thumbnail.some(layer => layer.type === 'image'));
});
test('repeated lists reuse lightweight summaries without reparsing embedded media, and edits invalidate only their own summary', async t => {
  const { dataDirectory, library } = context(t);
  const ids = [];
  for(let i=0;i<12;i++) ids.push((await library.create({name:'项目 '+i,document:model.create('classic')})).id);
  const fresh = createProjectLibrary({ dataDirectory }), originalRead = fs.readFileSync;
  let reads = 0;
  const mocked = t.mock.method(fs,'readFileSync',function(file,...args){if(typeof file==='string'&&file.startsWith(library.directory)&&file.endsWith('.json'))reads++;return originalRead.call(this,file,...args);});
  const initial = fresh.list(); assert.equal(initial.projects.length,12); assert.equal(reads,12);
  initial.projects[0].name='调用者自己的修改'; reads=0;
  const repeated=fresh.list(); assert.equal(reads,0); assert(!repeated.projects.some(project=>project.name==='调用者自己的修改'));
  await fresh.change(ids[0],{revision:1,name:'更新一个项目'}); reads=0;
  assert(fresh.list().projects.some(project=>project.name==='更新一个项目')); assert.equal(reads,1);
  mocked.mock.restore();
});
test('unsupported or oversized embedded media cannot silently disappear during project import', async t => {
  const { library } = context(t);
  const document = model.create('classic');
  document.layers.push({ id:'unsafe-image',type:'image',name:'导入的图片',src:'data:image/svg+xml;base64,PHN2Zy8+' });
  await assert.rejects(library.create({name:'不能丢图',document}),error=>error.status===400&&/素材/.test(error.message));
  document.layers.at(-1).src='data:image/png;base64,'+'A'.repeat(12000000);
  await assert.rejects(library.create({name:'不能丢大图',document}),error=>error.status===400&&/素材/.test(error.message));
  document.layers.pop(); document.layers.find(layer=>layer.type==='sc').parts.push({id:'invalid-part',kind:'image',src:'javascript:alert(1)'});
  await assert.rejects(library.create({name:'不能丢组件素材',document}),error=>error.status===400);
  assert.equal(library.list().projects.length,0);
});
test('preview server integrates the project API but never exposes project files through static URLs', async t => {
  const { dataDirectory } = context(t);
  const app = require('../app/preview-server').createPreviewServer({ port: 0, dataRoot: dataDirectory });
  await app.listen();
  t.after(async () => { app.server.closeAllConnections(); await app.close(); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const response = await fetch(base + '/api/projects', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '私有项目', document: model.create('classic') }) });
  assert.equal(response.status, 200);
  const record = await response.json();
  assert.equal((await fetch(base + '/theme-live/project-library/' + record.id + '.json')).status, 404);
  assert.equal((await (await fetch(base + '/api/projects/' + record.id)).json()).name, '私有项目');
});
test('HTTP library requires local origin for writes, reports conflicts and restores from another local origin', async t => {
  const { library } = context(t);
  const server = http.createServer((req, res) => library.handle(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const port = server.address().port, base = `http://127.0.0.1:${port}`;
  const send = (suffix, method, body, origin = base) => fetch(base + '/api/projects' + suffix, { method, headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  const body = { name: '测试', document: model.create('game') };
  assert.equal((await send('', 'POST', body, 'https://foreign.example')).status, 403);
  assert.equal((await send('', 'POST', body, null)).status, 403);
  const createdResponse = await send('', 'POST', body); assert.equal(createdResponse.status, 200);
  const created = await createdResponse.json();
  const stale = await send('/' + created.id, 'PUT', { revision: 0, name: '覆盖' }); assert.equal(stale.status, 409);
  assert.equal((await stale.json()).current.name, '测试');
  assert.equal((await send('/' + created.id, 'DELETE', { revision: 1 })).status, 200);
  const trash = await (await fetch(base + '/api/projects?trash=1')).json(); assert.equal(trash.projects.length, 1);
  const restored = await send('/' + created.id + '/restore', 'POST', { revision: 2 }, `http://localhost:${port}`);
  assert.equal(restored.status, 200); assert.equal((await restored.json()).deletedAt, null);
  const fetched = await (await fetch(base + '/api/projects/' + created.id)).json(); assert.equal(fetched.revision, 3);
});
