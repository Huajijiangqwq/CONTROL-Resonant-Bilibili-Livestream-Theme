'use strict';
// Original code-drawn geometric mark. CC BY 4.0. No external image dependency.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc(bytes) { let n = 0xffffffff; for (const b of bytes) n = table[(n ^ b) & 255] ^ (n >>> 8); return (n ^ 0xffffffff) >>> 0; }
function chunk(name, body) {
  const tag = Buffer.from(name), head = Buffer.alloc(4), tail = Buffer.alloc(4);
  head.writeUInt32BE(body.length); tail.writeUInt32BE(crc(Buffer.concat([tag, body])));
  return Buffer.concat([head, tag, body, tail]);
}
const clamp = n => Math.max(0, Math.min(1, n));
function line(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
function pixel(x, y, size, template) {
  const edge = Math.min(line(x, y, .225, .315, .775, .315), line(x, y, .775, .315, .5, .795), line(x, y, .5, .795, .225, .315));
  const ink = clamp((.025 - edge) * size + .5);
  if (template) return [0, 0, 0, Math.round(ink * 255)];
  const qx = Math.abs(x - .5) - .305, qy = Math.abs(y - .5) - .305;
  const sdf = Math.hypot(Math.max(0, qx), Math.max(0, qy)) + Math.min(Math.max(qx, qy), 0) - .17;
  const alpha = clamp(.5 - sdf * size);
  let rgb = [14, 15, 16];
  // Sparse red filaments remain subordinate to the legible white silhouette.
  const radius = Math.hypot(x - .78, y - .19), angle = Math.atan2(y - .19, x - .78);
  const phase = radius * 115 + angle * 3.3 + Math.sin(x * 22 + y * 8) * 2.2;
  const hair = Math.pow(Math.max(0, Math.sin(phase)), 19);
  const envelope = Math.exp(-radius * 4.2) * (1 - clamp((.30 - x) * 6));
  rgb = rgb.map((v, i) => v + [135, 17, 11][i] * hair * envelope);
  const top = clamp((.013 - line(x, y, .225, .224, .775, .224)) * size + .5);
  rgb = rgb.map((v, i) => v * (1 - top) + [215, 45, 34][i] * top);
  const dot = clamp((.023 - Math.hypot(x - .5, y - .43)) * size + .5);
  rgb = rgb.map((v, i) => v * (1 - dot) + [218, 43, 32][i] * dot);
  rgb = rgb.map((v, i) => v * (1 - ink) + [242, 239, 229][i] * ink);
  return [...rgb.map(Math.round), Math.round(alpha * 255)];
}
function png(size, template = false) {
  const rows = Buffer.alloc((size * 4 + 1) * size), samples = size <= 128 ? 3 : 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sum = [0, 0, 0, 0];
    for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
      const p = pixel((x + (sx + .5) / samples) / size, (y + (sy + .5) / samples) / size, size, template);
      p.forEach((v, i) => sum[i] += v);
    }
    sum.forEach((v, i) => rows[y * (size * 4 + 1) + 1 + x * 4 + i] = Math.round(v / (samples * samples)));
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
function buildIcon(dir = path.join(__dirname, '../desktop')) {
  fs.mkdirSync(dir, { recursive: true });
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024], images = new Map(sizes.map(s => [s, png(s)]));
  fs.writeFileSync(path.join(dir, 'icon.png'), images.get(512));
  fs.writeFileSync(path.join(dir, 'icon-1024.png'), images.get(1024));
  fs.writeFileSync(path.join(dir, 'trayTemplate.png'), png(32, true));
  const icoSizes = sizes.filter(s => s <= 256), header = Buffer.alloc(6 + icoSizes.length * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(icoSizes.length, 4);
  let offset = header.length;
  icoSizes.forEach((s, i) => {
    const at = 6 + i * 16, bytes = images.get(s);
    header[at] = header[at + 1] = s === 256 ? 0 : s;
    header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(bytes.length, at + 8); header.writeUInt32LE(offset, at + 12); offset += bytes.length;
  });
  fs.writeFileSync(path.join(dir, 'icon.ico'), Buffer.concat([header, ...icoSizes.map(s => images.get(s))]));
  const icnsParts = [[32, 'icp5'], [64, 'icp6'], [128, 'ic07'], [256, 'ic08'], [512, 'ic09'], [1024, 'ic10']].map(([s, type]) => {
    const h = Buffer.alloc(8); h.write(type); h.writeUInt32BE(images.get(s).length + 8, 4); return Buffer.concat([h, images.get(s)]);
  });
  const icnsHead = Buffer.alloc(8); icnsHead.write('icns'); icnsHead.writeUInt32BE(8 + icnsParts.reduce((n, b) => n + b.length, 0), 4);
  fs.writeFileSync(path.join(dir, 'icon.icns'), Buffer.concat([icnsHead, ...icnsParts]));
}
if (require.main === module) buildIcon();
module.exports = { buildIcon, png };
