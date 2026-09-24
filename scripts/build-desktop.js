'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {build,makeZip}=require('./package');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
const electronVersion='44.4.3';
const electronSHA='790a355b684d5c7cc8dc3cdd8c4cca7c4b2d054685427c7554a956879a82e70b';
function psFile(script,args){const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,...args],{windowsHide:true,encoding:'utf8'});if(result.status!==0)throw Error(result.stderr||result.stdout);}
async function main(){
  if(process.platform!=='win32'||process.arch!=='x64')throw Error('Windows x64 build required');
  require('./create-icon').buildIcon();
  psFile(path.join(__dirname,'compile-audio.ps1'),['-AppRoot',path.join(root,'app')]);
  const source=build();
  const cache=process.env.CONTROL_BUILD_CACHE?path.resolve(process.env.CONTROL_BUILD_CACHE):path.join(root,'.build-cache');
  fs.mkdirSync(cache,{recursive:true});
  const zipName=`electron-v${electronVersion}-win32-x64.zip`,archive=path.join(cache,zipName);
  if(!fs.existsSync(archive)){
    console.log('Downloading pinned Electron runtime…');
    const response=await fetch(`https://github.com/electron/electron/releases/download/v${electronVersion}/${zipName}`,{signal:AbortSignal.timeout(300000)});
    if(!response.ok)throw Error('Electron download: '+response.status);
    fs.writeFileSync(archive,Buffer.from(await response.arrayBuffer()));
  }
  if(crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')!==electronSHA)throw Error('Electron SHA-256 mismatch. Do not use this archive.');
  const stage=path.join(cache,'stage-'+Date.now()),payload=path.join(stage,'resources','app');
  fs.mkdirSync(stage,{recursive:true});
  psFile(path.join(__dirname,'expand-archive.ps1'),['-Archive',archive,'-Destination',stage]);
  const sourceStage=path.join(cache,'source-'+Date.now());
  psFile(path.join(__dirname,'expand-archive.ps1'),['-Archive',path.join(root,'dist',source.name),'-Destination',sourceStage]);
  fs.cpSync(path.join(sourceStage,`${pkg.name}-${pkg.version}`),payload,{recursive:true});
  // Only the release source manifest plus this precompiled original helper enters the app.
  fs.copyFileSync(path.join(root,'app','now-playing-capture.exe'),path.join(payload,'app','now-playing-capture.exe'));
  fs.renameSync(path.join(stage,'electron.exe'),path.join(stage,'ControlResonant.exe'));
  fs.copyFileSync(path.join(root,'README.md'),path.join(stage,'README.md'));
  fs.copyFileSync(path.join(root,'THIRD_PARTY_NOTICES.md'),path.join(stage,'THIRD_PARTY_NOTICES.md'));
  const label=String(process.env.CONTROL_BUILD_LABEL||'').replace(/[^a-z0-9.-]/gi,'').slice(0,64);
  const slug=`ControlResonant-${pkg.version}-win-x64${label?'-'+label:''}`,entries=[],hashes=[];
  function walk(dir){for(const file of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,file.name);if(file.isDirectory())walk(full);else{const rel=path.relative(stage,full).replaceAll('\\','/'),bytes=fs.readFileSync(full);entries.push([slug+'/'+rel,bytes]);hashes.push(crypto.createHash('sha256').update(bytes).digest('hex')+'  '+rel);}}}
  walk(stage);entries.push([slug+'/SHA256SUMS.txt',Buffer.from(hashes.sort().join('\n')+'\n')]);
  const target=path.join(root,'dist',slug+'.zip'),bytes=makeZip(entries);fs.writeFileSync(target,bytes);
  const sum=crypto.createHash('sha256').update(bytes).digest('hex');fs.appendFileSync(path.join(root,'dist','SHA256SUMS.txt'),sum+'  '+path.basename(target)+'\n');
  fs.writeFileSync(path.join(cache,'last-build.json'),JSON.stringify({stage,archive:target,sha256:sum,electronVersion,electronSHA},null,2));
  console.log(JSON.stringify({archive:target,MiB:(bytes.length/1048576).toFixed(2),sha256:sum,stage},null,2));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
