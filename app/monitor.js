(() => {
  'use strict';
  const C=MonitorCatalog,$=id=>document.getElementById(id),standalone=document.body.dataset.component,query=new URLSearchParams(location.search);
  let id=standalone||query.get('component')||'normal',item=C.entries.find(e=>e.id===id)||C.entries[0],settings,time=0,playing=true,ready=false;
  const channel=new BroadcastChannel('control-monitor-v1');let toastTimer,audioContext,analyser,audioURL,coverFile,audioLast=0;
  const session='monitor-v1-settings:';
  if(standalone)document.body.classList.add('standalone');
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
  function send(type,extra={}){const data={channel:'control-monitor-command',id,type,...extra};$('preview').contentWindow?.postMessage(data,location.origin);channel.postMessage(data);}
  function save(){try{localStorage.setItem(session+id,JSON.stringify(settings));}catch{}updateLinks();send('config',{config:settings});}
  function outputURL(linked=true){const url=new URL('monitor-stage.html',location.href);url.searchParams.set('component',id);url.searchParams.set('config',JSON.stringify(settings));if(linked)url.searchParams.set('linked','1');return url.href;}
  function updateLinks(){$('output').href=outputURL();$('independent').href='monitor-'+id+'.html';}
  function fields(target,list){target.replaceChildren();for(const f of list){const label=document.createElement('label');label.className='field'+(['text','select'].includes(f.type)?' wide':'')+(f.type==='checkbox'?' check wide':'');const span=document.createElement('span');span.textContent=f.label;const input=document.createElement(f.key==='message'?'textarea':f.type==='select'?'select':'input');if(f.key==='message')input.rows=3;input.name=f.key;input.setAttribute('aria-label',f.label);
      if(f.type==='select')for(const [value,name] of f.options){const o=new Option(name,value);input.add(o);}else if(input.tagName==='INPUT')input.type=f.type;
      if(f.type==='number'){input.min=f.min;input.max=f.max;input.step=f.step;}if(f.type==='text')input.maxLength=300;
      if(f.type==='checkbox')input.checked=settings[f.key];else input.value=settings[f.key];
      input.addEventListener('input',()=>{const raw={...settings,[f.key]:f.type==='checkbox'?input.checked:input.value};settings=C.clean(id,raw);
        if(f.key==='tier'){const keys=['strength','reach','textWarp','red','dispersion','ghost','flowSpeed'];C.tiers[settings.tier].forEach((v,i)=>settings[keys[i]]=v);for(const key of keys){const control=$('specific').querySelector('[name="'+key+'"]');if(control)control.value=settings[key];}}
        save();});if(f.type==='checkbox')label.append(input,span);else label.append(span,input);target.append(label);
    }}
  function select(next){
    if(!C.entries.some(e=>e.id===next))next='normal';id=next;item=C.entries.find(e=>e.id===id);let stored={};try{stored=JSON.parse(localStorage.getItem(session+id)||'{}');}catch{}settings=C.clean(id,stored);ready=false;time=0;playing=true;
    $('name').textContent=item.name;$('description').textContent=item.description;$('status').textContent='载入组件…';$('status').style.color='';document.title=item.name+' · 组件监视面板';document.querySelector('.workspace').scrollTop=0;document.querySelector('.inspector').scrollTop=0;for(const key of ['replay','pause','stable','exit','previous','next','snapshot'])$(key).disabled=true;
    fields($('specific'),item.fields);fields($('placement'),C.shared.slice(0,5));fields($('timing'),C.shared.slice(5));$('specific-section').hidden=!item.fields.length;$('music-tools').hidden=id!=='music';
    document.querySelectorAll('[data-component-id]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.componentId===id));
    updateLinks();$('preview').src=outputURL(false);if(!standalone){const url=new URL(location.href);url.searchParams.set('component',id);history.replaceState(null,'',url);}
  }
  for(const entry of C.entries){const b=document.createElement('button');b.className='component';b.dataset.componentId=entry.id;b.setAttribute('aria-pressed','false');const icon=document.createElement('span');icon.className='icon';icon.textContent=entry.icon;const content=document.createElement('span');content.textContent=entry.name;const hint=document.createElement('small');hint.textContent=entry.description;content.append(hint);b.append(icon,content);b.onclick=()=>select(entry.id);$('components').append(b);}
  function action(type){send(type,type==='pause'?{playing:!playing}:{});if(type==='exit'){settings.autoExit=true;save();const control=$('timing').querySelector('[name=autoExit]');if(control)control.checked=true;}}
  $('replay').onclick=()=>action('replay');$('pause').onclick=()=>action('pause');$('stable').onclick=()=>action('stable');$('exit').onclick=()=>action('exit');$('previous').onclick=()=>send('step',{frames:-1});$('next').onclick=()=>send('step',{frames:1});$('snapshot').onclick=()=>send('snapshot');
  $('timeline').oninput=e=>send('seek',{time:Number(e.target.value)});
  $('copy').onclick=async()=>{try{await navigator.clipboard.writeText(outputURL());toast('已复制纯画面地址：浏览器源设为 1920 × 1080。');}catch{toast('复制受限，请通过“打开录制画面”复制地址。');}};
  $('reset').onclick=()=>{settings={...item.defaults};save();select(id);};
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  $('export').onclick=()=>{const all={};for(const entry of C.entries){let raw={};try{raw=JSON.parse(localStorage.getItem(session+entry.id)||'{}');}catch{}all[entry.id]=C.clean(entry.id,raw);}download(new Blob([JSON.stringify({format:'control-component-monitor',version:1,components:all},null,2)],{type:'application/json'}),'Control-组件录制设置.json');};
  $('import').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>200000)throw Error('文件过大');const raw=JSON.parse(await file.text());if(raw.format!=='control-component-monitor'||raw.version!==1||!raw.components)throw Error('不是组件监视面板设置');for(const entry of C.entries){if(raw.components[entry.id])localStorage.setItem(session+entry.id,JSON.stringify(C.clean(entry.id,raw.components[entry.id])));}select(id);toast('已导入录制设置。');}catch(error){toast('导入失败：'+error.message);}e.target.value='';};
  window.addEventListener('message',e=>{
    if(e.origin!==location.origin||e.source!==$('preview').contentWindow||e.data?.id!==id)return;const d=e.data;
    if(d.channel==='control-monitor-snapshot'){download(d.blob,'Control-'+id+'-'+time.toFixed(2)+'s.png');return;}
    if(d.channel!=='control-monitor-status')return;if(d.error){$('status').textContent=d.error;$('status').style.color='#ee8375';return;}
    if(d.ready){ready=true;$('status').textContent='组件就绪';for(const key of ['replay','pause','stable','exit','previous','next','snapshot'])$(key).disabled=false;if(coverFile&&id==='music')send('cover',{blob:coverFile});}
    time=d.time;playing=d.playing;$('pause').textContent=playing?'暂停':'继续';$('time').textContent=time.toFixed(2)+' / '+(!settings.autoExit&&!settings.loop?'持续':d.total.toFixed(2))+' s';$('timeline').max=Math.max(d.total,time);$('timeline').value=time;
    if(ready){const t=time-settings.lead;$('status').textContent=!playing?'已暂停':t<0?'开场留空':t<settings.entry?'入场':t<settings.entry+settings.hold?'持续动效':settings.autoExit?'退场 / 尾部留空':'持续动效';}
  });
  document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;const type={r:'replay',R:'replay',' ':'pause',e:'exit',E:'exit'}[e.key];if(type){e.preventDefault();action(type);}if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();send('step',{frames:e.key==='ArrowRight'?1:-1});}});
  $('audio-file').onchange=e=>{const file=e.target.files[0];if(!file)return;if(audioURL)URL.revokeObjectURL(audioURL);audioURL=URL.createObjectURL(file);$('audio').src=audioURL;settings.audioMode='audio';settings.title=file.name.replace(/\.[^.]+$/,'');save();fields($('specific'),item.fields);toast('已载入音频，点击下方播放器开始播放。');};
  $('cover-file').onchange=e=>{const file=e.target.files[0];if(!file)return;if(!file.type.startsWith('image/')||file.size>20000000){toast('请选择 20 MB 以内的图片。');return;}coverFile=file;send('cover',{blob:file});};
  $('audio').onplay=async()=>{try{if(!audioContext){audioContext=new AudioContext();analyser=audioContext.createAnalyser();analyser.fftSize=8192;analyser.smoothingTimeConstant=.35;const source=audioContext.createMediaElementSource($('audio'));source.connect(analyser);analyser.connect(audioContext.destination);}await audioContext.resume();}catch(error){toast('音频分析不可用：'+error.message);}};
  const db=new Float32Array(4096);function audioTick(now){requestAnimationFrame(audioTick);if(!analyser||id!=='music'||now-audioLast<1000/60)return;audioLast=now;analyser.getFloatFrequencyData(db);const levels=new Float32Array(240);for(let i=0;i<240;i++){const hz=30*Math.pow(18000/30,i/239),bin=hz/audioContext.sampleRate*8192,index=Math.floor(bin),fraction=bin-index;const a=Number.isFinite(db[index])?db[index]:-100,b=Number.isFinite(db[index+1])?db[index+1]:-100;levels[i]=Math.max(0,Math.min(1,(a*(1-fraction)+b*fraction+72)/60));}send('audio',{levels:Array.from(levels),position:$('audio').currentTime,duration:$('audio').duration});}requestAnimationFrame(audioTick);
  select(item.id);
})();
