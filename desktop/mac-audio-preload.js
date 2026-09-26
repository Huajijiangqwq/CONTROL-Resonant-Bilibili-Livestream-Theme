'use strict';
const { contextBridge, ipcRenderer }=require('electron');
contextBridge.exposeInMainWorld('audioCapture', {
  frame:(samples,rate)=>ipcRenderer.send('mac-audio:frame',{samples,rate}),
  error:()=>ipcRenderer.send('mac-audio:error'),
});
