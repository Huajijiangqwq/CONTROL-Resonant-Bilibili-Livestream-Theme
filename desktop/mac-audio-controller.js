'use strict';
const path=require('node:path'),{pathToFileURL}=require('node:url');
function createController({BrowserWindow,session,desktopCapturer,ipcMain},send){
  let win=null,wanted=false,generation=0;
  const page=pathToFileURL(path.join(__dirname,'mac-audio.html')).href;
  const partition=session.fromPartition('control-system-audio');
  const trusted=event=>wanted&&win&&!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&event.senderFrame.url===page;
  partition.setPermissionRequestHandler((contents,permission,callback)=>callback(!!wanted&&contents===win?.webContents&&['media','display-capture'].includes(permission)));
  partition.setPermissionCheckHandler((contents,permission)=>!!wanted&&contents===win?.webContents&&['media','display-capture'].includes(permission));
  partition.setDisplayMediaRequestHandler(async(request,callback)=>{
    if(!wanted||request.frame!==win?.webContents.mainFrame){callback({});return;}
    try{const screens=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:0,height:0}});callback(wanted&&screens[0]?{video:screens[0],audio:'loopback'}:{});}catch{callback({});}
  });
  const error=()=>send({type:'mac-audio-error',error:'系统音频采集失败。请在 macOS 系统设置 → 隐私与安全性中允许音频录制，重新打开客户端后再试。'});
  ipcMain.on('mac-audio:frame',(event,data)=>{
    if(!trusted(event)||!(data?.samples instanceof Float32Array)||data.samples.length>32768||data.rate<8000||data.rate>192000)return;
    send({type:'mac-audio-pcm',bytes:Buffer.from(data.samples.buffer,data.samples.byteOffset,data.samples.byteLength),rate:data.rate});
  });
  ipcMain.on('mac-audio:error',event=>{if(trusted(event))error();});
  async function setEnabled(enabled){
    wanted=!!enabled;const own=++generation;
    if(!wanted){if(win&&!win.isDestroyed())await win.webContents.executeJavaScript('window.stopCapture()').catch(()=>{});return;}
    try{
      if(!win||win.isDestroyed()){
        win=new BrowserWindow({show:false,width:160,height:100,webPreferences:{session:partition,preload:path.join(__dirname,'mac-audio-preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
        win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
        win.webContents.on('will-navigate',(event,url)=>{if(url!==page)event.preventDefault();});
        win.webContents.on('render-process-gone',()=>{if(wanted)error();});
        await win.loadURL(page);
      }
      if(wanted&&own===generation)await win.webContents.executeJavaScript('window.startCapture()',true);
    }catch{if(wanted&&own===generation)error();}
  }
  return {setEnabled,close(){wanted=false;generation++;win?.destroy();win=null;}};
}
module.exports={createController};
