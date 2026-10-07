'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
// Execute the actual ready branch: the regression was automatic seeding in
// this branch, not the explicit Restore Examples button or message composer.
const source = fs.readFileSync(path.join(__dirname, '../app/live.js'), 'utf8');
const start = source.indexOf("if (event.data.type === 'ready') {");
const end = source.indexOf("} else if (event.data.type === 'receipt')", start);
assert(start >= 0 && end > start);
const readyBranch = source.slice(start, end) + '}';
function ready({ development = false, search = '', live = false } = {}) {
  const sent = [], label = {}, params = new URLSearchParams(search);
  const context = vm.createContext({
    window: { ThemeDevelopment: development }, params,
    liveMode: live, obs: params.has('obs'), isolatedPreview: params.has('libraryPreview'),
    chatReady: false, chatInstance: null, chatProbe: null, pending: [],
    event: { data: { type: 'ready', instance: 'session-1' } }, clearInterval() {}, fps: () => 60,
    post(command, data) { sent.push({ command, data }); }, $: () => label,
  });
  vm.runInContext('(function(){' + readyBranch + '})()', context);
  return { sent, label };
}
test('public live preview starts empty even when a URL requests development examples', () => {
  for (const search of ['', '?dev=1', '?dev=1&demo=1']) {
    const result = ready({ search });
    assert.deepEqual(result.sent.map(v => v.command), ['fps', 'source']);
    assert.equal(result.label.textContent, '等待第一条消息');
  }
});
test('automatic examples require developer mode and never seed editor, OBS or real messages', () => {
  assert(ready({ development: true }).sent.some(v => v.command === 'demo'));
  for (const search of ['?editor=1', '?obs=1', '?published=theme', '?libraryPreview=1'])
    assert.equal(ready({ development: true, search }).sent.some(v => v.command === 'demo'), false);
  const real = ready({ development: true, live: true });
  assert.equal(real.sent.some(v => v.command === 'demo'), false);
  assert.equal(real.sent.find(v => v.command === 'source').data, true);
  assert.equal(real.label.textContent, '等待直播间消息');
});
