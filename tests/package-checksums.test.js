'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const crypto = require('node:crypto'), { spawnSync } = require('node:child_process');
const { excluded, makeZip, sourceFiles, refreshArchiveChecksums } = require('../scripts/package');

function checkArchiveRefresh(refresh) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-release-checksums-'));
  const zip = value => makeZip([['fixture.txt', Buffer.from(value)]]);
  const expected = new Map();
  function write(name, value) {
    const bytes = zip(value);
    fs.writeFileSync(path.join(dir, name), bytes);
    expected.set(name, crypto.createHash('sha256').update(bytes).digest('hex'));
  }
  function verify() {
    refresh(dir);
    const lines = fs.readFileSync(path.join(dir, 'SHA256SUMS.txt'), 'utf8');
    assert.equal(lines, [...expected].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([name, hash]) => hash + '  ' + name + '\n').join(''));
  }
  try {
    write('source.zip', 'source');
    write('windows.zip', 'windows');
    write('mac-arm64.zip', 'arm64');
    write('mac-x64.ZIP', 'x64');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not an archive');
    fs.mkdirSync(path.join(dir, 'nested.zip'));
    fs.writeFileSync(path.join(dir, 'nested.zip', 'hidden.zip'), zip('nested archive'));
    fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'),
      'untrusted  windows.zip\nuntrusted  windows.zip\nuntrusted  removed.zip\n');
    verify();
    write('mac-arm64.zip', 'replacement archive');
    fs.unlinkSync(path.join(dir, 'windows.zip'));
    expected.delete('windows.zip');
    verify();
    verify();
    for (const name of expected.keys()) fs.unlinkSync(path.join(dir, name));
    expected.clear();
    verify();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('source and Windows checksum refresh includes every current ZIP once and rehashes replacements', () => {
  checkArchiveRefresh(refreshArchiveChecksums);
});

test('Mac checksum refresh follows the same current ZIP and replacement rules', () => {
  const python = process.env.CONTROL_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const script = path.resolve(__dirname, '../scripts/build-mac.py');
  checkArchiveRefresh(dir => {
    const result = spawnSync(python, ['-B', '-c',
      "import runpy, sys; runpy.run_path(sys.argv[1])['refresh_archive_checksums'](sys.argv[2])", script, dir],
    { encoding: 'utf8', windowsHide: true });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});

test('source archives omit Python caches without excluding Python source files', () => {
  for (const name of ['scripts/__pycache__', 'scripts/__pycache__/build-mac.cpython-313.pyc',
    'scripts/build-mac.pyc', '__pycache__/fixture.txt']) assert(excluded(name), name);
  assert(!excluded('scripts/build-mac.py'));
  assert(!sourceFiles().some(name => name.includes('__pycache__/') || name.endsWith('.pyc')));
});
