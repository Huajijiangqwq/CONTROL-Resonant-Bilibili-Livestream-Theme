'use strict';
// Reproducible ZIP using only Node built-ins. Run from a clean checkout or a used
// installation: runtime data is excluded in either case.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  zlib = require('node:zlib');
const root = path.resolve(__dirname, '..'),
  pkg = require('../package.json');
const profile = require('../app/release-profile');
const roots = ['app', 'desktop', 'scripts', 'tests', 'docs', 'licenses', '.github'];
const rootFiles = [
  'package.json',
  'README.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  '.gitignore',
  '.gitattributes',
  '.prettierignore',
  '.prettierrc.json',
  '启动全部服务.cmd',
  '停止全部服务.cmd',
  '扫码登录哔哩哔哩.cmd',
];
function excluded(rel) {
  return (
    /(^|\/)(?:theme-live|theme-projects|node_modules|external-now-playing|\.runtime|__pycache__)(\/|$)/.test(rel) ||
    /\.(?:exe|log|tmp|zip|pyc)$/.test(rel) ||
    /(?:audio|now-playing)-settings\.json$/.test(rel) ||
    /(?:^|\/)timer-state\.json(?:\.tmp)?$/.test(rel) ||
    /(?:^|\/)editor-message-state\.json(?:\.tmp)?$/.test(rel) ||
    /bilibili-(?:open|session)-credentials\.enc(?:\.tmp)?$/.test(rel) ||
    /(?:^|\/)credential-key\.enc(?:\.tmp)?$/.test(rel) ||
    /(^|\/)\.env(?:\.|$)/.test(rel)
  );
}
function collect(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = dir + '/' + e.name;
    if (excluded(rel)) return [];
    if (e.isSymbolicLink()) throw Error('Symlink not allowed in release: ' + rel);
    return e.isDirectory() ? collect(rel) : [rel];
  });
}
function sourceFiles() { return [...rootFiles, ...roots.flatMap(collect)].sort(); }
function runtimeExcluded(rel) {
  return /^(?:tests|scripts|\.github)\//.test(rel) ||
    /^docs\/Beta1发布核对\.md$/.test(rel) ||
    /^(?:\.git|\.prettier|启动全部服务\.cmd|停止全部服务\.cmd|扫码登录哔哩哔哩\.cmd)/.test(rel) ||
    (rel.startsWith('app/') && profile.developmentAsset(rel.slice(4)));
}
function runtimeEntries(files = sourceFiles()) {
  const entries = files.filter(file => !runtimeExcluded(file)).map(file => {
    let data = fs.readFileSync(path.join(root, file));
    if (file.endsWith('.html')) data = Buffer.from(profile.publicHtml(data.toString('utf8')));
    return [file, data];
  });
  entries.push(['PUBLIC-RELEASE.json', Buffer.from(JSON.stringify({
    format: 'control-public-runtime', version: pkg.version, developmentTools: false,
  }, null, 2) + '\n')]);
  entries.push(['SHA256SUMS.txt', Buffer.from(entries.map(([file, data]) =>
    crypto.createHash('sha256').update(data).digest('hex') + '  ' + file).sort().join('\n') + '\n')]);
  return entries;
}
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc(data) {
  let n = 0xffffffff;
  for (const b of data) n = table[(n ^ b) & 255] ^ (n >>> 8);
  return (n ^ 0xffffffff) >>> 0;
}
function makeZip(entries) {
  const body = [],
    central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const encoded = Buffer.from(name),
      packed = zlib.deflateRawSync(data, { level: 9 }),
      sum = crc(data),
      head = Buffer.alloc(30),
      index = Buffer.alloc(46);
    head.writeUInt32LE(0x04034b50);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x800, 6);
    head.writeUInt16LE(8, 8);
    head.writeUInt16LE(23861, 12);
    head.writeUInt32LE(sum, 14);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(encoded.length, 26);
    body.push(head, encoded, packed);
    index.writeUInt32LE(0x02014b50);
    index.writeUInt16LE(20, 4);
    index.writeUInt16LE(20, 6);
    index.writeUInt16LE(0x800, 8);
    index.writeUInt16LE(8, 10);
    index.writeUInt16LE(23861, 14);
    index.writeUInt32LE(sum, 16);
    index.writeUInt32LE(packed.length, 20);
    index.writeUInt32LE(data.length, 24);
    index.writeUInt16LE(encoded.length, 28);
    index.writeUInt32LE(offset, 42);
    central.push(index, encoded);
    offset += head.length + encoded.length + packed.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...body, directory, end]);
}
function refreshArchiveChecksums(dir) {
  // Rehash the files that exist now; previous manifests may be stale or incomplete.
  const archives = fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(?:zip|dmg)$/i.test(entry.name))
    .map(entry => entry.name).sort();
  const buffer = Buffer.alloc(1024 * 1024);
  const lines = archives.map(name => {
    const hash = crypto.createHash('sha256'), file = fs.openSync(path.join(dir, name), 'r');
    try {
      let count;
      while ((count = fs.readSync(file, buffer, 0, buffer.length, null)) > 0)
        hash.update(buffer.subarray(0, count));
    } finally { fs.closeSync(file); }
    return hash.digest('hex') + '  ' + name;
  });
  fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), lines.length ? lines.join('\n') + '\n' : '');
}
function build() {
  const files = sourceFiles();
  const slug = `${pkg.name}-${pkg.version}`,
    entries = [],
    hashes = [];
  for (const file of files) {
    const data = fs.readFileSync(path.join(root, file));
    entries.push([`${slug}/${file}`, data]);
    hashes.push(`${crypto.createHash('sha256').update(data).digest('hex')}  ${file}`);
  }
  const manifest = Buffer.from(hashes.join('\n') + '\n');
  entries.push([`${slug}/SHA256SUMS.txt`, manifest]);
  const dist = path.resolve(process.env.CONTROL_DIST || path.join(root, 'dist'));
  fs.mkdirSync(dist, { recursive: true });
  const archive = makeZip(entries),
    name = slug + '.zip';
  fs.writeFileSync(path.join(dist, name), archive);
  refreshArchiveChecksums(dist);
  console.log(
    `${name}: ${files.length} files, ${(archive.length / 1048576).toFixed(2)} MiB. Runtime data excluded.`,
  );
  return { name, files, archive, dir: dist };
}
if (require.main === module) build();
module.exports = { build, excluded, makeZip, sourceFiles, runtimeExcluded, runtimeEntries, refreshArchiveChecksums };
