'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const C = require('../app/monitor-catalog');
test('recording settings tolerate corrupt saved shapes and do not turn blank numeric input into zero', () => {
  for (const bad of [null, [], 'string', 17]) assert.deepEqual(C.clean('music', bad), C.clean('music'));
  assert.equal(C.clean('normal', { width: '' }).width, C.clean('normal').width);
  assert.equal(C.clean('normal', { width: null }).width, C.clean('normal').width);
  assert.equal(C.clean('normal', { width: true }).width, C.clean('normal').width);
  assert.equal(C.clean('normal', { width: 10 }).width, 100);
  assert.equal(C.clean('normal', { width: '1920' }).width, 1920);
});
test('linked recording outputs accept only their owning panel; legacy output URLs stay independent', () => {
  const first = '12345678-1234-1234-1234-123456789abc', second = '23456789-1234-1234-1234-123456789abc';
  const scope = { controller: first, view: 'first-view', id: 'sc', linked: true };
  const command = { channel: 'control-monitor-command', controller: first, view: 'first-view', id: 'sc', type: 'pause' };
  assert(C.acceptsControl(scope, command)); assert(C.acceptsControl(scope, command, true));
  assert(!C.acceptsControl(scope, { ...command, controller: second }));
  assert(!C.acceptsControl(scope, { ...command, view: 'stale-view' }, true));
  assert(!C.acceptsControl({ ...scope, linked: false }, command));
  assert(!C.acceptsControl({ ...scope, controller: '' }, { ...command, controller: '' }));
  assert(C.acceptsControl({ ...scope, controller: '' }, { ...command, controller: '' }, true));
});
function harness(component = 'music', initial = {}, options = {}) {
  const nodes = new Map(), windowEvents = new Map(), documentEvents = new Map(), broadcasts = [], posted = [], storage = new Map(Object.entries(initial)), clocks = [], raf = [];
  const all = [];
  function element(tag = 'div') {
    const e = { tagName: tag.toUpperCase(), children: [], dataset: {}, style: {}, attributes: {}, value: '', paused: true, currentTime: 1, duration: 30, pauseCount: 0,
      classList: { add() {} },
      append(...children) { for (const child of children) { this.children.push(child); child.parent = this; } },
      add(option) { this.append(option); },
      replaceChildren(...children) { this.children = []; this.append(...children); },
      after(child) { child.parent = this.parent; if (child.id) nodes.set(child.id, child); }, before(child) { if (child.id) nodes.set(child.id, child); },
      replaceWith() {}, remove() {},
      setAttribute(name, value) { this.attributes[name] = String(value); }, removeAttribute(name) { delete this.attributes[name]; },
      addEventListener(name, callback) { this['on' + name] = callback; },
      querySelector(selector) { const name = /^\[name="?([^"\]]+)"?\]$/.exec(selector)?.[1]; return descendants(this).find(node => name && node.name === name) || null; },
      pause() { this.paused = true; this.pauseCount++; }, click() { this.onclick?.(); },
    };
    Object.defineProperty(e, 'childNodes', { get() { return this.children; } });
    all.push(e); return e;
  }
  function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
  for (const id of ['toast','preview','output','independent','specific','placement','timing','specific-section','music-tools','name','description','status','replay','pause','stable','exit','previous','next','snapshot','timeline','time','components','copy','reset','export','import','audio-file','cover-file','audio']) { const e = element(); e.id = id; nodes.set(id, e); }
  nodes.get('preview').contentWindow = { postMessage: value => posted.push(value) };
  const roots = Object.fromEntries(['.workspace','.inspector','.shot-head','.instructions p'].map(name => [name,element()]));
  const document = { body: { dataset: {}, classList: { add() {} } }, title: '', getElementById: id => nodes.get(id), createElement: element,
    querySelector: name => roots[name], querySelectorAll: selector => selector === '[data-component-id]' ? all.filter(e => e.dataset.componentId) : selector === 'input[aria-invalid="true"]' ? all.filter(e => e.tagName === 'INPUT' && e.attributes['aria-invalid'] === 'true') : [],
    addEventListener: (name, callback) => documentEvents.set(name, callback),
  };
  let storageError = false, contextClosed = false, contextSuspends = 0, analysisReads = 0, modules = 0, now = 100;
  const window = { addEventListener: (name, callback) => windowEvents.set(name, callback) };
  const context = vm.createContext({ MonitorCatalog: C, window, document, location: { href: 'http://127.0.0.1:19041/monitor.html?component=' + component, origin: 'http://127.0.0.1:19041', search: '?component=' + component }, history: { replaceState() {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem(key,value) { if (storageError) throw new Error('quota full'); storage.set(key,value); } },
    crypto: require('node:crypto').webcrypto, URL, URLSearchParams, Blob, Float32Array, Number, Object, Math, JSON,
    Option: function(text, value) { const e = element('option'); e.textContent = text; e.value = value; return e; },
    BroadcastChannel: class { postMessage(value) { broadcasts.push(value); } close() {} },
    AudioContext: class { constructor() { this.sampleRate=48000; if(options.worklet)this.audioWorklet={async addModule(){modules++;if(options.worklet==='reject')throw new Error('unavailable');}}; } createAnalyser() { return { connect() {}, getFloatFrequencyData(data) { analysisReads++;data.fill(-90); } }; } createMediaElementSource() { return { connect() {} }; } async resume() {} async suspend() { contextSuspends++; } async close() { contextClosed=true; } },
    AudioWorkletNode: class { constructor() { this.port={messages:[],postMessage(value){this.messages.push(value);},close(){this.closed=true;}};clocks.push(this); } connect() {if(options.worklet==='connect-fail')throw new Error('context closed');} disconnect(){this.disconnected=true;} },
    performance: { now:()=>now+=50 },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: callback => {raf.push(callback);return raf.length;}, cancelAnimationFrame() {}, navigator: { clipboard: { async writeText() {} } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/monitor.js'),'utf8'),context);
  const fields = (area, name) => descendants(nodes.get(area)).find(node => node.name === name);
  const url = () => new URL(nodes.get('preview').src);
  function ready(extra={}) { const u=url(); windowEvents.get('message')({ origin: 'http://127.0.0.1:19041', source: nodes.get('preview').contentWindow, data: { channel:'control-monitor-status', id:u.searchParams.get('component'), controller:u.searchParams.get('controller'), view:u.searchParams.get('view'), time:1, total:10, playing:true, ready:true,...extra } }); }
  return { nodes, fields, ready, storage, broadcasts, posted, windowEvents, documentEvents, all, url, clocks, raf, setStorageError(value) { storageError=value; }, audioState:()=>({contextClosed,contextSuspends,analysisReads,modules}) };
}
test('switching away from music pauses hidden audio and panel shutdown closes its audio resources', async () => {
  const h=harness(); h.ready();
  const source=h.fields('specific','audioMode'); source.value='audio'; source.oninput();
  h.nodes.get('audio').paused=false; await h.nodes.get('audio').onplay();
  const before=h.nodes.get('audio').pauseCount;
  h.all.find(node=>node.dataset.componentId==='normal').onclick();
  assert(h.nodes.get('audio').pauseCount>before); assert.equal(h.nodes.get('audio').paused,true);
  assert(h.audioState().contextSuspends>0);
  h.windowEvents.get('pagehide')(); await Promise.resolve(); assert(h.audioState().contextClosed);
});
test('numeric controls preserve the last valid preview while typing, then visibly clamp on commit', () => {
  const h=harness('normal'); h.ready(); const width=h.fields('placement','width');
  const original=JSON.parse(h.url().searchParams.get('config')).width;
  width.value=''; width.oninput(); assert.equal(JSON.parse(h.url().searchParams.get('config')).width,original);
  width.onchange(); assert.equal(Number(width.value),original);
  width.value='5'; width.oninput(); assert.equal(JSON.parse(h.url().searchParams.get('config')).width,original);
  width.onchange(); assert.equal(Number(width.value),100); assert.equal(JSON.parse(new URL(h.nodes.get('output').href).searchParams.get('config')).width,100);
  assert.equal(h.posted.at(-1).config.width,100);
  width.value='20';width.oninput();h.nodes.get('stable').onclick();
  assert.equal(Number(width.value),100);assert.equal(width.attributes['aria-invalid'],undefined);
  assert.equal(h.posted.at(-1).type,'stable');
});
test('focused buttons keep native space activation and failed import cannot partially overwrite recording settings', async () => {
  const h=harness('normal');h.ready();let prevented=false;const sent=h.posted.length;
  h.documentEvents.get('keydown')({key:' ',target:{closest:()=>({})},preventDefault(){prevented=true;}});
  assert.equal(prevented,false);assert.equal(h.posted.length,sent);
  const before=JSON.parse(h.url().searchParams.get('config'));
  h.setStorageError(true);
  await h.nodes.get('import').onchange({target:{files:[{size:120,async text(){return JSON.stringify({format:'control-component-monitor',version:1,components:{normal:{width:2300},music:{title:'变更'}}});}}],value:'file'}});
  assert.deepEqual(JSON.parse(h.url().searchParams.get('config')),before);
  assert.match(h.nodes.get('toast').textContent,/原设置已保留/);
});
test('background audio uses one worklet clock, pauses cleanly, and falls back once if loading is rejected', async () => {
  for(const mode of ['supported','reject','connect-fail']) {
    const h=harness('music',{}, {worklet:mode});h.ready();
    const source=h.fields('specific','audioMode');source.value='audio';source.oninput();
    h.nodes.get('audio').paused=false;await h.nodes.get('audio').onplay();await h.nodes.get('audio').onplay();
    assert.equal(h.audioState().modules,1);
    h.raf[0](100);
    if(mode==='supported') {
      assert.equal(h.clocks.length,1);assert.equal(h.audioState().analysisReads,0);
      h.clocks[0].port.onmessage({data:0});assert.equal(h.audioState().analysisReads,1);
      h.nodes.get('audio').paused=true;h.nodes.get('audio').onpause();
      assert.equal(h.clocks[0].port.messages.at(-1).enabled,false);
      h.clocks[0].port.onmessage({data:0});assert.equal(h.audioState().analysisReads,1);
      h.nodes.get('audio').paused=false;await h.nodes.get('audio').onplay();assert.equal(h.clocks.length,1);
      assert.equal(h.clocks[0].port.messages.at(-1).enabled,true);
      h.windowEvents.get('pagehide')();assert(h.clocks[0].port.closed);assert(h.clocks[0].disconnected);
    } else { assert.equal(h.clocks.length,mode==='connect-fail'?1:0);if(mode==='connect-fail'){assert(h.clocks[0].port.closed);assert(h.clocks[0].disconnected);}assert.equal(h.audioState().analysisReads,1);h.windowEvents.get('pagehide')(); }
    assert(h.audioState().contextClosed);
  }
});
test('completed one-shot recordings offer replay rather than resuming an already finished timeline',()=>{
  const h=harness('normal'),total=C.total(C.clean('normal'));
  h.ready({time:total,total,playing:false});
  assert.equal(h.nodes.get('status').textContent,'播放完毕');assert.equal(h.nodes.get('pause').textContent,'再播放');
  h.nodes.get('pause').onclick();assert.equal(h.posted.at(-1).type,'replay');
});
test('the audio clock sends only bounded tiny ticks and produces silence', () => {
  let Processor;
  const posted=[];
  const context=vm.createContext({AudioWorkletProcessor:class{constructor(){this.port={postMessage:value=>posted.push(value)};}},sampleRate:48000,registerProcessor(name,klass){assert.equal(name,'control-monitor-clock');Processor=klass;}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/monitor-audio-clock-worklet.js'),'utf8'),context);
  const clock=new Processor(),input=[new Float32Array(128).fill(.2)],output=[new Float32Array(128).fill(1)];
  for(let i=0;i<375;i++)clock.process([input],[output]);assert.equal(posted.length,0);assert(output[0].every(value=>value===0));
  clock.port.onmessage({data:{enabled:true,fps:30}});for(let i=0;i<375;i++)clock.process([input],[output]);assert.equal(posted.length,30);
  clock.port.onmessage({data:{enabled:false}});for(let i=0;i<375;i++)clock.process([input],[output]);assert.equal(posted.length,30);
  clock.port.onmessage({data:{enabled:true,fps:1000}});for(let i=0;i<375;i++)clock.process([input],[output]);assert.equal(posted.length,90);assert(posted.every(value=>value===0));
});
