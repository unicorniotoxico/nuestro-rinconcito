// Validaciones del mundo y de los datos: que el mapa sea coherente y que
// todo lo importante se pueda alcanzar caminando.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../shared/maps.js';
import * as D from '../shared/data.js';
import { fishParams, markerPos, evalTaps } from '../shared/fishing.js';
import { cleanText, normalizeCode } from '../server/game/util.js';

const objs = M.initialObjects();

test('las filas de los mapas tienen el ancho correcto', () => {
  for (const m of Object.values(M.MAPS)) {
    if (!m.rows) continue;
    assert.equal(m.rows.length, m.h, m.id);
    for (const [i, r] of m.rows.entries()) assert.equal(r.length, m.w, `${m.id} fila ${i}`);
  }
});

test('los objetos están sobre terreno válido y no se pisan', () => {
  const seen = new Set();
  for (const o of objs) {
    for (let i = 0; i < (o.w || 1); i++) {
      const k = `${o.map}:${o.x + i},${o.y}`;
      assert.ok(!seen.has(k), `dos objetos en ${k}`);
      seen.add(k);
      const t = M.rawTile(o.map, o.x + i, o.y);
      assert.ok(t && !['~', '#', 'H', 'b', 'D', 'C', 'E', 'p', '='].includes(t), `${o.kind} en casilla "${t}" (${k})`);
    }
  }
});

function reachable(map, start, ctx, solid) {
  const seen = new Set([`${Math.floor(start.x)},${Math.floor(start.y - 0.1)}`]);
  const q = [[Math.floor(start.x), Math.floor(start.y - 0.1)]];
  const m = M.MAPS[map];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || seen.has(k)) continue;
      if (M.collides(map, nx + 0.5, ny + 0.6, ctx, solid)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}

test('desde la llegada se puede caminar a todo lo importante', () => {
  const solid = M.buildSolidSet(objs, []);
  const ctx = { bridge: false, houseLevel: 1 };
  const r = reachable('isla', M.SPAWN, ctx, solid);
  const must = { 'puerta de la casa': [17, 7], 'entrada de la cueva': [7, 4], 'tranquera de la huerta': [21, 12], 'punta del muelle': [17, 28], 'frente al buzón': [20, 8], 'frente al tablón': [14, 8], 'comienzo del puente': [29, 6], 'camita del carpincho': [13, 11] };
  for (const [name, [x, y]] of Object.entries(must)) assert.ok(r.has(`${x},${y}`), `no se llega a: ${name}`);
  assert.ok(!r.has('33,6'), 'sin puente no se llega al mirador');
  const r2 = reachable('isla', M.SPAWN, { bridge: true, houseLevel: 1 }, solid);
  assert.ok(r2.has('35,6') && r2.has('34,5'), 'con puente se llega al mirador');
  // toda la huerta se alcanza
  for (let y = M.FARM_RECT.y0; y <= M.FARM_RECT.y1; y++) for (let x = M.FARM_RECT.x0; x <= M.FARM_RECT.x1; x++) {
    assert.equal(M.rawTile('isla', x, y), 'f');
    assert.ok(r.has(`${x},${y}`), `huerta ${x},${y}`);
  }
});

test('la cueva: desde la entrada se llega a cofres y minerales', () => {
  const solid = M.buildSolidSet(objs, []);
  const r = reachable('cueva', M.CAVE_SPAWN, { bridge: false, houseLevel: 1 }, solid);
  for (const o of objs.filter(o => o.map === 'cueva')) {
    const around = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => r.has(`${o.x + dx},${o.y + dy}`));
    assert.ok(around, `no se llega a ${o.kind} (${o.x},${o.y})`);
  }
  for (const e of M.ENEMY_SPAWNS) assert.ok(!M.collides('cueva', e.x, e.y + 0.3, { houseLevel: 1 }, solid), `criatura en pared ${e.x},${e.y}`);
});

test('los portales llevan a lugares libres y no a otro portal', () => {
  const solid = M.buildSolidSet(objs, []);
  for (const w of M.WARPS) {
    for (const lvl of [1, 2, 3]) {
      assert.ok(!M.collides(w.to.map, w.to.x, w.to.y, { bridge: false, houseLevel: lvl }, solid), `${w.id} nivel ${lvl}`);
      assert.equal(M.warpAt(w.to.map, Math.floor(w.to.x), Math.floor(w.to.y - 0.1)), null, `${w.id} cae en otro portal`);
    }
  }
  for (const s of [M.SPAWN, M.HOME_SPAWN, M.CAVE_SPAWN]) assert.ok(!M.collides(s.map, s.x, s.y, { houseLevel: 1 }, solid));
});

test('la casa crece sin achicar el piso de los niveles anteriores', () => {
  for (const [a, b] of [[1, 2], [2, 3]]) {
    const ra = M.houseFloorRect(a), rb = M.houseFloorRect(b);
    assert.ok(rb.x0 <= ra.x0 && rb.x1 >= ra.x1 && rb.y0 <= ra.y0 && rb.y1 >= ra.y1);
  }
  assert.equal(M.houseTile(1, 6, 10), 'door');
});

test('datos: recetas, cultivos, peces, nodos y desafíos son coherentes', () => {
  for (const r of D.RECIPES) for (const k of [...Object.keys(r.in), ...Object.keys(r.out)]) assert.ok(D.ITEMS[k], `${r.id}: ${k}`);
  for (const [k, c] of Object.entries(D.CROPS)) { assert.ok(D.ITEMS[c.seed] && D.ITEMS[k]); assert.equal(D.ITEMS[c.seed].crop, k); }
  for (const pool of D.FISH_BY_RARITY) for (const f of pool) assert.equal(D.ITEMS[f].cat, 'pez');
  for (const n of Object.values(D.NODES)) for (const d of n.drops || []) assert.ok(D.ITEMS[d[0]]);
  for (const c of Object.values(D.CHALLENGES)) { assert.ok(D.HATS[c.hat]); for (const k of Object.keys(c.reward)) assert.ok(D.ITEMS[k]); }
  for (const [k, f] of Object.entries(D.FURNITURE)) assert.equal(D.ITEMS[k].cat, 'mueble', k);
  for (const k of Object.keys(D.ITEMS)) if (D.ITEMS[k].cat === 'mueble') assert.ok(D.FURNITURE[k], k);
  for (const p of Object.values(D.PROJECTS)) for (const k of Object.keys(p.needs)) assert.ok(D.ITEMS[k]);
  // todo lo que piden las recetas de herramientas se consigue sin herramientas
  const free = new Set(Object.values(D.NODES).filter(n => n.drops && !n.tool).flatMap(n => n.drops.map(d => d[0])));
  for (const k of Object.keys(D.RECIPES.find(r => r.id === 'hacha').in)) assert.ok(free.has(k), `el hacha necesita ${k}, que no se consigue a mano`);
  for (const k of Object.keys(D.RECIPES.find(r => r.id === 'pico').in)) assert.ok(free.has(k));
});

test('pesca: con los toques justos se gana y tocando cualquier cosa se pierde', () => {
  for (let rarity = 0; rarity < 4; rarity++) {
    for (let seed = 1; seed < 40; seed++) {
      const p = fishParams(rarity, seed * 7919);
      const taps = []; let t = 0;
      for (let k = 0; k < 3; k++) { while (Math.abs(markerPos(t, p) - p.centers[k]) > p.zone * 0.25) t += 2; taps.push(t); t += 50; }
      assert.ok(evalTaps(p, taps).success, `rareza ${rarity} semilla ${seed}`);
      assert.ok(t < D.FISH_MAX_MS, 'se puede ganar a tiempo');
    }
  }
  const p = fishParams(3, 1234);
  assert.equal(evalTaps(p, [0, 0, 0, 0]).success && evalTaps(p, [5, 4, 3]).success, false);
  assert.equal(evalTaps(p, [NaN]).success, false);
});

test('textos: se limpian caracteres invisibles y se respeta el largo; códigos normalizados', () => {
  assert.equal(cleanText('  Hola\u0000 mundo​  ', 20), 'Hola mundo');
  assert.equal(cleanText('ñandú 💛💛💛', 7), 'ñandú 💛');
  assert.equal(cleanText(42, 10), '');
  assert.equal(normalizeCode('abcd-efgh'), 'ABCDEFGH');
});
