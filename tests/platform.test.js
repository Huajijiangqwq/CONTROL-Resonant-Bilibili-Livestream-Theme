'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('Mac credentials authenticate ciphertext and reuse only the encrypted local key',()=>{
  const {setKey,protect}=require('../app/platform-credentials');
  const {loadKey}=require('../desktop/credential-key');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'control-key-'));
  const wrapping=crypto.randomBytes(32);
  const safe={isEncryptionAvailable:()=>true,encryptString(value){const b=Buffer.from(value);return Buffer.from(b.map((v,i)=>v^wrapping[i%32]));},decryptString(value){return Buffer.from(value.map((v,i)=>v^wrapping[i%32])).toString();}};
  try{
    const first=loadKey(safe,root),again=loadKey(safe,root);assert.deepEqual(again,first);
    const saved=fs.readFileSync(path.join(root,'credential-key.enc'));assert(!saved.includes(first));assert(!saved.includes(first.toString('base64')));
    setKey(first.toString('base64'));const plain=Buffer.from('fixture-session');const encrypted=protect(plain);
    assert(!encrypted.includes(plain));assert.deepEqual(protect(encrypted,true),plain);
    encrypted[encrypted.length-1]^=1;assert.throws(()=>protect(encrypted,true));
    assert.throws(()=>loadKey({...safe,isEncryptionAvailable:()=>false},root),/钥匙串/);
    assert.throws(()=>setKey('invalid'),/无效/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Mac PCM shared session feeds music and band meter; one consumer stopping keeps the other alive',async()=>{
  const controls=[],bridge=require('../desktop/mac-audio-bridge').createBridge(x=>controls.push(x.enabled));
  const meter=bridge.spawnMeter(),music=bridge.spawnCapture('desktop');
  let rows='',pcm=Buffer.alloc(0);meter.stdout.on('data',b=>rows+=b);music.stdout.on('data',b=>pcm=Buffer.concat([pcm,b]));
  meter.stdin.write('bands:30,180,180,2000,2000,12000\nwatch:desktop\n');await tick();
  assert.deepEqual(controls,[true]);
  for(let frame=0;frame<12;frame++){
    const bytes=Buffer.alloc(2048*4);for(let i=0;i<2048;i++)bytes.writeFloatLE(.4*Math.sin(2*Math.PI*100*(frame*2048+i)/48000),i*4);
    bridge.receive({type:'mac-audio-pcm',bytes,rate:48000});
  }
  assert.equal(pcm.readUInt32LE(0),0x3153504e);assert.equal(pcm.readUInt32LE(4),48000);
  const levels=rows.trim().split('\n').map(JSON.parse).filter(x=>x.type==='level');
  assert(levels.length>0);assert(levels.at(-1).bands[0]>levels.at(-1).bands[2]);assert(levels.at(-1).peak>0);
  music.kill();assert.deepEqual(controls,[true]);
  meter.stdin.write('stop\n');assert.deepEqual(controls,[true,false]);
  bridge.close();
  const immediate=bridge.spawnCapture('desktop');immediate.kill();await tick();assert.deepEqual(controls,[true,false]);
});
test('Mac capture failure shuts down all live consumers without a false running state',async()=>{
  const controls=[],bridge=require('../desktop/mac-audio-bridge').createBridge(x=>controls.push(x.enabled));
  const child=bridge.spawnCapture('desktop');let error='';child.stderr.on('data',b=>error+=b);await tick();
  bridge.receive({type:'mac-audio-error',error:'permission denied'});
  assert.equal(child.exitCode,0);assert.match(error,/permission denied/);assert.deepEqual(controls,[true,false]);bridge.close();
});
test('Mac metadata reader ignores an in-flight response after switching providers',()=>{
  let finish;const media=require('../app/mac-media').createMacMedia({run:(_exe,_args,_opts,callback)=>{finish=callback;}});
  media.read();media.stop();finish(null,JSON.stringify({connected:true,hasSong:true,title:'stale',id:'stale'}));
  assert.equal(media.read().track.hasSong,false);media.close();
});
test('credential wrapping key is excluded from source release and static web serving',async()=>{
  const {excluded}=require('../scripts/package');assert(excluded('app/credential-key.enc'));assert(excluded('desktop/credential-key.enc.tmp'));
  const service=require('../app/preview-server').createPreviewServer({port:0});
  try{const {port}=await service.listen();assert.equal((await fetch(`http://127.0.0.1:${port}/credential-key.enc`)).status,404);}finally{service.server.closeAllConnections();await service.close();}
});
