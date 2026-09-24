'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {choosePort,pageUrl}=require('../desktop/core');
const {sanitizeTrack}=require('../app/windows-media');
const {createPreviewServer}=require('../app/preview-server');
const {createService}=require('../app/now-playing-server');
test('first run finds a free port group; saved OBS addresses never silently move',async()=>{
  assert.equal(await choosePort(undefined,async port=>port!==8794),8801);
  assert.equal(await choosePort(8801,async()=>true),8801);
  await assert.rejects(choosePort(8801,async port=>port!==8803),/OBS/);
  await assert.rejects(choosePort(65533,async()=>true),/端口/);
  assert.equal(pageUrl('http://127.0.0.1:8801/','music'),'http://127.0.0.1:8801/now-playing.html');
  assert.throws(()=>pageUrl('http://127.0.0.1:8801/','../../private'));
  assert.throws(()=>pageUrl('https://attacker.example/','live'));
});
test('SMTC metadata preserves cover only for same track and bounds untrusted values',()=>{
  const cover='data:image/png;base64,AAAA';
  const first=sanitizeTrack({id:'one',title:'曲目',cover,hasSong:true,connected:true});
  assert.equal(sanitizeTrack({id:'one',title:'曲目'},first).cover,cover);
  assert.equal(sanitizeTrack({id:'two',title:'下一首'},first).cover,'');
  const unsafe=sanitizeTrack({cover:'file:///secrets',duration:-9,position:Infinity,title:'x'.repeat(9000)});
  assert.equal(unsafe.cover,'');assert.equal(unsafe.duration,0);assert(unsafe.position<=864000);assert.equal(unsafe.title.length,2048);
});
test('desktop published snapshots live in user data; private settings stay inaccessible',async()=>{
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'control-desktop-'));
  const app=createPreviewServer({port:0,dataRoot:data});
  try {
    const address=await app.listen(),base=`http://127.0.0.1:${address.port}`;
    // Port zero is only for tests; Origin validation must use the bound port.
    const response=await fetch(base+'/api/themes',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(require('../app/theme-editor-model').create('classic'))});
    assert.equal(response.status,200);
    const {id}=await response.json();assert(fs.existsSync(path.join(data,'theme-projects',id+'.json')));
    assert.equal((await fetch(base+'/theme-projects/'+id+'.json')).status,200);
    fs.writeFileSync(path.join(data,'now-playing-settings.json'),'SECRET');
    assert.equal((await fetch(base+'/now-playing-settings.json')).status,404);
    assert.equal((await fetch(base+'/theme-projects/../now-playing-settings.json')).status,404);
  } finally {app.server.closeAllConnections();await app.close();fs.rmSync(data,{recursive:true,force:true});}
});
test('music service exposes builtin metadata and cover and shuts down its provider',async()=>{
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'control-music-'));let stopped=0,closed=0;
  const provider={read:()=>({track:{connected:true,hasSong:true,title:'测试',artist:'测试歌手',id:'song',cover:'builtin:test',paused:false,position:12,duration:60},error:''}),cover:()=>({type:'image/png',bytes:Buffer.from([137,80,78,71])}),stop(){stopped++},close(){closed++}};
  const service=createService({port:0,settingsFile:path.join(data,'settings.json'),capturePath:path.join(data,'missing.exe'),defaultProvider:'builtin',mediaProvider:provider});
  try{
    const address=await service.listen(),base=`http://127.0.0.1:${address.port}`;
    const state=await fetch(base+'/api/health').then(r=>r.json());assert.equal(state.track.title,'测试');assert.equal(state.config.musicProvider,'builtin');
    const cover=await fetch(base+'/api/cover');assert.equal(cover.headers.get('content-type'),'image/png');assert.equal((await cover.arrayBuffer()).byteLength,4);
    const invalid=await fetch(base+'/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({musicProvider:'malicious'})});assert.equal(invalid.status,400);
    const changed=await fetch(base+'/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({musicProvider:'external',serviceUrl:'http://127.0.0.1:1'})});assert.equal(changed.status,200);assert.equal(stopped,1);
  }finally{service.close();assert.equal(closed,1);fs.rmSync(data,{recursive:true,force:true});}
});
