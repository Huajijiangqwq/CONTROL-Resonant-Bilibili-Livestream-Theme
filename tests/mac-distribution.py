"""Offline distribution fixtures; no Apple tools or production bundle is launched."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import plistlib
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('mac_build', Path(__file__).resolve().parent.parent / 'scripts/build-mac.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class DistributionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='control mac 中文 ')
        self.root = Path(self.temporary.name)
        self.addCleanup(self.temporary.cleanup)
        self.metadata = {'version': '1.2.3', 'arch': 'arm64', 'buildHost': 'darwin',
            'bundleSignature': 'ad-hoc', 'requiresLocalPreparation': False,
            'notarized': False, 'macOSRuntimeTested': False}

    def test_signed_snapshot_removes_deleted_signature_files_and_preserves_modes(self):
        bundle = self.root / build.APP
        signature = bundle / 'Contents/_CodeSignature'
        signature.mkdir(parents=True)
        (signature / 'CodeResources').write_bytes(b'new signature')
        executable = bundle / 'Contents/MacOS/Electron'
        executable.parent.mkdir()
        executable.write_bytes(b'signed executable')
        executable.chmod(0o755)
        before = {build.APP + 'Contents/_CodeSignature/obsolete': (b'old', stat.S_IFREG | 0o644),
            build.APP + 'Contents/MacOS/Electron': (b'old executable', stat.S_IFREG | 0o644),
            'README-macOS.md': (b'readme', stat.S_IFREG | 0o644)}
        result = build.replace_bundle_entries(before, self.root)
        self.assertNotIn(build.APP + 'Contents/_CodeSignature/obsolete', result)
        self.assertEqual(result[build.APP + 'Contents/_CodeSignature/CodeResources'][0], b'new signature')
        self.assertEqual(result[build.APP + 'Contents/MacOS/Electron'],
            (b'signed executable', executable.lstat().st_mode))
        self.assertEqual(result[build.APP + 'Contents/_CodeSignature/'][1], signature.lstat().st_mode)
        self.assertEqual(result['README-macOS.md'], before['README-macOS.md'])

    def test_signed_snapshot_preserves_actual_framework_symlink(self):
        versions = self.root / build.APP / 'Contents/Frameworks/Fixture.framework/Versions'
        (versions / 'A').mkdir(parents=True)
        (versions / 'A/Fixture').write_bytes(b'framework')
        link = versions / 'Current'
        try:
            link.symlink_to('A', target_is_directory=True)
        except OSError as error:
            self.skipTest('Host cannot create a symlink fixture: ' + str(error.errno))
        result = build.signed_bundle_entries(self.root)
        data, mode = result[build.APP + 'Contents/Frameworks/Fixture.framework/Versions/Current']
        self.assertEqual(data, b'A')
        self.assertTrue(stat.S_ISLNK(mode))
        self.assertFalse(any('/Current/' in name for name in result), 'snapshot must not follow links')

    def test_other_hosts_cannot_create_or_verify_dmg(self):
        with patch.object(build.sys, 'platform', 'win32'), patch.object(build.subprocess, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'requires macOS'):
                build.create_dmg(self.root / build.APP, self.root / 'test.dmg', self.metadata, {})
            with self.assertRaisesRegex(RuntimeError, 'requires macOS'):
                build.verify_dmg(self.root / 'test.dmg', self.metadata)
            run.assert_not_called()

    def test_verify_checks_readonly_mounted_bundle_and_detaches_after_codesign_failure(self):
        calls = []
        def run(command, **options):
            calls.append(command)
            if command[1] == 'attach':
                mount = command[command.index('-mountpoint') + 1]
                self.assertIn('-readonly', command)
                self.assertIn('-nobrowse', command)
                self.assertIn('-noautoopen', command)
                return subprocess.CompletedProcess(command, 0, stdout=plistlib.dumps({'system-entities': [{'mount-point': mount}]}))
            if command[0] == '/usr/bin/codesign':
                raise subprocess.CalledProcessError(1, command)
            return subprocess.CompletedProcess(command, 0)
        with patch.object(build.sys, 'platform', 'darwin'), patch.object(build.subprocess, 'run', side_effect=run), \
             patch.object(build, 'validate_dmg_layout', side_effect=lambda mount, metadata: Path(mount) / build.APP) as validate:
            with self.assertRaises(subprocess.CalledProcessError):
                build.verify_dmg(self.root / 'fixture.dmg', self.metadata)
            validate.assert_called_once()
        self.assertEqual([item[1] for item in calls], ['verify', 'attach', '--verify', 'detach'])
        self.assertIn('--deep', calls[2]); self.assertIn('--strict', calls[2])

    def test_invalid_attach_metadata_still_detaches(self):
        calls = []
        def run(command, **options):
            calls.append(command)
            return subprocess.CompletedProcess(command, 0, stdout=b'not a plist')
        with patch.object(build.sys, 'platform', 'darwin'), patch.object(build.subprocess, 'run', side_effect=run):
            with self.assertRaises(plistlib.InvalidFileException):
                build.verify_dmg(self.root / 'fixture.dmg', self.metadata)
        self.assertEqual(calls[-1][1], 'detach')

    def test_layout_rejects_wrong_bundle_identity_before_any_signature_claim(self):
        contents = self.root / build.APP / 'Contents'
        contents.mkdir(parents=True)
        (contents / 'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': 'wrong.app'}))
        with self.assertRaisesRegex(ValueError, 'identifier'):
            build.validate_dmg_layout(self.root, self.metadata)
        (contents / 'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': 'com.huajijiang.controlresonant',
            'CFBundleVersion': '0.0.0', 'CFBundleShortVersionString': '0.0.0'}))
        with self.assertRaisesRegex(ValueError, 'version'):
            build.validate_dmg_layout(self.root, self.metadata)

    def test_dmg_candidate_is_udzo_with_clear_metadata_and_replaces_only_after_verification(self):
        target = self.root / 'release.dmg'
        target.write_bytes(b'previous artifact')
        calls, shortcuts = [], []
        companions = {'README-macOS.md': b'project guide', 'Electron-LICENSE.txt': b'license', 'LICENSES.chromium.html': b'licenses'}
        def run(command, **options):
            calls.append(command)
            if command[1] == 'create':
                self.assertEqual(command[command.index('-format') + 1], 'UDZO')
                self.assertEqual(command[command.index('-volname') + 1], 'Control Resonant')
                staging = Path(command[command.index('-srcfolder') + 1])
                self.assertEqual(json.loads((staging / 'BUILD-INFO.json').read_text(encoding='utf-8')), self.metadata)
                readme = (staging / '安装说明.txt').read_text(encoding='utf-8')
                self.assertIn('Applications', readme); self.assertIn('ad-hoc', readme); self.assertIn('未经过 Apple 公证', readme)
                for name, data in companions.items():
                    self.assertEqual((staging / name).read_bytes(), data)
                Path(command[-1]).write_bytes(b'candidate fixture')
            return subprocess.CompletedProcess(command, 0)
        def verify(candidate, metadata):
            self.assertEqual(target.read_bytes(), b'previous artifact')
            self.assertEqual(Path(candidate).read_bytes(), b'candidate fixture')
        with patch.object(build.sys, 'platform', 'darwin'), patch.object(build.subprocess, 'run', side_effect=run), \
             patch.object(build, 'verify_dmg', side_effect=verify) as verification, \
             patch.object(Path, 'symlink_to', lambda location, dest, **kwargs: shortcuts.append((location.name, dest))):
            result = build.create_dmg(self.root / build.APP, target, self.metadata, companions)
            verification.assert_called_once()
        self.assertEqual(target.read_bytes(), b'candidate fixture')
        self.assertEqual(shortcuts, [('Applications', '/Applications')])
        self.assertEqual(calls[0][0], '/usr/bin/ditto')
        self.assertEqual(result['dmg'], str(target)); self.assertEqual(len(result['dmgSha256']), 64)

    def test_failed_candidate_verification_preserves_previous_image(self):
        target = self.root / 'release.dmg'
        target.write_bytes(b'previous artifact')
        def run(command, **options):
            if command[1] == 'create':
                Path(command[-1]).write_bytes(b'invalid fixture')
            return subprocess.CompletedProcess(command, 0)
        with patch.object(build.sys, 'platform', 'darwin'), patch.object(build.subprocess, 'run', side_effect=run), \
             patch.object(build, 'verify_dmg', side_effect=ValueError('invalid image')), patch.object(Path, 'symlink_to'):
            with self.assertRaisesRegex(ValueError, 'invalid image'):
                build.create_dmg(self.root / build.APP, target, self.metadata, {})
        self.assertEqual(target.read_bytes(), b'previous artifact')

    def test_setup_zip_retains_unix_modes_links_and_honest_unverified_metadata(self):
        source_root = self.root / 'source'
        for folder in ('desktop', 'scripts', 'docs'):
            (source_root / folder).mkdir(parents=True)
        pkg = {'name': 'fixture', 'version': '1.2.3', 'devDependencies': {'electron': '44.4.3'}}
        (source_root / 'package.json').write_text(json.dumps(pkg), encoding='utf-8')
        for name in ('desktop/icon.icns', 'scripts/prepare-mac.sh', 'scripts/repair-mac.command', 'docs/macOS.md'):
            (source_root / name).write_bytes(b'fixture\n')
        runtime, source, cache, output = (self.root / name for name in ('runtime.zip', 'source.zip', 'cache', 'output'))
        cache.mkdir(); output.mkdir()
        with zipfile.ZipFile(runtime, 'w') as archive:
            def add(name, data, mode=stat.S_IFREG | 0o644):
                item = zipfile.ZipInfo(name); item.create_system = 3; item.external_attr = mode << 16
                archive.writestr(item, data)
            add('LICENSE', b'license'); add('LICENSES.chromium.html', b'licenses')
            add('Electron.app/', b'', stat.S_IFDIR | 0o755)
            add('Electron.app/Contents/Info.plist', plistlib.dumps({'CFBundleExecutable': 'Electron'}))
            add('Electron.app/Contents/MacOS/Electron', b'fixture executable', stat.S_IFREG | 0o755)
            add('Electron.app/Contents/Frameworks/Fixture.framework/Versions/A/', b'', stat.S_IFDIR | 0o755)
            add('Electron.app/Contents/Frameworks/Fixture.framework/Versions/Current', b'A', stat.S_IFLNK | 0o777)
        with zipfile.ZipFile(source, 'w') as archive:
            archive.writestr('fixture-1.2.3/package.json', json.dumps(pkg))
        arguments = ['build-mac.py', '--runtime', str(runtime), '--source', str(source), '--arch', 'arm64',
            '--cache', str(cache), '--output', str(output), '--prepare-on-mac']
        with patch.object(build, 'ROOT', source_root), patch.object(build.sys, 'platform', 'win32'), \
             patch.object(build.sys, 'argv', arguments), patch.object(build.subprocess, 'run') as run, contextlib.redirect_stdout(io.StringIO()):
            build.main()
            run.assert_not_called()
        self.assertEqual(list(output.glob('*.dmg')), [])
        target = output / 'ControlResonant-1.2.3-mac-arm64-setup.zip'
        prefix = target.stem + '/'
        with zipfile.ZipFile(target) as archive:
            info = json.loads(archive.read(prefix + 'BUILD-INFO.json'))
            self.assertEqual(info['bundleSignature'], 'requires-local-signing')
            self.assertTrue(info['requiresLocalPreparation'])
            self.assertFalse(info['notarized']); self.assertFalse(info['macOSRuntimeTested'])
            binary = archive.getinfo(prefix + build.APP + 'Contents/MacOS/Electron')
            self.assertEqual(binary.create_system, 3); self.assertEqual(binary.external_attr >> 16, stat.S_IFREG | 0o755)
            link = archive.getinfo(prefix + build.APP + 'Contents/Frameworks/Fixture.framework/Versions/Current')
            self.assertTrue(stat.S_ISLNK(link.external_attr >> 16)); self.assertEqual(archive.read(link), b'A')


if __name__ == '__main__':
    unittest.main()
