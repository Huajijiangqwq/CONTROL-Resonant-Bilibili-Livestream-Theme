'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const M=require('../app/theme-editor-model'),C=require('../app/theme-layer-clipboard');
const Custom=require('../app/live-custom-config');
const Geometry=require('../app/theme-editor-geometry');
const FakeObs=require('./fixtures/fake-obs');
const {createObsBridge}=require('../app/obs-bridge'),{createThemePublish}=require('../app/theme-publish-server');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('legacy games retain their layout; presets keep the actual resolution ratio through normalize and export',()=>{
 const legacy=M.layer({type:'game',x:18,y:72,w:1408,h:200});
 assert.equal(legacy.w,1408);assert.equal(legacy.h,792);assert.equal(legacy.aspectLocked,true);
 for(const p of M.gameResolutions){
  const game=M.gameResolution(legacy,p.width,p.height);
  const doc=M.normalize({layers:[game]});
  assert.deepEqual(M.normalize(JSON.parse(JSON.stringify(doc))),doc);
  const roundtrip=doc.layers[0];near(roundtrip.w/roundtrip.h,p.width/p.height);
  assert.equal(roundtrip.gameWidth,p.width);assert.equal(roundtrip.gameHeight,p.height);
  assert.equal(roundtrip.x,18);assert.equal(roundtrip.y,72);
  assert(roundtrip.w<=1920&&roundtrip.h<=1080);
  assert(roundtrip.x+roundtrip.w<=1920+1e-8&&roundtrip.y+roundtrip.h<=1080+1e-8);
  const custom=Custom.normalize(M.custom(doc));
  assert(Math.abs(custom.elements.game.w/custom.elements.game.h-p.width/p.height)<.002);
 }
 assert.equal(M.gameRatioLabel({gameWidth:3440,gameHeight:1440}),'43:18');
 assert.equal(M.gameRatioLabel({gameWidth:2560,gameHeight:1080}),'64:27');
 assert.equal(M.gameRatioLabel({gameWidth:1920,gameHeight:1200}),'16:10');
 assert.equal(M.gameRatioLabel({gameWidth:2520,gameHeight:1080}),'21:9');
 const outside=M.gameResolution({...legacy,x:-400,y:900},1080,1920);
 assert.equal(outside.x,-400);assert.equal(outside.y,900);
});

test('custom games preserve aspect when editing either dimension; free frames and copies remain free',()=>{
 const game=M.gameResolution(M.layer({id:'wide',type:'game',w:1408}),3000,1000);
 for(const axis of ['w','h'])for(const value of [2,400,1900,100000]){
  const resized=M.layer({...game,...M.resizeAspect(game,axis,value)});
  near(resized.w/resized.h,3);assert(resized.w<=1920&&resized.h<=1080);
 }
 for(const [w,h] of [[64,16384],[16384,64]]){const edge=M.gameResolution(game,w,h);near(edge.w/edge.h,w/h);assert(edge.w>=2&&edge.h>=2);}
 for(const [w,h] of [[0,1080],[NaN,1080],[400.5,300],[20000,1080]])assert.throws(()=>M.gameResolution(game,w,h),/64/);
 const free=M.layer({...game,aspectLocked:false,w:901,h:600});
 assert.deepEqual([free.w,free.h],[901,600]);assert.equal(free.aspectLocked,false);
 const doc=M.normalize({layers:[free]});
 const pasted=C.paste(M.normalize(),C.encode(doc,['wide']),{id:()=> 'new-game'}).items[0];
 assert.deepEqual([pasted.w,pasted.h,pasted.gameWidth,pasted.gameHeight,pasted.aspectLocked],[901,600,3000,1000,false]);
 const custom=Custom.normalize(M.custom(doc));assert.deepEqual([custom.elements.game.w,custom.elements.game.h],[901,600]);
 near(M.layer({...free,aspectLocked:true}).w/M.layer({...free,aspectLocked:true}).h,3);
});

test('transparent aperture follows new game geometry without reverting to 16:9',()=>{
 const game=M.gameResolution(M.layer({type:'game',x:100,y:120,w:1000}),1280,1024);
 const polygon=Geometry.aperturePolygon({x:0,y:0,w:1920,h:1080,rotation:0},game);
 assert(polygon.includes(`${(game.y+game.h)/1080*100}%`));
 near(game.h,800);
});

test('install, applied updates and live binding keep non-16:9 OBS bounds and fixed browser URL',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'control-game-ratio-'));
 const fake=new FakeObs(),publication=createThemePublish({dataRoot:root,model:()=>M});
 const bridge=createObsBridge({root,connection:fake,model:()=>M,publication});
 t.after(async()=>{await bridge.managed.settled();bridge.close();publication.close();fs.rmSync(root,{recursive:true,force:true});});
 const doc=M.create('classic'),game=doc.layers.find(l=>l.type==='game');
 Object.assign(game,M.gameResolution(game,3440,1440));
 publication.publish('theme',{document:doc,revision:0});
 const installed=await bridge.install({published:'theme',source:'游戏源'},'http://127.0.0.1:19031');
 const item=()=>fake.items[installed.sceneName].find(i=>i.sourceName==='游戏源');
 const url=fake.settings[installed.inputName].url;
 near(item().sceneItemTransform.boundsWidth/item().sceneItemTransform.boundsHeight,3440/1440);
 assert.equal(item().sceneItemTransform.boundsType,'OBS_BOUNDS_SCALE_INNER');
 Object.assign(game,M.gameResolution(game,1280,800));
 publication.publish('theme',{document:doc,revision:1});await bridge.managed.settled();
 near(item().sceneItemTransform.boundsWidth/item().sceneItemTransform.boundsHeight,16/10);
 assert.equal(fake.settings[installed.inputName].url,url);
 const live=await bridge.install({document:doc,source:'游戏源'},'http://127.0.0.1:19031');
 const state=await bridge.live.bind({...live,source:'游戏源',document:doc,writer:'ratio-test'},'http://127.0.0.1:19031');
 const binding=bridge.live.get(state.id);await binding.frame;
 Object.assign(game,M.gameResolution(game,5120,1440));
 await bridge.live.update({id:state.id,writer:'ratio-test',sequence:1,document:doc,duration:0});await binding.frame;
 const captured=fake.items[live.sceneName].find(i=>i.sceneItemId===binding.gameItems[game.id]);
 near(captured.sceneItemTransform.boundsWidth/captured.sceneItemTransform.boundsHeight,32/9);
 assert.equal(captured.sceneItemTransform.boundsType,'OBS_BOUNDS_SCALE_INNER');
 assert(!fake.calls.some(call=>/^(SetCurrentProgramScene|StartRecord|StartStream)$/.test(call.type)));
});
