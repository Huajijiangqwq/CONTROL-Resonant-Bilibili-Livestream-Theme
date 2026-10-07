/* Structural editor shell. Existing controls retain IDs, handlers and undo behavior. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), body = document.body;
  const pageTitle=location.pathname.endsWith('chat-editor.html')?'弹幕编辑器':'主题编辑器';
  const brandTitle=document.querySelector('.appbar .brand b');if(brandTitle)brandTitle.textContent=pageTitle;
  const assets = document.querySelector('.assets-panel'), layers = document.querySelector('.layers-panel');
  if (!assets || !layers) return;
  body.classList.add('editor-studio');
  const icon = (name) => {
    const paths = { save: 'M4 3h14l3 3v15H3V3zM7 3v7h10V3M7 21v-7h10v7',
      folder: 'M3 6h7l2 3h9v12H3z', more: 'M5 12h.01M12 12h.01M19 12h.01',
      undo: 'M4 10h10a6 6 0 010 12M4 10l6-6M4 10l6 6', redo: 'M20 10H10a6 6 0 000 12M20 10l-6-6M20 10l-6 6' };
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true'); svg.classList.add('studio-icon');
    const p = document.createElementNS(svg.namespaceURI,'path'); p.setAttribute('d',paths[name]); svg.append(p); return svg;
  };
  const button = (id, title, name) => {
    const b = document.createElement('button'); b.id=id; b.type='button'; b.title=title; b.setAttribute('aria-label',title);
    if(name)b.append(icon(name));else b.textContent=title;
    return b;
  };
  const menu = (label, className) => {
    const d=document.createElement('details');d.className='studio-menu '+className;
    const s=document.createElement('summary');s.textContent=label;
    const content=document.createElement('nav');content.className='studio-menu-panel';content.setAttribute('aria-label',label+'操作');
    d.append(s,content);return {node:d,panel:content};
  };
  const componentLibrary=document.createElement('div');componentLibrary.id='studioComponents';componentLibrary.className='studio-components';
  while(assets.firstChild)componentLibrary.append(assets.firstChild);
  layers.id='studioLayers';
  const tabs=document.createElement('div');tabs.className='studio-left-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','左侧面板');
  const tabMap=new Map();
  for(const [id,label] of [['layers','图层'],['components','组件']]){
    const b=button('studioTab-'+id,label);b.dataset.pane=id;b.setAttribute('role','tab');b.setAttribute('aria-controls',id==='layers'?'studioLayers':'studioComponents');tabs.append(b);tabMap.set(id,b);
    const panel=id==='layers'?layers:componentLibrary;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',b.id);
  }
  const libraryShortcut=button('studioLibraryShortcut','打开项目库','folder');libraryShortcut.className='studio-library-shortcut';tabs.append(libraryShortcut);
  assets.append(tabs,layers,componentLibrary);
  const modeRow=document.createElement('div');modeRow.className='studio-mode-row';
  const viewMode=document.createElement('select');viewMode.id='studioViewMode';viewMode.setAttribute('aria-label','编辑范围');
  viewMode.add(new Option('整个直播场景','theme'));viewMode.add(new Option('弹幕区内部','chat'));
  viewMode.value=location.pathname.endsWith('chat-editor.html')?'chat':'theme';
  modeRow.append(viewMode);tabs.after(modeRow);
  const composition=$('compositionMode');if(composition){composition.title='消息如何组织';composition.setAttribute('aria-label','消息组织方式');modeRow.append(composition);}
  let leftPane='layers';
  function showPane(value){
    leftPane=value;componentLibrary.hidden=value!=='components';layers.hidden=value!=='layers';body.dataset.leftPane=value;
    for(const [id,b]of tabMap){b.setAttribute('aria-selected',String(id===value));b.tabIndex=id===value?0:-1;}
    window.dispatchEvent(new Event('resize'));
  }
  for(const [id,b] of tabMap){
    b.onclick=()=>showPane(id);
    b.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();showPane(e.key==='Home'?'layers':e.key==='End'?'components':id==='layers'?'components':'layers');tabMap.get(leftPane).focus();}};
  }
  showPane('layers');
  const docTitle=$('projectName');docTitle.classList.add('studio-project-name');
  const titleGroup=document.createElement('div');titleGroup.className='studio-project-title';
  const nameState=document.createElement('span');nameState.id='studioProjectState';nameState.textContent='自动草稿';nameState.title='自动草稿会保留当前编辑；命名保存后进入项目库。';
  titleGroup.append(docTitle,nameState);
  const bar=document.querySelector('.appbar'), oldMenu=bar.querySelector('.menu'), end=bar.querySelector('.appbar-end');
  const projectMenu=menu('项目','studio-project-menu');
  projectMenu.panel.append($('projectLibraryOpen'),$('saveProject'));
  const saveCopy=button('studioSaveCopy','另存副本');projectMenu.panel.append(saveCopy);
  const newDoc=button('studioNewProject','从布局新建');projectMenu.panel.append(newDoc);
  const file=$('projectMenu');file.textContent='导入、导出与恢复';projectMenu.panel.append(file);
  const save=button('studioSave','保存项目 · Ctrl S','save');
  const undo=$('undo'),redo=$('redo');
  undo.setAttribute('aria-label','撤销');redo.setAttribute('aria-label','重做');undo.replaceChildren(icon('undo'));redo.replaceChildren(icon('redo'));
  const history=document.createElement('div');history.className='studio-history';history.append(undo,redo);
  const more=menu('更多','studio-more-menu');
  $('settingsOpen').textContent='直播与主题设置';more.panel.append($('settingsOpen'),$('editChat'));
  const help=button('studioHelp','操作指南与快捷键');more.panel.append(help);
  const appName=bar.querySelector('.app-name');if(appName)appName.hidden=true;
  bar.insertBefore(projectMenu.node,oldMenu);bar.insertBefore(titleGroup,oldMenu);bar.insertBefore(save,oldMenu);bar.insertBefore(history,oldMenu);
  oldMenu.remove();
  end.append(more.node);
  const size=document.querySelector('.doc-size');if(size){size.hidden=true;bar.append(size);}
  const docTab=document.querySelector('.document-tab');if(docTab)docTab.remove();
  const status=$('saveState');status.classList.add('studio-save-state');titleGroup.append(status);
  function closeMenus(){for(const d of bar.querySelectorAll('.studio-menu[open]'))d.open=false;}
  for(const d of [projectMenu,more]){
    d.node.addEventListener('toggle',()=>{if(d.node.open)for(const other of bar.querySelectorAll('.studio-menu[open]'))if(other!==d.node)other.open=false;});
    d.panel.addEventListener('click',e=>{if(e.target.closest('button'))closeMenus();});
  }
  let lastMenuOrigin=null;
  document.addEventListener('click',e=>{
    const menu=e.target.closest('.studio-menu');
    if(menu&&e.target.closest('button'))lastMenuOrigin=menu.querySelector('summary');
    else if(!e.target.closest('dialog'))lastMenuOrigin=null;
  },true);
  document.addEventListener('close',e=>{
    if(e.target.tagName!=='DIALOG'||document.querySelector('dialog[open]')||!lastMenuOrigin?.isConnected)return;
    const focused=document.activeElement;
    if(!focused||focused===body||e.target.contains(focused)||focused.closest('.studio-menu:not([open])'))lastMenuOrigin.focus();
  },true);
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.studio-menu'))closeMenus();});
  document.addEventListener('keydown',e=>{const opened=bar.querySelector('.studio-menu[open]');if(e.key==='Escape'&&opened){e.preventDefault();e.stopImmediatePropagation();closeMenus();opened.querySelector('summary').focus();}},true);
  libraryShortcut.onclick=()=>{$('projectLibraryOpen').click();};
  save.onclick=()=>{$('saveProject').click();};
  saveCopy.onclick=()=>window.ControlProjectLibrary?.saveAs();
  newDoc.onclick=()=>{$('chooseTemplate').click();};
  help.onclick=()=>{$('helpOpen').click();};
  viewMode.onchange=()=>{
    const desired=viewMode.value==='chat',current=location.pathname.endsWith('chat-editor.html');
    // Saving can fail or require conflict resolution. Keep the current scope
    // truthful until navigation creates or selects the destination editor.
    viewMode.value=current?'chat':'theme';if(desired!==current)$('editChat').click();
  };
  const stateBadge=document.createElement('div');stateBadge.className='studio-output-state';document.querySelector('.canvas-status').prepend(stateBadge);
  function collectLateControls(){
    const obs=$('obsConnect');if(obs&&obs.parentElement!==more.panel)more.panel.prepend(obs);
    const badge=$('publicationBadge');if(badge&&badge.parentElement!==stateBadge)stateBadge.append(badge);
    const picker=$('chatInstancePicker');if(picker&&picker.parentElement!==modeRow)modeRow.append(picker);
    const toggle=$('assetPanelToggle');if(toggle){toggle.textContent='侧栏';toggle.title='显示或收起图层 / 组件栏';toggle.setAttribute('aria-label','切换左侧栏');}
  }
  new MutationObserver(collectLateControls).observe(end,{childList:true});collectLateControls();
  window.addEventListener('control-project-state',e=>{
    const {current,dirty}=e.detail||{};
    nameState.textContent=current?(dirty?'项目有修改':'命名版本已保存'):'未命名草稿';
    nameState.dataset.dirty=String(!!dirty);save.title=current?'保存当前命名项目 · Ctrl S':'将草稿命名保存到项目库 · Ctrl S';
  });
  window.EditorStudio={showPane,get pane(){return leftPane;}};
})();
