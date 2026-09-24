'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  app = path.join(root, 'app');
const errors = [];
let checked = 0,
  resources = 0;
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() && !['theme-live', 'theme-projects'].includes(e.name)
        ? walk(path.join(dir, e.name))
        : e.isFile()
          ? [path.join(dir, e.name)]
          : [],
    );
}
function resource(source, ref) {
  if (/^(?:[a-z]+:|\/\/|#|data:)/i.test(ref)) return;
  const name = ref.split(/[?#]/)[0];
  if (!name) return;
  const resolved = path.resolve(path.dirname(source), decodeURIComponent(name));
  resources++;
  if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved))
    errors.push(`${path.relative(root, source)}: missing ${name}`);
}
for (const file of [
  ...walk(app),
  ...walk(path.join(root, 'desktop')),
  ...walk(path.join(root, 'scripts')),
  ...walk(path.join(root, 'tests')),
]) {
  if (!/\.(js|html|css|cs|ps1)$/.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  checked++;
  if (file.endsWith('.js')) {
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (r.status !== 0) errors.push(r.stderr);
  }
  if (file.startsWith(app + path.sep) || file.startsWith(path.join(root, 'desktop') + path.sep)) {
    if (/(?:[A-Z]:[\\/]Users[\\/]|codex-runtimes|CodexData)/i.test(text))
      errors.push(`Development-machine dependency: ${path.relative(root, file)}`);
    if (/^(?:_qa-|now-playing-(?:vhs|flow-study)\d)/.test(path.basename(file)))
      errors.push(`Historical experiment: ${file}`);
    if (file.endsWith('.html'))
      for (const m of text.matchAll(/(?:src|href)="([^"<>]+)"/g))
        resource(file, m[1].replaceAll('&amp;', '&'));
    if (file.endsWith('.css'))
      for (const m of text.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)) resource(file, m[1]);
    if (file.endsWith('.js')) {
      for (const m of text.matchAll(/require\(['"](\.\/[^'"]+)['"]\)/g))
        resource(file, /\.[a-z]+$/.test(m[1]) ? m[1] : m[1] + '.js');
      for (const m of text.matchAll(
        /['"]((?:assets\/|now-playing-fonts\/)[^'"?]+\.(?:svg|png|jpg|webp|woff2))['"]/g,
      ))
        resource(file, m[1]);
    }
  }
}
for (const name of [
  'LICENSE',
  'README.md',
  'THIRD_PARTY_NOTICES.md',
  'licenses/fft.js-MIT.txt',
  'licenses/psrdnoise-MIT.txt',
  'licenses/blivedm-MIT.txt',
  'licenses/Microsoft-samples-MIT.txt',
])
  if (!fs.existsSync(path.join(root, name))) errors.push(`Missing notice: ${name}`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Checked ${checked} source files and ${resources} resource references. No missing assets or syntax errors.`,
  );
