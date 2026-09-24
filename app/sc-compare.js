/* A single native SC renderer with a repeatable, fixed conversation for all tiers.
   Settings and time belong only to this page; no live theme or messages are changed. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('comparison'), ctx = canvas.getContext('2d');
  const W = 760, H = 940, Q = 1.5, WIDTH = 490, CENTER = 467;
  const ENTRY = 1000, EXIT = SCExit.duration, SEED = 2.31;
  const amounts = Object.keys(MonitorCatalog.tiers).map(Number);
  const keys = ['strength','reach','textWarp','red','dispersion','ghost','speed'];
  const params = new URLSearchParams(location.search);
  const requested = Number(params.get('tier'));
  if (amounts.includes(requested)) $('tier').value = String(requested);
  $('entrance').checked = params.get('entry') === '1';
  $('outro').checked = params.get('exit') === '1';
  if (params.has('hold')) $('hold').value = String(Math.max(1,Math.min(600,Number(params.get('hold')) || 8)));
  const conversation = [
    {sender:'小北',body:'欢迎来到太古屋'},
    {sender:'白噪声',body:'先去控制点，再继续探索太古屋。'},
    {sender:'回声',body:'前面有希斯，小心。'},
    {sender:'调查员 12',body:'热线电话又响了。'},
  ].map(message => ({...message,model:NormalNotice.measure({...message,width:WIDTH,fontSize:25,lineHeight:146,main:true,bodyWeight:600})}));
  let layer, layout, data, fx, clock = 0, paused = false, forceStable = false, manualExit = null;
  let last = null, rendered = -Infinity, lastUI = -Infinity, phase = '', raf, disposed = false;
  const holdMs = () => Math.max(1,Math.min(600,Number($('hold').value) || 8))*1000;
  const entryMs = () => $('entrance').checked ? ENTRY : 0;

  function writeURL() {
    const url = new URL(location.href);
    url.searchParams.set('tier',$('tier').value);
    url.searchParams.set('entry',$('entrance').checked?'1':'0');
    url.searchParams.set('exit',$('outro').checked?'1':'0');
    url.searchParams.set('hold',String(holdMs()/1000));
    if (document.body.classList.contains('pure')) url.searchParams.set('pure','1');
    else url.searchParams.delete('pure');
    history.replaceState(null,'',url);
  }
  function syncControls() {
    const amount = Number($('tier').value), index = amounts.indexOf(amount);
    $('tierTitle').textContent = '¥ '+amount;
    $('lower').disabled = index === 0;
    $('higher').disabled = index === amounts.length-1;
    $('hold').disabled = !$('outro').checked;
    $('timingNote').textContent = forceStable ? '稳定段已锁定。点击“重新播放”恢复所选进退场流程。' : $('outro').checked
      ? `稳定停留 ${holdMs()/1000} 秒后播放退场。切换档位会从相同起点重播。`
      : '当前持续展示稳定流纹，不自动消失。';
    $('pause').textContent = paused ? '继续' : '暂停';
    $('pause').setAttribute('aria-pressed',String(paused));
    writeURL();
  }
  function rebuild() {
    layer?.dispose();
    fx = Object.fromEntries(keys.map((key,i)=>[key,MonitorCatalog.tiers[$('tier').value][i]]));
    data = {sender:'调查员 07',body:'前面有希斯，小心。\n先去控制点，再继续探索太古屋。',amount:Number($('tier').value),duration:holdMs()/1000,page:0};
    // Use exactly the same part layout for every amount, including the highest tier.
    layout = SCComponentParts.measure({width:WIDTH-54,data,style:{fontSize:26,bodyWeight:600,linePercent:146,parts:ThemeEditorModel.normalizeParts(null,'sc')},viewportHeight:720,halo:80});
    layer = HissSimulation.createLayer({
      width:WIDTH,height:layout.height,quality:Q,fx,seed:SEED,continuousTime:true,
      background:'#0e100f',nameBand:layout.nameBand,progress:layout.progress,
      paint:(c,r,remaining)=>SCComponentParts.paint(c,r,layout,data,remaining,ENTRY,clock),
    });
    clock = 0; manualExit = null; forceStable = false; last = null; rendered = -Infinity; lastUI = -Infinity;
    syncControls(); draw();
  }
  function stateAt() {
    const start = entryMs();
    const scheduled = $('outro').checked && !forceStable ? start + holdMs() : Infinity;
    const exitStart = manualExit ?? scheduled;
    const exitAge = clock >= exitStart ? clock-exitStart : -1;
    const motionAge = forceStable || !start ? ENTRY : Math.min(ENTRY,clock);
    const completed = exitAge >= EXIT;
    return {exitAge,motionAge,completed,
      phase:completed?'已退场':exitAge>=0?'退场消散':motionAge<ENTRY?'进场演变':'稳定流动',
      remaining:exitAge>=0?0:$('outro').checked&&!forceStable?Math.max(0,(scheduled-Math.max(start,clock))/1000):holdMs()/1000,
      // Skipping the entrance evaluates a complete native field, never a CSS fade.
      age:clock+(forceStable||!start?1800:0),
    };
  }
  function draw() {
    if (disposed) return;
    const s=stateAt();
    ctx.setTransform(Q,0,0,Q,0,0);
    ctx.fillStyle='#0e100f';ctx.fillRect(0,0,W,H);
    const left=(W-WIDTH-112)/2, x=left+83, cardY=CENTER-layout.height/2;
    ctx.textBaseline='top';ctx.textAlign='left';ctx.fillStyle='#edeee6';
    ctx.font='800 34px "Microsoft YaHei",sans-serif';ctx.fillText('通讯记录',x,58);
    ctx.fillStyle='#353a36';ctx.fillRect(x,108,WIDTH-54,1);
    ctx.fillStyle='#d94d41';ctx.fillRect(x,108,128,4);
    const occupancy=s.completed?0:s.exitAge>=0?SCExit.occupied(s.exitAge):HissSimulation.occupied(s.motionAge,layout.height,fx);
    // Reserve a normal message gap after the SC vanishes; its optical overlap
    // belongs to the stable card, not to the final context-only arrangement.
    const compression=Math.max(0,layout.height-30)*(1-occupancy)/2;
    const upperNear=cardY-conversation[1].model.height+13+compression;
    const lowerNear=cardY+layout.height-2-compression;
    const positions=[upperNear-conversation[0].model.height-12,upperNear,lowerNear,lowerNear+conversation[2].model.height+12];
    conversation.forEach((message,i)=>NormalNotice.draw(ctx,{x,y:positions[i],age:1000,model:message.model}));
    // Drawing after the context lets the original optical shader sample and refract it.
    if (!s.completed) layer.draw(ctx,left,cardY-HissSimulation.padding,s.age,s.remaining,Q,s.exitAge,-1,s.motionAge);
    if (phase!==s.phase || clock-lastUI>80 || lastUI<0) {
      phase=s.phase;lastUI=clock;
      $('phase').textContent=s.phase;
      $('elapsed').textContent=(clock/1000).toFixed(2)+' s';
      $('exit').disabled=!$('outro').checked||s.exitAge>=0;
      canvas.setAttribute('aria-label',`¥ ${data.amount} SC · ${s.phase} · ${Math.floor(clock/100)/10} 秒 · 固定上下文 4 条`);
      $('renderStatus').textContent=layer.kind==='native'?'原生 SC 流场 · 上下文折射 · 60 FPS 上限':'当前仅显示简化效果：请开启浏览器硬件加速以查看完整流纹。';
    }
  }
  function restart() { paused=false;rebuild(); }
  function showStable() {rebuild();forceStable=true;paused=false;clock=0;syncControls();draw();}
  function togglePause() {paused=!paused;last=null;syncControls();}
  function switchTier(step) {const i=amounts.indexOf(Number($('tier').value));$('tier').value=String(amounts[Math.max(0,Math.min(amounts.length-1,i+step))]);rebuild();}
  function setPure(on) {document.body.classList.toggle('pure',on);$('showControls').hidden=!on;writeURL();}
  $('tier').addEventListener('change',rebuild);
  $('entrance').addEventListener('change',restart);
  $('outro').addEventListener('change',restart);
  $('hold').addEventListener('change',()=>{$('hold').value=String(holdMs()/1000);restart();});
  $('lower').addEventListener('click',()=>switchTier(-1));
  $('higher').addEventListener('click',()=>switchTier(1));
  $('replay').addEventListener('click',restart);
  $('pause').addEventListener('click',togglePause);
  $('stable').addEventListener('click',showStable);
  $('exit').addEventListener('click',()=>{if(!$('outro').checked)return;clock=Math.max(clock,entryMs());manualExit=clock;paused=false;syncControls();draw();});
  $('pure').addEventListener('click',()=>setPure(true));
  $('showControls').addEventListener('click',()=>setPure(false));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){setPure(false);return;}
    if(event.target.closest('input,select,textarea,button,a'))return;
    if(event.code==='Space'){event.preventDefault();togglePause();}
    if(event.key.toLowerCase()==='r')restart();
  });
  document.addEventListener('visibilitychange',()=>{last=null;});
  window.addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(raf);layer?.dispose();},{once:true});
  function tick(now) {
    if(disposed)return;
    raf=requestAnimationFrame(tick);
    if(document.hidden){last=null;return;}
    const delta=last===null?0:Math.min(now-last,100);last=now;
    if(!paused&&!stateAt().completed)clock+=delta;
    if(now-rendered>=1000/60-.5){if(!paused)draw();rendered=now;}
  }
  try {rebuild();setPure(params.get('pure')==='1');raf=requestAnimationFrame(tick);}
  catch(error){$('phase').textContent='预览未能启动';$('renderStatus').textContent=error.message;$('renderStatus').classList.add('error');console.error(error);}
})();
