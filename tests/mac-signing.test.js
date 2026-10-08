'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const scriptPath = path.join(__dirname, '../scripts/prepare-mac.sh');
const script = fs.readFileSync(scriptPath, 'utf8');
const bash = process.env.CONTROL_BASH || (process.platform === 'win32'
  ? path.join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe') : '/bin/bash');

test('Mac preparation remains valid Bash syntax', { skip: !fs.existsSync(bash) && 'Bash is unavailable' }, () => {
  const result = spawnSync(bash, ['-n', scriptPath], { encoding: 'utf8', windowsHide: true });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
});

test('unsigned Intel binaries are signed before every parent executable and bundle', { skip: !fs.existsSync(bash) && 'Bash is unavailable' }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'control-signing-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bundle = path.join(root, 'Control Resonant 测试.app');
  const binaries = ['Contents/MacOS/Electron'];
  const nested = [], dependencies = [];
  for (const name of ['Electron Helper (Renderer)', 'Electron Helper (Plugin)', 'Electron Helper (GPU)', 'Electron Helper']) {
    const app = 'Contents/Frameworks/' + name + '.app', binary = app + '/Contents/MacOS/' + name;
    nested.push(app); binaries.push(binary); dependencies.push([app, binary]);
  }
  for (const [name, leaves] of [
    ['Electron Framework', ['Libraries/libffmpeg.dylib', 'Libraries/libvk_swiftshader.dylib', 'Helpers/chrome_crashpad_handler']],
    ['Squirrel', ['Resources/ShipIt']], ['Mantle', []], ['ReactiveObjC', []],
  ]) {
    const framework = 'Contents/Frameworks/' + name + '.framework', binary = framework + '/Versions/A/' + name;
    nested.push(framework); binaries.push(binary); dependencies.push([framework, binary]);
    for (const leaf of leaves) {
      const file = framework + '/Versions/A/' + leaf;
      binaries.push(file); dependencies.push([binary, file], [framework, file]);
    }
  }
  for (const item of [...binaries.slice(1), ...nested]) dependencies.push([binaries[0], item]);
  for (const item of [...binaries, ...nested]) dependencies.push(['.', item]);
  function write(name, content) { const file = path.join(bundle, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
  // All fixture Mach-O files begin unsigned; no upstream arm64 signature can mask the order.
  for (const file of binaries) write(file, 'MACHO\n');
  write('Contents/Info.plist', 'fixture\n');
  write('Contents/Resources/app/desktop/mac-entitlements.plist', 'fixture\n');
  const dependencyFile = path.join(root, 'dependencies.txt'), targetsFile = path.join(root, 'targets.txt');
  fs.writeFileSync(dependencyFile, dependencies.map(pair => pair.join('\t')).join('\n') + '\n');
  fs.writeFileSync(targetsFile, [...binaries, ...nested, '.'].join('\n') + '\n');
  const log = path.join(root, 'signed.txt'), flags = path.join(root, 'flags.txt');
  const stubs = String.raw`set -euo pipefail
uname() { printf 'Darwin\n'; }
mock_plist() { printf 'com.huajijiang.controlresonant\n'; }
mock_file() { local header; IFS= read -r header < "$2"; if [[ "$header" == MACHO ]]; then printf 'Mach-O 64-bit executable x86_64\n'; else printf 'ASCII text\n'; fi; }
must_be_signed() {
  if ! /usr/bin/grep -Fqx -- "$1" "$SIGN_LOG"; then
    printf '%s: code object is not signed at all\nIn subcomponent: %s\n' "$target" "$1" >&2
    return 1
  fi
}
mock_codesign() {
  local target='' arg verify=false deep=false strict=false entitlement=false dependent prerequisite owner
  for arg in "$@"; do
    target="$arg"
    case "$arg" in --verify) verify=true ;; --deep) deep=true ;; --strict) strict=true ;; --entitlements) entitlement=true ;; esac
  done
  if [[ "$verify" == true ]]; then
    [[ "$deep" == true && "$strict" == true ]] || return 1
    while IFS= read -r dependent; do
      owner="$bundle/$dependent"; if [[ "$dependent" == . ]]; then owner="$bundle"; fi
      must_be_signed "$owner"
    done < "$TARGETS_FILE"
    printf 'verified\n' >> "$FLAGS_LOG"
    return 0
  fi
  [[ "$deep" == false ]] || return 1
  while IFS=$'\t' read -r dependent prerequisite; do
    owner="$bundle/$dependent"; if [[ "$dependent" == . ]]; then owner="$bundle"; fi
    if [[ "$owner" == "$target" ]]; then must_be_signed "$bundle/$prerequisite"; fi
  done < "$DEPENDENCIES_FILE"
  printf '%s\n' "$target" >> "$SIGN_LOG"
  printf '%s\t%s\n' "$entitlement" "$target" >> "$FLAGS_LOG"
}
if [[ "$PARENT_FIRST_CONTROL" == 1 ]]; then
  bundle="$(cd "$1" && pwd -P)"
  mock_codesign --force --sign - --timestamp=none "$bundle/Contents/MacOS/Electron"
  exit 0
fi
`;
  const harness = path.join(root, 'prepare-fixture.sh');
  fs.writeFileSync(harness, stubs + script.replaceAll('/usr/libexec/PlistBuddy', 'mock_plist')
    .replaceAll('/usr/bin/file', 'mock_file').replaceAll('/usr/bin/codesign', 'mock_codesign').replaceAll('\r\n', '\n'));
  const env = { ...process.env, SIGN_LOG: log.replaceAll('\\', '/'), FLAGS_LOG: flags.replaceAll('\\', '/'),
    DEPENDENCIES_FILE: dependencyFile.replaceAll('\\', '/'), TARGETS_FILE: targetsFile.replaceAll('\\', '/') };
  const run = control => {
    fs.writeFileSync(log, ''); fs.writeFileSync(flags, '');
    return spawnSync(bash, [harness, bundle], { encoding: 'utf8', windowsHide: true, env: { ...env, PARENT_FIRST_CONTROL: control } });
  };
  const parentFirst = run('1');
  assert.ifError(parentFirst.error); assert.notEqual(parentFirst.status, 0);
  assert.match(parentFirst.stderr, /code object is not signed at all/);
  const fixed = run('0');
  assert.ifError(fixed.error); assert.equal(fixed.status, 0, fixed.stderr || fixed.stdout);
  const signed = fs.readFileSync(log, 'utf8').trim().split('\n');
  assert.equal(signed.length, binaries.length + nested.length + 1);
  assert.equal(new Set(signed).size, signed.length);
  assert(signed.at(-1).endsWith('/Control Resonant 测试.app'));
  for (const line of fs.readFileSync(flags, 'utf8').trim().split('\n').slice(0, -1)) {
    const [entitlement, target] = line.split('\t');
    assert.equal(entitlement, String(target.endsWith('.app') || target.includes('/Contents/MacOS/')));
  }
  assert.equal(fs.readFileSync(flags, 'utf8').trim().split('\n').at(-1), 'verified');
});
