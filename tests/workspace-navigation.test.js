'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

function shellFixture(){
  const nodes=new Map(),listeners=new Map(),nav=[],stored=new Map();
  const element=(tag='div')=>{
    const classes=new Set();
    const e={tagName:tag.toUpperCase(),hidden:false,dataset:{},children:[],style:{},events:{},attributes:{},classList:{toggle(key,value){if(value===undefined)value=!classes.has(key);value?classes.add(key):classes.delete(key);},add(key){classes.add(key);},contains:key=>classes.has(key)},
      append(...items){for(const item of items){item.parent=this;this.children.push(item);if(item.id)nodes.set(item.id,item);}},
      prepend(item){item.parent=this;this.children.unshift(item);},replaceChildren(){for(const item of this.children)nodes.delete(item.id);this.children=[];},
      addEventListener(name,fn){this.events[name]=fn;},setAttribute(name,value){this.attributes[name]=value;},querySelector(){return null;},
    };
    if(tag==='iframe'){
      e.loads=0;e.contentWindow={messages:[],postMessage(value){this.messages.push(value);}};
      let src='';Object.defineProperty(e,'src',{get:()=>src,set:value=>{src=value;e.loads++;}});
    }
    return e;
  };
  for(const id of ['toast','sectionTitle','sectionEyebrow','about','serviceScreen','editors','openBrowser','statusDot','serviceLabel','serviceTitle','version','serviceDetail','retry','dataFolder','quit','railToggle']){const e=element();e.id=id;nodes.set(id,e);}
  const markup=fs.readFileSync(path.join(__dirname,'../desktop/index.html'),'utf8');
  for(const match of markup.matchAll(/data-page="([^"]+)"/g)){const e=element('button');e.dataset.page=match[1];nav.push(e);}
  const rail=element();let stateListener;
  const document={body:element('body'),getElementById:id=>nodes.get(id),createElement:element,createElementNS:(_ns,tag)=>element(tag),
    querySelector:s=>s==='.rail-bottom'?rail:null,
    querySelectorAll:s=>s==='[data-page]'?nav:s==='#editors iframe'?nodes.get('editors').children:[],
  };
  const desktop={onState:fn=>{stateListener=fn;},state:()=>new Promise(()=>{}),openDocs:async()=>{},openPage:async()=>{},dataFolder(){},retry(){},quit(){}};
  const ctx=vm.createContext({document,desktop,localStorage:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)},window:{addEventListener:(name,fn)=>listeners.set(name,fn)},URL,setTimeout:()=>1,clearTimeout(){}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../desktop/shell.js'),'utf8'),ctx);
  const base='http://127.0.0.1:19991/';
  stateListener({status:'ready',base,message:'ready'});
  return{nodes,base,body:document.body,stored,nav,click:key=>nav.find(e=>e.dataset.page===key).events.click(),
    message:(source,data,origin=base.slice(0,-1))=>listeners.get('message')({source,data,origin}),
    update:stateListener};
}

test('desktop page navigation keeps the original editor renderer and undo history alive',()=>{
  const h=shellFixture();h.click('theme');const editor=h.nodes.get('frame-theme'),live=h.nodes.get('frame-live');
  assert.deepEqual(h.nav.map(button=>button.dataset.page),['live','theme','chat','music','about']);
  assert.equal(editor.title,'主题编辑器');
  assert.equal(h.nav.find(button=>button.dataset.page==='chat').attributes['aria-label'],'弹幕编辑器');
  editor.contentWindow.undoMarker=['edit1'];
  h.message(editor.contentWindow,{channel:'control-workspace-page',page:'theme-editor.html'});
  h.message(editor.contentWindow,{channel:'control-workspace-navigate',url:h.base+'live.html'});
  assert.equal(editor.hidden,true);assert.equal(live.hidden,false);
  h.click('theme');assert.equal(h.nodes.get('frame-theme'),editor);assert.equal(editor.loads,1);assert.deepEqual(editor.contentWindow.undoMarker,['edit1']);
  h.update({status:'ready',base:h.base,message:'ready again'});assert.equal(editor.loads,1);
});

test('navigation collapse is an explicit global preference and never changes with the selected workspace',()=>{
  const h=shellFixture();
  h.click('theme');assert.equal(h.body.classList.contains('rail-collapsed'),false);
  h.nodes.get('railToggle').onclick();
  for(const page of ['music','live','chat','theme']){h.click(page);assert.equal(h.body.classList.contains('rail-collapsed'),true);}
  assert.equal(h.stored.get('control-navigation-collapsed'),'true');
  assert.equal(h.nodes.get('railToggle').attributes['aria-label'],'展开导航');
  h.nodes.get('railToggle').onclick();h.click('music');assert.equal(h.body.classList.contains('rail-collapsed'),false);
  assert.equal(h.nodes.get('railToggle').attributes['aria-expanded'],'true');
});

test('desktop navigation rejects unrelated senders and foreign or unsupported URLs',()=>{
  const h=shellFixture();h.click('theme');const editor=h.nodes.get('frame-theme');
  const send=(source,url,origin)=>h.message(source,{channel:'control-workspace-navigate',url},origin);
  send({},h.base+'chat-editor.html');send(editor.contentWindow,'https://example.com/chat-editor.html');
  send(editor.contentWindow,h.base+'monitor.html?dev=1');send(editor.contentWindow,h.base+'simulation.html?dev=1');
  assert.equal(h.nodes.has('frame-monitor'),false);assert.equal(h.nodes.has('frame-simulation'),false);
  send(editor.contentWindow,h.base+'nested/chat-editor.html');send(editor.contentWindow,h.base+'chat-editor.html','http://127.0.0.1:19992');
  assert.equal(h.nodes.has('frame-chat'),false);assert.equal(editor.hidden,false);
  send(editor.contentWindow,h.base+'chat-editor.html?chatId=chat-2');
  const chat=h.nodes.get('frame-chat');assert.equal(chat.src,h.base+'chat-editor.html?chatId=chat-2');
  const before=chat.loads;h.click('theme');h.click('chat');assert.equal(chat.loads,before);
});

function pageFixture(){
  const clicks=new Map(),events=new Map(),sent=[];let saveResult=true;
  const parent={postMessage:m=>sent.push(m)},window={parent,addEventListener:(name,fn)=>events.set(name,fn),open(){},ThemeEditor:{save:async()=>saveResult}};
  const origin='http://127.0.0.1:19991',location={origin,pathname:'/theme-editor.html',href:origin+'/theme-editor.html'};
  const document={documentElement:{dataset:{}},addEventListener:(name,fn)=>clicks.set(name,fn),getElementById:()=>null};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/workspace-page.js'),'utf8'),vm.createContext({window,parent,document,location,URL}));
  return{window,parent,sent,origin,save:value=>{saveResult=value;},ready(source=parent){events.get('message')({source,data:{channel:'control-workspace-host',ready:true}});},
    async click(url,extra={}){let prevented=false;await clicks.get('click')({target:{closest:()=>({href:url,target:''})},button:0,preventDefault(){prevented=true;},stopImmediatePropagation(){},...extra});return prevented;}};
}

test('embedded editor waits for its desktop host and saves before switching workspaces',async()=>{
  const h=pageFixture();assert.equal(h.window.WorkspaceNavigation.navigate('live.html'),false);
  h.ready({});assert.equal(h.window.WorkspaceNavigation.navigate('live.html'),false);h.ready();
  h.save(false);assert(await h.click(h.origin+'/live.html'));assert.equal(h.sent.filter(m=>m.channel==='control-workspace-navigate').length,0);
  h.save(true);assert(await h.click(h.origin+'/live.html'));assert.equal(h.sent.at(-1).url,h.origin+'/live.html');
  assert.equal(await h.click(h.origin+'/live.html',{ctrlKey:true}),false);
  assert.equal(await h.click('https://example.com/live.html'),false);
});
