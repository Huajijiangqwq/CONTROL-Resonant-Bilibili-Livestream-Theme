/* Recording workbench. Its settings never write to the live theme document. */
(() => {
  'use strict';
  const number = (key,label,min,max,step=1) => ({key,label,type:'number',min,max,step});
  const text = (key,label) => ({key,label,type:'text'});
  const select = (key,label,options) => ({key,label,type:'select',options});
  const common = {x:960,y:540,width:850,height:540,background:'transparent',fps:60,lead:1,entry:1,hold:6,exit:1,autoExit:true,loop:false,speed:1,sender:'调查员 07',message:'欢迎来到太古屋',fontSize:38};
  const fleet = rank => ({rank,width:1000,entry:rank==='governor'?4.9:rank==='admiral'?2.8:2.2,hold:6,signal:true,nameSize:38,titleSize:46});
  const entries = [
    ['normal','普通弹幕','三角转动、署名与正文写入','▽',{width:840,entry:.22,hold:5,fontSize:40},[text('sender','用户名'),text('message','弹幕正文'),number('fontSize','字号',16,100)]],
    ['gift','礼物档案','原物证照片 · 档案显影与退场','▤',{width:900,entry:.8,giftName:'能量电池',quantity:10,value:1000},[text('giftName','礼物名称'),text('sender','赠送者'),number('quantity','数量',1,999999),number('value','价值 / 电池',0,999999999)]],
    ['sc','SC / 希斯','七档强度 · 入场、持续流纹与消散','SC',{width:820,height:260,entry:1,hold:8,exit:1.2,tier:100,strength:46,reach:68,textWarp:40,red:62,dispersion:34,ghost:20,flowSpeed:36},[select('tier','SC 档位',[[2,'¥ 2'],[30,'¥ 30'],[50,'¥ 50'],[100,'¥ 100'],[500,'¥ 500'],[1000,'¥ 1000'],[2000,'¥ 2000']]),text('sender','用户名'),text('message','SC 正文'),number('strength','流纹强度',0,140),number('reach','影响范围',0,200),number('textWarp','文字折射',0,100),number('red','红色强度',0,100),number('dispersion','边缘色散',0,100),number('flowSpeed','流速',0,100)]],
    ['captain','开通舰长','舰长徽记与原片碎光','Ⅰ',fleet('captain'),[text('sender','用户名'),number('nameSize','用户名字号',20,80),number('titleSize','开通提示字号',24,80)]],
    ['admiral','开通提督','更强碎光、数字错位与 VHS','Ⅱ',fleet('admiral'),[text('sender','用户名'),number('nameSize','用户名字号',20,80),number('titleSize','开通提示字号',24,80),{key:'signal',label:'区域信号干扰',type:'checkbox'}]],
    ['governor','开通总督','完整 FBC 插播与总督显形','Ⅲ',fleet('governor'),[text('sender','用户名'),number('nameSize','用户名字号',20,80),number('titleSize','开通提示字号',24,80),{key:'signal',label:'区域信号干扰',type:'checkbox'}]],
    ['fbc','FBC 插播','原联邦控制局标志 · 复古信号','FBC',{width:1920,height:1080,entry:.18,hold:1.5,exit:.1},[]],
    ['resonance','希斯共振','独立连续流场 · 可改发射点','≈',{width:1280,height:720,entry:1,hold:15,autoExit:false,density:1.2,warp:1,spread:1,anchorX:55,anchorY:50,drive:.15},[number('density','流纹密度',0,3,.05),number('warp','扭曲程度',0,3,.05),number('spread','扩散范围',.2,3,.05),number('anchorX','发射点 X / %',0,100),number('anchorY','发射点 Y / %',0,100),number('drive','音频驱动模拟',0,1,.05)]],
    ['music','Now Playing','正式音乐皮肤 · 可加载本地音频','♫',{width:1550,entry:.8,hold:60,autoExit:false,title:'Take Control',artist:'Old Gods of Asgard',texture:.65,flow:1,audioMode:'demo'},[text('title','歌名'),text('artist','歌手'),number('texture','材质强度',0,1,.05),number('flow','流纹强度',0,2,.05),select('audioMode','频谱来源',[['demo','节奏演示（无音频）'],['audio','本地音频'],['silent','静音']])]],
    ['frame','边框 / HUD','按实际尺寸重绘 · 无拉伸变形','□',{width:1420,height:800,autoExit:false,stroke:1.5,grain:.4,trace:.14,corners:true},[number('height','高度 / px',40,1080),number('stroke','线宽',.5,8,.5),number('grain','边缘颗粒',0,1,.05),number('trace','游走微光',0,1,.05),{key:'corners',label:'内侧角标',type:'checkbox'}]],
    ['logo','官方双 Logo','官方中英标志 · 左右排列','C',{width:1100,autoExit:false},[]],
    ['title','主播与标题','自适应白底标题条','T',{width:1300,autoExit:false,title:'今晚继续探索',fontSize:38},[text('sender','主播名'),text('title','直播标题'),number('fontSize','字号',20,80)]],
    ['timer','直播计时','可设起始时长 · 实时递增','◷',{width:680,autoExit:false,startSeconds:0,fontSize:48},[number('startSeconds','起始时间 / 秒',0,999999),number('fontSize','字号',20,100)]],
    ['heading','通讯标题','通讯记录标题与红线','—',{width:700,autoExit:false,title:'通讯记录',fontSize:56},[text('title','标题'),number('fontSize','字号',20,100)]]
  ].map(([id,name,description,icon,defaults,fields])=>({id,name,description,icon,defaults:{...common,...defaults},fields}));
  entries.find(e=>e.id==='sc').fields.push(number('height','卡片高度 / px',200,700));
  entries.find(e=>e.id==='sc').fields.push(number('ghost','残影强度',0,100));
  entries.find(e=>e.id==='resonance').fields.push(number('height','区域高度 / px',100,1080));
  entries.find(e=>e.id==='resonance').defaults.spread=2;
  const tiers={2:[24,44,28,48,24,9,28],30:[32,54,33,56,28,13,30],50:[39,62,37,60,32,17,33],100:[46,68,40,62,34,20,36],500:[60,85,43,72,43,29,39],1000:[74,106,46,83,52,39,42],2000:[88,126,48,92,62,49,45]};
  const shared=[number('x','中心 X / px',-1920,3840),number('y','中心 Y / px',-1080,2160),number('width','组件宽度 / px',100,3000),select('background','录制背景',[['transparent','透明'],['black','纯黑'],['green','绿幕'],['game','游戏示例']]),select('fps','帧率上限',[[60,'60 FPS'],[30,'30 FPS'],[24,'24 FPS']]),number('lead','开场留空 / 秒',0,30,.1),number('entry','入场时长 / 秒',.05,20,.05),number('hold','停留时长 / 秒',.1,600,.1),number('exit','退场时长 / 秒',.1,10,.1),{key:'autoExit',label:'到时退场',type:'checkbox'},{key:'loop',label:'循环播放',type:'checkbox'},select('speed','播放速度',[[1,'1×'],[.5,'0.5×'],[.25,'0.25×'],[2,'2×']])];
  function clean(id,raw={}) {
    const item=entries.find(e=>e.id===id)||entries[0],out={...item.defaults};
    for(const f of [...shared,...item.fields]){
      if(!(f.key in raw))continue;const v=raw[f.key];
      if(f.type==='number'&&Number.isFinite(Number(v)))out[f.key]=Math.min(f.max,Math.max(f.min,Number(v)));
      else if(f.type==='checkbox')out[f.key]=v===true;
      else if(f.type==='text')out[f.key]=String(v).slice(0,300);
      else if(f.type==='select'){const found=f.options.find(([key])=>String(key)===String(v));if(found)out[f.key]=found[0];}
    }
    return out;
  }
  function total(s){return s.lead+s.entry+s.hold+(s.autoExit?s.exit+1:0);}
  window.MonitorCatalog={entries,shared,tiers,clean,total};
})();
