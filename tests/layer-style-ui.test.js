'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createDocument}=require('./fixtures/dom-tree'),F=require('../app/theme-layer-effects');
function fixture(types=['color','shadow']){
  const dom=createDocument('<html><body><aside id="properties"></aside></body></html>'),document=dom.document;
  let layer={id:'layer-one',type:'text',effects:types.map((type,i)=>F.create(type,'original-'+i)),effectsEnabled:true},calls=[];
  const window={ThemeLayerEffects:F};
  const context=vm.createContext({window,document,crypto:require('node:crypto').webcrypto,Option:function(text,value){const node=document.createElement('option');node.textContent=text;node.value=value;return node;}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/theme-layer-effects-ui.js'),'utf8'),context);
  const root=document.getElementById('properties');
  const mount=()=>{root.replaceChildren();window.ThemeLayerEffectsUI.mount(root,{get:()=>layer,begin(){calls.push('begin');},change(fn){fn(layer);layer={...layer,effects:F.normalize(layer.effects)};calls.push('change');},end(){calls.push('end');}});};mount();
  return {document,root,mount,calls,get layer(){return layer;},set layer(value){layer=value;},field(label){const field=root.querySelectorAll('input,select,button').find(node=>node.getAttribute('aria-label')===label);assert(field,'control '+label+' exists');return field;},close:()=>dom.dispose()};
}
function input(field,value,event='input'){field.value=value;field.dispatchEvent({type:event,bubbles:true});}
test('layer styles expose only real renderable types and add a separate alpha-aware style without changing legacy IDs or order',t=>{
  const f=fixture();t.after(f.close);
  assert.equal(f.root.querySelector('h3').textContent,'图层样式');
  assert.deepEqual(f.root.querySelectorAll('option').map(node=>node.value).sort(),[...F.types].sort());
  assert(!f.root.textContent.includes('渐变叠加'));
  assert.equal(f.root.querySelectorAll('optgroup').length,2);
  const choice=f.field('选择图层样式');choice.value='innerGlow';choice.dispatchEvent({type:'change'});
  f.root.querySelectorAll('button').find(node=>node.textContent==='添加样式').click();
  assert.deepEqual(Array.from(f.layer.effects.slice(0,2),effect=>[effect.id,effect.type]),[['original-0','color'],['original-1','shadow']]);
  assert.equal(f.layer.effects[2].type,'innerGlow');assert.equal(f.layer.effects[2].opacity,60);
  f.mount();const enabled=f.field('启用图层样式'),before=JSON.stringify(f.layer.effects);
  enabled.checked=false;enabled.dispatchEvent({type:'change'});assert.equal(f.layer.effectsEnabled,false);assert.equal(JSON.stringify(f.layer.effects),before);
  f.mount();assert.match(f.root.textContent,/参数仍然保留/);
});
test('continuous size adjustments form one undo transaction and invalid typed values do not corrupt the model',t=>{
  const f=fixture(['stroke']);t.after(f.close);
  const slider=f.field('描边 描边宽度'),number=f.field('描边 描边宽度 数值');
  input(slider,6);input(slider,14);input(slider,20);
  assert.equal(f.layer.effects[0].radius,20);assert.equal(f.calls.filter(value=>value==='begin').length,1);
  slider.dispatchEvent({type:'pointerup'});slider.dispatchEvent({type:'change'});assert.equal(f.calls.filter(value=>value==='end').length,1);
  input(number,100);assert.equal(f.layer.effects[0].radius,20);assert.equal(number.getAttribute('aria-invalid'),'true');
  number.dispatchEvent({type:'blur'});assert.equal(f.layer.effects[0].radius,24);assert.equal(number.value,'24');assert.equal(number.getAttribute('aria-invalid'),null);
  input(number,'');number.dispatchEvent({type:'blur'});assert.equal(number.value,'24');assert.equal(f.layer.effects[0].radius,24);
});
test('color, opacity, ordering and reset preserve independent styles and their saved identity',t=>{
  const f=fixture(['outerGlow','colorOverlay']);t.after(f.close);
  const hex=f.field('外发光 颜色 十六进制');input(hex,'abc');assert.equal(f.layer.effects[0].color,'#aabbcc');
  input(hex,'nope');assert.equal(f.layer.effects[0].color,'#aabbcc');assert.equal(hex.getAttribute('aria-invalid'),'true');
  hex.dispatchEvent({type:'blur'});assert.equal(hex.value,'#aabbcc');assert.equal(hex.getAttribute('aria-invalid'),null);
  const opacity=f.field('外发光 不透明度 数值');input(opacity,0);opacity.dispatchEvent({type:'change'});assert.equal(f.layer.effects[0].opacity,0);
  f.field('下移外发光').click();assert.deepEqual(Array.from(f.layer.effects,effect=>effect.type),['colorOverlay','outerGlow']);
  assert.equal(f.layer.effects[1].id,'original-0');f.mount();
  f.root.querySelectorAll('.effect-card').find(card=>card.dataset.style==='outerGlow').querySelector('.effect-reset').click();
  assert.equal(f.layer.effects[1].id,'original-0');assert.equal(f.layer.effects[1].color,'#cf493b');assert.equal(f.layer.effects[1].opacity,65);
});
test('locking or switching the selected layer rejects stale control events and maximum capacity is explicit',t=>{
  const f=fixture(['stroke']);t.after(f.close);const slider=f.field('描边 描边宽度');
  f.layer={...f.layer,id:'another-layer'};input(slider,18);assert.equal(f.layer.effects[0].radius,2);assert.equal(f.calls.length,0);
  f.layer={...f.layer,id:'layer-one',locked:true};input(slider,18);assert.equal(f.layer.effects[0].radius,2);assert.equal(f.calls.length,0);
  f.mount();assert(f.field('启用图层样式').disabled);assert(f.field('选择图层样式').disabled);
  f.layer={...f.layer,locked:false,effects:Array.from({length:F.maxEffects},(_,i)=>F.create('stroke','copy-'+i))};f.mount();
  assert(f.field('选择图层样式').disabled);assert(f.root.querySelectorAll('button').find(node=>node.textContent==='添加样式').disabled);
  assert.equal(f.root.querySelector('.effect-count').textContent,'6 / 6');
});
