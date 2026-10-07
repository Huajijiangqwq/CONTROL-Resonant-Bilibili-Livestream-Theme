/* Task-based controls for ordinary preview pages; output surfaces are untouched. */
(() => {
  'use strict';
  const params=new URLSearchParams(location.search);
  if(['obs','pure','embedded','editor','libraryPreview'].some(key=>params.has(key)))return;
  const page=location.pathname.split('/').pop();
  const live=page==='live.html',music=page==='now-playing.html';
  if(!live&&!music)return;
  const host=document.querySelector(live?'.editor-scroll':'aside .controls');
  if(!host)return;
  document.body.classList.add(live?'studio-controls-live':'studio-controls-music');
  const development=window.ThemeDevelopment===true;
  const groups=live?[['live','直播'],['look','画面'],['audio','音频'],['test',development?'测试':'消息']]:[['source','歌曲'],['audio','音频'],['look','画面'],['output','输出']];
  const nav=document.createElement('nav');nav.className='studio-control-tabs';nav.setAttribute('aria-label','设置分组');
  const note=document.createElement('p');note.className='studio-control-empty';note.hidden=true;
  const buttons=new Map();let active=groups[0][0],sections=[];
  const key='control-settings-tab-'+(live?'live':'music');
  try{const stored=sessionStorage.getItem(key);if(groups.some(g=>g[0]===stored))active=stored;}catch{}
  function category(section){
    const title=section.querySelector('h1,h2,summary')?.textContent||'';
    if(live){
      if(section.classList.contains('local-message-section')||section.querySelector('#liveTestMirroring'))return'test';
      if(/音频/.test(title))return'audio';
      if(/本地消息/.test(title))return'test';
      if(/画面设置|Now Playing|界面动效|自定义画布|提示的停留|动画帧率/.test(title))return'look';
      return'live';
    }
    if(/声音|音频|频谱|频段/.test(title))return'audio';
    if(/质感|画面|流纹|录像/.test(title))return'look';
    if(/OBS|输出/.test(title))return'output';
    return'source';
  }
  function apply(){
    for(const section of sections)section.dataset.controlHidden=String(category(section)!==active);
    for(const [id,b]of buttons){b.setAttribute('aria-selected',String(id===active));b.tabIndex=id===active?0:-1;}
    const available=sections.filter(s=>category(s)===active&&!s.hidden&&s.style.display!=='none');
    note.hidden=available.length>0;
    note.textContent=live&&params.has('published')?'此画面来自编辑器。布局与外观请在编辑器调整，再应用到直播。':'当前分组没有可调整的项目。';
    try{sessionStorage.setItem(key,active);}catch{}
  }
  nav.setAttribute('role','tablist');
  groups.forEach(([id,label],index)=>{
    const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('role','tab');
    b.onclick=()=>{active=id;apply();host.scrollTop=0;};
    b.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const i=event.key==='Home'?0:event.key==='End'?groups.length-1:(index+(event.key==='ArrowRight'?1:groups.length-1))%groups.length;active=groups[i][0];apply();buttons.get(active).focus();}};
    buttons.set(id,b);nav.append(b);
  });
  function refresh(){
    sections=[...host.children].filter(n=>n.matches(live?'.control-section':'section'));
    if(host.firstElementChild!==nav)host.prepend(nav);
    if(note.parentElement!==host)host.append(note);
    apply();
  }
  new MutationObserver(refresh).observe(host,{childList:true});
  if(live&&!development){
    for(const id of ['demoButton','autoChat','audioTest','shortSc','zoneReplay','scCarouselDemo']){const control=document.getElementById(id);if(control){control.hidden=true;control.dataset.developmentControl='true';}}
    for(const button of document.querySelectorAll('[id^="band"][id$="-test"]')){button.hidden=true;button.dataset.developmentControl='true';}
    const localHeading=document.querySelector('.local-message-section h2');if(localHeading)localHeading.textContent='发送一条检查消息';
  }
  refresh();
})();
