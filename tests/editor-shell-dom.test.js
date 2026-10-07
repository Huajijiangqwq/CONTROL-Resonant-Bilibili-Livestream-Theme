'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createDocument}=require('./fixtures/dom-tree'),M=require('../app/theme-editor-model');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({clipboardFailure=false}={}){
  const dom=createDocument(fs.readFileSync(path.join(__dirname,'../app/theme-editor.html'),'utf8')),document=dom.document;
  const events=new Map(),streams=new Map(),requests=[],dispatches=[],intervals=[],timeouts=[];
  const draft=M.create('classic');document.getElementById('publishOutput').value='scene';
  const window={ThemeEditor:{get project(){return structuredClone(draft);},selection:[],async save(){return true;}},ControlProjectLibrary:{mount(){}},ThemeDocumentCompare:require('../app/theme-document-compare'),
    addEventListener(type,handler){if(!events.has(type))events.set(type,[]);events.get(type).push(handler);},
    dispatchEvent(event){dispatches.push(event);for(const handler of events.get(event.type)||[])handler(event);},
    open(){return {closed:false,location:{replace(){}},close(){this.closed=true;}};},
    StudioEvents:{open(endpoint){const stream={events:{},addEventListener(type,handler){this.events[type]=handler;},close(){}};streams.set(endpoint,stream);return stream;}},
  };
  class Event{constructor(type,options={}){this.type=type;Object.assign(this,options);}preventDefault(){this.defaultPrevented=true;}stopPropagation(){this.stopped=true;}stopImmediatePropagation(){this.stopped=true;this.immediate=true;}}
  const context=vm.createContext({window,document,MutationObserver:dom.MutationObserver,Node:{TEXT_NODE:3},Event,CustomEvent:Event,
    Option:function(name,value){const el=document.createElement('option');el.textContent=name;el.value=value;return el;},
    location:{pathname:'/theme-editor.html',search:'',href:'http://localhost:19041/theme-editor.html',origin:'http://localhost:19041',assign(){}},
    URL,URLSearchParams,crypto:require('node:crypto').webcrypto,JSON,AbortSignal,structuredClone,
    localStorage:{setItem(){}},navigator:{clipboard:{async writeText(){if(clipboardFailure)throw new Error('blocked clipboard');}}},
    setInterval(fn){intervals.push(fn);return intervals.length;},clearInterval(){},setTimeout(fn){timeouts.push(fn);return timeouts.length;},clearTimeout(){},
    fetch(url,options){return new Promise(resolve=>requests.push({url,body:options?.body&&JSON.parse(options.body),resolve(value){resolve({ok:true,json:async()=>value});}}));},
  });
  function run(name){vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/'+name),'utf8'),context);}
  function publish(){run('theme-publish-ui.js');intervals.shift()();}
  const packet=revision=>({channel:'theme',revision,writer:'old-writer',epoch:'instance-one',document:structuredClone(draft),output:'scene',chatId:'',name:'测试主题',appliedAt:revision});
  const receive=revision=>streams.get('/api/theme-publish/theme/events').events.published({data:JSON.stringify(packet(revision))});
  return {dom,document,window,events,streams,requests,run,publish,packet,receive,close(){for(const fn of events.get('pagehide')||[])fn();dom.dispose();}};
}
test('the studio shell reparents existing controls without losing identities or their bound actions',async t=>{
  const f=fixture();t.after(()=>f.close());
  const original=new Map(f.document.querySelectorAll('[id]').map(node=>[node.id,node])),calls=[];
  for(const id of ['saveProject','projectMenu','undo','redo','settingsOpen','editChat','helpOpen'])original.get(id).onclick=()=>calls.push(id);
  f.run('editor-studio.js');await tick();
  for(const [id,node]of original){assert.equal(f.document.getElementById(id),node,'preserved '+id);assert.equal(f.document.querySelectorAll('[id="'+id+'"]').length,1,'unique '+id);}
  f.document.getElementById('studioSave').click();f.document.getElementById('studioHelp').click();f.document.getElementById('undo').click();
  assert.deepEqual(calls,['saveProject','helpOpen','undo']);
  assert.equal(f.document.getElementById('layers').closest('#studioLayers').id,'studioLayers');
  const obs=f.document.createElement('button');obs.id='obsConnect';f.document.querySelector('.appbar-end').append(obs);await tick();
  assert(obs.closest('.studio-more-menu'));
});
test('publication organization keeps controls wired and clipboard failure exposes the actual fixed address',async t=>{
  const f=fixture({clipboardFailure:true});t.after(()=>f.close());f.run('editor-studio.js');f.publish();f.receive(1);
  const ids=['publicationState','publicationAuto','publicationMessages','applyLiveTheme','publicationObsState','publicationObsTargets','publicationObsConnect','publicationObsRetry','publishOutput','copyUrl','openLive','obsUrl','outputSize','captureInfo','outputHint'];
  const original=new Map(ids.map(id=>[id,f.document.getElementById(id)])),copyHandler=original.get('copyUrl').onclick;
  f.run('editor-chrome.js');await tick();
  for(const [id,node]of original){assert.equal(f.document.getElementById(id),node,'preserved '+id);assert.equal(f.document.querySelectorAll('[id="'+id+'"]').length,1,'unique '+id);}
  assert.equal(f.document.getElementById('copyUrl').onclick,copyHandler);
  const dialog=f.document.getElementById('publishDialog');dialog.showModal();
  const address=f.document.getElementById('obsUrl'),details=address.closest('details');assert(details);assert.equal(details.open,false);
  await f.document.getElementById('copyUrl').onclick();
  assert.equal(details.open,true);assert.equal(f.document.activeElement,address);assert(address.selected);assert.match(address.value,/published=theme/);
  const auto=f.document.getElementById('publicationAuto');auto.checked=true;
  const applying=auto.onchange({target:auto});await tick();
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].body.document.format,'control-theme');
  f.requests[0].resolve({...f.packet(2),writer:f.requests[0].body.writer});await applying;await tick();
  assert.match(auto.closest('details').querySelector('summary').textContent,/已开启/);
});
test('a pending managed OBS target stays visible outside collapsed publication details after reorganization',async t=>{
  const f=fixture();t.after(()=>f.close());f.run('editor-studio.js');f.publish();f.receive(1);f.run('editor-chrome.js');await tick();
  f.streams.get('/api/obs/published/events').events['obs-published']({data:JSON.stringify({connected:false,targets:[{id:'owned',channel:'theme',sceneName:'主题场景',phase:'pending',message:'等待连接'}]})});await tick();
  const status=f.document.getElementById('publicationState'),badge=f.document.getElementById('publicationBadge');
  assert.match(status.textContent,/OBS 采集待同步/);assert.equal(status.closest('details'),null);
  assert.match(badge.textContent,/OBS 采集待同步/);assert.equal(badge.closest('details'),null);assert.equal(badge.dataset.state,'pending');
  assert.equal(f.document.getElementById('copyUrl').disabled,false);
});
test('a blocked editor-scope navigation keeps the scope selector truthful',async t=>{
  const f=fixture();t.after(()=>f.close());let attempts=0;
  f.document.getElementById('editChat').onclick=async()=>{attempts++;return false;};
  f.run('editor-studio.js');const select=f.document.getElementById('studioViewMode');
  assert.equal(select.value,'theme');select.value='chat';select.dispatchEvent({type:'change',bubbles:true});await tick();
  assert.equal(attempts,1);assert.equal(select.value,'theme');assert.equal(f.document.body.dataset.leftPane,'layers');
});
test('closing a menu-opened dialog returns focus to a visible menu summary without stealing other dialog focus',async t=>{
  const f=fixture();t.after(()=>f.close());
  const file=f.document.getElementById('projectMenu'),dialog=f.document.getElementById('fileDialog');
  file.onclick=()=>dialog.showModal();f.run('editor-studio.js');
  const menu=file.closest('.studio-menu'),summary=menu.querySelector('summary');menu.open=true;await tick();file.focus();
  assert.equal(f.document.activeElement,file);file.click();await tick();assert(dialog.open);assert.equal(menu.open,false);
  dialog.close();await tick();assert.equal(f.document.activeElement,summary);
  const visible=f.document.getElementById('publish'),other=f.document.getElementById('publishDialog');visible.onclick=()=>other.showModal();visible.focus();visible.click();other.close();await tick();
  assert.equal(f.document.activeElement,visible);
});
test('tab labels point at real panels and rebuilding a settings category keeps keyboard focus on its new active button',async t=>{
  const f=fixture();t.after(()=>f.close());f.run('editor-studio.js');
  for(const name of ['layers','components']){
    const tab=f.document.getElementById('studioTab-'+name),panel=f.document.getElementById(tab.getAttribute('aria-controls'));
    assert.equal(panel.getAttribute('role'),'tabpanel');assert.equal(panel.getAttribute('aria-labelledby'),tab.id);
  }
  const layers=f.document.getElementById('studioTab-layers');layers.focus();layers.dispatchEvent({type:'keydown',key:'ArrowRight',bubbles:true});
  const components=f.document.getElementById('studioTab-components');assert.equal(f.document.activeElement,components);assert.equal(components.getAttribute('aria-selected'),'true');assert.equal(f.document.getElementById('studioComponents').hidden,false);
  f.run('editor-chrome.js');const root=f.document.getElementById('nativeSettings');
  root.innerHTML='<details class="native-section"><summary>弹幕接入</summary><input id="fixture-room"></details><details class="native-section"><summary>音频共振</summary><input id="fixture-audio"></details>';
  await tick();f.document.getElementById('settingsDialog').showModal();
  const oldButton=f.document.getElementById('settingsNav').querySelectorAll('button').find(button=>button.textContent==='音频');oldButton.focus();oldButton.click();await tick();
  const active=f.document.getElementById('settingsNav').querySelector('[aria-pressed="true"]');
  assert.notEqual(active,oldButton);assert.equal(active.textContent,'音频');assert.equal(f.document.activeElement,active);
  assert.equal(f.document.getElementById('fixture-audio').closest('details').hidden,false);assert.equal(f.document.getElementById('fixture-room').closest('details').hidden,true);
});
