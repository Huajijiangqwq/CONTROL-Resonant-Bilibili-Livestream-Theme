"""Preserve Electron's Unix modes and framework symlinks, including on Windows.

On a Mac, also produce and verify an ad-hoc bundle signature with Apple's tools.
Cross-built archives retain the upstream Mach-O bytes/signatures unchanged and
are explicitly labelled as unsigned/unnotarized app bundles in BUILD-INFO.json.
Neither path represents a Developer ID signature or a real-machine UI test.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import stat
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
APP = 'Control Resonant.app/'

def check_name(name):
    p = PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or '\\' in name or ':' in name:
        raise ValueError('Unsafe archive path: ' + name)

def main():
    parser=argparse.ArgumentParser()
    for key in ('runtime','source','arch','cache','output'): parser.add_argument('--'+key,required=True)
    args=parser.parse_args()
    pkg=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))
    entries={}
    with zipfile.ZipFile(args.runtime) as runtime:
        for item in runtime.infolist():
            check_name(item.filename)
            if not item.filename.startswith('Electron.app/'): continue
            name=APP+item.filename[len('Electron.app/'):]
            if name.endswith(('Resources/default_app.asar','Resources/electron.icns')): continue
            mode=item.external_attr >> 16
            entries[name]=(runtime.read(item), mode or (stat.S_IFDIR|0o755 if item.is_dir() else stat.S_IFREG|0o644))
        entries['Electron-LICENSE.txt']=(runtime.read('LICENSE'),stat.S_IFREG|0o644)
        entries['LICENSES.chromium.html']=(runtime.read('LICENSES.chromium.html'),stat.S_IFREG|0o644)
    info_name=APP+'Contents/Info.plist'
    info=plistlib.loads(entries[info_name][0])
    info.update(CFBundleName='Control Resonant',CFBundleDisplayName='Control Resonant',
        CFBundleIdentifier='com.huajijiang.controlresonant',CFBundleShortVersionString='0.1.0',CFBundleVersion='1',
        CFBundleIconFile='icon.icns',LSMinimumSystemVersion='14.2',
        LSApplicationCategoryType='public.app-category.video',
        NSAudioCaptureUsageDescription='允许 Control Resonant 读取系统音频，用于实时音乐频谱和希斯共振效果。',
        NSMicrophoneUsageDescription='音频捕获需要系统授权；本功能用于系统声音可视化。',
        NSScreenCaptureUsageDescription='系统声音采集由屏幕捕获接口提供；不会录制或保存屏幕视频。',
        NSAppleEventsUsageDescription='读取 Music 或 Spotify 的当前歌曲、歌手和播放进度，用于音乐皮肤。')
    info.pop('ElectronAsarIntegrity',None)
    entries[info_name]=(plistlib.dumps(info),stat.S_IFREG|0o644)
    entries[APP+'Contents/Resources/icon.icns']=((ROOT/'desktop/icon.icns').read_bytes(),stat.S_IFREG|0o644)
    with zipfile.ZipFile(args.source) as source:
        prefix=pkg['name']+'-'+pkg['version']+'/'
        for item in source.infolist():
            check_name(item.filename)
            if not item.filename.startswith(prefix): raise ValueError('Unexpected source root')
            rel=item.filename[len(prefix):]
            if not rel or item.is_dir(): continue
            entries[APP+'Contents/Resources/app/'+rel]=(source.read(item),stat.S_IFREG|0o644)
    for name, (data, mode) in entries.items():
        if stat.S_ISLNK(mode):
            target=data.decode()
            check_name(target)
            # All pinned Electron symlinks are relative and stay inside their framework.
            path=PurePosixPath(name).parent/target
            if str(path) not in entries and str(path)+'/' not in entries:
                # Versions/Current is itself a symlink; ZIP preserves that chain.
                replaced=str(path).replace('/Versions/Current/','/Versions/A/')
                if replaced not in entries and replaced+'/' not in entries:
                    raise ValueError('Unresolved framework link: '+name)
    entries['README-macOS.md']=((ROOT/'docs/macOS.md').read_bytes(),stat.S_IFREG|0o644)
    native=sys.platform=='darwin'
    metadata={'version':pkg['version'],'arch':args.arch,'minimumMacOS':'14.2','electron':pkg['devDependencies']['electron'],
        'buildHost':sys.platform,'bundleSignature':'ad-hoc' if native else 'unsigned',
        'notarized':False,'macOSRuntimeTested':False,'upstreamMachOUnmodified':not native}
    if native:
        # Use a unique temporary staging directory. Do not mutate a user's installed app.
        with tempfile.TemporaryDirectory(prefix='control-mac-',dir=args.cache) as temporary:
            folder=Path(temporary)
            links=[]
            for name,(data,mode) in entries.items():
                target=folder/name
                if stat.S_ISDIR(mode): target.mkdir(parents=True,exist_ok=True)
                elif stat.S_ISLNK(mode): links.append((target,data.decode()))
                else:
                    target.parent.mkdir(parents=True,exist_ok=True)
                    target.write_bytes(data);target.chmod(mode & 0o777)
            for target,link in links: target.parent.mkdir(parents=True,exist_ok=True);target.symlink_to(link)
            bundle=folder/APP
            subprocess.run(['/usr/bin/codesign','--force','--deep','--sign','-', '--entitlements',str(ROOT/'desktop/mac-entitlements.plist'),str(bundle)],check=True)
            subprocess.run(['/usr/bin/codesign','--verify','--deep','--strict','--verbose=2',str(bundle)],check=True)
            for current,dirs,files in os.walk(bundle,followlinks=False):
                for filename in dirs+files:
                    target=Path(current)/filename;name=target.relative_to(folder).as_posix();mode=target.lstat().st_mode
                    if target.is_symlink(): entries[name]=(os.readlink(target).encode(),mode)
                    elif target.is_file(): entries[name]=(target.read_bytes(),mode)
    entries['BUILD-INFO.json']=(json.dumps(metadata,ensure_ascii=False,indent=2).encode(),stat.S_IFREG|0o644)
    slug=f"ControlResonant-{pkg['version']}-mac-{args.arch}"
    target=Path(args.output)/(slug+'.zip')
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for name,(data,mode) in sorted(entries.items()):
            item=zipfile.ZipInfo(slug+'/'+name,date_time=(2026,9,26,0,0,0))
            item.create_system=3;item.external_attr=mode<<16
            if stat.S_ISDIR(mode): item.external_attr|=0x10
            item.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(item,data)
    with zipfile.ZipFile(target) as archive:
        if archive.testzip(): raise ValueError('ZIP verification failed')
    sha=hashlib.sha256(target.read_bytes()).hexdigest()
    (Path(args.cache)/('last-mac-'+args.arch+'.json')).write_text(json.dumps({'archive':str(target),'sha256':sha,**metadata},indent=2),encoding='utf-8')
    print(json.dumps({'archive':str(target),'MiB':round(target.stat().st_size/1048576,2),'sha256':sha,**metadata},indent=2))

if __name__=='__main__': main()
