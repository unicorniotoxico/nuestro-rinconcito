// Genera los íconos de la app (PNG) a partir de un dibujo pixel de 32×32.
// Sin dependencias: codifica PNG a mano con zlib.  Uso: npm run icons
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');

const ART = [
  '................................',
  '................................',
  '..............rr.rr.............',
  '.............rRRrrrr............',
  '.............rRrrrrr............',
  '..............rrrrr.............',
  '...............rrr..............',
  '................r...............',
  '..........oooooooooooo..........',
  '.........oCCCCCCCCCCCCo.........',
  '........oCCCLLLLLLLLCCCo........',
  '.......oCCCCCCCCCCCCCCCCo.......',
  '......oCCCCCCCCCCCCCCCCCCo......',
  '.....oddddddddddddddddddddo.....',
  '.....oooooooooooooooooooooo.....',
  '......owwwwwwwwwwwwwwwwwwo......',
  '......owgggwwwwwwwwwwgggwo......',
  '......owgbgwwwwppwwwwgbgwo......',
  '......owgggwwwppppwwwgggwo......',
  '......owwwwwwwbbbbwwwwwwwo......',
  '......owwwwwwwbbbbwwwwwwwo......',
  '......owwwwwwwbbybwwwwwwwo......',
  '......owwwwwwwbbbbwwwwwwwo......',
  '......oWWWWWWWbbbbWWWWWWWo......',
  '...GGGooooooooooooooooooooGGG...',
  '..GGGGGGGGGGGGGGGGGGGGGGGGGGGG..',
  '..GgGGGGGgGGGGGGGGGGgGGGGGGgGG..',
  '...GGGGGGGGGGGGGGGGGGGGGGGGGG...',
  '................................',
  '................................',
  '................................',
  '................................',
];
const PAL = {
  o: [74, 54, 64], r: [239, 111, 139], R: [255, 196, 210], C: [232, 138, 118], L: [243, 167, 150], d: [201, 109, 92],
  w: [247, 230, 200], W: [230, 207, 169], g: [200, 141, 94], b: [158, 106, 67], p: [239, 143, 160], y: [242, 198, 90],
  G: [120, 192, 92], gg: [92, 159, 72],
};
PAL.g2 = PAL.gg;

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// size: lado del PNG · artScale: tamaño del dibujo (fracción) · round: esquinas redondeadas
// transparent: sin fondo (capa frontal de los íconos adaptativos de Android)
function render(size, artFrac, round, transparent = false) {
  const buf = Buffer.alloc(size * size * 4);
  const bgTop = [255, 233, 201], bgBot = [242, 167, 176];
  const r = round ? size * 0.22 : 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let inside = true;
    if (r) {
      const cx = x < r ? r : x > size - r ? size - r : x, cy = y < r ? r : y > size - r ? size - r : y;
      inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    }
    const i = (y * size + x) * 4, t = y / size;
    if (!inside || transparent) { buf[i + 3] = 0; continue; }
    buf[i] = Math.round(bgTop[0] + (bgBot[0] - bgTop[0]) * t);
    buf[i + 1] = Math.round(bgTop[1] + (bgBot[1] - bgTop[1]) * t);
    buf[i + 2] = Math.round(bgTop[2] + (bgBot[2] - bgTop[2]) * t);
    buf[i + 3] = 255;
  }
  const px = Math.floor((size * artFrac) / 32);
  const off = Math.floor((size - px * 32) / 2);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const ch = ART[y][x];
    if (ch === '.') continue;
    const col = ch === 'g' && y >= 24 ? PAL.gg : PAL[ch];
    if (!col) continue;
    for (let yy = 0; yy < px; yy++) for (let xx = 0; xx < px; xx++) {
      const i = ((off + y * px + yy) * size + off + x * px + xx) * 4;
      buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = 255;
    }
  }
  return png(size, size, buf);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon-192.png'), render(192, 0.86, true));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), render(512, 0.86, true));
fs.writeFileSync(path.join(OUT, 'maskable-512.png'), render(512, 0.66, false));
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), render(180, 0.8, false));
console.log('Íconos generados en', OUT);

// Íconos de la app de Android
const RES = path.resolve(OUT, '../../android/app/src/main/res');
if (fs.existsSync(RES)) {
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    const dir = path.join(RES, 'mipmap-' + d);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), render(Math.round(48 * k), 0.86, true));
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), render(Math.round(108 * k), 0.6, false, true));
  }
  const assets = path.resolve(RES, '../assets');
  fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(path.join(assets, 'icono.png'), render(192, 0.86, true));
  console.log('Íconos de Android generados en', RES);
}
