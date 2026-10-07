'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {build,makeZip,runtimeEntries}=require('./package');
const hashes={arm64:'6b728f5dcfae74f3f936f2bca5b3cd9b9659ffea464f67939f004acb55425a85',x64:'015b52631d92187b552ff4e047255f596a7af4707e388a5890951f0b2645764e'};
async function main(){
  const prepareOnMac=process.argv.includes('--prepare-on-mac');
  if(process.platform!=='darwin'&&!prepareOnMac)
    throw Error('请在 macOS 构建已签名的测试包。Windows 仅可使用 --prepare-on-mac 生成需要在 Mac 上先运行签名准备脚本的包。');
  const arch=process.argv.find(x=>x.startsWith('--arch='))?.slice(7)||process.arch;
  if(!hashes[arch])throw Error('Choose --arch=arm64 or --arch=x64');
  const root=path.resolve(__dirname,'..'),cache=path.resolve(process.env.CONTROL_BUILD_CACHE||path.join(root,'.build-cache'));
  fs.mkdirSync(cache,{recursive:true});
  require('./create-icon').buildIcon();
  const version=require('../package.json').devDependencies.electron;
  if(version!=='44.4.3')throw Error('Update verified Electron archive hashes before changing the runtime.');
  const name=`electron-v${version}-darwin-${arch}.zip`,archive=path.join(cache,name);
  if(!fs.existsSync(archive)){
    console.log(`Downloading Electron for macOS ${arch}…`);
    const response=await fetch(`https://github.com/electron/electron/releases/download/v${version}/${name}`,{signal:AbortSignal.timeout(300000)});
    if(!response.ok)throw Error('Electron download: '+response.status);
    fs.writeFileSync(archive,Buffer.from(await response.arrayBuffer()));
  }
  if(crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')!==hashes[arch])throw Error('Electron SHA-256 mismatch');
  const source=build();
  const pkg=require('../package.json'),runtimeSource=path.join(cache,'public-source-'+Date.now()+'.zip');
  fs.writeFileSync(runtimeSource,makeZip(runtimeEntries(source.files).map(([relative,bytes])=>[`${pkg.name}-${pkg.version}/${relative}`,bytes])));
  const python=process.env.CONTROL_PYTHON||(process.platform==='win32'?'python':'python3');
  const result=spawnSync(python,[path.join(__dirname,'build-mac.py'),'--runtime',archive,'--source',runtimeSource,'--arch',arch,'--cache',cache,'--output',source.dir,...(prepareOnMac?['--prepare-on-mac']:[])],{stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error('macOS package build failed');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
