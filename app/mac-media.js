'use strict';
const {execFile}=require('node:child_process'),path=require('node:path'),crypto=require('node:crypto');
const {sanitizeTrack}=require('./windows-media');
function createMacMedia({run=execFile,request=fetch}={}){
  let closed=false,pending=false,stamp=0,revision=0,track=sanitizeTrack({}),error='',cover=null,coverUrl='';
  async function artwork(url,own){
    if(!url||url===coverUrl)return;
    coverUrl=url;cover=null;
    try{
      const u=new URL(url);if(u.protocol!=='https:')return;
      const response=await request(u,{signal:AbortSignal.timeout(3500)});
      const type=response.headers.get('content-type')||'';
      if(!response.ok||!/^image\/(jpeg|png|webp)/.test(type))return;
      let length=0;const chunks=[];
      for await(const chunk of response.body){length+=chunk.length;if(length>5*1024*1024)throw Error('cover size');chunks.push(chunk);}
      const bytes=Buffer.concat(chunks);
      if(own===revision&&!closed&&coverUrl===url)cover={type,bytes,key:crypto.createHash('sha256').update(bytes).digest('hex').slice(0,24)};
    }catch{}
  }
  function poll(){
    if(closed||pending||Date.now()-stamp<900)return;
    pending=true;const own=revision;
    run('/usr/bin/osascript',['-l','JavaScript',path.join(__dirname,'mac-media.jxa')],{timeout:4000,maxBuffer:32768},(err,stdout)=>{
      pending=false;if(own!==revision||closed)return;stamp=Date.now();
      if(err){track={...track,connected:false,paused:true};error='未能读取播放器，请检查 macOS 自动化权限。';return;}
      try{
        const data=JSON.parse(stdout);if(track.id!==data.id){cover=null;coverUrl='';}
        track=sanitizeTrack(data);error=String(data.error||'').slice(0,250);
        if(data.artworkUrl)void artwork(data.artworkUrl,own);
      }catch{error='播放器信息暂时无法读取。';}
    });
  }
  return {
    read(){poll();return {track:{...track,connected:track.connected&&Date.now()-stamp<6000,cover:cover?'builtin:'+cover.key:''},error};},
    cover:()=>cover,
    stop(){revision++;track=sanitizeTrack({});cover=null;coverUrl='';stamp=0;},
    close(){closed=true;this.stop();},
  };
}
module.exports={createMacMedia};
