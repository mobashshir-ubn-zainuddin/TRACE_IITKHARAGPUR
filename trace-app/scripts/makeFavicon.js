/**
 * Generates a TRACE-branded favicon.ico (32x32, 32-bit BGRA) without any
 * external dependency. The mark is a blue "activity pulse" on a dark card
 * background, matching the TRACE header logo (lucide `Activity`).
 *
 * Usage: node scripts/makeFavicon.js
 */
const fs = require("fs");
const path = require("path");

const SIZE = 32;

// TRACE palette (globals.css)
const BG = [0x15, 0x18, 0x24]; // --card  #151824
const FG = [0x3b, 0x82, 0xf6]; // --primary #3b82f6

// Activity polyline in a 24x24 viewbox: M22 12h-4l-3 9L9 3l-3 9H2
const POINTS = [
  [22, 12],
  [18, 12],
  [15, 21],
  [9, 3],
  [6, 12],
  [2, 12],
];

const scale = SIZE / 24;
const stroke = 2.6; // px, in icon space

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Coverage of the stroke at a pixel centre, anti-aliased. */
function coverage(px, py) {
  let best = Infinity;
  for (let i = 0; i < POINTS.length - 1; i++) {
    const [ax, ay] = POINTS[i];
    const [bx, by] = POINTS[i + 1];
    const d = distanceToSegment(px, py, ax * scale, ay * scale, bx * scale, by * scale);
    if (d < best) best = d;
  }
  const half = stroke / 2;
  if (best <= half - 0.5) return 1;
  if (best >= half + 0.5) return 0;
  return half + 0.5 - best;
}

// --- Build 32-bit BGRA pixel rows (ICO stores bottom-up) ---
const rowBytes = SIZE * 4;
const pixels = Buffer.alloc(rowBytes * SIZE);

for (let y = 0; y < SIZE; y++) {
  const srcY = SIZE - 1 - y; // bottom-up
  for (let x = 0; x < SIZE; x++) {
    const a = coverage(x + 0.5, srcY + 0.5);
    const r = Math.round(BG[0] + (FG[0] - BG[0]) * a);
    const g = Math.round(BG[1] + (FG[1] - BG[1]) * a);
    const b = Math.round(BG[2] + (FG[2] - BG[2]) * a);
    const off = y * rowBytes + x * 4;
    pixels[off + 0] = b;
    pixels[off + 1] = g;
    pixels[off + 2] = r;
    pixels[off + 3] = 255;
  }
}

// AND mask: 1 bit per pixel, rows padded to 4 bytes. All zero (fully opaque).
const maskRowBytes = Math.ceil(SIZE / 32) * 4;
const mask = Buffer.alloc(maskRowBytes * SIZE);

// BITMAPINFOHEADER
const header = Buffer.alloc(40);
header.writeUInt32LE(40, 0); // biSize
header.writeInt32LE(SIZE, 4); // biWidth
header.writeInt32LE(SIZE * 2, 8); // biHeight (image + mask)
header.writeUInt16LE(1, 12); // biPlanes
header.writeUInt16LE(32, 14); // biBitCount
header.writeUInt32LE(0, 16); // biCompression = BI_RGB
header.writeUInt32LE(pixels.length + mask.length, 20); // biSizeImage

const image = Buffer.concat([header, pixels, mask]);

// ICONDIR + ICONDIRENTRY
const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0); // reserved
dir.writeUInt16LE(1, 2); // type = icon
dir.writeUInt16LE(1, 4); // count

const entry = Buffer.alloc(16);
entry.writeUInt8(SIZE, 0); // width
entry.writeUInt8(SIZE, 1); // height
entry.writeUInt8(0, 2); // colour count
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // planes
entry.writeUInt16LE(32, 6); // bit count
entry.writeUInt32LE(image.length, 8); // bytes in resource
entry.writeUInt32LE(6 + 16, 12); // offset

const ico = Buffer.concat([dir, entry, image]);

const out = path.join(__dirname, "..", "src", "app", "favicon.ico");
fs.writeFileSync(out, ico);
console.log(`Wrote ${out} (${ico.length} bytes)`);
