'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const FX=require('../app/theme-layer-effects'),M=require('../app/theme-editor-model');
test('effect data is bounded, safe, ordered and stable on repeated normalization',()=>{
  const raw=[{id:'a'.repeat(80),type:'blur',radius:999},{id:'a'.repeat(80),type:'shadow',color:'url(http://bad)',opacity:-30},{type:'color',hue:'script()',contrast:120},{type:'script',src:'javascript:bad'}];
  const normalized=FX.normalize(raw);
  assert.equal(normalized.length,3);assert.equal(normalized[0].radius,24);assert.equal(normalized[1].color,'#000000');assert.equal(normalized[1].opacity,0);assert.equal(normalized[2].hue,0);
  assert.equal(new Set(normalized.map(x=>x.id)).size,3);assert.deepEqual(FX.normalize(normalized),normalized);
  assert.equal(FX.normalize(Array.from({length:10},()=>({type:'blur'}))).length,6);
});
test('effect ordering and bypass are preserved through portable documents',()=>{
  const doc=M.create('classic'),layer=M.layer({id:'fx-test',type:'image',effects:[{id:'blur',type:'blur',radius:3},{id:'color',type:'color',contrast:140,saturation:0}]});
  doc.layers.push(layer);const copy=M.normalize(JSON.parse(JSON.stringify(doc))).layers.find(x=>x.id==='fx-test');
  assert.equal(copy.effects.length,2);const css=FX.filter(copy);assert(css.indexOf('blur(3px)')<css.indexOf('contrast(1.4)'));assert(css.includes('saturate(0)'));
  copy.effects.reverse();const reverse=FX.filter(copy);assert(reverse.indexOf('contrast(1.4)')<reverse.indexOf('blur(3px)'));
  copy.effectsEnabled=false;assert.equal(FX.filter(copy),'brightness(1)');
  copy.effectsEnabled=true;copy.effects[0].enabled=false;assert(!FX.filter(copy).includes('contrast'));
});
test('processing leaves original media and geometry unchanged; unsupported game capture is not faked',()=>{
  const image=M.layer({id:'photo',type:'image',src:'assets/game-placeholder.svg',x:-100,y:20,w:640,h:360,brightness:.8,effects:[{type:'shadow',x:4,y:6,radius:12,opacity:50,color:'#ee4422'}]});
  const before=JSON.stringify(image);assert.match(FX.filter(image),/drop-shadow\(4px 6px 12px rgba\(238,68,34,0.5\)\)/);assert.equal(JSON.stringify(image),before);
  assert.equal(FX.supported('game'),false);assert.equal(FX.filter({...image,type:'game'}),'brightness(0.8)');
});
test('alpha layer styles are portable, bounded and only use sanitized colors',()=>{
  const doc=M.create('classic'),effects=['stroke','outerGlow','innerGlow','colorOverlay'].map((type,i)=>({type,id:'s'+i,color:i?'#123abc':'url(javascript:bad)',radius:999,opacity:999}));
  doc.layers.push(M.layer({id:'styled',type:'text',text:'字',effects}));
  const value=M.normalize(JSON.parse(JSON.stringify(doc))).layers.find(x=>x.id==='styled');
  assert.deepEqual(value.effects.map(x=>x.type),['stroke','outerGlow','innerGlow','colorOverlay']);
  assert.equal(value.effects[0].color,'#e8e6dc');assert.equal(value.effects[0].radius,24);assert.equal(value.effects[1].radius,40);assert.equal(value.effects[2].radius,30);assert.equal(value.effects[3].opacity,100);
  assert(!FX.types.includes('gradientOverlay'));assert.equal(FX.maxEffects,6);
});
function fakeDocument(){
  class Node{constructor(tag){this.tagName=tag;this.attrs={};this.children=[];this.style={};this.isConnected=true;}setAttribute(k,v){this.attrs[k]=v;if(k==='id')this.id=v;}appendChild(n){this.children.push(n);n.parent=this;return n;}replaceChildren(){this.children=[];}remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}}
  return {body:new Node('body'),createElementNS(_ns,tag){return new Node(tag);}};
}
test('alpha definitions resolve in each target document and update stable filter ids',()=>{
  const a=fakeDocument(),b=fakeDocument(),layer=M.layer({id:'style',type:'image',w:200,h:100,effects:[{id:'edge',type:'stroke',color:'#ff0000',radius:4},{id:'tint',type:'colorOverlay',opacity:50,color:'#ff0000'}]});
  const first=FX.filter(layer,a),nodes=a.body.children[0].children[0].children;
  assert.match(first,/url\(#cr-layer-style-\d+\)/);assert.equal(nodes.length,2);assert.equal(nodes[0].children[0].tagName,'feMorphology');
  assert.equal(nodes[0].children[1].attrs.operator,'out');assert.equal(nodes[1].children[0].tagName,'feColorMatrix');assert.match(nodes[1].children[0].attrs.values,/0 0 0 1 0$/);
  assert.equal(FX.filter(layer,a),first);assert.equal(a.body.children[0].children[0].children.length,2);
  layer.effects[0].radius=8;assert.equal(FX.filter(layer,a),first);assert.equal(nodes[0].children[0].attrs.radius,'8');
  assert.notEqual(FX.filter(layer,b),first);assert.equal(b.body.children.length,1);
  layer.effectsEnabled=false;assert.equal(FX.filter(layer,b),'brightness(1)');
});
test('canvas styles resolve before output transforms and reuse one padded surface per target document',()=>{
  function make(){const doc=fakeDocument(),created=[];doc.createElement=()=>{const calls=[],context={clearRect(){},save(){},restore(){},drawImage(...args){calls.push(args);}},canvas={ownerDocument:doc,width:0,height:0,getContext(){return context;},calls};created.push(canvas);return canvas;};return{doc,created};}
  const a=make(),b=make(),source={},layer={id:'shape',type:'shape',w:1920,h:1080,effects:[{id:'edge',type:'stroke',radius:6}]},draws=[];
  const output=doc=>({canvas:{ownerDocument:doc},save(){},restore(){},drawImage(...args){assert.equal(this.filter,'none');draws.push(args);}});
  FX.drawCanvas(output(a.doc),source,layer);FX.drawCanvas(output(b.doc),source,layer);FX.drawCanvas(output(a.doc),source,layer);
  assert.equal(a.created.length,1);assert.equal(b.created.length,1);assert.deepEqual(draws[0].slice(1),[-256,-256,2432,1592]);assert.equal(a.created[0].calls.length,2);
  assert.match(a.created[0].getContext().filter,/url\(#cr-layer-style-/);
});
