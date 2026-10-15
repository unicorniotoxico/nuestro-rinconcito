// Copia local del mundo. Solo se modifica con lo que manda el servidor
// (la única excepción es la posición del propio personaje, que se predice).
import * as M from '../shared/maps.js';
import { FURNITURE } from '../shared/data.js';

const listeners = new Map();
export function on(ev, fn) { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); return () => listeners.get(ev).delete(fn); }
export function emit(ev, data) { for (const fn of listeners.get(ev) || []) fn(data); }

export const S = {
  ready: false, you: null, islandId: null, code: null,
  players: {}, me: null,
  objects: new Map(), objAt: new Map(),
  soil: {}, furniture: new Map(),
  houseLevel: 1, bridge: false, projects: {},
  pet: null, mail: [], challenge: null, history: [], log: [], memories: {},
  enemies: new Map(),
  solid: null,
  local: { map: 'isla', x: 0, y: 0, dir: 'down', moving: false },
};

export const partnerId = () => Object.keys(S.players).find(k => k !== S.you) || null;
export const partner = () => { const k = partnerId(); return k ? S.players[k] : null; };
export const ctxWorld = () => ({ bridge: S.bridge, houseLevel: S.houseLevel });

function indexObj(o) {
  for (let i = 0; i < (o.w || 1); i++) S.objAt.set(`${o.map}:${o.x + i},${o.y}`, o);
}
export function rebuildSolid() {
  S.solid = M.buildSolidSet([...S.objects.values()], [...S.furniture.values()]);
}

export function applyWelcome(m) {
  S.you = m.you; S.islandId = m.islandId; S.code = m.code;
  S.players = {};
  for (const [k, p] of Object.entries(m.players)) S.players[k] = { ...p, rx: p.x, ry: p.y, tx: p.x, ty: p.y };
  S.me = m.me;
  S.objects.clear(); S.objAt.clear();
  for (const o of m.objects) { S.objects.set(o.id, o); indexObj(o); }
  S.soil = m.soil;
  S.furniture.clear();
  for (const f of m.furniture) S.furniture.set(f.id, f);
  S.houseLevel = m.houseLevel; S.bridge = m.bridge; S.projects = m.projects;
  S.pet = { ...m.pet, rx: m.pet.x, ry: m.pet.y, mv: 0 };
  S.mail = m.mail; S.challenge = m.challenge; S.history = m.history; S.log = m.log; S.memories = m.memories || {};
  S.enemies.clear();
  applyEnemies(m.enemies);
  const me = S.players[S.you];
  S.local = { map: me.map, x: me.x, y: me.y, dir: me.dir, moving: false };
  rebuildSolid();
  S.ready = true;
  emit('welcome');
  emit('all');
}

export function applyEnemies(list) {
  const seen = new Set();
  for (const [id, kind, x, y, hp, alive, hurtAt] of list) {
    seen.add(id);
    const e = S.enemies.get(id);
    if (e) Object.assign(e, { tx: x, ty: y, hp, alive: !!alive, hurtAt });
    else S.enemies.set(id, { id, kind: kind === 0 ? 'musguito' : 'polillin', x, y, tx: x, ty: y, rx: x, ry: y, hp, alive: !!alive, hurtAt });
  }
}

export function handlers(net) {
  net.on('welcome', applyWelcome);
  net.on('pl', ({ p }) => {
    const cur = S.players[p.id];
    if (p.id === S.you) {
      S.players[p.id] = { ...cur, ...p, rx: S.local.x, ry: S.local.y };
      if (S.me) { S.me.look = p.look; S.me.name = p.name; S.me.sit = p.sit; }
    } else {
      const moved = !cur || cur.map !== p.map;
      S.players[p.id] = { ...cur, ...p, tx: p.x, ty: p.y, rx: moved ? p.x : cur.rx, ry: moved ? p.y : cur.ry };
    }
    emit('players');
  });
  net.on('pm', (m) => {
    const p = S.players[m.p];
    if (!p) return;
    p.tx = m.x; p.ty = m.y; p.dir = m.dir; p.moving = !!m.mv; p.lastMoveAt = performance.now();
    if (Math.hypot(p.rx - m.x, p.ry - m.y) > 3) { p.rx = m.x; p.ry = m.y; }
    if (p.sit && m.mv) p.sit = null;
  });
  net.on('pos', (m) => {
    Object.assign(S.local, { map: m.map, x: m.x, y: m.y, dir: m.dir });
    const me = S.players[S.you];
    if (me) Object.assign(me, { map: m.map, x: m.x, y: m.y, rx: m.x, ry: m.y });
    emit('pos', m);
  });
  net.on('inv', ({ inv }) => { S.me.inv = inv; emit('inv'); });
  net.on('hp', ({ hp }) => { const old = S.me.hp; S.me.hp = hp; emit('hp', { old, hp }); });
  net.on('me', ({ me }) => { S.me = me; emit('inv'); emit('hp', { old: me.hp, hp: me.hp }); emit('players'); });
  net.on('obj', ({ o }) => {
    const cur = S.objects.get(o.id);
    const solidChange = !cur || cur.gone !== o.gone;
    S.objects.set(o.id, o); indexObj(o);
    if (solidChange) rebuildSolid();
    emit('obj', o);
  });
  net.on('soil', ({ k, s }) => { if (s) S.soil[k] = s; else delete S.soil[k]; emit('soil', k); });
  net.on('furn', ({ f, del }) => {
    if (del) S.furniture.delete(del); else S.furniture.set(f.id, f);
    rebuildSolid();
    emit('furn');
  });
  net.on('proj', (m) => {
    const changedMap = m.houseLevel !== S.houseLevel || m.bridge !== S.bridge;
    S.projects = m.projects; S.houseLevel = m.houseLevel; S.bridge = m.bridge;
    if (changedMap) emit('mapchange');
    emit('proj');
  });
  net.on('pet', ({ pet }) => { Object.assign(S.pet, pet); emit('pet'); });
  net.on('petpos', (m) => { if (!S.pet) return; S.pet.x = m.x; S.pet.y = m.y; S.pet.dir = m.dir; S.pet.mv = m.mv; });
  net.on('mail', ({ mail }) => { S.mail = mail; emit('mail'); });
  net.on('chal', ({ challenge, history }) => { const prev = S.challenge; S.challenge = challenge; S.history = history; emit('chal', { prev }); });
  net.on('chscore', (m) => { if (S.challenge) Object.assign(S.challenge, { scores: m.scores, best: m.best, sum: m.sum }); emit('chscore'); });
  net.on('log', ({ entry }) => { S.log.push(entry); if (S.log.length > 40) S.log.shift(); emit('log'); });
  net.on('en', ({ l }) => applyEnemies(l));
  net.on('code', ({ code }) => { S.code = code; emit('players'); });
}

// Consultas útiles
export function objAt(map, x, y) { return S.objAt.get(`${map}:${x},${y}`) || null; }
export function furnitureAt(x, y, layerPref = null) {
  let found = null;
  for (const f of S.furniture.values()) {
    const d = FURNITURE[f.item];
    if (x >= f.x && x < f.x + d.w && y >= f.y && y < f.y + d.h) {
      if (!found || (layerPref === null && d.layer === 1)) found = f;
    }
  }
  return found;
}
export const count = (item) => (S.me && S.me.inv[item]) || 0;
