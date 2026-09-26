'use strict';
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { SpectrumAnalyzer, frequencies } = require('../app/now-playing-dsp');
const sources = [{ id: 'desktop', name: 'macOS 系统音频' }];
function createBridge(send) {
  const consumers = new Set(); let lastWanted = false, analyzer, rates = [30,180,180,2000,2000,12000];
  const active = () => {
    const wanted = [...consumers].some(c => c.active);
    if (wanted !== lastWanted) { lastWanted = wanted; send({ type: 'mac-audio-control', enabled: wanted }); }
  };
  function spawn(kind, source = 'desktop') {
    const c = new EventEmitter(); c.active = false; c.kind = kind; c.exitCode = null;
    c.stdout = new PassThrough(); c.stderr = new PassThrough();
    let commandBuffer = '';
    const json = value => c.stdout.write(JSON.stringify(value) + '\n');
    c.kill = () => { if(c.exitCode!==null)return; c.active = false; consumers.delete(c); active(); c.exitCode = 0; c.stdout.end(); c.stderr.end(); c.emit('exit', 0); };
    c.stdin = new Writable({ write(chunk, _, done) {
      commandBuffer += chunk.toString();
      const lines = commandBuffer.split('\n'); commandBuffer = lines.pop();
      for (const line of lines) {
        if (line === 'list') json({ type: 'sources', sources });
        else if (line.startsWith('bands:')) { const next=line.slice(6).split(',').map(Number); if(next.length===6&&next.every(Number.isFinite))rates=next; }
        else if (line.startsWith('watch:')) {
          if(line !== 'watch:desktop') { json({type:'error',message:'Mac 版当前支持系统音频，请选择桌面音频。'}); continue; }
          c.active = true; active();
        } else if(line==='stop'){c.active=false;active();} else if(line==='quit')c.kill();
      }
      done();
    }, final(done){c.kill();done();} });
    consumers.add(c);
    queueMicrotask(() => {
      if(c.exitCode!==null)return;
      if (source === 'list' || kind === 'meter') json({type:'sources',sources});
      else if(source==='desktop'){c.active=true;active();}
      else { c.stderr.write('ERROR: Mac 版当前仅支持系统音频\n'); c.kill(); }
    });
    return c;
  }
  function receive(message) {
    if (message.type === 'mac-audio-error') {
      for(const c of [...consumers])if(c.active){
        if(c.kind==='meter') c.stdout.write(JSON.stringify({type:'error',message:message.error})+'\n');
        else c.stderr.write('ERROR: '+String(message.error).slice(0,250)+'\n');
        c.kill();
      }
      return;
    }
    if(message.type!=='mac-audio-pcm'||!lastWanted)return;
    const data=Buffer.from(message.bytes), rate=Number(message.rate);
    if(data.length<4 || data.length>131072 || data.length%4 || !Number.isFinite(rate) || rate<8000 || rate>192000)return;
    const samples = new Float32Array(data.length/4);
    for(let i=0;i<samples.length;i++)samples[i]=Math.max(-1,Math.min(1,data.readFloatLE(i*4)||0));
    const header=Buffer.alloc(16);header.writeUInt32LE(0x3153504e);header.writeInt32LE(rate,4);header.writeInt32LE(1,8);header.writeInt32LE(samples.length,12);
    let result;
    if([...consumers].some(c=>c.kind==='meter'&&c.active)){
      if(!analyzer||analyzer.rate!==rate)analyzer=new SpectrumAnalyzer(rate,1);
      result=analyzer.push(samples);
    }
    for(const c of consumers)if(c.active&&c.stdout.writableLength<262144){
      if(c.kind==='music')c.stdout.write(Buffer.concat([header,data]));
      else if(result){
        const bands=[0,1,2].map(b=>{let power=0,n=0;frequencies.forEach((hz,i)=>{if(hz>=rates[b*2]&&hz<=rates[b*2+1]){power+=Math.pow(10,result.db[i]/20);n++;}});return Math.max(0,Math.min(1,(power/Math.max(1,n))*10));});
        c.stdout.write(JSON.stringify({type:'level',source:'desktop',peak:Math.min(1,result.rms*5),bands,spectrum:true,available:true})+'\n');
      }
    }
  }
  return { spawnMeter:()=>spawn('meter'), spawnCapture:source=>spawn('music',source), receive, close(){for(const c of [...consumers])c.kill();} };
}
module.exports={createBridge};
