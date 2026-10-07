/* Report document identity so cached desktop workspaces cannot retain another page. */
(() => {
  'use strict';
  if (window.parent === window) return;
  const page = location.pathname.split('/').pop();
  let hostReady=false;
  const allowed=new Set(['live.html','theme-editor.html','chat-editor.html','now-playing.html']);
  if(!allowed.has(page))return;
  window.addEventListener('message',event=>{
    if(event.source===parent && event.data?.channel==='control-workspace-host' && event.data.ready===true){hostReady=true;document.documentElement.dataset.workspaceHost='true';}
  });
  function navigate(value){
    if(!hostReady)return false;
    const url=new URL(value,location.href);
    if(url.origin!==location.origin||!allowed.has(url.pathname.split('/').pop()))return false;
    parent.postMessage({channel:'control-workspace-navigate',url:url.href},'*');
    return true;
  }
  window.WorkspaceNavigation={navigate,open(value){if(navigate(value))return;window.open(value,'_blank');}};
  document.addEventListener('click',async event=>{
    const link=event.target.closest('a[href]');
    if(!hostReady||!link||link.target==='_blank'||event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    let url;try{url=new URL(link.href);}catch{return;}
    if(url.origin!==location.origin||!allowed.has(url.pathname.split('/').pop()))return;
    event.preventDefault();event.stopImmediatePropagation();
    try{if(window.ThemeEditor && await window.ThemeEditor.save()===false)return;navigate(url.href);}
    catch{const note=document.getElementById('saveState');if(note)note.textContent='草稿尚未保存，请先处理保存提示';}
  },true);
  // No settings or personal data cross this boundary. The desktop verifies
  // both the service origin and the exact iframe sending the notification.
  window.parent.postMessage({channel:'control-workspace-page',page}, '*');
})();
