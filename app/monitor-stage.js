/* One native renderer per recording page; no production settings are mutated. */
(async () => {
  'use strict';
  const C=MonitorCatalog,query=new URLSearchParams(location.search),id=query.get('component')||'normal',item=C.entries.find(e=>e.id===id)||C.entries[0];
  let raw={};try{raw=JSON.parse(query.get('config')||'{}');}catch{}
  let s=C.clean(item.id,raw),time=0,playing=true,last=performance.now(),painted=-1,lastStatus=0,revision=0,ready=false;
  const channel=new BroadcastChannel('control-monitor-v1'),canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),W=1920,H=1080;
  document.title=item.name+' · 录制输出';
  const make=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
  const layer=make(W,H),ink=layer.getContext('2d'),frame=make(1,1),flow=make(1280,720),musicCanvas=make(1920,560);
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  const image=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('素材无法读取：'+src));im.src=src;});
  const script=src=>new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=src;el.onload=resolve;el.onerror=()=>reject(Error('组件无法读取：'+src));document.head.append(el);});
  const status=(extra={})=>{canvas.setAttribute('aria-label',item.name+' · '+time.toFixed(2)+' 秒 · '+(playing?'播放中':'已暂停')+' · 1920 × 1080');if(window.parent!==window)window.parent.postMessage({channel:'control-monitor-status',id:item.id,time,playing,total:C.total(s),...extra},location.origin);};
  function text(c,str,x,y,size=38,weight=600,color='#eae9e1'){c.font=weight+' '+size+'px "Microsoft YaHei",sans-serif';c.textBaseline='top';c.textAlign='left';c.fillStyle=color;c.fillText(str,x,y);}
  function fitText(c,value,width){const chars=Array.from(String(value));if(c.measureText(value).width<=width)return value;while(chars.length&&c.measureText(chars.join('')+'…').width>width)chars.pop();return chars.join('')+'…';}
  function nativeAge(t,duration){return t<s.entry?t/s.entry*duration:duration+(t-s.entry)*1000;}
  let game,logos,hiss,hissSize='',field,fieldBox,fieldStyle={},music,trackKey='',cover='assets/cover-placeholder.svg',spectrum=new Float32Array(240),audioPosition=0,audioDuration=240;
  let disposed=false;
  function dispose(){disposed=true;hiss?.dispose();field?.dispose();music?.dispose();channel.close();}
  window.addEventListener('pagehide',dispose,{once:true});
  function config(next){const prior=s;s=C.clean(item.id,next);revision++;if(prior.title!==s.title||prior.artist!==s.artist)trackKey='';painted=-1;}
  function action(data){
    if(data.id!==item.id)return;
    if(data.type==='config')config(data.config);
    if(data.type==='audio'){spectrum=Float32Array.from((data.levels||[]).slice(0,240));audioPosition=Number(data.position)||0;audioDuration=Number(data.duration)||240;}
    if(data.type==='cover'&&data.blob instanceof Blob){const next=URL.createObjectURL(data.blob);if(cover.startsWith('blob:'))URL.revokeObjectURL(cover);cover=next;trackKey='';}
    if(data.type==='replay'){time=0;playing=true;music?.base.hiss.reset();}
    if(data.type==='pause')playing=typeof data.playing==='boolean'?data.playing:!playing;
    if(data.type==='stable'){time=s.lead+s.entry+.1;playing=true;}
    if(data.type==='exit'){s.autoExit=true;time=s.lead+s.entry+s.hold;playing=true;}
    if(data.type==='seek'){time=clamp(Number(data.time)||0,0,Math.max(time,C.total(s)));playing=false;}
    if(data.type==='step'){time=clamp(time+Number(data.frames||1)/s.fps,0,s.autoExit||s.loop?C.total(s):Infinity);playing=false;}
    if(data.type==='snapshot'){canvas.toBlob(blob=>{if(blob)window.parent.postMessage({channel:'control-monitor-snapshot',id:item.id,blob},location.origin);});}
    if(data.type!=='audio'){painted=-1;last=performance.now();status();}
  }
  window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.channel==='control-monitor-command')action(e.data);});
  channel.onmessage=e=>{if(query.has('linked')&&e.data?.channel==='control-monitor-command')action(e.data);};
  document.addEventListener('keydown',e=>{const type={r:'replay',R:'replay',' ':'pause',e:'exit',E:'exit'}[e.key];if(type){e.preventDefault();action({id:item.id,type});}if(e.key==='ArrowRight'){e.preventDefault();action({id:item.id,type:'step',frames:1});}if(e.key==='f'||e.key==='F')document.documentElement.requestFullscreen?.();});
  try {
    const names=[];
    if(item.id==='normal')names.push('normal-notice-engine.js');
    if(item.id==='gift')names.push('gift-notice-engine.js','notice-lifetime.js','notice-exit.js');
    if(['captain','admiral','governor','fbc'].includes(item.id))names.push('fleet-film-burn.js','fleet-interlude.js','fleet-vhs.js','fleet-signal.js','fleet-notice-engine.js');
    if(item.id==='sc')names.push('sc-flow-field.js','hiss-simulation-engine.js');
    if(item.id==='resonance')names.push('hiss-corner-field.js');
    if(item.id==='frame')names.push('theme-frame-engine.js');
    if(item.id==='music')names.push('now-playing-dsp.js','now-playing-spectrum240.js','now-playing-type.js','now-playing-material.js','now-playing-renderer.js','now-playing-recording-source.js','now-playing-flow-contours.js','now-playing-flow-density.js','now-playing-flow-field.js','now-playing-signal.js');
    for(const name of names)await script(name);
    await Promise.all([window.GiftNotice?.loading,window.FleetNotice?.loading,window.FleetInterlude?.loading,document.fonts.ready]);
    if(window.GiftNotice?.failed||window.FleetNotice?.failed)throw Error('原始组件素材未能完整载入，请检查本地服务。');
    game=await image('live-game.jpg');
    if(item.id==='logo')logos=await Promise.all(['live-logo-en.png','live-logo-zh.png'].map(image));
    if(item.id==='music'){await document.fonts.load('700 80px "Anton"');music=new NowPlayingSignal.Renderer(musicCanvas);}
    if(item.id==='resonance'){
      const paper=make(128,128),p=paper.getContext('2d'),pixels=p.createImageData(128,128);
      for(let i=0;i<pixels.data.length;i+=4){const n=(Math.sin(i*12.9898)*43758.5453)%1;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=180;pixels.data[i+3]=Math.abs(n)*30;}p.putImageData(pixels,0,0);
      fieldBox={x:0,y:0,w:1280,h:720,ax:700,ay:360,variant:0};field=HissCornerField.create(flow,fieldBox,{texture:()=>({canvas:paper,revision:1}),style:()=>fieldStyle,gameRect:()=>({x:-2000,y:-2000,w:1,h:1})});
      if(!field?.state.ready)throw Error('希斯共振需要 WebGL 2，请开启浏览器硬件加速。');
    }
    ready=true;last=performance.now();status({ready:true});requestAnimationFrame(tick);
  } catch(error){const p=document.createElement('p');p.className='load-error';p.textContent=error.message;document.body.append(p);status({error:error.message});}
  function background(){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);if(s.background==='game')ctx.drawImage(game,0,0,W,H);else if(s.background!=='transparent'){ctx.fillStyle=s.background==='green'?'#00ff00':'#000';ctx.fillRect(0,0,W,H);}}
  function render(){
    background();const t=time-s.lead;if(t<0)return;
    const exit=s.autoExit&&t>=s.entry+s.hold?clamp((t-s.entry-s.hold)/s.exit):-1;if(exit>=1)return;
    ink.setTransform(1,0,0,1,0,0);ink.globalAlpha=1;ink.globalCompositeOperation='source-over';ink.clearRect(0,0,W,H);
    const x=s.x-s.width/2,y=s.y, genericAlpha=exit<0?1:1-smooth(exit);let nativeExit=false;
    if(item.id==='normal'){
      const model=NormalNotice.measure({sender:s.sender,body:s.message,width:s.width,fontSize:s.fontSize,lineHeight:146,main:true});
      NormalNotice.draw(ink,{x,y:y-model.height/2,age:nativeAge(t,220),model});
    }else if(item.id==='gift'){
      const data={giftName:s.giftName,sender:s.sender,quantity:s.quantity,value:s.value};const h=GiftNotice.height(s.width,data,true);
      GiftNotice.draw(ink,{x,y:y-h/2,width:s.width,age:nativeAge(t,800),data,main:true,exitProgress:exit});nativeExit=true;
    }else if(['captain','admiral','governor'].includes(item.id)){
      const scale=s.width/850,age=nativeAge(t,FleetNotice.duration(item.id));
      FleetNotice.draw(ink,{x:s.x-429.5*scale,y:s.y-330*scale,scale,rank:item.id,age,username:s.sender,nameSize:s.nameSize,titleSize:s.titleSize,exitProgress:exit});
      if(s.signal&&exit<0)FleetNotice.drawSignal(ink,{x:0,y:0,width:W,height:H,quality:1,rank:item.id,age,focusX:s.x,focusY:s.y});nativeExit=true;
    }else if(item.id==='fbc'){
      const age=t<s.entry?877+t/s.entry*180:1057+((t-s.entry)%s.hold)/s.hold*1499;
      FleetInterlude.draw(ink,{x,y:y-s.height/2,width:s.width,height:s.height,age,rank:'governor',quality:1});
    }else if(item.id==='sc'){
      const width=s.width,height=s.height,Wc=width+112,Hc=height+320,q=1.5,key=width+':'+height;
      const fx={strength:s.strength,reach:s.reach,textWarp:s.textWarp,red:s.red,dispersion:s.dispersion,ghost:s.ghost,speed:s.flowSpeed};
      if(hissSize!==key){hiss?.dispose();hissSize=key;hiss=HissSimulation.createLayer({width,height,quality:q,fx,seed:2.31,transparent:true,continuousTime:true,nameBand:[53,100],paintVersion:()=>revision,progress:{x:22,y:height-28,width:width-180,height:2.2,duration:s.hold+s.entry},paint:(c,r,left)=>{
        c.fillStyle='#10100ff2';c.fillRect(r.x,r.y,r.w,r.h);text(c,'▽  异常通讯 / SC',r.x+22,r.y+18,21,600,'#df493a');c.font='600 32px "Microsoft YaHei",sans-serif';text(c,fitText(c,s.sender,r.w-225),r.x+22,r.y+60,32);text(c,'¥ '+s.tier,r.x+r.w-160,r.y+60,32,750);
        c.save();c.beginPath();c.rect(r.x+22,r.y+110,r.w-44,r.h-158);c.clip();let row='',line=0;for(const ch of s.message){if(c.measureText(row+ch).width>r.w-44||ch==='\n'){text(c,row,r.x+22,r.y+114+line*43,32);row='';line++;}if(ch!=='\n')row+=ch;}text(c,row,r.x+22,r.y+114+line*43,32);c.restore();text(c,Math.floor(left/60)+':'+String(Math.floor(left)%60).padStart(2,'0'),r.x+r.w-80,r.y+r.h-34,18,500,'#df5948');}});}
      hiss.updateFX(fx);if(!render.sc||render.sc.width!==Math.ceil(Wc*q)||render.sc.height!==Math.ceil(Hc*q))render.sc=make(Math.ceil(Wc*q),Math.ceil(Hc*q));
      const ci=render.sc.getContext('2d');ci.setTransform(q,0,0,q,0,0);ci.clearRect(0,0,Wc,Hc);hiss.draw(ci,0,0,t*1000,Math.max(0,s.entry+s.hold-t),q,exit<0?-1:exit*1000,-1,nativeAge(t,1000));
      ink.drawImage(render.sc,s.x-Wc/2,s.y-Hc/2,Wc,Hc);nativeExit=true;
    }else if(item.id==='resonance'){
      fieldStyle={free:true,flowColor:'#b80504',flowDensity:s.density,flowWarp:s.warp,flowSpread:s.spread};fieldBox.ax=1280*s.anchorX/100;fieldBox.ay=720*s.anchorY/100;
      const beat=Math.exp(-((t*1.7)%1)*8)*s.drive;field.draw(t*1000,1,{level:s.drive,bass:beat,mid:s.drive*.5,high:s.drive*.2,hit:beat,optics:.23,glow:.32});ink.drawImage(flow,x,y-s.height/2,s.width,s.height);
    }else if(item.id==='music'){
      const next=s.title+'|'+s.artist+'|'+cover;if(trackKey!==next){music.setTrack({hasSong:true,paused:false,id:next,title:s.title,artist:s.artist,duration:audioDuration},cover,t*1000);trackKey=next;}
      const levels=new Float32Array(240);for(let i=0;i<240;i++){const u=i/239,beat=Math.exp(-((t*1.8)%1)*8);levels[i]=s.audioMode==='audio'?(spectrum[i]||0):s.audioMode==='silent'?0:Math.min(1,(.12+.44*beat*Math.exp(-u*3)+.24*Math.pow(Math.sin(u*18-t*1.7),6)+.11*Math.pow(Math.sin(u*43+t*2.4),8))*(1-u*.7));}
      music.draw(t*1000,levels,{texture:s.texture,flow:s.flow,fps:s.fps,attack:18,release:135},s.audioMode==='audio'?audioPosition:t,NowPlayingSignal.settings({strength:1.05,softness:1.5,bleed:4.5,offset:1.8,motion:1,hue:1,noise:1,frequency:1}),-Infinity);ink.drawImage(musicCanvas,x,y-s.width*560/3840,s.width,s.width*560/1920);
    }else if(item.id==='frame'){
      const options={w:s.width,h:s.height,stroke:'#c3c3b5',strokeWidth:s.stroke,radius:0,borderStyle:'solid',grainAmount:s.grain,traceAmount:s.trace};ThemeFrame.draw(frame,options,t*1000);ink.drawImage(frame,x,y-s.height/2,s.width,s.height);
      if(s.corners){ThemeFrame.draw(frame,{...options,borderStyle:'corners',cornerInset:15,cornerLength:22},t*1000);ink.drawImage(frame,x,y-s.height/2,s.width,s.height);}
    }else if(item.id==='logo'){
      const parts=[[logos[0],0,0,1280,236],[logos[0],78,254,1139,193],[logos[1],0,0,889,415],[logos[1],146,448,609,272]],ratio=parts.reduce((sum,p)=>sum+p[3]/p[4],0),h=s.width/(ratio+1.1);let lx=x;
      for(let i=0;i<parts.length;i++){if(i===2){lx+=h*.28;ink.fillStyle='#73766c';ink.fillRect(lx,y-h/2,1,h);lx+=h*.28;}const [im,sx,sy,sw,sh]=parts[i],w=sw/sh*h;ink.drawImage(im,sx,sy,sw,sh,lx,y-h/2,w,h);lx+=w+h*.13;}
    }else if(item.id==='title'){
      ink.font='750 '+s.fontSize+'px "Microsoft YaHei",sans-serif';const name=fitText(ink,'▼  '+s.sender,s.width*.4),nw=ink.measureText(name).width,title=fitText(ink,s.title,Math.max(20,s.width-nw-80)),tw=ink.measureText(title).width+38,total=nw+42+tw,lx=s.x-total/2; text(ink,name,lx,y-s.fontSize/2,s.fontSize,750);const labelX=lx+nw+42;ink.fillStyle='#efede4';ink.fillRect(labelX,y-s.fontSize/2-9,tw,s.fontSize+21);text(ink,title,labelX+19,y-s.fontSize/2,s.fontSize,750,'#171817');
    }else if(item.id==='timer'){
      const n=Math.floor(s.startSeconds+t),pad=n=>String(n).padStart(2,'0');text(ink,'◷ 直播时长  '+pad(Math.floor(n/3600))+':'+pad(Math.floor(n/60)%60)+':'+pad(n%60),x,y-s.fontSize/2,s.fontSize,650);
    }else if(item.id==='heading'){
      text(ink,s.title,x,y-s.fontSize/2-12,s.fontSize,800);ink.fillStyle='#44473e';ink.fillRect(x,y+s.fontSize*.65,s.width,1);ink.fillStyle='#c44237';ink.fillRect(x,y+s.fontSize*.65,Math.min(200,s.width*.4),5);
    }
    ctx.save();ctx.globalAlpha=nativeExit?1:genericAlpha;ctx.drawImage(layer,0,0);ctx.restore();
  }
  function tick(now){
    if(disposed)return;requestAnimationFrame(tick);if(!ready)return;
    const elapsed=(now-last)/1000;last=now;if(playing)time+=Math.min(elapsed,.12)*s.speed;
    const duration=C.total(s);if(time>duration&&(s.autoExit||s.loop)){if(s.loop){time%=duration;music?.base.hiss.reset();}else{time=duration;playing=false;}painted=-1;}
    if(painted<0||(playing&&now-painted>=1000/s.fps-.5)){
      try{render();painted=now;}catch(error){ready=false;status({error:error.message});const p=document.createElement('p');p.className='load-error';p.textContent=error.message;document.body.append(p);}
    }
    if(now-lastStatus>120){status();lastStatus=now;}
  }
})();
