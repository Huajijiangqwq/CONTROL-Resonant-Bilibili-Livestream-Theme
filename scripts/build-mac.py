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

def refresh_archive_checksums(directory):
    # Match package.js: current top-level regular ZIP/DMG files, sorted by filename.
    # Never preserve hashes from an earlier manifest after an archive is replaced.
    directory = Path(directory)
    archives = sorted((item for item in directory.iterdir()
        if item.is_file() and not item.is_symlink() and item.suffix.lower() in ('.zip', '.dmg')),
        key=lambda item: item.name)
    lines = []
    for archive in archives:
        digest = hashlib.sha256()
        with archive.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(chunk)
        lines.append(digest.hexdigest() + '  ' + archive.name)
    with (directory / 'SHA256SUMS.txt').open('w', encoding='utf-8', newline='\n') as manifest:
        manifest.write('\n'.join(lines) + ('\n' if lines else ''))

def signed_bundle_entries(folder):
    """Snapshot the actual signed bundle, including directory modes and symlinks."""
    folder = Path(folder)
    bundle = folder / APP
    result = {APP: (b'', bundle.lstat().st_mode)}
    for current, dirs, files in os.walk(bundle, followlinks=False):
        for filename in dirs + files:
            target = Path(current) / filename
            name = target.relative_to(folder).as_posix()
            mode = target.lstat().st_mode
            if stat.S_ISLNK(mode):
                result[name] = (os.readlink(target).encode('utf-8'), mode)
            elif stat.S_ISDIR(mode):
                result[name + '/'] = (b'', mode)
            elif stat.S_ISREG(mode):
                result[name] = (target.read_bytes(), mode)
            else:
                raise ValueError('Unsupported bundle entry: ' + name)
    return result


def replace_bundle_entries(entries, folder):
    # codesign can remove obsolete signature files. Updating only existing keys
    # would silently put those deleted files back into the final ZIP.
    retained = {name: value for name, value in entries.items()
                if name != APP.rstrip('/') and not name.startswith(APP)}
    retained.update(signed_bundle_entries(folder))
    return retained


def validate_dmg_layout(mounted, metadata):
    mounted = Path(mounted)
    bundle = mounted / APP
    if not bundle.is_dir() or bundle.is_symlink():
        raise ValueError('Disk image must contain an application directory')
    info = plistlib.loads((bundle / 'Contents/Info.plist').read_bytes())
    if info.get('CFBundleIdentifier') != 'com.huajijiang.controlresonant':
        raise ValueError('Disk image has an unexpected application identifier')
    version = metadata['version'].split('-')[0]
    if info.get('CFBundleVersion') != version or info.get('CFBundleShortVersionString') != version:
        raise ValueError('Disk image application version does not match this build')
    executable = info.get('CFBundleExecutable', '')
    if not executable or '/' in executable or '\\' in executable or executable in ('.', '..'):
        raise ValueError('Disk image application executable is invalid')
    binary = bundle / 'Contents/MacOS' / executable
    if not binary.is_file() or not binary.stat().st_mode & 0o111:
        raise ValueError('Disk image application executable is missing or not executable')
    link = mounted / 'Applications'
    if not link.is_symlink() or os.readlink(link) != '/Applications':
        raise ValueError('Disk image Applications shortcut is invalid')
    for name in ('安装说明.txt', 'README-macOS.md', 'Electron-LICENSE.txt', 'LICENSES.chromium.html'):
        if not (mounted / name).is_file():
            raise ValueError('Disk image is missing ' + name)
    if json.loads((mounted / 'BUILD-INFO.json').read_text(encoding='utf-8')) != metadata:
        raise ValueError('Disk image build metadata does not match this build')
    resolved_bundle = bundle.resolve()
    for current, dirs, files in os.walk(bundle, followlinks=False):
        for name in dirs + files:
            target = Path(current) / name
            if target.is_symlink():
                # Internal Electron links must still resolve within this bundle.
                target.resolve(strict=True).relative_to(resolved_bundle)
    return bundle


def verify_dmg(image, metadata):
    if sys.platform != 'darwin':
        raise RuntimeError('Disk image verification requires macOS')
    subprocess.run(['/usr/bin/hdiutil', 'verify', str(image)], check=True)
    with tempfile.TemporaryDirectory(prefix='control-dmg-mount-') as temporary:
        mount = Path(temporary) / 'volume'
        mount.mkdir()
        attached = False
        try:
            result = subprocess.run(['/usr/bin/hdiutil', 'attach', str(image), '-readonly',
                '-nobrowse', '-noautoopen', '-mountpoint', str(mount), '-plist'],
                check=True, stdout=subprocess.PIPE)
            attached = True
            entities = plistlib.loads(result.stdout).get('system-entities', [])
            if not any(Path(item['mount-point']).resolve() == mount.resolve()
                       for item in entities if item.get('mount-point')):
                raise ValueError('Disk image did not mount at the requested location')
            bundle = validate_dmg_layout(mount, metadata)
            subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict',
                '--verbose=2', str(bundle)], check=True)
        finally:
            if attached or os.path.ismount(mount):
                subprocess.run(['/usr/bin/hdiutil', 'detach', str(mount)], check=True)


def create_dmg(bundle, target, metadata, companion_files):
    if sys.platform != 'darwin':
        raise RuntimeError('Disk image creation requires macOS; use the setup ZIP on other hosts')
    target = Path(target)
    with tempfile.TemporaryDirectory(prefix='control-dmg-', dir=target.parent) as temporary:
        staging = Path(temporary) / 'contents'
        staging.mkdir()
        # ditto preserves the signed app's Unix permissions, links and metadata.
        subprocess.run(['/usr/bin/ditto', str(bundle), str(staging / APP)], check=True)
        (staging / 'Applications').symlink_to('/Applications', target_is_directory=True)
        for name, data in companion_files.items():
            (staging / name).write_bytes(data)
        (staging / 'BUILD-INFO.json').write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
        (staging / '安装说明.txt').write_text(
            'Control Resonant ' + metadata['version'] + '\n\n'
            '1. 将 Control Resonant.app 拖到旁边的 Applications（应用程序）快捷方式。\n'
            '2. 复制完成后推出此磁盘映像，再从“应用程序”打开客户端。\n'
            '3. 首次使用的系统授权与功能限制见 README-macOS.md。\n\n'
            '此构建使用本地临时签名（ad-hoc），没有 Apple Developer ID 签名，也未经过 Apple 公证。\n'
            'macOS 仍可能要求确认来源或阻止首次打开；请参阅项目的 macOS 使用说明。\n'
            '签名和磁盘映像的结构验证不代表界面、系统音频、Music / Spotify 或 OBS 已完成实机测试。\n',
            encoding='utf-8')
        candidate = Path(temporary) / target.name
        subprocess.run(['/usr/bin/hdiutil', 'create', '-volname', 'Control Resonant',
            '-srcfolder', str(staging), '-fs', 'HFS+', '-format', 'UDZO', str(candidate)], check=True)
        verify_dmg(candidate, metadata)
        # Keep any previous artifact intact until all native verification passes.
        candidate.replace(target)
    return {'dmg': str(target), 'dmgSha256': hashlib.sha256(target.read_bytes()).hexdigest()}


def main():
    parser=argparse.ArgumentParser()
    for key in ('runtime','source','arch','cache','output'): parser.add_argument('--'+key,required=True)
    parser.add_argument('--prepare-on-mac', action='store_true')
    args=parser.parse_args()
    if sys.platform != 'darwin' and not args.prepare_on_mac:
        raise RuntimeError('Build on macOS, or explicitly request a local-preparation kit.')
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
        CFBundleIdentifier='com.huajijiang.controlresonant',CFBundleShortVersionString=pkg['version'].split('-')[0],CFBundleVersion=pkg['version'].split('-')[0],
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
    entries['prepare-mac.sh']=((ROOT/'scripts/prepare-mac.sh').read_bytes().replace(b'\r\n',b'\n'),stat.S_IFREG|0o755)
    entries['修复并打开.command']=((ROOT/'scripts/repair-mac.command').read_bytes().replace(b'\r\n',b'\n'),stat.S_IFREG|0o755)
    native=sys.platform=='darwin'
    metadata={'version':pkg['version'],'arch':args.arch,'minimumMacOS':'14.2','electron':pkg['devDependencies']['electron'],
        'buildHost':sys.platform,'bundleSignature':'ad-hoc' if native else 'requires-local-signing',
        'requiresLocalPreparation':not native,
        'notarized':False,'macOSRuntimeTested':False,'upstreamMachOUnmodified':not native}
    slug=f"ControlResonant-{pkg['version']}-mac-{args.arch}" + ('' if native else '-setup')
    distribution={}
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
            subprocess.run(['/bin/bash',str(ROOT/'scripts/prepare-mac.sh'),str(bundle)],check=True)
            subprocess.run(['/usr/bin/codesign','--verify','--deep','--strict','--verbose=2',str(bundle)],check=True)
            entries=replace_bundle_entries(entries,folder)
            distribution=create_dmg(bundle,Path(args.output)/(slug+'.dmg'),metadata,
                {name:entries[name][0] for name in ('README-macOS.md','Electron-LICENSE.txt','LICENSES.chromium.html')})
    entries['BUILD-INFO.json']=(json.dumps(metadata,ensure_ascii=False,indent=2).encode(),stat.S_IFREG|0o644)
    target=Path(args.output)/(slug+'.zip')
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for name,(data,mode) in sorted(entries.items()):
            item=zipfile.ZipInfo(slug+'/'+name,date_time=(2026,9,27,0,0,0))
            item.create_system=3;item.external_attr=mode<<16
            if stat.S_ISDIR(mode): item.external_attr|=0x10
            item.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(item,data)
    with zipfile.ZipFile(target) as archive:
        if archive.testzip(): raise ValueError('ZIP verification failed')
    sha=hashlib.sha256(target.read_bytes()).hexdigest()
    refresh_archive_checksums(args.output)
    (Path(args.cache)/('last-mac-'+args.arch+'.json')).write_text(json.dumps({'archive':str(target),'sha256':sha,**distribution,**metadata},indent=2),encoding='utf-8')
    print(json.dumps({'archive':str(target),'MiB':round(target.stat().st_size/1048576,2),'sha256':sha,**distribution,**metadata},indent=2))

if __name__=='__main__': main()
