'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'),
  M = require('../app/theme-editor-model'), V = require('../app/theme-document-validation');
const editor = fs.readFileSync(path.join(__dirname, '../app/theme-editor.js'), 'utf8');
const extract = (from, to) => editor.slice(editor.indexOf(from), editor.indexOf(to, editor.indexOf(from)));
function fixture({ limit = V.maxBytes, fail = '', changeEpoch = false } = {}) {
  let reads = 0, commits = 0, serial = 0; const notices = [];
  const validation = { ...V, maxBytes: limit, capacityIssue(doc, model) {
    const raw = V.capacityIssue(doc, model); if (raw) return raw;
    return V.estimateBytes(doc, model, limit).tooLarge ? '容量超限' : '';
  } };
  const context = vm.createContext({ M, window: { ThemeDocumentValidation: validation }, project: M.normalize(), documentEpoch: 1,
    activeVariant: {}, assetRequest: 0, assetRequests: new Map(), chatMode: false, selected: new Set(),
    crypto: { randomUUID: () => 'asset-' + ++serial }, toast: text => notices.push(text),
    viewport: () => ({ x: 0, y: 0, w: 1920, h: 1080 }), insertionPoint: () => ({ x: 200, y: 200 }),
    roomForLayers: count => context.project.layers.length + count <= 100,
    transact(fn) { commits++; fn(); context.project = M.normalize(context.project); },
    ThemeEditorImports: { validate() {}, async read(file) {
      reads++; if (file.name === fail) throw Error('无法解码'); if (changeEpoch) context.documentEpoch++;
      return { name: file.name, type: 'image', width: 100, height: 100, src: 'data:image/png;base64,aGVsbG8=' };
    } },
  });
  vm.runInContext(extract('  function roomForDocument(', '  function withComponentParts('), context);
  vm.runInContext(extract('  async function importAssets(', "  $('assetFile').onchange"), context);
  return { context, notices, get reads() { return reads; }, get commits() { return commits; } };
}
const file = (name, size = 5) => ({ name, size, type: 'image/png' });
test('bulk imports commit all prepared assets once and select the complete batch', async () => {
  const f = fixture(); await f.context.importAssets([file('a.png'), file('b.png')]);
  assert.equal(f.reads, 2); assert.equal(f.commits, 1); assert.equal(f.context.project.layers.length, 2);
  assert.equal(f.context.selected.size, 2);
});
test('a second failed decode or final capacity rejection leaves the original canvas untouched', async () => {
  for (const options of [{ fail: 'b.png' }, { limit: 3000 }]) {
    const f = fixture(options), before = JSON.stringify(f.context.project);
    await f.context.importAssets([file('a.png'), file('b.png')]);
    assert.equal(f.reads, 2); assert.equal(f.commits, 0); assert.equal(JSON.stringify(f.context.project), before);
    assert(f.notices.some(text => /未改变/.test(text)));
  }
});
test('oversized batches are rejected before decoding and a document switch cancels the entire batch', async () => {
  const big = fixture(); await big.context.importAssets(Array.from({ length: 6 }, (_, i) => file(i + '.png', 8 * 1024 * 1024)));
  assert.equal(big.reads, 0); assert.equal(big.commits, 0);
  const switched = fixture({ changeEpoch: true }); await switched.context.importAssets([file('a.png'), file('b.png')]);
  assert.equal(switched.reads, 1); assert.equal(switched.commits, 0); assert.equal(switched.context.project.layers.length, 0);
});
