'use strict';
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const PAGES = Object.freeze({theme:'theme-editor.html',chat:'chat-editor.html',live:'live.html',simulation:'simulation.html',music:'now-playing.html',monitor:'monitor.html'});
const OFFSETS = [0,2,3,4];
function free(port) {
  return new Promise(resolve => {
    const s=net.createServer(); s.once('error',()=>resolve(false));
    s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true)));
  });
}
async function choosePort(savedPort, probe=free) {
  if (savedPort !== undefined) {
    if (!Number.isInteger(savedPort) || savedPort<1024 || savedPort>65531) throw Error('保存的端口无效。');
    if ((await Promise.all(OFFSETS.map(n=>probe(savedPort+n)))).every(Boolean)) return savedPort;
    throw Error(`本客户端的端口组 ${savedPort} 已被占用。请先关闭占用这些端口的程序，再重试；为保留 OBS 地址，不会自动更换端口。`);
  }
  for(let port=8791;port<9191;port+=10) if((await Promise.all(OFFSETS.map(n=>probe(port+n)))).every(Boolean))return port;
  throw Error('没有可用的本地服务端口。');
}
function pageUrl(base, page) {
  if (!Object.hasOwn(PAGES,page)) throw Error('页面无效');
  const u = new URL(base);
  if (u.protocol!=='http:' || u.hostname!=='127.0.0.1') throw Error('服务地址无效');
  return new URL(PAGES[page],u).href;
}
function readConfig(dir) { try { return JSON.parse(fs.readFileSync(path.join(dir,'desktop.json'),'utf8')); }catch { return {}; } }
function saveConfig(dir,config) {fs.mkdirSync(dir,{recursive:true}); const file=path.join(dir,'desktop.json'); fs.writeFileSync(file+'.tmp',JSON.stringify(config,null,2));fs.renameSync(file+'.tmp',file);}
module.exports={PAGES,OFFSETS,choosePort,pageUrl,readConfig,saveConfig};
