// Code MIT. Game-localized titles remain with their original rights holders.
(function(root){
  'use strict';
  const entries=Object.freeze([
    {id:'oldest-house',kind:'localized-ui',label:'游戏中文原文 · 任务标题',body:'欢迎来到太古屋',source:'https://www.gamersky.com/handbook/201908/1213260.shtml'},
    {id:'unknown-caller',kind:'localized-ui',label:'游戏中文原文 · 任务标题',body:'未知的呼叫者',source:'https://www.gamersky.com/handbook/201908/1213260_3.shtml'},
    {id:'director-override',kind:'localized-ui',label:'游戏中文原文 · 任务标题',body:'局长超控',source:'https://www.gamersky.com/handbook/201908/1213260_6.shtml'},
    {id:'finnish-tango',kind:'localized-ui',label:'游戏中文原文 · 任务标题',body:'芬兰探戈',source:'https://www.gamersky.com/handbook/201908/1213260_28.shtml'},
    {id:'control-point',kind:'fan-message',label:'日常弹幕 · 使用游戏术语',body:'先去控制点，再继续探索太古屋。'},
    {id:'hiss',kind:'fan-message',label:'日常弹幕 · 使用游戏术语',body:'前面有希斯，小心。'},
    {id:'altered-item',kind:'fan-message',label:'日常弹幕 · 使用游戏术语',body:'发现异化物，先保持距离。'},
    {id:'hotline',kind:'fan-message',label:'日常弹幕 · 使用游戏术语',body:'热线电话又响了。'},
  ].map(Object.freeze));
  const api={entries,names:Object.freeze(['太古屋访客','控制局实习生','研究部值班员','北极星','太古屋来客'])};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {
    root.RemedyPresets=api;
    function attach(){
      const target=document.getElementById('testBody')||document.getElementById('message');
      if(!target)return;
      const select=document.createElement('select');select.setAttribute('aria-label','中文预设弹幕');select.title='游戏汉化原文与日常弹幕分开标注；不会改写已有输入。';
      const placeholder=new Option('选择中文预设…','');select.add(placeholder);
      for(const kind of ['localized-ui','fan-message']){
        const group=document.createElement('optgroup');group.label=entries.find(e=>e.kind===kind).label;
        for(const entry of entries.filter(e=>e.kind===kind))group.append(new Option(entry.body,entry.id));
        select.append(group);
      }
      select.style.maxWidth='230px';select.style.minWidth='120px';
      select.addEventListener('change',()=>{const entry=entries.find(e=>e.id===select.value);if(entry){target.value=entry.body;target.dispatchEvent(new Event('input',{bubbles:true}));}select.value='';});
      (target.id==='testBody'?target:target.parentElement).insertAdjacentElement('afterend',select);
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach);else attach();
  }
})(globalThis);
