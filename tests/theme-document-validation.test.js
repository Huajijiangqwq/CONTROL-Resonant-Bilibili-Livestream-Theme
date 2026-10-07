'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../app/theme-editor-model'), V = require('../app/theme-document-validation');
test('legacy embedded raster and video formats survive shared validation unchanged', () => {
  for (const type of ['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm']) {
    const src = 'data:' + type + ';base64,AAAA';
    const raw = { format:'control-theme', version:1, layers:[{id:'media',type:type.startsWith('video')?'video':'image',src}] };
    assert.equal(V.issue(raw,M),''); assert.equal(V.validate(raw,M),raw); assert.equal(M.normalize(raw).layers[0].src,src);
  }
  assert.equal(V.issue({format:'control-theme',version:1,layers:[{type:'image',src:'   '}]},M),'');
});
test('clipboard fragments and variant parts share the same media rejection boundary', () => {
  const raw = { layers:[{type:'sc',name:'留言',variants:{'100':{parts:[{kind:'image',name:'图案',src:'data:text/html;base64,AAAA'}]}}}] };
  assert.match(V.mediaIssue(raw,M),/图案.*素材/);
  raw.layers[0].variants['100'].parts[0].src='assets/gift-evidence.png';
  assert.equal(V.mediaIssue(raw,M),'');
  assert.throws(()=>V.validate(raw,M),/CONTROL/);
});
test('oversized media and unsupported inline SVG fail before any caller can drop their source', () => {
  const raw={format:'control-theme',version:1,layers:[{id:'media',type:'image',name:'大图',src:'data:image/png;base64,'+'A'.repeat(12000000)}]};
  assert.match(V.issue(raw,M),/大图.*素材/);
  raw.layers[0].src='data:image/svg+xml;base64,AAAA'; assert.match(V.issue(raw,M),/素材/);
  assert.throws(()=>V.validate(raw,M),/素材/);
});
test('bounded JSON byte estimates match UTF-8 serialization for escaped text, Unicode and JSON omission rules', () => {
  const values=[null,true,false,0,-0,1e25,NaN,Infinity,undefined,
    '引号"与反斜杠\\\n\t\u0000\ud800😀',
    {中文:'太古屋',empty:'',omitted:undefined,fn(){},symbol:Symbol('x'),numbers:[NaN,Infinity,-0]},
    [undefined,,()=>{},Symbol('x'),'测试'],
    {long:('😀\u0000"a\\\ud800').repeat(4000)},
    M.create('classic'),
  ];
  for(const value of values){const actual=JSON.stringify(value),expected=actual===undefined?0:Buffer.byteLength(actual);const measured=V.estimateBytes(value,M,Infinity);assert.equal(measured.error,'');assert.equal(measured.complete,true);assert.equal(measured.bytes,expected);}
});
test('large validated media is counted without stringifying it and counting stops before later properties after the limit',t=>{
  const media='data:image/png;base64,'+'A'.repeat(5*1024*1024);M.source(media);
  const stringify=JSON.stringify;let largeStrings=0;
  const mocked=t.mock.method(JSON,'stringify',function(value,...args){if(typeof value==='string'&&value.length>16384)largeStrings++;return stringify.call(this,value,...args);});
  const measured=V.estimateBytes({src:media},M);assert.equal(measured.bytes,media.length+10);assert.equal(largeStrings,0);
  let touched=false;const value={src:media};Object.defineProperty(value,'later',{enumerable:true,get(){touched=true;throw Error('must stop before reading');}});
  const bounded=V.estimateBytes(value,M,1000);assert.equal(bounded.tooLarge,true);assert.equal(bounded.complete,false);assert.equal(touched,false);assert.equal(V.jsonBytes(value,M,1000),1001);
  mocked.mock.restore();
});
test('capacity includes repeated media references; over-limit existing drafts still have a lossless compact rescue export',()=>{
  const src='data:image/png;base64,'+'A'.repeat(10*1024*1024);
  const raw={format:'control-theme',version:1,name:'旧超限项目',layers:Array.from({length:4},(_,i)=>({id:'image-'+i,type:'image',src})),settings:{sessdata:'private',hostInput:'公开名称'}};
  assert.match(V.capacityIssue(raw,M),/40 MB/);assert.throws(()=>V.validate(raw,M),/40 MB/);
  assert.doesNotThrow(()=>V.validate(raw,M,{allowOversize:true}));
  const exported=V.serializeForExport(raw,M);assert.equal(exported.compact,true);assert.equal(exported.oversized,true);assert.match(exported.warning,/救援.*精简/);
  assert.equal(exported.bytes,Buffer.byteLength(exported.text));
  const reopened=JSON.parse(exported.text);assert.equal(reopened.layers.length,4);assert.equal(reopened.layers[3].src,src);assert.equal(reopened.settings.sessdata,undefined);assert.equal(reopened.settings.hostInput,'公开名称');
});
test('ordinary exports remain importable and custom JSON behavior is rejected rather than miscounted',()=>{
  const original=M.create('classic'),exported=V.serializeForExport(original,M);assert.equal(exported.oversized,false);assert(exported.bytes<=V.maxBytes);assert.equal(V.issue(JSON.parse(exported.text),M),'');
  const cycle={};cycle.self=cycle;assert.match(V.estimateBytes(cycle,M).error,/循环/);
  assert.throws(()=>V.jsonBytes({hidden:{toJSON(){return 'different';}}},M),/JSON/);
  assert(V.maxBytes<V.maxRequestBytes);
});
