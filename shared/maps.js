// Mapas de "Nuestro rinconcito". Las coordenadas están en casillas.
// Una posición (x, y) de un personaje es el punto de sus pies; la casilla
// (tx, ty) ocupa de tx a tx+1 y de ty a ty+1.
import { NODES, FURNITURE } from './data.js';

// Leyenda isla:  ~ agua · . pasto · : arena · # acantilado · p camino · f tierra de huerta
//                = muelle · b puente (roto hasta repararlo) · C entrada a la cueva
//                H casa · D puerta de la casa
const ISLA = [
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~#########::::::::::::::::~~~~~~~~~~~~',
  '~~~#########................:~~~~::::~~~',
  '~~:####C####...HHHHH.........:~~:....:~~',
  '~~:####p..##...HHHHH.........:~~:....:~~',
  '~~:....p.......HHHHH......ppppbb:....:~~',
  '~~:....p.......HHDHH......p..:~~:....:~~',
  '~~:....p.........pppppppppp..:~~:....:~~',
  '~~:....ppppppppppp...........:~~:....:~~',
  '~~:..............p....ffffff.:~~~::::~~~',
  '~~:..............p....ffffff.:~~~~~~~~~~',
  '~~:..............pppp.ffffff.:~~~~~~~~~~',
  '~~:..............p....ffffff.:~~~~~~~~~~',
  '~~~:.............p....ffffff.:~~~~~~~~~~',
  '~~~:.............p....ffffff.:~~~~~~~~~~',
  '~~:..............p...........:~~~~~~~~~~',
  '~~:..............p...........:~~~~~~~~~~',
  '~~:..............p...........:~~~~~~~~~~',
  '~~:..............p...........:~~~~~~~~~~',
  '~~:..............p..........:~~~~~~~~~~~',
  '~~:..............p..........:~~~~~~~~~~~',
  '~~:..............p...........:~~~~~~~~~~',
  '~~:.............pppp.........:~~~~~~~~~~',
  '~~::.............==.........::~~~~~~~~~~',
  '~~:::::::::::::::==:::::::::::~~~~~~~~~~',
  '~~~::::::::::::::==::::::::::~~~~~~~~~~~',
  '~~~~~::::::::::::==::::::::~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~==~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
];

// Leyenda cueva: # roca · . suelo · E salida
const CUEVA = [
  '############################',
  '##########........##########',
  '#########..........#########',
  '#########..........#########',
  '##########........##########',
  '###....######..######.....##',
  '##......#####..######.....##',
  '##..#...#####..######.....##',
  '##......##........###..#..##',
  '##......#..........##.....##',
  '##..................#.....##',
  '##.........#..............##',
  '##........................##',
  '##...###........#...##...###',
  '##...###............##...###',
  '##...####..........###...###',
  '#############..#############',
  '#############..#############',
  '#############..#############',
  '#############EE#############',
];

export const MAPS = {
  isla:  { id: 'isla',  name: 'La isla', w: 40, h: 30, rows: ISLA },
  casa:  { id: 'casa',  name: 'Nuestra casa', w: 14, h: 11, rows: null },
  cueva: { id: 'cueva', name: 'La cueva', w: 28, h: 20, rows: CUEVA },
};

// ---------------------------------------------------------------- casa
// El interior crece con las mejoras. Nivel 1: x 3..9, y 5..9 · Nivel 2: x 1..12, y 5..9
// Nivel 3: x 1..12, y 2..9. La puerta está siempre en (6, 10).
export const HOUSE_DOOR = { x: 6, y: 10 };
export function houseFloorRect(level) {
  if (level >= 3) return { x0: 1, y0: 2, x1: 12, y1: 9 };
  if (level >= 2) return { x0: 1, y0: 5, x1: 12, y1: 9 };
  return { x0: 3, y0: 5, x1: 9, y1: 9 };
}
export function houseTile(level, x, y) {
  if (x === HOUSE_DOOR.x && y === HOUSE_DOOR.y) return 'door';
  const r = houseFloorRect(level);
  if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return 'floor';
  if (x >= r.x0 && x <= r.x1 && y === r.y0 - 1) return 'wallface';
  return 'void';
}

// ---------------------------------------------------------------- portales
export const WARPS = [
  { id: 'casa_entrar', map: 'isla', tiles: [[17, 7]], to: { map: 'casa', x: 6.5, y: 9.6, dir: 'up' } },
  { id: 'casa_salir', map: 'casa', tiles: [[6, 10]], to: { map: 'isla', x: 17.5, y: 8.7, dir: 'down' } },
  { id: 'cueva_entrar', map: 'isla', tiles: [[7, 4]], to: { map: 'cueva', x: 14, y: 18.4, dir: 'up' } },
  { id: 'cueva_salir', map: 'cueva', tiles: [[13, 19], [14, 19]], to: { map: 'isla', x: 7.5, y: 5.8, dir: 'down' } },
];
export const SPAWN = { map: 'isla', x: 17.5, y: 21.5, dir: 'down' };
export const HOME_SPAWN = { map: 'isla', x: 17.5, y: 8.7, dir: 'down' };
export const CAVE_SPAWN = { map: 'cueva', x: 14, y: 18.2, dir: 'up' };

// ---------------------------------------------------------------- objetos iniciales
const O = (kind, map, x, y, extra = {}) => ({ kind, map, x, y, ...extra });
export function initialObjects() {
  const list = [];
  const add = (...a) => list.push(O(...a));
  // árboles
  for (const [x, y] of [[4, 10], [6, 13], [4, 17], [9, 15], [11, 11], [6, 20], [10, 19], [13, 17], [13, 21], [21, 3], [25, 4], [24, 19], [27, 21], [21, 22], [33, 8]]) add('arbol', 'isla', x, y);
  for (const [x, y] of [[10, 7], [12, 5], [4, 7], [5, 24], [26, 24], [20, 18]]) add('roca', 'isla', x, y);
  for (const [x, y] of [[9, 5], [36, 8]]) add('roca_cobre', 'isla', x, y);
  for (const [x, y] of [[3, 12], [8, 10], [12, 13], [15, 20], [20, 15], [23, 22]]) add('arbusto', 'isla', x, y);
  for (const [x, y] of [[13, 7], [5, 9], [19, 21], [10, 24], [24, 17]]) add('piedrita', 'isla', x, y);
  for (const [x, y] of [[5, 14], [7, 17], [11, 14], [15, 15], [19, 10], [24, 7], [27, 18], [3, 21], [14, 24]]) add('pasto', 'isla', x, y);
  for (const [x, y] of [[15, 11], [20, 20], [9, 22]]) add('flor_sol', 'isla', x, y);
  for (const [x, y] of [[19, 14], [4, 22], [12, 19]]) add('flor_azul', 'isla', x, y);
  for (const [x, y] of [[16, 11], [21, 19], [8, 7]]) add('flor_rosa', 'isla', x, y);
  for (const [x, y] of [[34, 6], [36, 6], [34, 9]]) add('flor_luna', 'isla', x, y);
  // cerca de la huerta (con tranquera en 21,12)
  for (let x = 21; x <= 28; x++) { add('cerca', 'isla', x, 9); add('cerca', 'isla', x, 16); }
  for (let y = 10; y <= 15; y++) { if (y !== 12) add('cerca', 'isla', 21, y); add('cerca', 'isla', 28, y); }
  for (const [x, y] of [[16, 8], [20, 23], [33, 5], [25, 7]]) add('farola', 'isla', x, y);
  add('buzon', 'isla', 20, 7);
  add('tablon', 'isla', 14, 7);
  add('banco', 'isla', 34, 4, { w: 2 });
  add('canasta', 'isla', 13, 10);
  // cueva
  for (const [x, y] of [[3, 13], [9, 14], [18, 9], [24, 14]]) add('roca', 'cueva', x, y);
  for (const [x, y] of [[2, 6], [6, 9], [22, 6], [25, 10], [10, 9]]) add('roca_cobre', 'cueva', x, y);
  for (const [x, y] of [[10, 2], [17, 3], [14, 1]]) add('roca_cuarzo', 'cueva', x, y);
  add('cofre', 'cueva', 3, 15, { loot: 0 });
  add('cofre', 'cueva', 24, 5, { loot: 1 });
  add('cofre', 'cueva', 11, 1, { loot: 2 });
  return list.map((o, i) => ({ id: 'o' + (i + 1), w: 1, ...o }));
}

export const ENEMY_SPAWNS = [
  { kind: 'musguito', x: 6.5, y: 7.5 }, { kind: 'musguito', x: 11.5, y: 14.5 },
  { kind: 'musguito', x: 23.5, y: 10.5 }, { kind: 'musguito', x: 13.5, y: 2.5 },
  { kind: 'polillin', x: 4.5, y: 11.5 }, { kind: 'polillin', x: 23.5, y: 14.5 },
  { kind: 'polillin', x: 16.5, y: 10.5 },
];
export const PET_HOME = { x: 13.5, y: 11.2 };
export const PET_AREA = { x0: 9, y0: 10, x1: 16, y1: 15 };
export const FARM_RECT = { x0: 22, y0: 10, x1: 27, y1: 15 };

// ---------------------------------------------------------------- consultas
export function rawTile(mapId, tx, ty, level = 1) {
  const m = MAPS[mapId];
  if (!m || tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return null;
  if (mapId === 'casa') return houseTile(level, tx, ty);
  return m.rows[ty][tx];
}

export function isWater(mapId, tx, ty) {
  return mapId === 'isla' && rawTile('isla', tx, ty) === '~';
}

// ¿La casilla bloquea el paso? (sin contar objetos)
export function tileBlocks(mapId, tx, ty, ctx) {
  const t = rawTile(mapId, tx, ty, ctx.houseLevel);
  if (t === null) return true;
  if (mapId === 'casa') return t === 'void' || t === 'wallface';
  if (mapId === 'cueva') return t === '#';
  if (t === '~' || t === '#' || t === 'H') return true;
  if (t === 'b') return !ctx.bridge;
  return false;
}

export function objectBlocks(o) {
  const def = NODES[o.kind];
  if (!def || !def.solid) return false;
  if (o.kind === 'arbol') return true; // el tronco queda aunque esté talado
  return !o.gone;
}

export function furnitureBlocks(f) {
  const def = FURNITURE[f.item];
  return def && def.layer === 1;
}

// Conjunto de casillas ocupadas por objetos y muebles, por mapa.
export function buildSolidSet(objects, furniture) {
  const s = { isla: new Set(), casa: new Set(), cueva: new Set() };
  for (const o of objects) {
    if (!objectBlocks(o)) continue;
    for (let i = 0; i < (o.w || 1); i++) s[o.map].add((o.x + i) + ',' + o.y);
  }
  for (const f of furniture) {
    if (!furnitureBlocks(f)) continue;
    const d = FURNITURE[f.item];
    for (let dx = 0; dx < d.w; dx++) for (let dy = 0; dy < d.h; dy++) s.casa.add((f.x + dx) + ',' + (f.y + dy));
  }
  return s;
}

// Caja de colisión de los pies: 0.5 de ancho, 0.28 de alto.
export const FOOT_W = 0.5, FOOT_H = 0.28;
export function collides(mapId, x, y, ctx, solid) {
  const x0 = x - FOOT_W / 2, x1 = x + FOOT_W / 2, y0 = y - FOOT_H, y1 = y;
  for (let ty = Math.floor(y0); ty <= Math.floor(y1 - 1e-6); ty++) {
    for (let tx = Math.floor(x0); tx <= Math.floor(x1 - 1e-6); tx++) {
      if (tileBlocks(mapId, tx, ty, ctx)) return true;
      if (solid && solid[mapId] && solid[mapId].has(tx + ',' + ty)) return true;
    }
  }
  return false;
}

export function warpAt(mapId, tx, ty) {
  return WARPS.find(w => w.map === mapId && w.tiles.some(([x, y]) => x === tx && y === ty)) || null;
}

export function fishingSpot(mapId, px, py, tx, ty) {
  if (mapId !== 'isla') return null;
  if (!isWater('isla', tx, ty)) return null;
  if (px >= 32) return 'mirador';
  const under = rawTile('isla', Math.floor(px), Math.floor(py - 0.1));
  if (under === '=' || under === 'b') return 'muelle';
  return 'orilla';
}

export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export function frontTile(x, y, dir) {
  const [dx, dy] = DIRS[dir] || DIRS.down;
  // los pies están cerca del borde inferior de la casilla; mirar "arriba" apunta a la casilla de arriba
  const cx = x + dx * 0.75, cy = (y - 0.15) + dy * 0.75;
  return [Math.floor(cx), Math.floor(cy)];
}
