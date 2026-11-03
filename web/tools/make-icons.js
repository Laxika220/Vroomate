"use strict";
// Draws the app icon (white "V" on near-black) as PNGs for the web app manifest and iOS home screen.
// Usage: node tools/make-icons.js   (writes public/icons/*.png)
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** Distance from point p to segment ab. */
function seg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
/** size px; `pad` shrinks the mark for maskable icons, whose outer 10% may be cropped. */
function icon(size, { rounded, pad }) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const s = size / 32, r = rounded ? 7 * s : 0, sc = pad ? 0.8 : 1, c = size / 2;
  const P = (x, y) => [c + (x * s - c) * sc, c + (y * s - c) * sc];
  const [ax, ay] = P(9, 10), [bx, by] = P(16, 23), [cx, cy] = P(23, 10), w = 1.6 * s * sc;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const px = x + 0.5, py = y + 0.5;
      // rounded-square coverage (antialiased)
      const qx = Math.max(Math.abs(px - c) - (c - r), 0), qy = Math.max(Math.abs(py - c) - (c - r), 0);
      const bg = r ? Math.max(0, Math.min(1, r - Math.hypot(qx, qy) + 0.5)) : 1;
      const d = Math.min(seg(px, py, ax, ay, bx, by), seg(px, py, bx, by, cx, cy));
      const fg = Math.max(0, Math.min(1, w - d + 0.5));
      const v = Math.round(17 + (255 - 17) * fg), o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = raw[o + 1] = raw[o + 2] = v; raw[o + 3] = Math.round(255 * bg);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const out = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(out, { recursive: true });
for (const [name, size, opts] of [["icon-192.png", 192, { rounded: true }], ["icon-512.png", 512, { rounded: true }], ["maskable-512.png", 512, { pad: true }], ["apple-touch-icon.png", 180, {}]])
  fs.writeFileSync(path.join(out, name), icon(size, opts));
console.log("Icons written to " + out);
