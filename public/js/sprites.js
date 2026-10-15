// Arte pixel 100 % original, generado con código al iniciar.
// Nada se copia de otros juegos: son mapas de píxeles y formas dibujadas acá.
import { LOOK } from '../shared/data.js';

export const OUT = '#4a3640';
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const ctx = (c) => { const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return g; };

// ---------------------------------------------------------------- utilidades
// Dibuja un mapa de caracteres con una paleta { letra: color }.
export function pix(rows, pal, c = null, ox = 0, oy = 0) {
  const w = Math.max(...rows.map(r => r.length)), h = rows.length;
  c = c || mk(w, h);
  const g = ctx(c);
  for (let y = 0; y < h; y++) {
    const r = rows[y];
    for (let x = 0; x < r.length; x++) {
      const col = pal[r[x]];
      if (!col) continue;
      g.fillStyle = col; g.fillRect(ox + x, oy + y, 1, 1);
    }
  }
  return c;
}
function disc(g, cx, cy, r, col) {
  g.fillStyle = col;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) g.fillRect(x, y, 1, 1);
}
// Contorno de 1 px alrededor de lo dibujado
function outline(c, col = OUT) {
  const g = c.getContext('2d');
  const { width: w, height: h } = c;
  const d = g.getImageData(0, 0, w, h).data;
  const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : d[(y * w + x) * 4 + 3];
  g.fillStyle = col;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (a(x, y)) continue;
    if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) g.fillRect(x, y, 1, 1);
  }
  return c;
}
function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function speckle(g, x0, y0, w, h, cols, n, seed) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash(i, seed, 1) * w), y = Math.floor(hash(seed, i, 2) * h);
    g.fillStyle = cols[i % cols.length]; g.fillRect(x0 + x, y0 + y, 1, 1);
  }
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); gg = Math.round((t - gg) * p + gg); b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) + (r << 16) + (gg << 8) + b).toString(16).slice(1);
}
export { shade };

// ---------------------------------------------------------------- colores
export const C = {
  grass: '#93d26f', grassD: '#7fc15d', grassL: '#ade383', tuft: '#6fb04f', grassF: '#8bc867',
  sand: '#f3dfa8', sandD: '#e6cc8c', sandL: '#fbefca',
  water: '#6cc4e6', waterD: '#58b0d8', waterL: '#93d9f3', foam: '#eafbff',
  path: '#dfc08f', pathD: '#cdaa78', pathL: '#ecd5aa',
  cliff: '#a08c7d', cliffD: '#7c6a60', cliffL: '#b9a697', cliffTop: '#86b85e',
  dock: '#c99060', dockD: '#a5714a', dockL: '#ddaa7c',
  soil: '#a8754e', soilD: '#8b5d3c', soilW: '#7a5034', soilWD: '#62402a',
  roof: '#e88a76', roofD: '#c96d5c', roofL: '#f3a796', wall: '#f7e6c8', wallD: '#e6cfa9', wood: '#c88d5e', woodD: '#9e6a43', woodL: '#dfa878',
  glass: '#9fd4ea', glow: '#ffe39a',
  cave: '#71657a', caveD: '#62576b', caveL: '#7e7287', caveWall: '#4a4152', caveWallD: '#3a3341', caveWallL: '#5d5266',
  floor: '#dcab79', floorD: '#c99668', floorL: '#e8bd8f', wallpaper: '#f6dccb', wallpaperS: '#efcdb9', base: '#b27b56', void: '#2f2632',
  leaf: '#78c05c', leafD: '#5c9f48', leafL: '#9bd775', trunk: '#9c6a46', trunkD: '#7a4f34',
  rock: '#b6aeb0', rockD: '#918a8f', rockL: '#d2cccd',
};

// ---------------------------------------------------------------- casillas
const T = 16;
export function tileGrass(x, y, variant = 'grass') {
  const c = mk(T, T), g = ctx(c);
  g.fillStyle = variant === 'f' ? C.grassF : C.grass; g.fillRect(0, 0, T, T);
  speckle(g, 0, 0, T, T, [C.grassD, C.grassL], 6, x * 31 + y * 7);
  if (hash(x, y) < 0.35) { // matita
    const tx = 3 + Math.floor(hash(y, x) * 9), ty = 4 + Math.floor(hash(x, y, 3) * 8);
    g.fillStyle = C.tuft; g.fillRect(tx, ty, 1, 2); g.fillRect(tx + 2, ty, 1, 2); g.fillRect(tx + 1, ty - 1, 1, 3);
  }
  if (variant !== 'f' && hash(x, y, 9) < 0.06) { // florcita mínima
    const tx = 2 + Math.floor(hash(x, y, 5) * 12), ty = 2 + Math.floor(hash(x, y, 6) * 12);
    g.fillStyle = ['#fff6e0', '#ffd0dc', '#fff0a0'][Math.floor(hash(x, y, 7) * 3)];
    g.fillRect(tx, ty, 1, 1);
  }
  return c;
}
export function tileSand(x, y) {
  const c = mk(T, T), g = ctx(c);
  g.fillStyle = C.sand; g.fillRect(0, 0, T, T);
  speckle(g, 0, 0, T, T, [C.sandD, C.sandL, C.sandD], 7, x * 13 + y * 17);
  if (hash(x, y, 4) < 0.08) { g.fillStyle = '#f4b9b0'; g.fillRect(6, 7, 2, 1); g.fillRect(5, 8, 4, 1); } // caracolita
  return c;
}
export function tilePath(x, y, n) {
  const c = mk(T, T), g = ctx(c);
  g.fillStyle = C.path; g.fillRect(0, 0, T, T);
  speckle(g, 0, 0, T, T, [C.pathD, C.pathL], 8, x * 5 + y * 11);
  g.fillStyle = C.grass;
  for (let i = 0; i < T; i++) {
    const j = hash(i, x + y * 40) < 0.5 ? 1 : 2;
    if (!n.u) g.fillRect(i, 0, 1, j);
    if (!n.d) g.fillRect(i, T - j, 1, j);
    if (!n.l) g.fillRect(0, i, j, 1);
    if (!n.r) g.fillRect(T - j, i, j, 1);
  }
  return c;
}
export function tileWater(x, y, n, frame) {
  const c = mk(T, T), g = ctx(c);
  g.fillStyle = C.water; g.fillRect(0, 0, T, T);
  for (let i = 0; i < 3; i++) {
    const wx = Math.floor(hash(x, y, i) * 12), wy = Math.floor(hash(y, x, i) * 14) + (frame && i === 1 ? 1 : 0);
    g.fillStyle = (i + frame) % 2 ? C.waterL : C.waterD;
    g.fillRect((wx + frame * 2) % 13, wy, 3, 1);
  }
  g.fillStyle = C.foam;
  const f = frame ? 1 : 0;
  if (n.u) { for (let i = 0; i < T; i += 2) g.fillRect(i + f, 0, 1, 1); g.fillStyle = C.waterL; g.fillRect(0, 1, T, 1); g.fillStyle = C.foam; }
  if (n.d) for (let i = 0; i < T; i += 2) g.fillRect(i + f, T - 1, 1, 1);
  if (n.l) for (let i = 0; i < T; i += 2) g.fillRect(0, i + f, 1, 1);
  if (n.r) for (let i = 0; i < T; i += 2) g.fillRect(T - 1, i + f, 1, 1);
  return c;
}
export function tileCliff(x, y, below) {
  const c = mk(T, T), g = ctx(c);
  if (below) { // cara visible
    g.fillStyle = C.cliff; g.fillRect(0, 0, T, T);
    g.fillStyle = C.cliffTop; g.fillRect(0, 0, T, 3);
    g.fillStyle = C.leafD; for (let i = 0; i < T; i += 3) g.fillRect(i + (hash(x, i) < 0.5 ? 0 : 1), 3, 2, 1);
    g.fillStyle = C.cliffD; g.fillRect(0, T - 2, T, 2);
    for (let i = 0; i < 3; i++) { const sx = Math.floor(hash(x, y, i) * 13); g.fillRect(sx, 6 + i * 3, 3, 1); }
    g.fillStyle = C.cliffL; g.fillRect(2, 5, 2, 1); g.fillRect(9, 9, 2, 1);
  } else {
    g.fillStyle = C.cliffTop; g.fillRect(0, 0, T, T);
    speckle(g, 0, 0, T, T, [C.leafD, C.grassL], 8, x * 3 + y);
  }
  return c;
}
export function tileDock(x, y) {
  const c = mk(T, T), g = ctx(c);
  g.fillStyle = C.dock; g.fillRect(0, 0, T, T);
  g.fillStyle = C.dockD;
  for (let i = 3; i < T; i += 4) g.fillRect(0, i, T, 1);
  g.fillStyle = C.dockL; for (let i = 0; i < T; i += 4) g.fillRect(0, i, T, 1);
  g.fillStyle = C.dockD; g.fillRect(2 + (y % 2) * 8, 1, 1, 1); g.fillRect(9 - (y % 2) * 6, 9, 1, 1);
  return c;
}
export function tileBridge(broken, frame) {
  const c = mk(T, T), g = ctx(c);
  g.drawImage(tileWater(1, 1, {}, frame), 0, 0);
  g.fillStyle = C.woodD; g.fillRect(0, 2, T, 1); g.fillRect(0, 13, T, 1);
  if (broken) {
    g.fillStyle = C.dock;
    g.fillRect(0, 4, 5, 8); g.fillRect(12, 5, 4, 6);
    g.fillStyle = C.dockD; g.fillRect(0, 8, 5, 1); g.fillRect(12, 8, 4, 1);
  } else {
    g.fillStyle = C.dock; g.fillRect(0, 3, T, 10);
    g.fillStyle = C.dockD; for (let i = 3; i < T; i += 4) g.fillRect(i, 3, 1, 10);
    g.fillStyle = C.dockL; g.fillRect(0, 3, T, 1);
  }
  return c;
}
export function tileSoil(watered, x, y) {
  const c = mk(T, T), g = ctx(c);
  g.fillStyle = watered ? C.soilW : C.soil; g.fillRect(1, 1, 14, 14);
  g.fillStyle = watered ? C.soilWD : C.soilD;
  for (let i = 3; i < 14; i += 4) g.fillRect(2, i, 12, 1);
  g.fillStyle = shade(watered ? C.soilW : C.soil, 0.15); g.fillRect(1, 1, 14, 1);
  return c;
}
export function tileCave(kind, x, y, below) {
  const c = mk(T, T), g = ctx(c);
  if (kind === 'floor') {
    g.fillStyle = C.cave; g.fillRect(0, 0, T, T);
    speckle(g, 0, 0, T, T, [C.caveD, C.caveL], 7, x * 7 + y * 3);
    if (hash(x, y, 2) < 0.15) { g.fillStyle = C.caveL; g.fillRect(5, 9, 3, 2); g.fillStyle = C.caveD; g.fillRect(5, 11, 3, 1); }
  } else if (below) {
    g.fillStyle = C.caveWall; g.fillRect(0, 0, T, T);
    g.fillStyle = C.caveWallL; g.fillRect(0, 0, T, 2);
    g.fillStyle = C.caveWallD; g.fillRect(0, T - 3, T, 3);
    for (let i = 0; i < 3; i++) g.fillRect(Math.floor(hash(x, i, y) * 12), 4 + i * 3, 4, 1);
  } else {
    g.fillStyle = C.caveWallD; g.fillRect(0, 0, T, T);
    speckle(g, 0, 0, T, T, ['#332d39', '#40384a'], 6, x + y * 9);
  }
  return c;
}
export function tileHouse(kind, x, y) {
  const c = mk(T, T), g = ctx(c);
  if (kind === 'floor' || kind === 'door') {
    g.fillStyle = C.floor; g.fillRect(0, 0, T, T);
    g.fillStyle = C.floorD; g.fillRect(0, 7, T, 1); g.fillRect(0, 15, T, 1);
    g.fillRect(((y * 5) % 12) + 2, 0, 1, 7); g.fillRect(((y * 7 + 6) % 12) + 2, 8, 1, 7);
    g.fillStyle = C.floorL; g.fillRect(0, 0, T, 1); g.fillRect(0, 8, T, 1);
    if (kind === 'door') {
      g.fillStyle = '#e9897a'; g.fillRect(2, 3, 12, 10);
      g.fillStyle = '#f6b3a5'; g.fillRect(3, 4, 10, 8);
      g.fillStyle = '#e9897a'; g.fillRect(5, 6, 6, 4);
    }
  } else if (kind === 'wallface') {
    g.fillStyle = C.wallpaper; g.fillRect(0, 0, T, T);
    g.fillStyle = C.wallpaperS; for (let i = 1; i < T; i += 4) g.fillRect(i, 0, 2, T - 3);
    g.fillStyle = C.base; g.fillRect(0, T - 3, T, 3);
    g.fillStyle = shade(C.base, 0.25); g.fillRect(0, T - 3, T, 1);
  } else {
    g.fillStyle = C.void; g.fillRect(0, 0, T, T);
  }
  return c;
}

// ---------------------------------------------------------------- objetos del mundo
const cacheObj = new Map();
function cached(key, fn) { if (!cacheObj.has(key)) cacheObj.set(key, fn()); return cacheObj.get(key); }

export function tree(stump = false, shakeHit = 0) {
  return cached('tree' + stump, () => {
    const c = mk(32, 36), g = ctx(c);
    // tronco
    g.fillStyle = C.trunk; g.fillRect(13, stump ? 26 : 22, 6, stump ? 7 : 11);
    g.fillStyle = C.trunkD; g.fillRect(17, stump ? 26 : 22, 2, stump ? 7 : 11); g.fillRect(12, 32, 8, 1);
    if (stump) {
      g.fillStyle = '#d7a874'; g.fillRect(13, 25, 6, 2); g.fillStyle = '#b98557'; g.fillRect(15, 25, 2, 1);
      return outline(c);
    }
    // copa
    disc(g, 16, 13, 10.5, C.leafD);
    disc(g, 8, 17, 6.5, C.leafD); disc(g, 24, 17, 6.5, C.leafD);
    disc(g, 16, 12, 9.5, C.leaf); disc(g, 9, 15, 5.5, C.leaf); disc(g, 23, 15, 5.5, C.leaf);
    disc(g, 13, 8, 4.5, C.leafL); disc(g, 7, 13, 2.5, C.leafL); disc(g, 21, 10, 2.5, C.leafL);
    g.fillStyle = C.leafD; for (const [x, y] of [[18, 15], [11, 18], [22, 19], [15, 20], [8, 19]]) g.fillRect(x, y, 2, 1);
    // frutitas
    g.fillStyle = '#f07a7a'; g.fillRect(19, 7, 2, 2); g.fillRect(9, 12, 2, 2); g.fillRect(24, 14, 2, 2);
    g.fillStyle = '#ffd0c8'; g.fillRect(19, 7, 1, 1); g.fillRect(9, 12, 1, 1); g.fillRect(24, 14, 1, 1);
    return outline(c);
  });
}

function rockBase(g, specks, specCol, specCol2) {
  disc(g, 8, 10, 6.5, C.rockD); disc(g, 7.5, 9, 6, C.rock); disc(g, 6, 7, 2.5, C.rockL);
  if (specks) for (const [x, y] of specks) { g.fillStyle = specCol; g.fillRect(x, y, 2, 2); g.fillStyle = specCol2; g.fillRect(x, y, 1, 1); }
}
export function rock(kind) {
  return cached('rock' + kind, () => {
    const c = mk(16, 16), g = ctx(c);
    if (kind === 'roca') rockBase(g, null);
    if (kind === 'roca_cobre') rockBase(g, [[9, 6], [5, 11], [10, 11], [4, 7]], '#e0874e', '#ffc08a');
    if (kind === 'roca_cuarzo') {
      rockBase(g, null);
      g.fillStyle = '#f7a8c8'; g.fillRect(6, 3, 3, 8); g.fillRect(10, 5, 2, 6); g.fillRect(3, 7, 2, 4);
      g.fillStyle = '#ffd9e8'; g.fillRect(6, 3, 1, 6); g.fillRect(10, 5, 1, 4);
      g.fillStyle = '#d97aa5'; g.fillRect(8, 4, 1, 7);
    }
    return outline(c);
  });
}
export function rubble() {
  return cached('rubble', () => {
    const c = mk(16, 16), g = ctx(c);
    g.fillStyle = C.rockD; g.fillRect(4, 11, 3, 2); g.fillRect(9, 12, 2, 1); g.fillRect(7, 13, 2, 1);
    return c;
  });
}
export function bush(gone) {
  return cached('bush' + gone, () => {
    const c = mk(16, 16), g = ctx(c);
    if (gone) { g.fillStyle = C.leafD; g.fillRect(5, 12, 6, 2); g.fillStyle = C.trunk; g.fillRect(7, 10, 1, 3); g.fillRect(9, 11, 1, 2); return outline(c); }
    disc(g, 8, 10, 6, C.leafD); disc(g, 8, 9, 5.5, C.leaf); disc(g, 6, 7, 2.5, C.leafL);
    g.fillStyle = C.trunk; g.fillRect(2, 5, 1, 3); g.fillRect(1, 5, 1, 1); g.fillRect(13, 4, 1, 4); g.fillRect(14, 4, 1, 1); g.fillRect(9, 2, 1, 3);
    return outline(c);
  });
}
export function pebbles() {
  return cached('pebbles', () => {
    const c = mk(16, 16), g = ctx(c);
    for (const [x, y, r] of [[5, 11, 2], [10, 12, 1.6], [8, 8, 1.4]]) { disc(g, x, y, r + 0.3, C.rockD); disc(g, x - 0.3, y - 0.3, r, C.rock); }
    g.fillStyle = C.rockL; g.fillRect(4, 10, 1, 1); g.fillRect(7, 7, 1, 1);
    return outline(c, '#6e6468');
  });
}
export function tallGrass() {
  return cached('grass', () => {
    const c = mk(16, 16), g = ctx(c);
    const blades = [[3, 6, '#6fb04f'], [5, 3, '#86c862'], [7, 5, '#6fb04f'], [9, 2, '#9ad874'], [11, 5, '#86c862'], [13, 7, '#6fb04f']];
    for (const [x, top, col] of blades) { g.fillStyle = col; g.fillRect(x, top, 1, 14 - top); g.fillRect(x + 1, top + 2, 1, 12 - top); }
    g.fillStyle = '#e8d690'; g.fillRect(9, 1, 1, 2); g.fillRect(5, 2, 1, 2);
    return outline(c, '#4f7d3c');
  });
}
const FLOWER_COLS = { flor_sol: ['#ffd84d', '#fff2a8', '#e0a52a'], flor_azul: ['#86a8f2', '#c9d8ff', '#5f7fd0'], flor_rosa: ['#f487a8', '#ffd0dd', '#d4607f'], flor_luna: ['#d8c8ff', '#ffffff', '#a58be0'] };
export function flower(kind) {
  return cached('fl' + kind, () => {
    const c = mk(16, 16), g = ctx(c), [a, b, d] = FLOWER_COLS[kind];
    g.fillStyle = '#5e9e45'; g.fillRect(7, 8, 1, 6); g.fillRect(5, 11, 2, 1); g.fillRect(8, 10, 2, 1);
    g.fillStyle = a; g.fillRect(6, 4, 3, 1); g.fillRect(5, 5, 5, 3); g.fillRect(6, 8, 3, 1);
    g.fillStyle = b; g.fillRect(6, 5, 1, 1);
    g.fillStyle = d; g.fillRect(7, 6, 1, 1);
    if (kind === 'flor_luna') { g.fillStyle = '#fffbe0'; g.fillRect(10, 3, 1, 1); g.fillRect(3, 6, 1, 1); }
    return outline(c);
  });
}
export function fence(n) {
  const key = 'fence' + (n.l ? 1 : 0) + (n.r ? 1 : 0) + (n.u ? 1 : 0) + (n.d ? 1 : 0);
  return cached(key, () => {
    const c = mk(16, 16), g = ctx(c);
    g.fillStyle = C.wood;
    if (n.l) { g.fillRect(0, 7, 8, 2); g.fillRect(0, 11, 8, 2); }
    if (n.r) { g.fillRect(8, 7, 8, 2); g.fillRect(8, 11, 8, 2); }
    if (n.u) g.fillRect(7, 0, 2, 8);
    if (n.d) g.fillRect(7, 8, 2, 8);
    g.fillStyle = C.woodD; g.fillRect(6, 5, 4, 10); g.fillStyle = C.woodL; g.fillRect(6, 5, 4, 1);
    return outline(c);
  });
}
export function lampPost() {
  return cached('lamp', () => {
    const c = mk(16, 28), g = ctx(c);
    g.fillStyle = '#5b4a55'; g.fillRect(7, 8, 2, 18); g.fillRect(5, 25, 6, 2);
    g.fillStyle = '#6e5c68'; g.fillRect(4, 2, 8, 2); g.fillRect(5, 9, 6, 1);
    g.fillStyle = '#ffe7a6'; g.fillRect(5, 4, 6, 5);
    g.fillStyle = '#fff6d6'; g.fillRect(6, 5, 2, 2);
    return outline(c);
  });
}
export function mailbox(flagUp) {
  return cached('mail' + flagUp, () => {
    const c = mk(16, 24), g = ctx(c);
    g.fillStyle = C.woodD; g.fillRect(7, 11, 3, 12);
    g.fillStyle = '#ef8fa0'; g.fillRect(3, 5, 11, 7); g.fillRect(4, 4, 9, 1);
    g.fillStyle = '#f7b8c3'; g.fillRect(4, 5, 8, 1);
    g.fillStyle = '#c9667a'; g.fillRect(3, 10, 11, 2);
    g.fillStyle = '#fff3e0'; g.fillRect(5, 7, 5, 1);
    if (flagUp) { g.fillStyle = '#7a5a4a'; g.fillRect(14, 1, 1, 8); g.fillStyle = '#ffd44d'; g.fillRect(15, 1, 1, 3); g.fillRect(14, 1, 1, 1); }
    else { g.fillStyle = '#7a5a4a'; g.fillRect(14, 8, 2, 1); }
    return outline(c);
  });
}
export function board() {
  return cached('board', () => {
    const c = mk(16, 24), g = ctx(c);
    g.fillStyle = C.woodD; g.fillRect(3, 12, 2, 11); g.fillRect(11, 12, 2, 11);
    g.fillStyle = C.wood; g.fillRect(1, 3, 14, 11);
    g.fillStyle = C.woodL; g.fillRect(1, 3, 14, 1);
    g.fillStyle = '#fff6e4'; g.fillRect(3, 5, 5, 6); g.fillRect(9, 6, 4, 4);
    g.fillStyle = '#cfb8a4'; g.fillRect(4, 7, 3, 1); g.fillRect(4, 9, 2, 1); g.fillRect(10, 7, 2, 1);
    g.fillStyle = '#ef8fa0'; g.fillRect(5, 5, 1, 1); g.fillRect(11, 6, 1, 1);
    return outline(c);
  });
}
export function bench() {
  return cached('bench', () => {
    const c = mk(32, 20), g = ctx(c);
    g.fillStyle = C.woodD; g.fillRect(3, 12, 2, 7); g.fillRect(27, 12, 2, 7);
    g.fillStyle = C.wood; g.fillRect(1, 3, 30, 3); g.fillRect(1, 7, 30, 2); g.fillRect(1, 11, 30, 3);
    g.fillStyle = C.woodL; g.fillRect(1, 11, 30, 1); g.fillRect(1, 3, 30, 1);
    g.fillStyle = C.woodD; g.fillRect(4, 3, 2, 9); g.fillRect(26, 3, 2, 9);
    return outline(c);
  });
}
export function chest(open) {
  return cached('chest' + open, () => {
    const c = mk(16, 16), g = ctx(c);
    g.fillStyle = '#a8673f'; g.fillRect(2, 7, 12, 8);
    g.fillStyle = '#7d4a2d'; g.fillRect(2, 11, 12, 1);
    g.fillStyle = '#f2c65a'; g.fillRect(2, 7, 1, 8); g.fillRect(13, 7, 1, 8);
    if (open) {
      g.fillStyle = '#5a3420'; g.fillRect(3, 6, 10, 2);
      g.fillStyle = '#c47e50'; g.fillRect(2, 2, 12, 4);
      g.fillStyle = '#ffe9a0'; g.fillRect(5, 6, 2, 1); g.fillRect(9, 6, 1, 1);
    } else {
      g.fillStyle = '#c47e50'; g.fillRect(2, 4, 12, 4);
      g.fillStyle = '#f2c65a'; g.fillRect(7, 7, 2, 3);
      g.fillStyle = '#dca06c'; g.fillRect(3, 4, 10, 1);
    }
    return outline(c);
  });
}
export function petBed() {
  return cached('petbed', () => {
    const c = mk(16, 16), g = ctx(c);
    g.fillStyle = '#c99a5c'; g.fillRect(1, 7, 14, 7); g.fillRect(2, 6, 12, 1);
    g.fillStyle = '#a97a44'; for (let i = 2; i < 15; i += 3) g.fillRect(i, 8, 1, 5);
    g.fillStyle = '#f3c6d0'; g.fillRect(3, 7, 10, 3);
    g.fillStyle = '#f9dfe5'; g.fillRect(4, 7, 4, 1);
    return outline(c);
  });
}

// ---------------------------------------------------------------- casa (exterior)
export function houseExterior(level) {
  return cached('house' + level, () => {
    const W = 80, H = 80; // 5 casillas de ancho, la base en y=80 (techo sobresale 1 casilla)
    const c = mk(W + 8, H), g = ctx(c), ox = 4;
    // paredes
    g.fillStyle = C.wall; g.fillRect(ox + 2, 34, W - 4, 44);
    g.fillStyle = C.wallD; g.fillRect(ox + 2, 74, W - 4, 4);
    g.fillStyle = C.wood; g.fillRect(ox + 2, 34, 3, 44); g.fillRect(ox + W - 5, 34, 3, 44); g.fillRect(ox + 2, 34, W - 4, 3);
    // techo
    for (let i = 0; i < 26; i++) {
      const w = W + 6 - Math.max(0, 14 - i) * 2;
      g.fillStyle = i % 5 === 4 ? C.roofD : C.roof;
      g.fillRect(ox + (W - w) / 2, 12 + i, w, 1);
    }
    g.fillStyle = C.roofL; g.fillRect(ox + 16, 13, W - 32, 2);
    g.fillStyle = C.roofD; g.fillRect(ox - 3, 37, W + 6, 2);
    if (level >= 2) { // chimenea
      g.fillStyle = '#b5a7a3'; g.fillRect(ox + 56, 4, 9, 16);
      g.fillStyle = '#958682'; g.fillRect(ox + 55, 2, 11, 3);
    }
    // ventanas
    const win = (x, y, w = 14, h = 12) => {
      g.fillStyle = C.wood; g.fillRect(x - 1, y - 1, w + 2, h + 2);
      g.fillStyle = C.glass; g.fillRect(x, y, w, h);
      g.fillStyle = '#d6f0fa'; g.fillRect(x + 1, y + 1, 4, 3);
      g.fillStyle = C.wood; g.fillRect(x + w / 2 - 1, y, 2, h); g.fillRect(x, y + h / 2 - 1, w, 2);
    };
    win(ox + 10, 46); win(ox + 56, 46);
    if (level >= 3) { // macetero con flores
      for (const x of [ox + 8, ox + 54]) {
        g.fillStyle = C.woodD; g.fillRect(x, 60, 18, 4);
        for (let i = 0; i < 6; i++) { g.fillStyle = ['#f487a8', '#ffd84d', '#86a8f2'][i % 3]; g.fillRect(x + 1 + i * 3, 58, 2, 2); }
      }
    }
    // puerta (centrada en la casilla del medio)
    g.fillStyle = C.woodD; g.fillRect(ox + 31, 50, 18, 28);
    g.fillStyle = C.wood; g.fillRect(ox + 33, 52, 14, 26);
    g.fillStyle = C.woodL; g.fillRect(ox + 33, 52, 14, 1); g.fillRect(ox + 39, 53, 2, 25);
    g.fillStyle = '#f2c65a'; g.fillRect(ox + 43, 65, 2, 2);
    // corazoncito sobre la puerta
    g.fillStyle = '#ef8fa0'; g.fillRect(ox + 37, 43, 2, 2); g.fillRect(ox + 41, 43, 2, 2); g.fillRect(ox + 37, 45, 6, 2); g.fillRect(ox + 38, 47, 4, 1); g.fillRect(ox + 39, 48, 2, 1);
    return outline(c);
  });
}
export function houseWindows(level) { // posiciones de las ventanas para iluminarlas de noche
  return [[4 + 10, 46], [4 + 56, 46]];
}
export function smoke(t) {
  const c = mk(16, 20), g = ctx(c);
  for (let i = 0; i < 3; i++) {
    const p = ((t / 1400) + i / 3) % 1;
    g.globalAlpha = 0.65 * (1 - p);
    disc(g, 8 + Math.sin((p + i) * 5) * 2, 18 - p * 16, 2 + p * 3, '#efe8ea');
  }
  return c;
}

// ---------------------------------------------------------------- cultivos
export function crop(type, step, steps) {
  return cached(`crop${type}${step}/${steps}`, () => {
    const c = mk(16, 16), g = ctx(c);
    const ready = step >= steps;
    const leaf = (x, y, w, h, col = '#6fbf52') => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    if (step === 0) { leaf(7, 9, 1, 4, '#5e9e45'); leaf(5, 8, 2, 2); leaf(8, 7, 2, 2); return outline(c, '#3e6b33'); }
    if (type === 'rabanito') {
      leaf(7, 6, 1, 7, '#5e9e45'); leaf(3, 4, 4, 3); leaf(8, 3, 4, 3); leaf(4, 4, 2, 1, '#9ad874');
      if (ready) { g.fillStyle = '#e8577a'; g.fillRect(5, 10, 6, 5); g.fillStyle = '#f78fa8'; g.fillRect(6, 10, 2, 2); g.fillStyle = '#fff'; g.fillRect(7, 15, 2, 1); }
    } else if (type === 'frutilla') {
      disc(g, 8, 9, 5, '#5ea946'); disc(g, 7, 8, 3.5, '#7bc75c');
      if (step >= 2) { g.fillStyle = '#fff'; g.fillRect(4, 6, 2, 2); g.fillRect(10, 9, 2, 2); g.fillStyle = '#ffd84d'; g.fillRect(4, 6, 1, 1); g.fillRect(10, 9, 1, 1); }
      if (ready) for (const [x, y] of [[4, 9], [9, 6], [10, 11], [6, 12]]) { g.fillStyle = '#ec4b5e'; g.fillRect(x, y, 3, 3); g.fillStyle = '#ffb3bd'; g.fillRect(x, y, 1, 1); g.fillStyle = '#ffe3a0'; g.fillRect(x + 2, y + 2, 1, 1); }
    } else if (type === 'calabaza') {
      leaf(2, 10, 12, 2, '#5e9e45'); leaf(3, 7, 4, 3); leaf(10, 8, 4, 3);
      if (step === 2 && !ready) { disc(g, 8, 11, 2.6, '#9ccc5a'); }
      if (ready) { disc(g, 8, 10, 5.5, '#e98a36'); disc(g, 7, 9, 3, '#f6a654'); g.fillStyle = '#c96c22'; g.fillRect(8, 5, 1, 10); g.fillRect(4, 6, 1, 8); g.fillRect(11, 6, 1, 8); g.fillStyle = '#5e9e45'; g.fillRect(8, 3, 2, 3); }
    }
    return outline(c, '#3e5a33');
  });
}

// ---------------------------------------------------------------- personajes
const BODY = {
  down: [
    '................', '................', '................',
    '.....OOOOOO.....', '....OKKKKKKO....', '...OKKKKKKKKO...', '...OKKKKKKKKO...',
    '...OKEKKKKEKO...', '...OKEKKKKEKO...', '...OCKKKKKKCO...', '....OKKKKKKO....',
    '....OOSSSSOO....', '...OSSSSSSSSO...', '...OKSSSSSSKO...', '...OKsSSSSsKO...',
    '....OSSSSSSO....', '....OPPPPPPO....', '....OPPOOPPO....', '....OBBOOBBO....', '.....OO..OO.....',
  ],
  up: [
    '................', '................', '................',
    '.....OOOOOO.....', '....OKKKKKKO....', '...OKKKKKKKKO...', '...OKKKKKKKKO...',
    '...OKKKKKKKKO...', '...OKKKKKKKKO...', '...OKKKKKKKKO...', '....OKKKKKKO....',
    '....OOSSSSOO....', '...OSSSSSSSSO...', '...OKSSSSSSKO...', '...OKsSSSSsKO...',
    '....OSSSSSSO....', '....OPPPPPPO....', '....OPPOOPPO....', '....OBBOOBBO....', '.....OO..OO.....',
  ],
  right: [
    '................', '................', '................',
    '.....OOOOOO.....', '....OKKKKKKO....', '...OKKKKKKKKO...', '...OKKKKKKKKO...',
    '...OKKKKKKEKO...', '...OKKKKKKEKO...', '...OKKKKKKKCO...', '....OKKKKKKO....',
    '.....OSSSSO.....', '....OSSSSSSO....', '....OSSSKSSO....', '....OSsSKsSO....',
    '....OSSSSSSO....', '.....OPPPPO.....', '.....OPPPPO.....', '.....OBBBBO.....', '......OOOO......',
  ],
};
const LEGS = {
  down: [
    ['....OPPPPPPO....', '....OBBOOPPO....', '.....OO.OBBO....', '.........OO.....'],
    ['....OPPPPPPO....', '....OPPOOBBO....', '....OBBO.OO.....', '.....OO.........'],
  ],
  right: [
    ['.....OPPPPO.....', '....OPPOPPO.....', '....OBBOOBBO....', '.....OO..OO.....'],
    ['.....OPPPPO.....', '.....OPPPPO.....', '.....OBBBBO.....', '......OOOO......'],
  ],
};
// Peinados: '.' no toca; H pelo, h sombra, L brillo, O contorno, x borra (transparente)
const HAIR = [
  { // Corto
    down: ['', '', '', '.....OOOOOO.....', '....OHHHHHHO....', '...OHHLHHHHHO...', '...OHHHHHhHHO...', '...OH......HO...', '...Oh......hO...'],
    up: ['', '', '', '.....OOOOOO.....', '....OHHHHHHO....', '...OHHLHHHHHO...', '...OHHHHHHHHO...', '...OHHHHHHHHO...', '...OHHHHHHHHO...', '...OhHHHHHHhO...', '....OhhhhhhO....'],
    right: ['', '', '', '.....OOOOOO.....', '....OHHHHHHO....', '...OHHLHHHHHO...', '...OHHHHHHhhO...', '...OHHHh........', '...OhHh.........', '....Oh..........'],
  },
  { // Largo
    down: ['', '', '', '.....OOOOOO.....', '....OHHHHHHO....', '...OHHLHHHHHO...', '...OHHHHHhHHO...', '..OHH......HHO..', '..OHh......hHO..', '..OHh......hHO..', '..OHhO....OhHO..', '..OHHO....OHHO..', '...OO......OO...'],
    up: ['', '', '', '.....OOOOOO.....', '....OHHHHHHO....', '...OHHLHHHHHO...', '...OHHHHHHHHO...', '..OHHHHHHHHHHO..', '..OHHHHHHHHHHO..', '..OHHHHHHHHHHO..', '..OhHHHHHHHHhO..', '..OhHHHHHHHHhO..', '...OhhhhhhhhO...', '....OOOOOOOO....'],
    right: ['', '', '', '.....OOOOOO.....', '....OHHHHHHO....', '...OHHLHHHHHO...', '...OHHHHHHhhO...', '..OHHHHh........', '..OHhHh.........', '..OHhh..........', '..OHhO..........', '..OHHO..........', '...OO...........'],
  },
  { // Rodete
    down: ['......OOOO......', '.....OHHLHO.....', '.....OHHHhO.....', '....OOOOOOOO....', '....OHHHHHHO....', '...OHHLHHHHHO...', '...OHHHHHhHHO...', '...OH......HO...'],
    up: ['......OOOO......', '.....OHHLHO.....', '.....OHHHhO.....', '....OOhhhhOO....', '....OHHHHHHO....', '...OHHLHHHHHO...', '...OHHHHHHHHO...', '...OHHHHHHHHO...', '...OHHHHHHHHO...', '...OhHHHHHHhO...', '....OhhhhhhO....'],
    right: ['.....OOOO.......', '....OHHLHO......', '....OHHHhO......', '....OOOOOOOO....', '....OHHHHHHO....', '...OHHLHHHHHO...', '...OHHHHHHhhO...', '...OHHHh........', '...OhHh.........'],
  },
  { // Rulos
    down: ['', '', '.....O.OO.O.....', '...OOHOHHOHOO...', '..OHHHHHHHHHHO..', '.OHHLHHHHHHHHHO.', '.OHHHHHHHHhHHHO.', '.OHHO......OHHO.', '..OHO......OHO..', '...O........O...'],
    up: ['', '', '.....O.OO.O.....', '...OOHOHHOHOO...', '..OHHHHHHHHHHO..', '.OHHLHHHHHHHHHO.', '.OHHHHHHHHHHHHO.', '.OHHHHHHHHHHHHO.', '.OHHHHHHHHHHHHO.', '..OhHHHHHHHHhO..', '...OhhOhhOhhO...', '....O..O..O.....'],
    right: ['', '', '.....O.OO.O.....', '...OOHOHHOHOO...', '..OHHHHHHHHHHO..', '.OHHLHHHHHHHHO..', '.OHHHHHHHHhhO...', '.OHHHHh.........', '..OHHh..........', '...OO...........'],
  },
];
const HATS = {
  sombrero_pescador: ['', '....OOOOOOOO....', '...OGGGGGGGGO...', '...OGgGGGGgGO...', '.OOOOOOOOOOOOOO.', '.OYYYYYYYYYYYYO.', '..OOOOOOOOOOOO..'],
  casco_minero: ['', '.....OOOOOO.....', '....OAAAAAAO....', '...OAAaWWaAAO...', '...OAAaWWaAAO...', '..OOOOOOOOOOOO..', '..OaaaaaaaaaaO..', '...OOOOOOOOOO...'],
  corona_flores: ['', '', '', '...O.O..O..O.O..', '..OROYOBOROYOO..', '...OGOGGOGGOGO..'],
};
const HAT_PAL = { O: OUT, G: '#7fb3a8', g: '#5e8f86', Y: '#f2d27a', A: '#f2c65a', a: '#d9a43a', W: '#fff7c9', R: '#f487a8', B: '#86a8f2' };

function mirror(rows) { return rows.map(r => r.split('').reverse().join('')); }
function paintRows(g, rows, pal, ox = 0, oy = 0) {
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y] || '';
    for (let x = 0; x < r.length; x++) {
      const ch = r[x];
      if (ch === '.') continue;
      if (ch === 'x') { g.clearRect(ox + x, oy + y, 1, 1); continue; }
      const col = pal[ch];
      if (!col) continue;
      g.fillStyle = col; g.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

const charCache = new Map();
// dir: down|up|left|right · frame: 0 quieto, 1 y 2 caminando · pose: 'sit'
export function character(look, dir, frame = 0, pose = null) {
  const key = `${look.skin}${look.hair}${look.hairColor}${look.shirt}${look.pants}${look.hat || ''}|${dir}${frame}${pose || ''}`;
  if (charCache.has(key)) return charCache.get(key);
  const c = mk(16, 20), g = ctx(c);
  const skin = LOOK.skin[look.skin] || LOOK.skin[1];
  const hair = LOOK.hairColors[look.hairColor] || LOOK.hairColors[1];
  const shirt = LOOK.clothes[look.shirt] || LOOK.clothes[0];
  const pants = LOOK.clothes[look.pants] || LOOK.clothes[7];
  const pal = { O: OUT, K: skin, k: shade(skin, -0.12), E: '#3a2a35', C: '#f2a0a8', S: shirt, s: shade(shirt, -0.15), P: pants, p: shade(pants, -0.2), B: '#6b4a3e' };
  const hpal = { O: OUT, H: hair, h: shade(hair, -0.22), L: shade(hair, 0.3) };
  const side = dir === 'left' || dir === 'right';
  const base = side ? 'right' : dir;
  let body = BODY[base].slice();
  if (pose === 'sit') {
    body = body.slice(0, 16).concat(side ? ['....OPPPPPPO....', '.....OBBBBO.....', '................', '................'] : ['...OPPPPPPPPO...', '...OBBO..OBBO...', '................', '................']);
  } else if (frame) {
    const legs = side ? LEGS.right[frame - 1] : LEGS.down[frame - 1];
    body = body.slice(0, 16).concat(legs);
  }
  const hairRows = HAIR[look.hair] ? HAIR[look.hair][base] : HAIR[0][base];
  const t = mk(16, 20), tg = ctx(t);
  paintRows(tg, body, pal);
  paintRows(tg, hairRows, hpal);
  if (look.hat && HATS[look.hat]) paintRows(tg, HATS[look.hat], HAT_PAL);
  if (dir === 'left') { g.translate(16, 0); g.scale(-1, 1); }
  g.drawImage(t, 0, 0);
  charCache.set(key, c);
  if (charCache.size > 300) charCache.delete(charCache.keys().next().value);
  return c;
}

// ---------------------------------------------------------------- criaturas
export function musguito(frame, hurt) {
  return cached('mus' + frame + hurt, () => {
    const c = mk(16, 16), g = ctx(c);
    const squash = frame ? 1 : 0;
    const body = hurt ? '#ffffff' : '#7cc46a', dark = hurt ? '#ffd0d0' : '#5a9e4c', light = hurt ? '#fff' : '#a8e08e';
    g.fillStyle = dark; g.fillRect(2, 8 + squash, 12, 7 - squash); g.fillRect(3, 6 + squash, 10, 2); g.fillRect(5, 4 + squash, 6, 2);
    g.fillStyle = body; g.fillRect(3, 7 + squash, 10, 6 - squash); g.fillRect(4, 5 + squash, 8, 3); g.fillRect(6, 4 + squash, 4, 1);
    g.fillStyle = light; g.fillRect(5, 6 + squash, 2, 1); g.fillRect(4, 7 + squash, 1, 1);
    g.fillStyle = '#c6a2e8'; g.fillRect(9, 3 + squash, 2, 1); g.fillRect(10, 2 + squash, 1, 1); // brotecito
    g.fillStyle = '#3a2a35'; g.fillRect(5, 9 + squash, 2, 2); g.fillRect(9, 9 + squash, 2, 2);
    g.fillStyle = '#fff'; g.fillRect(5, 9 + squash, 1, 1); g.fillRect(9, 9 + squash, 1, 1);
    g.fillStyle = '#f2a0a8'; g.fillRect(4, 11 + squash, 1, 1); g.fillRect(11, 11 + squash, 1, 1);
    return outline(c);
  });
}
export function polillin(frame, hurt) {
  return cached('pol' + frame + hurt, () => {
    const c = mk(16, 16), g = ctx(c);
    const wing = hurt ? '#ffffff' : '#f4ecff', wingD = hurt ? '#ffd0d0' : '#d4c3f0';
    if (frame) { g.fillStyle = wingD; g.fillRect(1, 3, 5, 5); g.fillRect(10, 3, 5, 5); g.fillStyle = wing; g.fillRect(2, 3, 4, 3); g.fillRect(10, 3, 4, 3); }
    else { g.fillStyle = wingD; g.fillRect(1, 7, 5, 4); g.fillRect(10, 7, 5, 4); g.fillStyle = wing; g.fillRect(2, 8, 4, 2); g.fillRect(10, 8, 4, 2); }
    g.fillStyle = '#ffe58a'; g.fillRect(6, 5, 4, 7);
    g.fillStyle = '#fff6c4'; g.fillRect(7, 5, 2, 2);
    g.fillStyle = '#e8b84a'; g.fillRect(6, 9, 4, 1);
    g.fillStyle = '#3a2a35'; g.fillRect(6, 6, 1, 1); g.fillRect(9, 6, 1, 1);
    g.fillStyle = '#8a6a5a'; g.fillRect(6, 3, 1, 2); g.fillRect(9, 3, 1, 2);
    return outline(c);
  });
}

// ---------------------------------------------------------------- carpincho
export function carpincho(dir, frame) {
  return cached('cap' + dir + frame, () => {
    const pal = { o: OUT, F: '#b0805a', L: '#c99a72', D: '#7a5238', E: '#3a2a35', n: '#5a3e33', N: '#8a6452', C: '#f2a0a8' };
    const side = dir === 'left' || dir === 'right';
    let rows;
    if (side) {
      rows = [
        '....................',
        '..............oo....',
        '.............oFFo...',
        '...oooooooooooFFFo..',
        '..oFFFLLLLLLLFFFFFo.',
        '.oFFLLLLLLLLLFFFEFFo',
        '.oFFFFFFFFFFFFFFFFno',
        '.oFFFFFFFFFFFFFFFnNo',
        '.oFFFFFFFFFFFFFFFFo.',
        '..oFFFFFFFFFFFFFFo..',
        frame ? '..oDDooooooooDDoo...' : '...oDDoooooooDDo....',
        frame ? '..oDDo......oDDo....' : '...oDDo.....oDDo....',
        frame ? '...oo........oo.....' : '....oo.......oo.....',
        '....................', '....................', '....................',
      ];
    } else if (dir === 'up') {
      rows = [
        '....................',
        '.....oo......oo.....',
        '....oFFo....oFFo....',
        '....oFFFooooFFFo....',
        '...oFFFFFFFFFFFFo...',
        '...oFFLLLLLLLLFFo...',
        '..oFFFLLLLLLLLFFFo..',
        '..oFFFFFFFFFFFFFFo..',
        '..oFFFFFFFFFFFFFFo..',
        '..oFFFFFFFFFFFFFFo..',
        '..oFFFFFFFFFFFFFFo..',
        '...oFFFFFFFFFFFFo...',
        '...oFFFFFDDFFFFFo...',
        frame ? '....oDDooooooDDo....' : '....oDDoo..ooDDo....',
        frame ? '....oDDo....ooo.....' : '....oDDo....oDDo....',
        frame ? '.....oo.............' : '.....oo......oo.....',
      ];
    } else {
      rows = [
        '....................',
        '.....oo......oo.....',
        '....oFFo....oFFo....',
        '....oFFFooooFFFo....',
        '...oFFFFFFFFFFFFo...',
        '...oFFLLLLLLLLFFo...',
        '..oFFFLLLLLLLLFFFo..',
        '..oFFFEFFFFFFEFFFo..',
        '..oFCFFFFFFFFFFCFo..',
        '..oFFFFFnnnnFFFFFo..',
        '..oFFFFFnNNnFFFFFo..',
        '...oFFFFFnnFFFFFo...',
        '...oFFFFFFFFFFFFo...',
        frame ? '....oDDooooooDDo....' : '....oDDoo..ooDDo....',
        frame ? '....oDDo....ooo.....' : '....oDDo....oDDo....',
        frame ? '.....oo.............' : '.....oo......oo.....',
      ];
    }
    if (dir === 'left') rows = rows.map(r => r.split('').reverse().join(''));
    return pix(rows, pal, mk(20, 16));
  });
}

// ---------------------------------------------------------------- muebles
export function furniture(item) {
  return cached('fu' + item, () => {
    let c, g;
    switch (item) {
      case 'silla':
        c = mk(16, 22); g = ctx(c);
        g.fillStyle = C.woodD; g.fillRect(3, 2, 2, 18); g.fillRect(11, 2, 2, 18); g.fillRect(4, 14, 2, 6); g.fillRect(10, 14, 2, 6);
        g.fillStyle = C.wood; g.fillRect(3, 2, 10, 3); g.fillRect(2, 11, 12, 4);
        g.fillStyle = '#f3b7c2'; g.fillRect(3, 11, 10, 2);
        return outline(c);
      case 'mesa':
        c = mk(32, 22); g = ctx(c);
        g.fillStyle = C.woodD; g.fillRect(3, 12, 3, 9); g.fillRect(26, 12, 3, 9);
        g.fillStyle = C.wood; g.fillRect(1, 5, 30, 8);
        g.fillStyle = C.woodL; g.fillRect(1, 5, 30, 2);
        g.fillStyle = '#fff3e6'; g.fillRect(6, 4, 20, 6); g.fillStyle = '#f3b7c2'; for (let i = 6; i < 26; i += 4) g.fillRect(i, 9, 2, 1);
        g.fillStyle = '#ffffff'; g.fillRect(14, 2, 4, 3); g.fillStyle = '#e88a76'; g.fillRect(15, 1, 2, 1);
        return outline(c);
      case 'cama':
        c = mk(32, 36); g = ctx(c);
        g.fillStyle = C.woodD; g.fillRect(1, 2, 30, 8); g.fillRect(1, 30, 30, 5);
        g.fillStyle = C.wood; g.fillRect(2, 3, 28, 6);
        g.fillStyle = '#fffaf2'; g.fillRect(2, 9, 28, 22);
        g.fillStyle = '#ffffff'; g.fillRect(4, 10, 11, 6); g.fillRect(17, 10, 11, 6);
        g.fillStyle = '#f29bb0'; g.fillRect(2, 17, 28, 14);
        g.fillStyle = '#f7bccb'; for (let i = 3; i < 30; i += 5) g.fillRect(i, 19, 2, 2);
        g.fillStyle = '#d9798f'; g.fillRect(2, 17, 28, 1); g.fillRect(2, 30, 28, 1);
        return outline(c);
      case 'alfombra':
        c = mk(32, 32); g = ctx(c);
        g.fillStyle = '#c9b6e8'; g.fillRect(1, 2, 30, 28);
        g.fillStyle = '#e3d7f6'; g.fillRect(4, 5, 24, 22);
        g.fillStyle = '#f3a7bd'; g.fillRect(8, 9, 16, 14);
        g.fillStyle = '#fff1f4'; g.fillRect(11, 12, 10, 8);
        g.fillStyle = '#a995cf'; for (let i = 2; i < 31; i += 3) { g.fillRect(i, 0, 1, 2); g.fillRect(i, 30, 1, 2); }
        return c;
      case 'maceta':
        c = mk(16, 20); g = ctx(c);
        g.fillStyle = '#d98a5f'; g.fillRect(4, 12, 8, 7); g.fillStyle = '#c0714a'; g.fillRect(3, 11, 10, 2);
        disc(g, 8, 8, 4.5, C.leaf);
        for (const [x, y] of [[5, 5], [10, 6], [7, 9], [9, 3]]) { g.fillStyle = '#ffd84d'; g.fillRect(x, y, 2, 2); g.fillStyle = '#fff'; g.fillRect(x, y, 1, 1); }
        return outline(c);
      case 'farol':
        c = mk(16, 24); g = ctx(c);
        g.fillStyle = '#6e5c68'; g.fillRect(7, 10, 2, 12); g.fillRect(4, 21, 8, 2);
        g.fillStyle = '#5b4a55'; g.fillRect(4, 2, 8, 2);
        g.fillStyle = '#ffe1a0'; g.fillRect(4, 4, 8, 7); g.fillStyle = '#fff6d6'; g.fillRect(5, 5, 3, 3);
        return outline(c);
      case 'estante':
        c = mk(32, 28); g = ctx(c);
        g.fillStyle = C.woodD; g.fillRect(1, 1, 30, 26);
        g.fillStyle = C.wood; g.fillRect(3, 3, 26, 22);
        g.fillStyle = C.woodD; g.fillRect(3, 13, 26, 2);
        for (let i = 0; i < 6; i++) { g.fillStyle = ['#f29bb0', '#8cc7e8', '#f2c46d', '#94d39a', '#b9a3ea', '#e8836b'][i]; g.fillRect(5 + i * 4, 5 + (i % 2), 3, 8 - (i % 2)); }
        g.fillStyle = '#fff'; g.fillRect(8, 17, 6, 6); g.fillStyle = '#7fc15d'; g.fillRect(20, 18, 5, 5);
        return outline(c);
      case 'caja_musical':
        c = mk(16, 16); g = ctx(c);
        g.fillStyle = '#b98557'; g.fillRect(2, 7, 12, 8); g.fillStyle = '#d6a272'; g.fillRect(2, 5, 12, 3);
        g.fillStyle = '#f2c65a'; g.fillRect(7, 9, 2, 2); g.fillRect(13, 10, 2, 1);
        g.fillStyle = '#f487a8'; g.fillRect(5, 3, 1, 2); g.fillRect(5, 2, 2, 1); g.fillRect(9, 2, 1, 3); g.fillRect(9, 1, 2, 1);
        return outline(c);
      case 'lampara':
        c = mk(16, 20); g = ctx(c);
        g.fillStyle = '#8a7a86'; g.fillRect(6, 15, 4, 4);
        g.fillStyle = '#f7a8c8'; g.fillRect(5, 4, 6, 11); g.fillRect(6, 2, 4, 2);
        g.fillStyle = '#ffd9e8'; g.fillRect(6, 4, 2, 8);
        return outline(c);
      case 'ramo':
        c = mk(16, 18); g = ctx(c);
        g.fillStyle = '#9fd4ea'; g.fillRect(5, 10, 6, 7); g.fillStyle = '#c9ebf6'; g.fillRect(6, 11, 1, 4);
        g.fillStyle = '#5e9e45'; g.fillRect(7, 6, 1, 4); g.fillRect(9, 5, 1, 5);
        for (const [x, y, col] of [[4, 4, '#ffd84d'], [8, 2, '#f487a8'], [11, 5, '#86a8f2'], [6, 7, '#f487a8']]) { g.fillStyle = col; g.fillRect(x, y, 3, 3); g.fillStyle = '#fff'; g.fillRect(x + 1, y + 1, 1, 1); }
        return outline(c);
      case 'cuadro':
        c = mk(16, 14); g = ctx(c);
        g.fillStyle = C.woodD; g.fillRect(1, 1, 14, 11);
        g.fillStyle = '#ffc48a'; g.fillRect(3, 3, 10, 4); g.fillStyle = '#f38f8f'; g.fillRect(3, 6, 10, 2);
        g.fillStyle = '#6cc4e6'; g.fillRect(3, 8, 10, 2);
        g.fillStyle = '#fff1a8'; g.fillRect(7, 5, 3, 2);
        g.fillStyle = '#4a3640'; g.fillRect(5, 7, 1, 2); g.fillRect(9, 7, 1, 2);
        return outline(c);
      case 'trofeo':
        c = mk(16, 18); g = ctx(c);
        g.fillStyle = '#b98557'; g.fillRect(4, 14, 8, 3);
        g.fillStyle = '#f2c65a'; g.fillRect(4, 3, 8, 6); g.fillRect(6, 9, 4, 2); g.fillRect(7, 11, 2, 3); g.fillRect(2, 4, 2, 3); g.fillRect(12, 4, 2, 3);
        g.fillStyle = '#fff1b0'; g.fillRect(5, 4, 2, 3);
        return outline(c);
      default:
        c = mk(16, 16); g = ctx(c); g.fillStyle = '#f0f'; g.fillRect(4, 4, 8, 8); return c;
    }
  });
}

// ---------------------------------------------------------------- íconos de objetos
const FISH_COLS = {
  sardinita: ['#b9c9d6', '#e3edf3', '#8aa0b1'], pez_boton: ['#f2c46d', '#ffe6a8', '#d29a3c'],
  trucha_melon: ['#8fd08a', '#d2f2b8', '#5ea95d'], farolito: ['#7aa8f0', '#c3d9ff', '#4f78c4'], carpa_corazon: ['#f487a8', '#ffd0dd', '#d4607f'],
};
const SEED_COLS = { sem_rabanito: '#e8577a', sem_frutilla: '#ec4b5e', sem_calabaza: '#e98a36' };

export function icon(id) {
  return cached('ic' + id, () => {
    let c = mk(16, 16), g = ctx(c);
    const P = (rows, pal) => { pix(rows, pal, c); return outline(c); };
    if (FISH_COLS[id]) {
      const [a, b, d] = FISH_COLS[id];
      g.fillStyle = a; g.fillRect(3, 6, 9, 5); g.fillRect(5, 5, 6, 1); g.fillRect(5, 11, 6, 1);
      g.fillStyle = d; g.fillRect(12, 5, 2, 2); g.fillRect(12, 10, 2, 2); g.fillRect(13, 7, 1, 3); g.fillRect(4, 10, 7, 1);
      g.fillStyle = b; g.fillRect(4, 6, 6, 2);
      g.fillStyle = '#3a2a35'; g.fillRect(5, 7, 1, 1);
      if (id === 'trucha_melon') { g.fillStyle = '#d2f2b8'; g.fillRect(8, 6, 1, 5); g.fillRect(10, 6, 1, 5); }
      if (id === 'farolito') { g.fillStyle = '#fff6a8'; g.fillRect(3, 3, 1, 1); g.fillRect(4, 4, 1, 1); g.fillStyle = '#ffe36a'; g.fillRect(2, 2, 2, 2); }
      if (id === 'carpa_corazon') { g.fillStyle = '#fff'; g.fillRect(7, 7, 1, 1); g.fillRect(9, 7, 1, 1); g.fillRect(7, 8, 3, 1); g.fillRect(8, 9, 1, 1); }
      return outline(c);
    }
    if (SEED_COLS[id]) {
      g.fillStyle = '#f3e2c0'; g.fillRect(3, 3, 10, 11); g.fillStyle = '#e2cca2'; g.fillRect(3, 3, 10, 2);
      g.fillStyle = SEED_COLS[id]; g.fillRect(5, 7, 6, 5);
      g.fillStyle = '#6fbf52'; g.fillRect(7, 5, 2, 2);
      return outline(c);
    }
    if (FLOWER_COLS[id]) return flower(id);
    if (id === 'rabanito') return P(['......##........', '.....#gg#.##....', '......#g#gg#....', '.......#g##.....', '.....rrrrrr.....', '....rRRrrrrr....', '....rRrrrrrr....', '....rrrrrrrr....', '.....rrrrrr.....', '......rrrr......', '.......ww.......', '.......w........'], { '#': '#5e9e45', g: '#86c862', r: '#e8577a', R: '#f78fa8', w: '#fff' });
    if (id === 'frutilla') return P(['......g.g.......', '.....ggggg......', '....rrrrrrr.....', '...rRrrryrrr....', '...rRrryrrrr....', '...rrrrrrryr....', '....ryrrrrr.....', '.....rrrryr.....', '......rrr.......', '.......r........'], { g: '#5e9e45', r: '#ec4b5e', R: '#ffb3bd', y: '#ffe3a0' });
    if (id === 'calabaza') return P(['.......gg.......', '........g.......', '....oooooooo....', '...oOoooOoooo...', '..oOooooOooooo..', '..oooodoooodoo..', '..ooooodoooodo..', '..oooooooooooo..', '...oooooooooo...', '....oooooooo....'], { g: '#5e9e45', o: '#e98a36', O: '#f6b26c', d: '#c96c22' });
    switch (id) {
      case 'azada': return P(['..........mmm...', '.........mmmm...', '........mM.mm...', '.......w...m....', '......w.........', '.....w..........', '....w...........', '...w............', '..w.............', '.w..............'], { m: '#9aa3ad', M: '#d5dbe2', w: C.wood });
      case 'regadera': return P(['................', '...........b....', '....bbbbbb.b....', '...bBBBBBbb.....', '...bBbbbbb......', '...bbbbbbb..s...', '...bbbbbbbbs....', '...bbbbbbbs.....', '....bbbbb.......'], { b: '#7fb3d9', B: '#b9dcf2', s: '#5e8fb7' });
      case 'hacha': return P(['......mmmm......', '.....mMMMmm.....', '.....mMmmmw.....', '......mmmw......', '.........w......', '........w.......', '.......w........', '......w.........', '.....w..........', '....w...........'], { m: '#9aa3ad', M: '#d5dbe2', w: C.wood });
      case 'pico': case 'pico_cobre': {
        const m = id === 'pico' ? '#9aa3ad' : '#e0874e', M = id === 'pico' ? '#d5dbe2' : '#ffc08a';
        return P(['..mmmmmm........', '.mMMMMMMmm......', 'mm....w..mm.....', 'm.....w....m....', '.....w..........', '.....w..........', '....w...........', '....w...........', '...w............', '...w............'], { m, M, w: C.wood });
      }
      case 'cana': return P(['...........ww...', '..........w..s..', '.........w...s..', '........w....s..', '.......w.....s..', '......w......s..', '.....w.......r..', '....wo.......R..', '...w.........r..', '..w.............'], { w: C.wood, s: '#e8e1d6', o: '#f2c65a', r: '#ec4b5e', R: '#fff' });
      case 'espada': return P(['............mm..', '...........mMm..', '..........mMm...', '.........mMm....', '........mMm.....', '...ww..mMm......', '....wwmMm.......', '.....ww.........', '....w.ww........', '...w....w.......'], { m: '#c99a6a', M: '#e8c49a', w: C.woodD });
      case 'mochila': return pix(['......oooo......', '.....o....o.....', '....oooooooo....', '...oBBBBBBBBo...', '...oBbbbbbbBo...', '...oBBBBBBBBo...', '...oBBBBBBBBo...', '...oBBkkkkBBo...', '...oBBkKKkBBo...', '...oBBkkkkBBo...', '...oBBBBBBBBo...', '....oooooooo....'], { o: OUT, B: '#e88a76', b: '#c96d5c', k: '#f7c3b5', K: '#f2c65a' }, c);
      case 'mano': return pix(['................', '......o.o.......', '.....oKoKo.o....', '.....oKoKooKo...', '..o..oKoKoKo....', '.oKo.oKKKKKo....', '.oKKooKKKKKo....', '..oKKKKKKKKo....', '...oKKKKKKo.....', '....oKKKKo......', '.....oooo.......'], { o: OUT, K: '#f8dcc2' }, c);
      case 'ramita': return P(['..........w.....', '.........w......', '........w.......', '.......ww.......', '......w..ww.....', '.....w....l.....', '....w...........', '...w............'], { w: C.trunk, l: '#78c05c' });
      case 'piedra': c = mk(16, 16); g = ctx(c); rockBase(g, null); return outline(c);
      case 'madera': return P(['................', '..wwwwwwwwwww...', '..WWWWWWWWWWw...', '..wwwwwwwwwww...', '...wwwwwwwwwww..', '...WWWWWWWWWWw..', '...wwwwwwwwwww..', '..wwwwwwwwwww...', '..WWWWWWWWWWw...', '..wwwwwwwwwww...'], { w: C.wood, W: C.woodL });
      case 'fibra': return P(['......g..g......', '.....g..g..g....', '.....g.g..g.....', '......gg.g......', '......yyyy......', '......gggg......', '.....g.gg.g.....', '....g..gg..g....', '...g...gg...g...'], { g: '#86c862', y: '#e8d690' });
      case 'cobre': return P(['................', '.....oooo.......', '....oOOooo......', '...oOooooood....', '...ooooooddd....', '....ooodddd.....', '.....dddd.......'], { o: '#e0874e', O: '#ffc08a', d: '#b8653a' });
      case 'cuarzo': return P(['.......p........', '......pPp.......', '......pPp..p....', '..p...pPp.pPp...', '.pPp..pPpppPp...', '.pPp..pdp.pPp...', '.pdp..pdp.pdp...', '..ppppppppppp...'], { p: '#f7a8c8', P: '#ffd9e8', d: '#d97aa5' });
      case 'musgo': return P(['................', '......gggg......', '....gGgggggg....', '...gGgggggggg...', '...ggggggggdg...', '....gggggddg....', '.....ggdddd.....'], { g: '#7cc46a', G: '#c9f0b4', d: '#5a9e4c' });
      case 'polvo': return P(['......y.........', '.....yYy...y....', '......y...yYy...', '...y.......y....', '..yYy...y.......', '...y...yYy......', '........y.......'], { y: '#ffe58a', Y: '#ffffff' });
      case 'perla': return P(['................', '.....pppp.......', '....pWWppp......', '...pWWpppppd....', '...pWpppppdd....', '...pppppppdd....', '....pppppdd.....', '.....pdddd......'], { p: '#f6eef4', W: '#ffffff', d: '#d9cbd6' });
      case 'moneda': return P(['................', '.....yyyy.......', '....yYYyyy......', '...yYyddyyd.....', '...yyyddyyd.....', '...yyyyyyyd.....', '....yyyyydd.....', '.....dddd.......'], { y: '#f2c65a', Y: '#fff1b0', d: '#c99a2e' });
      case 'ensalada': return P(['................', '....g.r.gg.y....', '...ggrggrggyg...', '..bbbbbbbbbbbb..', '..bBBBBBBBBBBb..', '...bbbbbbbbbb...', '....bbbbbbbb....'], { g: '#7bc75c', r: '#e8577a', y: '#ec4b5e', b: '#f3e2c0', B: '#fffaf0' });
      case 'pescado_asado': return P(['................', '.....ffffff.....', '...ffFFffffff...', '...fffffffffff..', '....ffffffff....', '.wwwwwwwwwwwwww.', '..wwwwwwwwwwww..'], { f: '#d99a52', F: '#f2c48a', w: '#f4f0ea' });
      case 'sopa_calabaza': return P(['......s..s......', '.......s..s.....', '................', '..oooooooooooo..', '..bOOOOOOOOOOb..', '..bbbbbbbbbbbb..', '...bbbbbbbbbb...', '....bbbbbbbb....'], { s: '#efe8ea', o: '#e98a36', O: '#f6b26c', b: '#8cc7e8' });
    }
    // muebles: reducidos a la mitad si son grandes
    const f = furniture(id);
    if (f) {
      c = mk(16, 16); g = ctx(c);
      if (f.width > 16 || f.height > 16) {
        const s = Math.min(16 / f.width, 16 / f.height);
        const w = Math.round(f.width * s), h = Math.round(f.height * s);
        g.drawImage(f, 0, 0, f.width, f.height, Math.floor((16 - w) / 2), Math.floor((16 - h) / 2), w, h);
      } else g.drawImage(f, Math.floor((16 - f.width) / 2), Math.floor((16 - f.height) / 2));
    }
    return c;
  });
}
const hatIconCache = {};
export function hatIcon(hat) {
  if (hatIconCache[hat]) return hatIconCache[hat];
  const c = mk(16, 10);
  paintRows(ctx(c), HATS[hat].filter((r, i) => i > 0), HAT_PAL, 0, 0);
  hatIconCache[hat] = c;
  return c;
}

// ---------------------------------------------------------------- gestos y efectos
export function emote(e) {
  return cached('em' + e, () => {
    const c = mk(14, 14), g = ctx(c);
    g.fillStyle = '#fffaf2'; g.fillRect(1, 1, 12, 10); g.fillRect(2, 0, 10, 12); g.fillRect(5, 12, 2, 1); g.fillRect(5, 13, 1, 1);
    const pal = { r: '#ef6f8b', y: '#f2c65a', b: '#5f7fd0', k: '#3a2a35', p: '#f487a8' };
    const art = {
      corazon: ['..rr.rr...', '.rrrrrrr..', '.rrrrrrr..', '..rrrrr...', '...rrr....', '....r.....'],
      saludo: ['....y.y...', '..y.y.y...', '..yyyyy.y.', '..yyyyyyy.', '..yyyyyy..', '...yyyy...'],
      nota: ['....bbbb..', '....b..b..', '....b..b..', '..bbb.bb..', '.bbbb.bb..', '..bb......'],
      risa: ['..kk..kk..', '..........', '.k......k.', '..kkkkkk..', '...pppp...', '..........'],
      estrella: ['....y.....', '....y.....', '.yyyyyyy..', '..yyyyy...', '..yy.yy...', '.y.....y..'],
      pregunta: ['...bbbb...', '..b....b..', '......b...', '.....b....', '..........', '.....b....'],
    }[e] || [];
    pix(art, pal, c, 2, 3);
    return outline(c, '#bfa9b4');
  });
}
export function heart(full) { // corazón del HUD (8x7)
  return cached('heart' + full, () => {
    const pal = { r: full === 2 ? '#ef6f8b' : '#f3d6dd', R: full === 2 ? '#ffb3c4' : '#fff', o: OUT, h: full === 1 ? '#ef6f8b' : null };
    const rows = full === 1
      ? ['.oo.oo.', 'ohRoRRo', 'ohhrrro', 'ohhrrro', '.ohrro.', '..oro..', '...o...']
      : ['.oo.oo.', 'orRorro', 'orrrrro', 'orrrrro', '.orrro.', '..oro..', '...o...'];
    return pix(rows, pal);
  });
}
