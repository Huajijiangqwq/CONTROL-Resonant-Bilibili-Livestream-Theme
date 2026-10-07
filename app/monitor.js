/* Each recording panel owns its linked outputs; live theme settings are separate. */
(() => {
  'use strict';
  const C=MonitorCatalog,$=id=>document.getElementById(id),standalone=document.body.dataset.component,query=new URLSearchParams(location.search);
  const controller=crypto.randomUUID(),bundleKey='control-monitor-v2-settings',legacyPrefix='monitor-v1-settings:';
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('control-monitor-v2:'+controller):null;
  const controls=['replay','pause','stable','exit','previous','next','snapshot','timeline'];
  const numberCommits=new WeakMap();
  let id=standalone||query.get('component')||'normal',item=C.entries.find(e=>e.id===id)||C.entries[0],settings,time=0,playing=true,ready=false,view='',disposed=false;
  let toastTimer,loadTimer,audioContext,analyser,audioURL,coverFile,audioLast=0,audioFrame,audioClock=null,clockAttempt=null,dirtyStorage=false,saved={};
  try{const stored=JSON.parse(localStorage.getItem(bundleKey)||'null');if(stored?.format==='control-component-monitor'&&stored.version===1&&stored.components&&typeof stored.components==='object'&&!Array.isArray(stored.components))saved=stored.components;}catch{}
  for(const entry of C.entries){if(!saved[entry.id]){try{saved[entry.id]=JSON.parse(localStorage.getItem(legacyPrefix+entry.id)||'{}');}catch{saved[entry.id]={};}}saved[entry.id]=C.clean(entry.id,saved[entry.id]);}
  if(standalone)document.body.classList.add('standalone');document.body.classList.add('monitor-workbench');
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4800);}
  function flushNumbers(){for(const input of document.querySelectorAll('input[aria-invalid="true"]'))numberCommits.get(input)?.();}
  function send(type,extra={}){if(disposed)return;if(!['config','audio','cover'].includes(type))flushNumbers();const data={channel:'control-monitor-command',controller,view,id,type,...extra};$('preview').contentWindow?.postMessage(data,location.origin);channel?.postMessage(data);}
  function persistence(){const node=$('monitorSaveState');node.textContent=dirtyStorage?'仅保留在当前窗口，请导出设置备份。':'录制设置已保存在本机。';node.dataset.error=String(dirtyStorage);}
  function writeBundle(value){localStorage.setItem(bundleKey,JSON.stringify({format:'control-component-monitor',version:1,components:value}));}
  function save(){saved[id]={...settings};try{writeBundle(saved);dirtyStorage=false;}catch{if(!dirtyStorage)toast('本机保存失败，当前修改仍在此窗口。请导出设置备份。');dirtyStorage=true;}persistence();updateLinks();send('config',{config:settings});}
  function outputURL(linked=true){const url=new URL('monitor-stage.html',location.href);url.searchParams.set('component',id);url.searchParams.set('config',JSON.stringify(settings));url.searchParams.set('controller',controller);url.searchParams.set('view',view);if(linked)url.searchParams.set('linked','1');return url.href;}
  function updateLinks(){$('output').href=outputURL();$('independent').href='monitor-'+id+'.html';}
  function applyField(field,input,commit){
    const value=field.type==='checkbox'?input.checked:input.value;
    if(field.type==='number'){const valid=String(value).trim()&&Number.isFinite(Number(value)),within=valid&&Number(value)>=field.min&&Number(value)<=field.max;if(!commit&&!within){input.setAttribute('aria-invalid','true');return;}if(!valid){input.value=settings[field.key];input.removeAttribute('aria-invalid');return;}}
    const previousMode=settings.audioMode,prior=settings[field.key];settings=C.clean(id,{...settings,[field.key]:value});input.removeAttribute('aria-invalid');if(commit&&field.type==='number')input.value=settings[field.key];if(Object.is(prior,settings[field.key]))return;
    if(field.key==='tier'){const keys=['strength','reach','textWarp','red','dispersion','ghost','flowSpeed'];C.tiers[settings.tier].forEach((value,i)=>settings[keys[i]]=value);for(const key of keys){const control=$('specific').querySelector('[name="'+key+'"]');if(control)control.value=settings[key];}}
    if(field.key==='audioMode'&&previousMode==='audio'&&settings.audioMode!=='audio')stopAudio();if(field.key==='fps')configureClock();save();
  }
  function fields(target,list){target.replaceChildren();for(const field of list){
    const label=document.createElement('label');label.className='field'+(['text','select'].includes(field.type)?' wide':'')+(field.type==='checkbox'?' check wide':'');
    const span=document.createElement('span');span.textContent=field.label;
    const input=document.createElement(field.key==='message'?'textarea':field.type==='select'?'select':'input');if(field.key==='message')input.rows=3;input.name=field.key;input.setAttribute('aria-label',field.label);
    if(field.type==='select')for(const [value,name] of field.options)input.add(new Option(name,value));else if(input.tagName==='INPUT')input.type=field.type;
    if(field.type==='number'){input.min=field.min;input.max=field.max;input.step=field.step;}if(field.type==='text')input.maxLength=300;
    if(field.type==='checkbox')input.checked=settings[field.key];else input.value=settings[field.key];
    input.addEventListener('input',()=>applyField(field,input,false));if(field.type==='number'){const commit=()=>applyField(field,input,true);numberCommits.set(input,commit);input.addEventListener('change',commit);input.addEventListener('blur',commit);input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();commit();input.blur();}});}
    if(field.type==='checkbox')label.append(input,span);else label.append(span,input);target.append(label);
  }}
  function configureClock(){audioClock?.port.postMessage({enabled:!disposed&&id==='music'&&settings?.audioMode==='audio'&&!$('audio').paused,fps:Number(settings?.fps)||60});}
  function quietAudio(){audioClock?.port.postMessage({enabled:false});audioContext?.suspend().catch(()=>{});if(id==='music')send('audio',{levels:[],position:$('audio').currentTime||0,duration:Number.isFinite($('audio').duration)?$('audio').duration:0});}
  function stopAudio(){$('audio').pause();quietAudio();}
  function setReady(value){ready=value;for(const key of controls)$(key).disabled=!value;}
  function failed(message){clearTimeout(loadTimer);setReady(false);$('status').textContent=message;$('status').dataset.error='true';$('monitorRetry').hidden=false;}
  function select(next){
    if(!C.entries.some(entry=>entry.id===next))next='normal';stopAudio();id=next;item=C.entries.find(entry=>entry.id===id);settings=C.clean(id,saved[id]);view=crypto.randomUUID();setReady(false);time=0;playing=true;
    $('name').textContent=item.name;$('description').textContent=item.description;$('status').textContent='载入组件…';$('status').dataset.error='false';$('monitorRetry').hidden=true;document.title=item.name+' · 组件监视面板';
    document.querySelector('.workspace').scrollTop=0;document.querySelector('.inspector').scrollTop=0;$('time').textContent='0.00 s';$('timeline').value=0;$('timeline').max=C.total(settings);
    fields($('specific'),item.fields);fields($('placement'),C.shared.slice(0,5));fields($('timing'),C.shared.slice(5));$('specific-section').hidden=!item.fields.length;$('music-tools').hidden=id!=='music';
    document.querySelectorAll('[data-component-id]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.componentId===id));updateLinks();$('preview').src=outputURL(false);persistence();
    clearTimeout(loadTimer);const loadingView=view;loadTimer=setTimeout(()=>{if(!ready&&view===loadingView)failed('组件未能载入，请重试。');},15000);
    if(!standalone){const url=new URL(location.href);url.searchParams.set('component',id);history.replaceState(null,'',url);}
  }
  function installChrome(){
    const badge=document.createElement('p');badge.className='monitor-isolation-note';badge.textContent='独立录制测试，设置与直播主题分别保存。';document.querySelector('.shot-head').after(badge);
    const saveState=document.createElement('p');saveState.id='monitorSaveState';saveState.className='subtle';saveState.setAttribute('role','status');$('reset').after(saveState);
    const retry=document.createElement('button');retry.id='monitorRetry';retry.textContent='重新载入';retry.hidden=true;retry.onclick=()=>select(id);$('status').after(retry);
    $('preview').addEventListener('error',()=>failed('无法载入组件页面，请确认本地服务正在运行。'));
    const search=document.createElement('input');search.id='monitorComponentSearch';search.type='search';search.placeholder='搜索组件';search.setAttribute('aria-label','搜索组件');$('components').before(search);
    const empty=document.createElement('p');empty.className='monitor-component-empty';empty.hidden=true;empty.textContent='没有匹配的组件';$('components').after(empty);
    search.oninput=()=>{const query=search.value.trim().toLocaleLowerCase();let shown=0;document.querySelectorAll('[data-component-id]').forEach(button=>{const entry=C.entries.find(entry=>entry.id===button.dataset.componentId);button.hidden=![entry.id,entry.name,entry.description].join(' ').toLocaleLowerCase().includes(query);if(!button.hidden)shown++;});empty.hidden=shown>0;};
    const instructions=document.querySelector('.instructions p');instructions.textContent='录制尺寸为 1920 × 1080，棋盘格代表透明区域。新打开的录制画面只接受此面板控制；刷新或关闭面板后需重新打开联动画面。OBS 与其他浏览器使用链接中的参数快照。';
    const keys=document.createElement('small');keys.className='monitor-keyboard';keys.textContent='空格 暂停 / 继续　R 重播　E 退场　← → 逐帧';instructions.append(document.createElement('br'),keys);
    for(const section of document.querySelectorAll('.inspector section')){if(section.id==='specific-section')continue;const heading=section.querySelector('h2');if(!heading)continue;const folded=document.createElement('details'),summary=document.createElement('summary');folded.className='monitor-fold-section';folded.open=!!section.querySelector('#placement');summary.textContent=heading.textContent;heading.remove();folded.append(summary,...section.childNodes);section.replaceWith(folded);}
  }
  installChrome();
  for(const entry of C.entries){const button=document.createElement('button');button.className='component';button.dataset.componentId=entry.id;button.setAttribute('aria-pressed','false');const icon=document.createElement('span');icon.className='icon';icon.textContent=entry.icon;icon.setAttribute('aria-hidden','true');const content=document.createElement('span');content.textContent=entry.name;const hint=document.createElement('small');hint.textContent=entry.description;content.append(hint);button.append(icon,content);button.onclick=()=>select(entry.id);$('components').append(button);}
  const ended=()=>!playing&&settings.autoExit&&!settings.loop&&time>=C.total(settings)-.001;
  function action(type){if(!ready)return;if(type==='pause'&&ended())type='replay';if(type==='pause')playing=!playing;send(type,type==='pause'?{playing}:{});if(type==='exit'){settings.autoExit=true;save();const control=$('timing').querySelector('[name=autoExit]');if(control)control.checked=true;}}
  $('replay').onclick=()=>action('replay');$('pause').onclick=()=>action('pause');$('stable').onclick=()=>action('stable');$('exit').onclick=()=>action('exit');$('previous').onclick=()=>{if(ready)send('step',{frames:-1});};$('next').onclick=()=>{if(ready)send('step',{frames:1});};$('snapshot').onclick=()=>{if(ready)send('snapshot');};
  $('timeline').oninput=event=>{if(ready)send('seek',{time:Number(event.target.value)});};
  $('output').addEventListener('click',()=>{flushNumbers();updateLinks();});
  $('copy').onclick=async()=>{flushNumbers();try{await navigator.clipboard.writeText(outputURL());toast('已复制 1920 × 1080 纯画面地址。');}catch{toast('复制受限，可打开录制画面后复制浏览器地址。');}};
  $('reset').onclick=()=>{settings={...item.defaults};save();select(id);toast('已恢复「'+item.name+'」的默认录制设置。');};
  function download(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  $('export').onclick=()=>{flushNumbers();const all=Object.fromEntries(C.entries.map(entry=>[entry.id,C.clean(entry.id,saved[entry.id])]));download(new Blob([JSON.stringify({format:'control-component-monitor',version:1,components:all},null,2)],{type:'application/json'}),'Control-组件录制设置.json');toast('已导出全部组件录制设置，不包含本地音频和封面。');};
  $('import').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>200000)throw Error('请选择 200 KB 以内的设置文件。');const raw=JSON.parse(await file.text());if(!raw||raw.format!=='control-component-monitor'||raw.version!==1||!raw.components||typeof raw.components!=='object'||Array.isArray(raw.components))throw Error('这不是组件监视面板的设置文件。');const next={...saved};let imported=0;for(const entry of C.entries)if(Object.hasOwn(raw.components,entry.id)){const value=raw.components[entry.id];if(!value||typeof value!=='object'||Array.isArray(value))throw Error('「'+entry.name+'」的设置格式不正确。');next[entry.id]=C.clean(entry.id,value);imported++;}if(!imported)throw Error('文件没有可读取的组件设置。');try{writeBundle(next);}catch{throw Error('本机存储不可用，请先导出当前设置。');}saved=next;dirtyStorage=false;select(id);toast('已导入 '+imported+' 个组件的录制设置。');}catch(error){toast('未导入，原设置已保留。'+(error.name==='SyntaxError'?'JSON 文件内容不完整。':error.message));}event.target.value='';};
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==$('preview').contentWindow||event.data?.id!==id||event.data?.controller!==controller||event.data?.view!==view)return;const data=event.data;
    if(data.channel==='control-monitor-snapshot'){if(data.blob instanceof Blob)download(data.blob,'Control-'+id+'-'+time.toFixed(2)+'s.png');return;}
    if(data.channel!=='control-monitor-status')return;if(data.error){failed(data.error);return;}
    if(data.ready){clearTimeout(loadTimer);setReady(true);$('monitorRetry').hidden=true;$('status').dataset.error='false';if(coverFile&&id==='music')send('cover',{blob:coverFile});}
    if(Number.isFinite(data.time))time=data.time;playing=!!data.playing;$('pause').textContent=ended()?'再播放':playing?'暂停':'继续';const total=Number.isFinite(data.total)?data.total:C.total(settings);$('time').textContent=time.toFixed(2)+' / '+(!settings.autoExit&&!settings.loop?'持续':total.toFixed(2))+' s';$('timeline').max=Math.max(total,time);$('timeline').value=time;
    if(ready){const at=time-settings.lead;$('status').textContent=ended()?'播放完毕':!playing?'已暂停':at<0?'开场留空':at<settings.entry?'入场':at<settings.entry+settings.hold?'持续动效':settings.autoExit?'退场 / 尾部留空':'持续动效';}
  });
  document.addEventListener('keydown',event=>{if(event.defaultPrevented||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||!ready||event.target.closest?.('input,textarea,select,button,a,summary,[contenteditable=true]'))return;const type={r:'replay',R:'replay',' ':'pause',e:'exit',E:'exit'}[event.key];if(type){event.preventDefault();action(type);}if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();send('step',{frames:event.key==='ArrowRight'?1:-1});}});
  $('audio-file').onchange=event=>{const file=event.target.files[0];if(!file)return;if(file.type&&!file.type.startsWith('audio/')){toast('请选择音频文件。');event.target.value='';return;}stopAudio();if(audioURL)URL.revokeObjectURL(audioURL);audioURL=URL.createObjectURL(file);$('audio').src=audioURL;settings.audioMode='audio';settings.title=file.name.replace(/\.[^.]+$/,'');save();fields($('specific'),item.fields);toast('已载入音频，点击播放器开始播放。');};
  $('cover-file').onchange=event=>{const file=event.target.files[0];if(!file)return;if(!file.type.startsWith('image/')||file.size>20000000){toast('请选择 20 MB 以内的图片。');event.target.value='';return;}coverFile=file;send('cover',{blob:file});};
  $('audio').onplay=async()=>{
    if(id!=='music'||settings.audioMode!=='audio'){stopAudio();return;}
    try{
      if(!audioContext){audioContext=new AudioContext();analyser=audioContext.createAnalyser();analyser.fftSize=8192;analyser.smoothingTimeConstant=.35;const source=audioContext.createMediaElementSource($('audio'));source.connect(analyser);analyser.connect(audioContext.destination);
        if(audioContext.audioWorklet&&typeof AudioWorkletNode==='function')clockAttempt=audioContext.audioWorklet.addModule('monitor-audio-clock-worklet.js').then(()=>{if(disposed)return;audioClock=new AudioWorkletNode(audioContext,'control-monitor-clock');audioClock.port.onmessage=()=>sampleAudio(performance.now());source.connect(audioClock);audioClock.connect(audioContext.destination);configureClock();}).catch(()=>{if(audioClock){audioClock.port.close();audioClock.disconnect();audioClock=null;}});
      }
      await audioContext.resume();if(clockAttempt)await clockAttempt;configureClock();
    }catch(error){stopAudio();toast('音频分析不可用，请再次点击播放或更换浏览器。');}
  };
  $('audio').addEventListener('pause',quietAudio);$('audio').addEventListener('ended',quietAudio);
  $('audio').addEventListener('error',()=>{stopAudio();toast('音频无法读取，请换用浏览器支持的 MP3、WAV 或其他音频格式。');});
  const db=new Float32Array(4096);
  function sampleAudio(now){if(disposed||!analyser||id!=='music'||settings.audioMode!=='audio'||$('audio').paused||now-audioLast<1000/Math.min(60,Number(settings.fps)||60)-1)return;audioLast=now;analyser.getFloatFrequencyData(db);const levels=new Float32Array(240);for(let i=0;i<240;i++){const hz=30*Math.pow(18000/30,i/239),bin=hz/audioContext.sampleRate*8192,index=Math.floor(bin),fraction=bin-index,a=Number.isFinite(db[index])?db[index]:-100,b=Number.isFinite(db[index+1])?db[index+1]:-100;levels[i]=Math.max(0,Math.min(1,(a*(1-fraction)+b*fraction+72)/60));}send('audio',{levels:Array.from(levels),position:$('audio').currentTime,duration:$('audio').duration});}
  function audioTick(now){if(disposed)return;audioFrame=requestAnimationFrame(audioTick);if(!audioClock)sampleAudio(now);}
  audioFrame=requestAnimationFrame(audioTick);
  window.addEventListener('pagehide',()=>{stopAudio();disposed=true;cancelAnimationFrame(audioFrame);clearTimeout(loadTimer);clearTimeout(toastTimer);channel?.close();if(audioClock){audioClock.port.onmessage=null;audioClock.port.close();audioClock.disconnect();audioClock=null;}audioContext?.close().catch(()=>{});if(audioURL)URL.revokeObjectURL(audioURL);});
  select(item.id);
})();
