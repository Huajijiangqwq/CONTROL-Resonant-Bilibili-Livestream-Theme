'use strict';
const path = require('node:path').posix;

// Validate the actual public payload, after stripping developer-only HTML.
// This catches accidentally removing a shared engine along with a laboratory UI.
function validate(entries) {
  const files = new Map(entries), errors = [];
  let references = 0;
  function check(source, ref, requireModule = false) {
    if (/^(?:[a-z]+:|\/\/|#|data:)/i.test(ref)) return;
    let name;
    try { name = decodeURIComponent(ref.split(/[?#]/)[0]); } catch { errors.push(source + ': invalid path ' + ref); return; }
    if (!name) return;
    const resolved = path.normalize(path.join(path.dirname(source), name));
    references++;
    if (files.has(resolved) || (requireModule && (files.has(resolved + '.js') || files.has(resolved + '/index.js')))) return;
    errors.push(source + ': public payload missing ' + name);
  }
  for (const [name, bytes] of files) {
    if (!/^(app|desktop)\//.test(name)) continue;
    const text = bytes.toString('utf8');
    if (name.endsWith('.html')) for (const match of text.matchAll(/(?:src|href)=["']([^"'<>]+)["']/g)) check(name, match[1].replaceAll('&amp;', '&'));
    if (name.endsWith('.css')) for (const match of text.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)) check(name, match[1]);
    if (name.endsWith('.js')) for (const match of text.matchAll(/require\(['"](\.{1,2}\/[^'"]+)['"]\)/g)) check(name, match[1], true);
  }
  return { errors, references };
}
module.exports = { validate };
