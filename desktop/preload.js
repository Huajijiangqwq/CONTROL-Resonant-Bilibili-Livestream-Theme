'use strict';
const {contextBridge,ipcRenderer}=require('electron');
// Available only to the packaged shell, not editor iframes or imported themes.
if(process.isMainFrame)contextBridge.exposeInMainWorld('desktop',{
  state:()=>ipcRenderer.invoke('desktop:state'),
  openPage:page=>ipcRenderer.invoke('desktop:open-page',page),
  copyPage:page=>ipcRenderer.invoke('desktop:copy-page',page),
  openDocs:doc=>ipcRenderer.invoke('desktop:docs',doc),
  dataFolder:()=>ipcRenderer.invoke('desktop:data'),
  retry:()=>ipcRenderer.invoke('desktop:retry'),
  quit:()=>ipcRenderer.invoke('desktop:quit'),
  onState:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('desktop:state',listener);return()=>ipcRenderer.removeListener('desktop:state',listener);},
});
