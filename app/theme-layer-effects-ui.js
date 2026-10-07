/* Ordered layer styles. Legacy color/blur/shadow records keep their IDs and order. */
(() => {
  'use strict';
  const expanded = new Set(), choices = new Map();
  const labels = { brightness:'亮度',contrast:'对比度',saturation:'饱和度',hue:'色相',sepia:'褪色',radius:'大小',amount:'大小',size:'大小',x:'水平偏移',y:'垂直偏移',opacity:'不透明度',angle:'角度',spread:'扩展' };
  const groups = [
    ['轮廓与光影',['stroke','innerGlow','outerGlow','shadow']],
    ['颜色与质感',['colorOverlay','gradientOverlay','color','blur']],
  ];
  function mount(root,{get,begin,change,end}) {
    const layer=get(), F=window.ThemeLayerEffects;
    if(!layer||!F?.supported(layer.type))return;
    const disabled=!!layer.locked, items=F.normalize(layer.effects), maximum=F.maxEffects||6;
    const section=document.createElement('section'); section.className='property-section layer-effects layer-styles';
    const heading=document.createElement('h3');heading.textContent='图层样式';section.append(heading);
    const note=document.createElement('p');note.className='property-note';note.textContent='按从上到下的顺序叠加，关闭总开关可对照本组样式。';section.append(note);
    function editable(){const current=get();return !disabled&&current?.id===layer.id&&!current.locked?current:null;}
    function edit(fn){if(!editable())return;begin();change(fn);end();}
    const top=document.createElement('div');top.className='layer-style-master';
    const master=document.createElement('label'),enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=layer.effectsEnabled!==false;enabled.disabled=disabled;
    enabled.setAttribute('aria-label','启用图层样式');enabled.onchange=()=>edit(current=>{current.effectsEnabled=enabled.checked;});
    master.append(enabled,document.createTextNode('启用图层样式'));
    const count=document.createElement('span');count.className='effect-count';count.textContent=items.length+' / '+maximum;count.title='可叠加的图层样式数量';
    top.append(master,count);section.append(top);
    if(layer.effectsEnabled===false){const paused=document.createElement('p');paused.className='effect-bypass-note';paused.textContent='本组样式已关闭，参数仍然保留。';section.append(paused);}
    const tools=document.createElement('div');tools.className='effect-stack-toolbar';
    const choice=document.createElement('select');choice.setAttribute('aria-label','选择图层样式');choice.disabled=disabled||items.length>=maximum;
    const added=new Set();
    for(const [name,types]of groups){
      const supported=types.filter(type=>F.types.includes(type));if(!supported.length)continue;
      const group=document.createElement('optgroup');group.label=name;
      for(const type of supported){group.append(new Option(F.names[type]||type,type));added.add(type);}choice.append(group);
    }
    for(const type of F.types)if(!added.has(type))choice.append(new Option(F.names[type]||type,type));
    const remembered=choices.get(layer.id);choice.value=F.types.includes(remembered)?remembered:(F.types.includes('stroke')?'stroke':F.types[0]);
    choice.onchange=()=>{choices.set(layer.id,choice.value);if(choices.size>200)choices.delete(choices.keys().next().value);};
    const add=document.createElement('button');add.type='button';add.textContent='添加样式';add.disabled=disabled||items.length>=maximum;
    add.title=items.length>=maximum?'最多叠加 '+maximum+' 项，请先移除不需要的样式':'添加所选图层样式';
    add.onclick=()=>{const item=F.create(choice.value,'fx-'+crypto.randomUUID());if(!item)return;expanded.add(layer.id+':'+item.id);edit(current=>{current.effects=[...(current.effects||[]),item];});};
    tools.append(choice,add);section.append(tools);
    const list=document.createElement('div');list.className='effect-stack-list';
    if(!items.length){const empty=document.createElement('p');empty.className='effect-empty';empty.textContent='先添加一项样式，保留原始素材并实时预览。';list.append(empty);}
    function colorField(effect,key,body){
      const label=document.createElement('label');label.className='effect-color-field';
      const two=Object.keys(effect).filter(name=>/^(color\d*|startColor|endColor)$/.test(name)&&/^#[a-f0-9]{6}$/i.test(effect[name]||'')).length>1;
      const last=key==='color2'||key==='endColor',text=two?(last?'结束颜色':'起始颜色'):effect.type==='shadow'?'投影颜色':'颜色';
      label.append(document.createTextNode(text));
      const row=document.createElement('div');row.className='effect-color-row';
      const swatch=document.createElement('input'),hex=document.createElement('input');swatch.type='color';hex.type='text';hex.maxLength=7;hex.spellcheck=false;hex.placeholder='#RRGGBB';
      swatch.value=effect[key];hex.value=effect[key];swatch.disabled=hex.disabled=disabled;
      swatch.setAttribute('aria-label',(F.names[effect.type]||effect.type)+' '+text);hex.setAttribute('aria-label',(F.names[effect.type]||effect.type)+' '+text+' 十六进制');
      let changing=false;
      function update(value,fromHex=false){
        let color=String(value).trim().replace(/^#/,'');if(/^[a-f0-9]{3}$/i.test(color))color=color.split('').map(c=>c+c).join('');
        if(!/^[a-f0-9]{6}$/i.test(color)){if(fromHex)hex.setAttribute('aria-invalid','true');return;}
        color='#'+color.toLowerCase();hex.removeAttribute('aria-invalid');
        const current=editable()?.effects?.find(item=>item.id===effect.id);if(!current)return;
        if(current[key]!==color){if(!changing){begin();changing=true;}change(layer=>{const item=layer.effects.find(item=>item.id===effect.id);if(item)item[key]=color;});}
        swatch.value=color;if(!fromHex)hex.value=color;
      }
      function finish(){const current=get()?.effects?.find(item=>item.id===effect.id);if(current){swatch.value=current[key];hex.value=current[key];}hex.removeAttribute('aria-invalid');if(changing){changing=false;end({fields:false});}}
      swatch.oninput=()=>update(swatch.value);swatch.onchange=finish;swatch.onblur=finish;
      hex.oninput=()=>update(hex.value,true);hex.onchange=finish;hex.onblur=finish;
      hex.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();update(hex.value,true);finish();hex.blur();}};
      row.append(swatch,hex);label.append(row);body.append(label);
    }
    items.forEach((effect,index)=>{
      const card=document.createElement('details');card.className='effect-card';card.dataset.enabled=String(effect.enabled);card.dataset.style=effect.type;
      const openKey=layer.id+':'+effect.id;card.open=expanded.has(openKey);
      card.ontoggle=()=>{if(card.open)expanded.add(openKey);else expanded.delete(openKey);};
      const summary=document.createElement('summary'),check=document.createElement('input');check.type='checkbox';check.checked=effect.enabled;check.disabled=disabled;
      check.setAttribute('aria-label','启用'+F.names[effect.type]);check.onclick=event=>event.stopPropagation();check.onchange=()=>edit(current=>{const item=current.effects.find(item=>item.id===effect.id);if(item)item.enabled=check.checked;});
      const title=document.createElement('span');title.className='effect-title';title.textContent=F.names[effect.type]||effect.type;
      summary.append(check,title);
      const action=(name,text,fn,inactive=false)=>{const button=document.createElement('button');button.type='button';button.textContent=text;button.title=name;button.setAttribute('aria-label',name);button.disabled=disabled||inactive;button.onclick=event=>{event.preventDefault();event.stopPropagation();edit(fn);};summary.append(button);};
      action('上移'+F.names[effect.type],'↑',current=>{const at=current.effects.findIndex(item=>item.id===effect.id);if(at>0)[current.effects[at-1],current.effects[at]]=[current.effects[at],current.effects[at-1]];},index===0);
      action('下移'+F.names[effect.type],'↓',current=>{const at=current.effects.findIndex(item=>item.id===effect.id);if(at>=0&&at<current.effects.length-1)[current.effects[at+1],current.effects[at]]=[current.effects[at],current.effects[at+1]];},index===items.length-1);
      action('移除'+F.names[effect.type],'×',current=>{current.effects=current.effects.filter(item=>item.id!==effect.id);});
      card.append(summary);
      const body=document.createElement('div');body.className='effect-card-body';
      for(const key of Object.keys(effect))if(/^(color\d*|startColor|endColor)$/.test(key)&&/^#[a-f0-9]{6}$/i.test(effect[key]||''))colorField(effect,key,body);
      const numeric=Object.entries(F.limits[effect.type]||{});
      const order=effect.type==='shadow'?['opacity','radius','x','y']:['opacity','amount','size','radius','angle'];
      numeric.sort((a,b)=>{const x=order.indexOf(a[0]),y=order.indexOf(b[0]);return(x<0?99:x)-(y<0?99:y);});
      for(const [key,[min,max]]of numeric){
        const ratio=key==='opacity'&&max<=1?100:1;
        const unit=['opacity','brightness','contrast','saturation','sepia','spread'].includes(key)?'%':['hue','angle'].includes(key)?'°':'px';
        const caption=['amount','size','radius'].includes(key)&&effect.type==='stroke'?'描边宽度':['amount','size','radius'].includes(key)&&/Glow$/.test(effect.type)?'发光大小':key==='radius'&&effect.type==='blur'?'模糊半径':key==='radius'&&effect.type==='shadow'?'柔化大小':labels[key]||key;
        const label=document.createElement('label');label.append(document.createTextNode(caption+' '+unit));
        const row=document.createElement('div');row.className='effect-parameter';
        const slider=document.createElement('input'),number=document.createElement('input');slider.type='range';number.type='number';
        for(const input of [slider,number]){input.min=min*ratio;input.max=max*ratio;input.step=['radius','amount','size'].includes(key) ? .1 : 1;input.value=effect[key]*ratio;input.disabled=disabled;input.setAttribute('aria-label',F.names[effect.type]+' '+caption+(input===number?' 数值':''));}
        let changing=false;
        function update(from,commit=false){
          const value=Number(from.value),valid=String(from.value).trim()!==''&&Number.isFinite(value);
          if(!valid)return;
          if(from===number&&!commit&&(value<min*ratio||value>max*ratio)){number.setAttribute('aria-invalid','true');return;}
          const next=Math.max(min,Math.min(max,value/ratio)),current=editable()?.effects?.find(item=>item.id===effect.id);
          if(!current)return;number.removeAttribute('aria-invalid');
          if(current[key]!==next){if(!changing){begin();changing=true;}change(layer=>{const item=layer.effects.find(item=>item.id===effect.id);if(item)item[key]=next;});}
          slider.value=next*ratio;if(from!==number||commit)number.value=next*ratio;
        }
        function finish(from){if(from===number)update(number,true);const current=get()?.effects?.find(item=>item.id===effect.id);if(current){number.value=current[key]*ratio;slider.value=current[key]*ratio;}number.removeAttribute('aria-invalid');if(changing){changing=false;end({fields:false});}}
        for(const input of [slider,number]){input.oninput=()=>update(input);input.onchange=()=>finish(input);input.onblur=()=>finish(input);}
        slider.onpointerup=()=>finish(slider);slider.onpointercancel=()=>finish(slider);
        number.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();finish(number);number.blur();}};
        row.append(slider,number);label.append(row);body.append(label);
      }
      if(effect.type==='color'){
        const preset=document.createElement('button');preset.type='button';preset.textContent='黑白档案';preset.disabled=disabled;
        preset.onclick=()=>edit(current=>{const item=current.effects.find(item=>item.id===effect.id);if(item)Object.assign(item,{saturation:0,contrast:115,brightness:100,hue:0,sepia:0});});body.append(preset);
      }
      const reset=document.createElement('button');reset.type='button';reset.className='effect-reset';reset.textContent='重置此样式';reset.disabled=disabled;
      reset.onclick=()=>edit(current=>{const at=current.effects.findIndex(item=>item.id===effect.id);if(at>=0)current.effects[at]=F.create(effect.type,effect.id);});body.append(reset);
      card.append(body);list.append(card);
    });
    section.append(list);root.append(section);
  }
  window.ThemeLayerEffectsUI={mount};
})();
