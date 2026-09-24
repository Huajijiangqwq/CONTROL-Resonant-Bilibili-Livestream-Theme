'use strict';
const {app,BrowserWindow,Menu,Tray,nativeImage,ipcMain,shell,clipboard,utilityProcess,session}=require('electron');
const path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
const {pageUrl,readConfig,saveConfig}=require('./core');
const root=path.resolve(__dirname,'..');
// Optional isolated profile for development / release checks. Never uses a production profile.
const profile=process.argv.find(x=>x.startsWith('--profile='));
if(profile)app.setPath('userData',path.resolve(profile.slice(10)));
app.setAppUserModelId('ControlResonant.ThemeStudio');
const hasLock=app.requestSingleInstanceLock();
let win,tray,child,exiting=false;
let state={status:'starting',message:'正在启动本地服务…',base:'',port:null,version:require('../package.json').version};
let logPath;
function log(message){if(logPath)fs.appendFileSync(logPath,new Date().toISOString()+' '+String(message).slice(0,3000)+'\n');}
function publish(update){Object.assign(state,update);if(win&&!win.isDestroyed())win.webContents.send('desktop:state',state);}
function show(){if(win){if(win.isMinimized())win.restore();win.show();win.focus();}}
function launchServices(){
  if(child)return;
  publish({status:'starting',message:'正在启动本地服务…',base:''});
  const userData=app.getPath('userData'),config=readConfig(userData);
  const proc=utilityProcess.fork(path.join(__dirname,'services.js'),[],{
    cwd:root,stdio:'pipe',serviceName:'Control Resonant Local Services',
    env:{...process.env,CONTROL_DATA:path.join(userData,'data'),CONTROL_PORT:config.port?String(config.port):''},
  });
  child=proc;
  proc.stdout?.on('data',chunk=>log(chunk));proc.stderr?.on('data',chunk=>log(chunk));
  proc.on('message',message=>{
    if(message.type==='ready'){
      saveConfig(userData,{...config,port:message.port});
      publish({status:'ready',message:'本地服务已就绪',base:message.base,port:message.port});
    } else if(message.type==='error')publish({status:'error',message:message.message,base:''});
  });
  proc.on('exit',code=>{if(child===proc)child=null;log('Services exit '+code);if(!exiting&&state.status!=='error')publish({status:'error',message:'本地服务已停止，请点击重试。',base:''});});
}
function trusted(event){return win&&!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&event.senderFrame.url===pathToFileURL(path.join(__dirname,'index.html')).href;}
function handle(name,callback){ipcMain.handle(name,(event,...args)=>{if(!trusted(event))throw Error('未授权的窗口');return callback(...args);});}
async function quit(){
  if(exiting)return;exiting=true;
  if(child){child.postMessage({type:'stop'});const old=child;await new Promise(resolve=>{old.once('exit',resolve);setTimeout(()=>{if(child===old)old.kill();resolve();},2500);});}
  tray?.destroy();app.quit();
}
if(!hasLock)app.quit();
else {
  app.on('second-instance',show);
  app.whenReady().then(()=>{
    const data=app.getPath('userData');fs.mkdirSync(data,{recursive:true});
    logPath=path.join(data,'desktop.log');if(fs.existsSync(logPath)&&fs.statSync(logPath).size>2000000)fs.renameSync(logPath,logPath+'.previous');
    // Pages receive no desktop privileges. Deny device permissions by default.
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    const icon=nativeImage.createFromPath(path.join(__dirname,'icon.png'));
    win=new BrowserWindow({width:1560,height:980,minWidth:1080,minHeight:700,show:false,backgroundColor:'#141619',title:'Control Resonant · 直播主题',icon,autoHideMenuBar:true,
      webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,webviewTag:false,backgroundThrottling:false},
    });
    Menu.setApplicationMenu(null);
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
    win.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(path.join(__dirname,'index.html')).href)event.preventDefault();});
    win.on('close',event=>{if(!exiting){event.preventDefault();win.hide();}});
    win.once('ready-to-show',show);
    win.webContents.on('render-process-gone',(_event,details)=>{log('Renderer exited '+details.reason);win.reload();});
    tray=new Tray(icon);tray.setToolTip('Control Resonant · 直播服务运行中');
    tray.setContextMenu(Menu.buildFromTemplate([{label:'打开客户端',click:show},{type:'separator'},{label:'退出并停止本地服务',click:quit}]));tray.on('double-click',show);
    handle('desktop:state',()=>state);
    handle('desktop:open-page',key=>shell.openExternal(pageUrl(state.base,key)));
    handle('desktop:copy-page',key=>{const url=pageUrl(state.base,key);clipboard.writeText(url);return url;});
    const docs={usage:'docs/使用说明.md',readme:'README.md',credits:'THIRD_PARTY_NOTICES.md',licenses:'docs/素材与许可.md',music:'docs/音乐集成.md',mit:'LICENSE',cc:'licenses/CC-BY-4.0.txt'};
    handle('desktop:docs',key=>{if(!Object.hasOwn(docs,key))throw Error('文档无效');return shell.openPath(path.join(root,docs[key]));});
    handle('desktop:data',()=>shell.openPath(data));
    handle('desktop:retry',()=>{if(!child)launchServices();return state;});
    handle('desktop:quit',quit);
    win.webContents.on('did-fail-load',(_event,code,message)=>log('Page load failed '+code+' '+message));
    win.webContents.on('console-message',(_event,details)=>{if(details.level==='error')log(details.message);});
    win.loadFile(path.join(__dirname,'index.html')).then(show).catch(error=>{log(error.message);show();});
    setTimeout(show,3000);
    launchServices();
  }).catch(error=>{log(error.stack);app.exit(1);});
  app.on('before-quit',event=>{if(!exiting){event.preventDefault();void quit();}});
  app.on('window-all-closed',()=>{});
}
