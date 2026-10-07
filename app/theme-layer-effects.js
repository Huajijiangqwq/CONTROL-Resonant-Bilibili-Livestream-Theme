/* Ordered, data-only layer processing shared by DOM and canvas decoration renderers. */
(function(root){
  'use strict';
  const types=['color','blur','shadow','stroke','outerGlow','innerGlow','colorOverlay'];
  const supportedTypes=['image','video','background','text','shape','line','border','logos','header','host','topic','status','timer','grain','hiss','resonance','music'];
  const names={color:'色调校正',blur:'模糊',shadow:'投影',stroke:'描边',outerGlow:'外发光',innerGlow:'内发光',colorOverlay:'颜色叠加'};
  const groups={color:'颜色与质感',blur:'颜色与质感',shadow:'轮廓与光影',stroke:'轮廓与光影',outerGlow:'轮廓与光影',innerGlow:'轮廓与光影',colorOverlay:'颜色与质感'};
  const colors={shadow:'#000000',stroke:'#e8e6dc',outerGlow:'#cf493b',innerGlow:'#f1ddd1',colorOverlay:'#cf493b'};
  const limits=Object.freeze({color:{brightness:[0,200,100],contrast:[0,200,100],saturation:[0,200,100],hue:[-180,180,0],sepia:[0,100,0]},blur:{radius:[0,24,2]},shadow:{x:[-100,100,0],y:[-100,100,5],radius:[0,60,12],opacity:[0,100,55]},stroke:{radius:[0,24,2],opacity:[0,100,100]},outerGlow:{radius:[0,40,8],opacity:[0,100,65]},innerGlow:{radius:[0,30,6],opacity:[0,100,60]},colorOverlay:{opacity:[0,100,100]}});
  const number=(v,[lo,hi,fallback])=>Number.isFinite(Number(v))?Math.min(hi,Math.max(lo,Number(v))):fallback;
  function normalize(raw){
    const seen=new Set();
    return (Array.isArray(raw)?raw:[]).filter(v=>v&&types.includes(v.type)).slice(0,6).map((item,index)=>{
      const base=typeof item.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(item.id)?item.id.slice(0,64):'effect-'+index;
      let id=base,copy=1;while(seen.has(id))id=base+'-'+copy++;seen.add(id);
      const value={id,type:item.type,enabled:item.enabled!==false};
      for(const [key,range]of Object.entries(limits[item.type]))value[key]=number(item[key],range);
      if(colors[item.type])value.color=/^#[a-f0-9]{6}$/i.test(item.color||'')?item.color:colors[item.type];
      return value;
    });
  }
  function create(type,id){return normalize([{type,id}])[0]||null;}
  const registries=new WeakMap();let nextFilter=0;
  function svgFilter(effect,layer,doc){
    if(!doc?.createElementNS||!doc.body)return '';
    let registry=registries.get(doc);
    const ns='http://www.w3.org/2000/svg';
    const element=(name,attrs={})=>{const node=doc.createElementNS(ns,name);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,String(v));return node;};
    if(!registry||!registry.svg.isConnected){
      const svg=element('svg',{'aria-hidden':'true',width:0,height:0});
      svg.style.cssText='position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
      const defs=element('defs');svg.appendChild(defs);doc.body.appendChild(svg);
      registry={svg,defs,entries:new Map()};registries.set(doc,registry);
    }
    const key=String(layer.id||'anonymous')+':'+effect.id;
    const signature=JSON.stringify([effect,layer.w,layer.h]);
    let entry=registry.entries.get(key);
    if(entry){registry.entries.delete(key);registry.entries.set(key,entry);}
    if(entry?.signature===signature)return 'url(#'+entry.node.id+')';
    if(!entry){
      const node=element('filter',{id:'cr-layer-style-'+(++nextFilter),'color-interpolation-filters':'sRGB',filterUnits:'userSpaceOnUse',x:-256,y:-256});
      registry.defs.appendChild(node);entry={node};registry.entries.set(key,entry);
      // A model holds at most 100 layers × 6 styles. Keep ample room for both
      // live sets while retiring definitions from deleted/undone layers.
      if(registry.entries.size>1200){const oldest=registry.entries.keys().next().value;registry.entries.get(oldest).node.remove();registry.entries.delete(oldest);}
    }
    const f=entry.node;f.setAttribute('width',String(number(layer.w,[1,7680,1920])+512));f.setAttribute('height',String(number(layer.h,[1,4320,1080])+512));
    f.replaceChildren();entry.signature=signature;
    const add=(name,attrs)=>{const node=element(name,attrs);f.appendChild(node);return node;};
    const opacity=effect.opacity/100;
    if(effect.type==='colorOverlay'){
      const rgb=[1,3,5].map(i=>parseInt(effect.color.slice(i,i+2),16)/255*opacity),keep=1-opacity;
      add('feColorMatrix',{type:'matrix',values:`${keep} 0 0 0 ${rgb[0]} 0 ${keep} 0 0 ${rgb[1]} 0 0 ${keep} 0 ${rgb[2]} 0 0 0 1 0`});
    }else{
      if(effect.type==='stroke'){
        add('feMorphology',{in:'SourceAlpha',operator:'dilate',radius:effect.radius,result:'expanded'});
        add('feComposite',{in:'expanded',in2:'SourceAlpha',operator:'out',result:'mask'});
      }else{
        add('feGaussianBlur',{in:'SourceAlpha',stdDeviation:effect.radius/2,result:'soft'});
        if(effect.type==='innerGlow')add('feComposite',{in:'SourceAlpha',in2:'soft',operator:'out',result:'mask'});
      }
      add('feFlood',{'flood-color':effect.color,'flood-opacity':opacity,result:'paint'});
      add('feComposite',{in:'paint',in2:effect.type==='outerGlow'?'soft':'mask',operator:'in',result:'style'});
      const merge=add('feMerge');
      if(effect.type==='innerGlow'){
        // Atop keeps the source alpha (including semitransparent source pixels).
        merge.remove();
        add('feComposite',{in:'style',in2:'SourceGraphic',operator:'atop'});
      }else{
        merge.appendChild(element('feMergeNode',{in:'style'}));merge.appendChild(element('feMergeNode',{in:'SourceGraphic'}));
      }
    }
    return 'url(#'+f.id+')';
  }
  function filter(layer,doc){
    const parts=['brightness('+number(layer.brightness,[.2,2,1])+')'];
    const legacyShadow=number(layer.shadow,[0,40,0]);
    if(legacyShadow)parts.push('drop-shadow(0 2px '+legacyShadow+'px #000b)');
    if(layer.effectsEnabled===false||!supportedTypes.includes(layer.type))return parts.join(' ');
    for(const effect of normalize(layer.effects)){
      if(!effect.enabled)continue;
      if(effect.type==='color'){
        parts.push('brightness('+effect.brightness/100+')','contrast('+effect.contrast/100+')','saturate('+effect.saturation/100+')','hue-rotate('+effect.hue+'deg)','sepia('+effect.sepia/100+')');
      }else if(effect.type==='blur')parts.push('blur('+effect.radius+'px)');
      else if(effect.type==='shadow'){
        const rgb=[1,3,5].map(i=>parseInt(effect.color.slice(i,i+2),16));
        parts.push(`drop-shadow(${effect.x}px ${effect.y}px ${effect.radius}px rgba(${rgb.join(',')},${effect.opacity/100}))`);
      }else if(effect.opacity>0&&(effect.type==='colorOverlay'||effect.radius>0)){const svg=svgFilter(effect,layer,doc);if(svg)parts.push(svg);}
    }
    return parts.join(' ');
  }
  const canvasSurfaces=new WeakMap();
  function drawCanvas(output,source,layer){
    // Canvas SVG-filter regions do not inherit its current transform reliably.
    // Resolve the complete style in local coordinates, then transform the pixels.
    const doc=output.canvas.ownerDocument,pad=256;
    let surfaces=canvasSurfaces.get(source);
    if(!surfaces){surfaces=new WeakMap();canvasSurfaces.set(source,surfaces);}
    let surface=surfaces.get(doc);
    if(!surface){surface=doc.createElement('canvas');surfaces.set(doc,surface);}
    const width=Math.max(1,Math.ceil(layer.w))+pad*2,height=Math.max(1,Math.ceil(layer.h))+pad*2;
    if(surface.width!==width)surface.width=width;if(surface.height!==height)surface.height=height;
    const local=surface.getContext('2d');local.clearRect(0,0,width,height);local.save();
    local.filter=filter({...layer,id:'capture-'+layer.id,w:width,h:height},doc);
    local.drawImage(source,pad,pad,layer.w,layer.h);local.restore();
    output.save();output.filter='none';output.drawImage(surface,-pad,-pad,width,height);output.restore();
  }
  const api={normalize,create,filter,drawCanvas,types,names,limits,groups,maxEffects:6,supported:type=>supportedTypes.includes(type)};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ThemeLayerEffects=api;
})(typeof window==='object'?window:globalThis);
