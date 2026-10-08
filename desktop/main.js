'use strict';
const {app,BrowserWindow,Menu,Tray,nativeImage,ipcMain,shell,clipboard,utilityProcess,session,safeStorage,desktopCapturer,protocol,dialog}=require('electron');
const path=require('node:path'),fs=require('node:fs');
const {pageUrl,readConfig,saveConfig}=require('./core');
const appProtocol=require('./app-protocol');
appProtocol.registerScheme(protocol);
const root=path.resolve(__dirname,'..');
// Optional isolated profile for development / release checks. Never uses a production profile.
const profile=process.argv.find(x=>x.startsWith('--profile='));
if(profile)app.setPath('userData',path.resolve(profile.slice(10)));
app.setAppUserModelId('ControlResonant.ThemeStudio');
const hasLock=app.requestSingleInstanceLock();
let win,tray,child,macAudio,exiting=false,failureShown=false,diagnostics;
let state={status:'starting',message:'正在启动本地服务…',base:'',port:null,version:require('../package.json').version};
let logPath;
function log(message){if(logPath)try{fs.appendFileSync(logPath,new Date().toISOString()+' '+String(message).slice(0,3000)+'\n');}catch{}}
function publish(update){Object.assign(state,update);if(win&&!win.isDestroyed())win.webContents.send('desktop:state',state);}
function show(){if(win){if(win.isMinimized())win.restore();win.show();win.focus();}}
function loadShell(){
  log('Loading packaged shell through internal protocol');
  return win.loadURL(appProtocol.shellURL).then(()=>{
    show();
    // Let the loaded interface paint before a synchronous Keychain prompt.
    setTimeout(()=>{if(!exiting&&!child)try{launchServices();}catch(error){log('Service launch failed: '+error.message);publish({status:'error',message:'本地服务启动失败，请查看日志后重试。'});}},150);
  }).catch(error=>{log('Shell load rejected: '+error.message);void interfaceFailure('主界面未能加载。');});
}
async function interfaceFailure(message){
  if(failureShown||exiting||!win||win.isDestroyed())return;
  failureShown=true;show();
  const canBrowse=state.status==='ready';
  const buttons=['重新加载界面','打开日志文件夹',...(canBrowse?['在浏览器打开']:[]),'关闭提示'];
  try{
    const {response}=await dialog.showMessageBox(win,{type:'error',title:'Control Resonant 启动提示',message,detail:'错误已记录到 desktop.log。可以重新加载界面；仍然失败时，请将该日志的末尾发给维护者。',buttons,defaultId:1,cancelId:buttons.length-1});
    if(response===0){failureShown=false;diagnostics?.reset();void loadShell();}
    else if(response===1)await shell.openPath(app.getPath('userData'));
    else if(canBrowse&&response===2)await shell.openExternal(pageUrl(state.base,'live'));
  }catch(error){log('Startup prompt failed: '+error.message);}
}
function launchServices(){
  if(child)return;
  publish({status:'starting',message:'正在启动本地服务…',base:''});
  const userData=app.getPath('userData'),config=readConfig(userData);
  log('Starting local services');
  const proc=utilityProcess.fork(path.join(__dirname,'services.js'),[],{
    cwd:root,stdio:'pipe',serviceName:'Control Resonant Local Services',
    env:{...process.env,CONTROL_DATA:path.join(userData,'data'),CONTROL_PORT:config.port?String(config.port):''},
  });
  child=proc;
  proc.on('spawn',()=>log('Local services process spawned'));
  proc.stdout?.on('data',chunk=>log(chunk));proc.stderr?.on('data',chunk=>log(chunk));
  proc.on('message',message=>{
    if(message.type==='mac-audio-control'&&process.platform==='darwin'){void macAudio?.setEnabled(message.enabled);return;}
    if(message.type==='ready'){
      log('Local services ready on port '+message.port);
      saveConfig(userData,{...config,port:message.port});
      publish({status:'ready',message:'本地服务已就绪',base:message.base,port:message.port});
    } else if(message.type==='error'){log('Local services startup error: '+message.message);publish({status:'error',message:message.message,base:''});}
  });
  proc.on('exit',code=>{if(child===proc)child=null;void macAudio?.setEnabled(false);log('Services exit '+code);if(!exiting&&state.status!=='error')publish({status:'error',message:'本地服务已停止，请点击重试。',base:''});});
  if(process.platform==='darwin'){
    let credentialKey='';const began=Date.now();log('Keychain initialization begin');
    try{credentialKey=require('./credential-key').loadKey(safeStorage,userData).toString('base64');log('Keychain initialization complete ('+(Date.now()-began)+' ms)');}catch{log('Keychain unavailable; credential persistence disabled.');}
    if(child===proc&&!exiting){proc.postMessage({type:'bootstrap',credentialKey});log('Local services bootstrap sent');}
  }
}
function trusted(event){return win&&!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&event.senderFrame.url===appProtocol.shellURL;}
function handle(name,callback){ipcMain.handle(name,(event,...args)=>{if(!trusted(event))throw Error('未授权的窗口');return callback(...args);});}
async function quit(){
  if(exiting)return;exiting=true;
  macAudio?.close();
  if(child){child.postMessage({type:'stop'});const old=child;await new Promise(resolve=>{old.once('exit',resolve);setTimeout(()=>{if(child===old)old.kill();resolve();},2500);});}
  tray?.destroy();app.quit();
}
if(!hasLock)app.quit();
else {
  app.on('second-instance',show);
  app.whenReady().then(()=>{
    const data=app.getPath('userData');fs.mkdirSync(data,{recursive:true});
    logPath=path.join(data,'desktop.log');if(fs.existsSync(logPath)&&fs.statSync(logPath).size>2000000)fs.renameSync(logPath,logPath+'.previous');
    log('Startup '+state.version+' '+process.platform+'/'+process.arch+' Electron '+process.versions.electron);
    appProtocol.install(session.defaultSession,{root,kind:'shell',log});
    app.on('child-process-gone',(_event,details)=>log('Child process exited type='+details.type+' reason='+details.reason+' code='+details.exitCode));
    // Pages receive no desktop privileges. Deny device permissions by default.
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    const icon=nativeImage.createFromPath(path.join(__dirname,'icon.png'));
    if(process.platform==='darwin'){
      app.dock?.setIcon(icon);
      macAudio=require('./mac-audio-controller').createController({BrowserWindow,session,desktopCapturer,ipcMain},message=>child?.postMessage(message));
    }
    win=new BrowserWindow({width:1560,height:980,minWidth:1080,minHeight:700,show:false,backgroundColor:'#141619',title:'Control Resonant · 直播主题',icon,autoHideMenuBar:true,
      webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,webviewTag:false,backgroundThrottling:false},
    });
    Menu.setApplicationMenu(process.platform==='darwin'?Menu.buildFromTemplate([{label:app.name,submenu:[{role:'about'},{type:'separator'},{label:'显示客户端',click:show},{type:'separator'},{role:'quit'}]},{role:'editMenu'},{role:'windowMenu'}]):null);
    win.webContents.setWindowOpenHandler(({url})=>{
      // Local editor preview windows stay inside the app with no preload or Node access.
      try {if(state.base&&new URL(url).origin===new URL(state.base).origin)return {action:'allow',overrideBrowserWindowOptions:{autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,preload:undefined}}};}catch{}
      try {
        const target=new URL(url);
        if ((target.origin==='https://github.com' && /^\/Widdit(?:\/now-playing-service(?:\/releases)?)?\/?$/.test(target.pathname)) ||
            target.origin==='http://127.0.0.1:9863') void shell.openExternal(target.href);
      }catch{}
      return {action:'deny'};
    });
    win.webContents.on('will-navigate',(event,url)=>{if(url!==appProtocol.shellURL)event.preventDefault();});
    win.on('close',event=>{if(!exiting){event.preventDefault();win.hide();}});
    win.once('ready-to-show',show);
    diagnostics=require('./window-diagnostics').observe(win.webContents,{log,onFailure:message=>void interfaceFailure(message),isClosing:()=>exiting,reload:()=>void loadShell()});
    const trayIcon=process.platform==='darwin'?nativeImage.createFromPath(path.join(__dirname,'trayTemplate.png')).resize({width:20,height:20}):icon;
    if(process.platform==='darwin')trayIcon.setTemplateImage(true);
    tray=new Tray(trayIcon);tray.setToolTip('Control Resonant · 直播服务运行中');
    tray.setContextMenu(Menu.buildFromTemplate([{label:'打开客户端',click:show},{type:'separator'},{label:'退出并停止本地服务',click:quit}]));tray.on('double-click',show);
    handle('desktop:state',()=>state);
    handle('desktop:open-page',key=>shell.openExternal(pageUrl(state.base,key)));
    handle('desktop:copy-page',key=>{const url=pageUrl(state.base,key);clipboard.writeText(url);return url;});
    const docs={usage:'docs/使用说明.md',readme:'README.md',credits:'THIRD_PARTY_NOTICES.md',licenses:'docs/素材与许可.md',music:'docs/音乐集成.md',mit:'LICENSE',cc:'licenses/CC-BY-4.0.txt'};
    handle('desktop:docs',key=>{if(!Object.hasOwn(docs,key))throw Error('文档无效');return shell.openPath(path.join(root,docs[key]));});
    handle('desktop:data',()=>shell.openPath(data));
    handle('desktop:retry',()=>{if(!child)launchServices();return state;});
    handle('desktop:quit',quit);
    void loadShell();
    setTimeout(show,3000);
  }).catch(error=>{log(error.stack);app.exit(1);});
  app.on('before-quit',event=>{if(!exiting){event.preventDefault();void quit();}});
  app.on('window-all-closed',()=>{});
  app.on('activate',show);
}
