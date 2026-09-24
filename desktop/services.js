'use strict';
// Runs outside the UI process; a crashed renderer does not interrupt OBS services.
const path=require('node:path'),fs=require('node:fs');
const {choosePort}=require('./core');
const services=[];
let stopping=false;
const send=data=>process.parentPort?.postMessage(data);
function stop() {
  if(stopping)return; stopping=true;
  for(const service of services.reverse())try{service.close();}catch{}
  setTimeout(()=>process.exit(0),800);
}
async function start() {
  const dataRoot=process.env.CONTROL_DATA;
  if(!dataRoot || !path.isAbsolute(dataRoot))throw Error('数据目录无效');
  fs.mkdirSync(dataRoot,{recursive:true});
  const port=await choosePort(process.env.CONTROL_PORT?Number(process.env.CONTROL_PORT):undefined);
  const live=require('../app/bilibili-server').startServer(port+2,{settingsFile:path.join(dataRoot,'bilibili-open-credentials.enc')});
  services.push({close(){live.relay.disconnect();live.server.close();live.server.closeAllConnections();}});
  if(!live.server.listening)await new Promise((resolve,reject)=>{live.server.once('listening',resolve);live.server.once('error',reject);});
  const audio=require('../app/audio-server').createService({port:port+3,settingsFile:path.join(dataRoot,'audio-settings.json')});
  services.push(audio);await audio.listen();
  const music=require('../app/now-playing-server').createService({port:port+4,settingsFile:path.join(dataRoot,'now-playing-settings.json'),defaultProvider:'builtin'});
  services.push(music);await music.listen();
  const preview=require('../app/preview-server').createPreviewServer({port,dataRoot,release:{name:'control-resonant-desktop',version:require('../package.json').version,pid:process.pid,port}});
  services.push(preview);await preview.listen();
  send({type:'ready',port,base:`http://127.0.0.1:${port}/`});
}
process.parentPort?.on('message',event=>{if(event.data?.type==='stop')stop();});
process.on('SIGTERM',stop);process.on('SIGINT',stop);
process.on('disconnect',stop);
start().catch(error=>{send({type:'error',message:error.message});stop();});
