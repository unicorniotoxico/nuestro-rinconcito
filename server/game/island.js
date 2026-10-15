// Una isla: estado persistente + reglas. El servidor es la autoridad: el
// cliente propone acciones y la isla las valida y aplica de a una (Node es de
// un solo hilo, así que dos acciones simultáneas nunca se pisan).
import * as D from '../../shared/data.js';
import * as M from '../../shared/maps.js';
import { fishParams, evalTaps } from '../../shared/fishing.js';
import { rand, randInt, clamp, dist, rollDrops, cleanText, isInt, isNum, newId } from './util.js';

export class ActionError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}
const fail = (msg, code) => { throw new ActionError(msg, code); };

const DATA_VERSION = 1;
const ENEMY_KINDS = Object.keys(D.ENEMIES);

// ---------------------------------------------------------------- creación
export function createIslandData(id, inviteCode, t) {
  const objects = {};
  for (const o of M.initialObjects()) objects[o.id] = { ...o, hits: 0, gone: false, respawnAt: 0 };
  const projects = {};
  for (const k of Object.keys(D.PROJECTS)) projects[k] = { have: {}, contrib: {}, done: false };
  return {
    v: DATA_VERSION, id, createdAt: t, inviteCode,
    players: {}, objects, soil: {}, furniture: {},
    houseLevel: 1, bridge: false, projects,
    pet: { name: null, x: M.PET_HOME.x, y: M.PET_HOME.y, dir: 'down', affection: 0, fedAt: 0, pettedAt: {}, lastGiftAt: 0 },
    mail: [], challenge: null, history: [], memories: {}, log: [],
  };
}

export function validateProfile(profile) {
  if (!profile || typeof profile !== 'object') fail('Faltan los datos del personaje');
  const name = cleanText(profile.name, D.NAME_MAX);
  if (name.length < 1) fail('Elegí un nombre para tu personaje');
  const l = profile.look || {};
  const look = {
    skin: isInt(l.skin, 0, D.LOOK.skin.length - 1) ? l.skin : D.DEFAULT_LOOK.skin,
    hair: isInt(l.hair, 0, D.LOOK.hairStyles.length - 1) ? l.hair : D.DEFAULT_LOOK.hair,
    hairColor: isInt(l.hairColor, 0, D.LOOK.hairColors.length - 1) ? l.hairColor : D.DEFAULT_LOOK.hairColor,
    shirt: isInt(l.shirt, 0, D.LOOK.clothes.length - 1) ? l.shirt : D.DEFAULT_LOOK.shirt,
    pants: isInt(l.pants, 0, D.LOOK.clothes.length - 1) ? l.pants : D.DEFAULT_LOOK.pants,
    hat: null,
  };
  return { name, look };
}

export function createPlayerData(pid, tokenHash, profile, t) {
  return {
    id: pid, tokenHash, name: profile.name, look: profile.look,
    inv: { ...D.START_ITEMS }, hp: D.MAX_HP,
    map: M.SPAWN.map, x: M.SPAWN.x, y: M.SPAWN.y, dir: M.SPAWN.dir,
    cosmetics: [], wins: { pesca: 0, mineria: 0, cosecha: 0 },
    chests: {}, joinedAt: t, lastSeen: t, sit: null,
  };
}

// ---------------------------------------------------------------- isla
export class Island {
  constructor(data, io) {
    this.d = data;
    this.io = io; // { send(islandId, pid, msg), dirty(island) }
    this.online = new Set();
    this.recent = {};
    this.fishing = {};
    this.lastMove = {};
    this.lastAttack = {};
    this.lastEmote = {};
    this.lastHurt = {};
    this.lastRegen = {};
    this.invulnUntil = {};
    this.lastPet = {};
    this.enemies = [];
    this.pet = { tx: data.pet.x, ty: data.pet.y, next: 0, moving: false, lastSent: 0 };
    this.enemyBroadcastAt = 0;
    this.rebuildSolid();
    this.spawnEnemies(Date.now());
  }

  get id() { return this.d.id; }
  pids() { return Object.keys(this.d.players); }
  other(pid) { return this.pids().find(k => k !== pid) || null; }
  isFull() { return this.pids().length >= 2; }
  ctx() { return { bridge: this.d.bridge, houseLevel: this.d.houseLevel }; }
  dirty() { this.io.dirty(this); }

  rebuildSolid() {
    this.solid = M.buildSolidSet(Object.values(this.d.objects), Object.values(this.d.furniture));
  }

  // ------------------------------------------------------------ envío
  send(pid, msg) { if (this.online.has(pid)) this.io.send(this.id, pid, msg); }
  broadcast(msg, { map = null, except = null } = {}) {
    for (const pid of this.online) {
      if (pid === except) continue;
      if (map && this.d.players[pid].map !== map) continue;
      this.io.send(this.id, pid, msg);
    }
  }
  toast(pid, msg, kind = 'info') { this.send(pid, { t: 'toast', msg, kind }); }
  fx(map, fx) { this.broadcast({ t: 'fx', ...fx }, { map }); }
  pub(p) {
    return {
      id: p.id, name: p.name, look: p.look, online: this.online.has(p.id),
      map: p.map, x: p.x, y: p.y, dir: p.dir, sit: p.sit, wins: p.wins, lastSeen: p.lastSeen,
    };
  }
  syncPl(p) { this.broadcast({ t: 'pl', p: this.pub(p) }); }
  syncInv(p) { this.send(p.id, { t: 'inv', inv: p.inv }); }
  syncHp(p) { this.send(p.id, { t: 'hp', hp: p.hp }); }
  syncMe(p) { this.send(p.id, { t: 'me', me: this.mine(p) }); }
  mine(p) {
    return { ...this.pub(p), inv: p.inv, hp: p.hp, chests: p.chests, cosmetics: p.cosmetics };
  }
  addLog(text) {
    this.d.log.push({ at: Date.now(), text });
    if (this.d.log.length > 40) this.d.log.splice(0, this.d.log.length - 40);
    this.broadcast({ t: 'log', entry: this.d.log[this.d.log.length - 1] });
  }
  objPub(o) { return { id: o.id, kind: o.kind, map: o.map, x: o.x, y: o.y, w: o.w || 1, gone: o.gone, hits: o.hits }; }
  mailFor(pid) { return this.d.mail.filter(m => m.to === pid || m.from === pid); }
  syncMail() { for (const pid of this.online) this.send(pid, { t: 'mail', mail: this.mailFor(pid) }); }
  syncProjects() {
    this.broadcast({ t: 'proj', projects: this.d.projects, houseLevel: this.d.houseLevel, bridge: this.d.bridge });
  }
  syncChallenge() { this.broadcast({ t: 'chal', challenge: this.d.challenge, history: this.d.history }); }

  snapshot(pid) {
    const players = {};
    for (const k of this.pids()) players[k] = this.pub(this.d.players[k]);
    return {
      t: 'welcome', serverNow: Date.now(), islandId: this.id, you: pid,
      code: this.isFull() ? null : this.d.inviteCode,
      players, me: this.mine(this.d.players[pid]),
      objects: Object.values(this.d.objects).map(o => this.objPub(o)),
      soil: this.d.soil, furniture: Object.values(this.d.furniture),
      houseLevel: this.d.houseLevel, bridge: this.d.bridge, projects: this.d.projects,
      pet: this.petPub(), mail: this.mailFor(pid), challenge: this.d.challenge, history: this.d.history,
      log: this.d.log, enemies: this.enemyPub(), memories: this.d.memories,
    };
  }

  // ------------------------------------------------------------ conexión
  onConnect(pid) {
    const t = Date.now();
    this.online.add(pid);
    this.recent[pid] = this.recent[pid] || new Map();
    const p = this.d.players[pid];
    p.lastSeen = t;
    p.sit = null;
    this.lastMove[pid] = t;
    this.slowTick(t);
    this.send(pid, this.snapshot(pid));
    const o = this.other(pid);
    if (o && this.online.has(o)) this.toast(o, `${p.name} llegó a la isla 💛`, 'love');
    this.syncPl(p);
    const pending = this.d.mail.filter(m => m.to === pid && !m.claimed).length;
    if (pending) this.toast(pid, pending === 1 ? 'Tenés un regalo esperándote en el buzón 💌' : `Tenés ${pending} regalos esperándote en el buzón 💌`, 'love');
    this.dirty();
  }

  onDisconnect(pid) {
    this.online.delete(pid);
    const p = this.d.players[pid];
    if (!p) return;
    p.lastSeen = Date.now();
    p.sit = null;
    delete this.fishing[pid];
    const c = this.d.challenge;
    if (c && c.status === 'proposed') { this.d.challenge = null; this.syncChallenge(); }
    this.syncPl(p);
    this.dirty();
  }

  // ------------------------------------------------------------ mensajes
  handle(pid, msg) {
    const p = this.d.players[pid];
    if (!p || !msg || typeof msg !== 'object') return;
    if (msg.t === 'mv') return this.onMove(p, msg);
    if (msg.t !== 'act') return;
    if (typeof msg.id !== 'string' || msg.id.length < 4 || msg.id.length > 40) return;
    const cache = this.recent[pid] || (this.recent[pid] = new Map());
    if (cache.has(msg.id)) { this.send(pid, cache.get(msg.id)); return; } // reintento: misma respuesta, sin repetir el efecto
    let res;
    try {
      const fn = typeof msg.a === 'string' && Object.hasOwn(ACTIONS, msg.a) ? ACTIONS[msg.a] : null;
      if (!fn) fail('Acción desconocida');
      const out = fn.call(this, p, msg, Date.now()) || {};
      res = { t: 'res', id: msg.id, ok: true, ...out };
    } catch (e) {
      if (e instanceof ActionError) res = { t: 'res', id: msg.id, ok: false, err: e.message, code: e.code };
      else { console.error('[accion]', msg.a, e); res = { t: 'res', id: msg.id, ok: false, err: 'Algo salió mal en el servidor' }; }
    }
    cache.set(msg.id, res);
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    this.send(pid, res);
  }

  onMove(p, m) {
    if (!isNum(m.x) || !isNum(m.y) || m.map !== p.map) return;
    const t = Date.now();
    const last = this.lastMove[p.id] || t - 200;
    const dt = clamp(t - last, 16, 1000);
    const allowed = D.SPEED * (dt / 1000) * 1.45 + 0.45;
    const d = dist(p.x, p.y, m.x, m.y);
    this.lastMove[p.id] = t;
    if (d > allowed || M.collides(p.map, m.x, m.y, this.ctx(), this.solid)) {
      this.send(p.id, { t: 'pos', map: p.map, x: p.x, y: p.y, dir: p.dir });
      return;
    }
    p.x = m.x; p.y = m.y;
    if (M.DIRS[m.dir]) p.dir = m.dir;
    if (p.sit && d > 0.001) { p.sit = null; this.syncPl(p); }
    this.broadcast({ t: 'pm', p: p.id, x: p.x, y: p.y, dir: p.dir, mv: m.mv ? 1 : 0 }, { map: p.map, except: p.id });
  }

  // ------------------------------------------------------------ inventario
  has(p, item, n = 1) { return (p.inv[item] || 0) >= n; }
  take(p, item, n = 1) {
    if (!this.has(p, item, n)) fail(`Te falta ${D.itemName(item)}`);
    p.inv[item] -= n;
    if (p.inv[item] <= 0) delete p.inv[item];
  }
  give(p, items) {
    for (const [k, v] of Object.entries(items)) {
      if (!D.ITEMS[k] || v <= 0) continue;
      p.inv[k] = Math.min(9999, (p.inv[k] || 0) + v);
    }
  }
  pickPower(p) { return this.has(p, 'pico_cobre') ? 2 : this.has(p, 'pico') ? 1 : 0; }

  // Distancia desde el cuerpo del jugador al rectángulo de casillas.
  near(p, tx, ty, w = 1, h = 1, r = D.REACH - 0.45) {
    const cx = p.x, cy = p.y - 0.3;
    const nx = clamp(cx, tx, tx + w), ny = clamp(cy, ty, ty + h);
    return Math.hypot(cx - nx, cy - ny) <= r;
  }
  requireNear(p, tx, ty, w = 1, h = 1, r) {
    if (!this.near(p, tx, ty, w, h, r)) fail('Acercate un poco más');
  }
  playerOn(map, x0, y0, w, h) {
    for (const pid of this.pids()) {
      const p = this.d.players[pid];
      if (p.map !== map) continue;
      if (p.x + M.FOOT_W / 2 > x0 && p.x - M.FOOT_W / 2 < x0 + w && p.y > y0 && p.y - M.FOOT_H < y0 + h) return true;
    }
    return false;
  }

  challengeActive(type) {
    const c = this.d.challenge;
    return c && c.status === 'active' && (!type || c.type === type) ? c : null;
  }
  score(pid, type, amount, points = 0) {
    const c = this.challengeActive(type);
    if (!c) return;
    c.scores[pid] = (c.scores[pid] || 0) + amount;
    if (points) {
      c.best[pid] = Math.max(c.best[pid] || 0, points);
      c.sum[pid] = (c.sum[pid] || 0) + points;
    }
    this.broadcast({ t: 'chscore', scores: c.scores, best: c.best, sum: c.sum });
  }

  // ------------------------------------------------------------ ticks
  slowTick(t) {
    let changed = false;
    // cultivos: cada etapa regada avanza; después necesita agua otra vez
    for (const [k, s] of Object.entries(this.d.soil)) {
      const c = s.crop;
      if (!c || !c.watered || !c.readyAt || t < c.readyAt) continue;
      const def = D.CROPS[c.type];
      c.step = Math.min(def.steps, c.step + 1);
      c.watered = false; c.readyAt = 0;
      if (c.step < def.steps && this.challengeActive('cosecha')) { c.watered = true; c.readyAt = t + def.stepMs / 4; }
      this.broadcast({ t: 'soil', k, s }, { map: 'isla' });
      changed = true;
    }
    // recursos que reaparecen (solo si nadie está parado encima)
    for (const o of Object.values(this.d.objects)) {
      if (!o.gone || !o.respawnAt || t < o.respawnAt) continue;
      if (this.playerOn(o.map, o.x, o.y, o.w || 1, 1)) { o.respawnAt = t + 4000; continue; }
      o.gone = false; o.hits = 0; o.respawnAt = 0;
      if (M.objectBlocks(o)) this.rebuildSolid();
      this.broadcast({ t: 'obj', o: this.objPub(o) }, { map: o.map });
      changed = true;
    }
    // vida que se recupera sola fuera de peligro
    for (const pid of this.online) {
      const p = this.d.players[pid];
      if (p.hp >= D.MAX_HP) continue;
      if (t - (this.lastHurt[pid] || 0) < 8000 || t - (this.lastRegen[pid] || 0) < D.REGEN_EVERY_MS) continue;
      p.hp += 1; this.lastRegen[pid] = t; this.syncHp(p);
    }
    // desafíos
    const c = this.d.challenge;
    if (c) {
      if (c.status === 'proposed' && t >= c.expiresAt) { this.d.challenge = null; this.syncChallenge(); }
      else if (c.status === 'countdown' && t >= c.startsAt) this.startChallenge(c, t);
      else if (c.status === 'active' && t >= c.endsAt) this.finishChallenge(t);
      else if (c.status === 'finished' && t - c.endsAt > 20_000) { this.d.challenge = null; this.syncChallenge(); }
    }
    if (changed) this.dirty();
  }

  fastTick(t, dtMs) {
    if (!this.online.size) return;
    const inCave = [...this.online].map(k => this.d.players[k]).filter(p => p.map === 'cueva');
    if (inCave.length) this.tickEnemies(t, dtMs / 1000, inCave);
    if ([...this.online].some(k => this.d.players[k].map === 'isla')) this.tickPet(t, dtMs / 1000);
  }

  // ------------------------------------------------------------ criaturas
  spawnEnemies(t) {
    this.enemies = M.ENEMY_SPAWNS.map((s, i) => ({
      id: i + 1, kind: s.kind, sx: s.x, sy: s.y, x: s.x, y: s.y,
      hp: D.ENEMIES[s.kind].hp, alive: true, respawnAt: 0, next: t + 500 + i * 120,
      vx: 0, vy: 0, stunUntil: 0, retreatUntil: 0, phase: i * 1.7, hurtAt: 0,
    }));
  }
  enemyPub() {
    return this.enemies.map(e => [e.id, ENEMY_KINDS.indexOf(e.kind), +e.x.toFixed(2), +e.y.toFixed(2), e.hp, e.alive ? 1 : 0, e.hurtAt]);
  }
  enemyFree(x, y) {
    const ctx = this.ctx();
    for (const [dx, dy] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.1], [0.3, 0.1]]) {
      if (M.tileBlocks('cueva', Math.floor(x + dx), Math.floor(y + dy), ctx)) return false;
      if (this.solid.cueva.has(Math.floor(x + dx) + ',' + Math.floor(y + dy))) return false;
    }
    return true;
  }
  tickEnemies(t, dt, players) {
    for (const e of this.enemies) {
      const def = D.ENEMIES[e.kind];
      if (!e.alive) {
        if (t >= e.respawnAt && !players.some(p => dist(p.x, p.y, e.sx, e.sy) < 4)) {
          Object.assign(e, { alive: true, hp: def.hp, x: e.sx, y: e.sy, vx: 0, vy: 0 });
        }
        continue;
      }
      let target = null, best = 99;
      for (const p of players) { const d = dist(p.x, p.y - 0.3, e.x, e.y); if (d < best) { best = d; target = p; } }
      if (t < e.stunUntil) {
        // empujón tras un golpe
        const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
        if (this.enemyFree(nx, ny)) { e.x = nx; e.y = ny; }
        e.vx *= 0.85; e.vy *= 0.85;
        continue;
      }
      let mx = 0, my = 0;
      if (e.kind === 'musguito') {
        // salta de a poquito
        if (t >= e.next) {
          e.next = t + 650 + rand() * 300;
          if (target && best < 5.5 && t > e.retreatUntil) { mx = target.x - e.x; my = target.y - 0.3 - e.y; }
          else if (target && t <= e.retreatUntil) { mx = e.x - target.x; my = e.y - target.y; }
          else { mx = e.sx + (rand() * 4 - 2) - e.x; my = e.sy + (rand() * 4 - 2) - e.y; }
          const l = Math.hypot(mx, my) || 1;
          e.vx = (mx / l) * def.speed * 1.6; e.vy = (my / l) * def.speed * 1.6;
          e.hopUntil = t + 380;
        }
        if (t < (e.hopUntil || 0)) {
          const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
          if (this.enemyFree(nx, ny)) { e.x = nx; e.y = ny; } else { e.vx = 0; e.vy = 0; }
        }
      } else {
        // polillín: revolotea
        e.phase += dt * 3;
        if (target && best < 6 && t > e.retreatUntil) { mx = target.x - e.x; my = target.y - 0.6 - e.y; }
        else if (target && t <= e.retreatUntil) { mx = e.x - target.x; my = e.y - target.y; }
        else { mx = e.sx + Math.cos(e.phase * 0.5) * 1.5 - e.x; my = e.sy + Math.sin(e.phase * 0.7) - e.y; }
        const l = Math.hypot(mx, my) || 1;
        const sp = l < 0.15 ? 0 : def.speed;
        const nx = e.x + (mx / l) * sp * dt + Math.cos(e.phase * 2.3) * dt * 0.8;
        const ny = e.y + (my / l) * sp * dt + Math.sin(e.phase * 3.1) * dt * 0.8;
        if (this.enemyFree(nx, ny)) { e.x = nx; e.y = ny; }
      }
      // contacto
      for (const p of players) {
        if (dist(p.x, p.y - 0.3, e.x, e.y) > 0.62) continue;
        if (t < (this.invulnUntil[p.id] || 0)) continue;
        this.hurt(p, def.dmg, e, t);
        e.retreatUntil = t + 900;
      }
    }
    if (t - this.enemyBroadcastAt >= 100) {
      this.enemyBroadcastAt = t;
      this.broadcast({ t: 'en', l: this.enemyPub() }, { map: 'cueva' });
    }
  }

  hurt(p, dmg, e, t) {
    p.hp = Math.max(0, p.hp - dmg);
    this.invulnUntil[p.id] = t + D.INVULN_MS;
    this.lastHurt[p.id] = t;
    const l = Math.hypot(p.x - e.x, p.y - 0.3 - e.y) || 1;
    this.send(p.id, { t: 'knock', dx: (p.x - e.x) / l, dy: (p.y - 0.3 - e.y) / l });
    this.fx(p.map, { k: 'hurt', p: p.id, x: p.x, y: p.y });
    if (p.hp <= 0) {
      p.hp = D.MAX_HP;
      this.moveTo(p, M.HOME_SPAWN);
      this.toast(p.id, 'Te desmayaste… Despertaste frente a casa con toda la vida. ¡No perdiste nada!', 'warn');
      const o = this.other(p.id);
      if (o) this.toast(o, `${p.name} se desmayó en la cueva, pero ya está a salvo en casa.`, 'info');
    }
    this.syncHp(p);
  }

  moveTo(p, to) {
    p.map = to.map; p.x = to.x; p.y = to.y; p.dir = to.dir || 'down'; p.sit = null;
    this.lastMove[p.id] = Date.now();
    delete this.fishing[p.id];
    this.send(p.id, { t: 'pos', map: p.map, x: p.x, y: p.y, dir: p.dir, warp: true });
    this.syncPl(p);
    if (p.map === 'cueva') this.send(p.id, { t: 'en', l: this.enemyPub() });
    this.dirty();
  }

  // ------------------------------------------------------------ mascota
  petPub() {
    const pt = this.d.pet;
    return { name: pt.name, x: pt.x, y: pt.y, dir: pt.dir, affection: pt.affection, fedAt: pt.fedAt, species: D.PET.species };
  }
  tickPet(t, dt) {
    const pt = this.d.pet, r = this.pet;
    if (t >= r.next) {
      r.next = t + 2500 + rand() * 4000;
      const A = M.PET_AREA;
      // a veces se acerca a alguien que esté cerca
      const near = [...this.online].map(k => this.d.players[k]).find(p => p.map === 'isla' && dist(p.x, p.y, pt.x, pt.y) < 5);
      if (near && rand() < 0.5) { r.tx = clamp(near.x + (rand() - 0.5), A.x0, A.x1); r.ty = clamp(near.y + 0.6, A.y0, A.y1); }
      else if (rand() < 0.35) { r.tx = pt.x; r.ty = pt.y; } // se queda quieto
      else { r.tx = A.x0 + rand() * (A.x1 - A.x0); r.ty = A.y0 + rand() * (A.y1 - A.y0); }
    }
    const dx = r.tx - pt.x, dy = r.ty - pt.y, l = Math.hypot(dx, dy);
    const moving = l > 0.08;
    if (moving) {
      const sp = Math.min(l, 1.4 * dt);
      const nx = pt.x + (dx / l) * sp, ny = pt.y + (dy / l) * sp;
      if (!M.collides('isla', nx, ny, this.ctx(), this.solid)) { pt.x = nx; pt.y = ny; }
      else { r.tx = pt.x; r.ty = pt.y; }
      pt.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    }
    if ((moving || r.moving) && t - r.lastSent > 180) {
      r.lastSent = t;
      this.broadcast({ t: 'petpos', x: +pt.x.toFixed(2), y: +pt.y.toFixed(2), dir: pt.dir, mv: moving ? 1 : 0 }, { map: 'isla' });
    }
    r.moving = moving;
  }

  // ------------------------------------------------------------ desafíos
  startChallenge(c, t) {
    c.status = 'active';
    if (c.type === 'cosecha') {
      for (const [k, s] of Object.entries(this.d.soil)) {
        const cr = s.crop;
        if (!cr) continue;
        const def = D.CROPS[cr.type];
        if (cr.step >= def.steps) continue;
        if (cr.watered && cr.readyAt) cr.readyAt = t + Math.max(0, cr.readyAt - t) / 4;
        else { cr.watered = true; cr.readyAt = t + def.stepMs / 4; }
        this.broadcast({ t: 'soil', k, s }, { map: 'isla' });
      }
    }
    if (c.type === 'mineria') {
      for (const o of Object.values(this.d.objects)) {
        if (o.gone && D.NODES[o.kind].mineral) o.respawnAt = Math.min(o.respawnAt, t + 3000);
      }
    }
    this.syncChallenge();
    this.dirty();
  }

  finishChallenge(t) {
    const c = this.d.challenge;
    if (!c || c.status !== 'active' || c.rewarded) return; // nunca se paga dos veces
    c.status = 'finished';
    c.rewarded = true;
    c.endsAt = Math.min(c.endsAt, t);
    const def = D.CHALLENGES[c.type];
    const [a, b] = c.players;
    let va, vb;
    if (c.type === 'pesca') {
      va = [c.best[a] || 0, c.sum[a] || 0]; vb = [c.best[b] || 0, c.sum[b] || 0];
    } else { va = [c.scores[a] || 0, 0]; vb = [c.scores[b] || 0, 0]; }
    const cmp = va[0] - vb[0] || va[1] - vb[1];
    const winners = cmp > 0 ? [a] : cmp < 0 ? [b] : [a, b];
    const nobody = va[0] === 0 && vb[0] === 0 && va[1] === 0 && vb[1] === 0;
    c.result = { winners: nobody ? [] : winners, tie: !nobody && winners.length === 2, nobody };
    for (const pid of c.players) {
      const p = this.d.players[pid];
      if (!p) continue;
      this.give(p, def.reward);
      if (c.result.winners.includes(pid)) {
        p.wins[c.type] = (p.wins[c.type] || 0) + 1;
        if (!p.cosmetics.includes(def.hat)) p.cosmetics.push(def.hat);
        p.look.hat = def.hat;
        this.syncPl(p);
      }
      this.syncInv(p);
      this.syncMe(p);
    }
    const names = c.result.winners.map(k => this.d.players[k].name);
    const txt = nobody ? 'nadie sumó puntos' : c.result.tie ? `empate entre ${names.join(' y ')}` : `ganó ${names[0]}`;
    this.d.history.unshift({ type: c.type, at: t, scores: c.scores, best: c.best, result: c.result });
    this.d.history = this.d.history.slice(0, 10);
    this.addLog(`Desafío “${def.name}”: ${txt}.`);
    this.syncChallenge();
    this.io.saveNow(this);
  }

  // ------------------------------------------------------------ casa
  // ¿Se puede caminar desde la puerta a todo el piso libre? (evita encerrar a alguien)
  houseConnected(extra) {
    const lvl = this.d.houseLevel, r = M.houseFloorRect(lvl);
    const blocked = new Set(this.solid.casa);
    for (const k of extra) blocked.add(k);
    const start = `${M.HOUSE_DOOR.x},${M.HOUSE_DOOR.y - 1}`;
    if (blocked.has(start)) return false;
    const seen = new Set([start]), q = [[M.HOUSE_DOOR.x, M.HOUSE_DOOR.y - 1]];
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
        if (seen.has(k) || blocked.has(k) || M.houseTile(lvl, nx, ny) !== 'floor') continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      const k = x + ',' + y;
      if (!blocked.has(k) && !seen.has(k)) return false;
    }
    return true;
  }
}

// ================================================================ acciones
// Cada acción valida TODO antes de modificar el estado.
const ACTIONS = {
  warp(p, m) {
    const w = M.WARPS.find(x => x.id === m.w);
    if (!w || w.map !== p.map) fail('No podés ir por ahí');
    if (!w.tiles.some(([tx, ty]) => dist(p.x, p.y - 0.2, tx + 0.5, ty + 0.5) <= 1.5)) fail('Estás muy lejos de la entrada');
    this.moveTo(p, w.to);
    return {};
  },

  gather(p, m, t) {
    const o = this.d.objects[m.o];
    if (!o || o.map !== p.map) fail('No hay nada para juntar');
    const def = D.NODES[o.kind];
    if (!def.drops) fail('Eso no se puede juntar');
    if (o.gone) fail('Ya no queda nada acá. Vuelve a crecer en un rato');
    this.requireNear(p, o.x, o.y, o.w || 1, 1);
    let power = 1;
    if (def.tool === 'hacha' && !this.has(p, 'hacha')) fail('Necesitás un hacha (se fabrica con ramitas y piedras)', 'tool');
    if (def.tool === 'pico') {
      power = this.pickPower(p);
      if (!power) fail('Necesitás un pico (se fabrica con ramitas y piedras)', 'tool');
      if (def.minPower && power < def.minPower) fail('Este cristal necesita un pico de cobre', 'tool');
    }
    const need = Math.max(1, Math.ceil(def.hits / power));
    if (t - (o.lastHitAt || 0) > 15_000) o.hits = 0;
    o.hits += 1; o.lastHitAt = t;
    if (o.hits < need) {
      this.fx(o.map, { k: 'hit', o: o.id, by: p.id });
      this.broadcast({ t: 'obj', o: this.objPub(o) }, { map: o.map });
      return { hit: o.hits, need };
    }
    o.gone = true; o.hits = 0;
    const fastMine = def.mineral && this.challengeActive('mineria');
    o.respawnAt = t + (fastMine ? 15_000 : def.respawnMs);
    const got = rollDrops(def.drops);
    this.give(p, got);
    if (def.mineral) {
      const n = Object.entries(got).filter(([k]) => ['piedra', 'cobre', 'cuarzo'].includes(k)).reduce((s, [, v]) => s + v, 0);
      this.score(p.id, 'mineria', n);
    }
    if (def.solid) this.rebuildSolid();
    this.fx(o.map, { k: 'gather', o: o.id, by: p.id, got });
    this.broadcast({ t: 'obj', o: this.objPub(o) }, { map: o.map });
    this.syncInv(p);
    this.dirty();
    return { got };
  },

  till(p, m) {
    const { x, y } = m;
    if (!isInt(x, 0, 39) || !isInt(y, 0, 29) || p.map !== 'isla') fail('Ahí no');
    if (M.rawTile('isla', x, y) !== 'f') fail('Solo se puede preparar la tierra dentro de la huerta');
    if (!this.has(p, 'azada')) fail('Necesitás la azada');
    const k = x + ',' + y;
    if (this.d.soil[k]) fail('Esa tierra ya está lista');
    this.requireNear(p, x, y);
    this.d.soil[k] = { crop: null, by: p.id };
    this.broadcast({ t: 'soil', k, s: this.d.soil[k] }, { map: 'isla' });
    this.fx('isla', { k: 'till', x, y, by: p.id });
    this.dirty();
    return {};
  },

  plant(p, m, t) {
    const { x, y, seed } = m;
    const k = x + ',' + y, s = this.d.soil[k];
    if (p.map !== 'isla' || !s) fail('Primero prepará la tierra con la azada');
    if (s.crop) fail('Ya hay algo plantado ahí');
    const it = D.ITEMS[seed];
    if (!it || it.cat !== 'semilla') fail('Elegí semillas para plantar');
    this.requireNear(p, x, y);
    this.take(p, seed, 1);
    const def = D.CROPS[it.crop];
    s.crop = { type: it.crop, step: 0, watered: false, readyAt: 0, planter: p.id, plantedAt: t };
    if (this.challengeActive('cosecha')) { s.crop.watered = true; s.crop.readyAt = t + def.stepMs / 4; }
    this.broadcast({ t: 'soil', k, s }, { map: 'isla' });
    this.fx('isla', { k: 'plant', x, y, by: p.id });
    this.syncInv(p);
    this.dirty();
    return {};
  },

  water(p, m, t) {
    const { x, y } = m;
    const k = x + ',' + y, s = this.d.soil[k];
    if (!this.has(p, 'regadera')) fail('Necesitás la regadera');
    if (p.map !== 'isla' || !s || !s.crop) fail('No hay nada para regar ahí');
    const def = D.CROPS[s.crop.type];
    if (s.crop.step >= def.steps) fail('¡Ya está para cosechar!');
    if (s.crop.watered) fail('Ya está regado. Crece solito un rato');
    this.requireNear(p, x, y);
    const fast = this.challengeActive('cosecha') ? 4 : 1;
    s.crop.watered = true; s.crop.readyAt = t + def.stepMs / fast;
    this.broadcast({ t: 'soil', k, s }, { map: 'isla' });
    this.fx('isla', { k: 'water', x, y, by: p.id });
    this.dirty();
    return {};
  },

  harvest(p, m) {
    const { x, y } = m;
    const k = x + ',' + y, s = this.d.soil[k];
    if (p.map !== 'isla' || !s || !s.crop) fail('No hay nada para cosechar');
    const def = D.CROPS[s.crop.type];
    if (s.crop.step < def.steps) fail('Todavía no está listo');
    const ch = this.challengeActive('cosecha');
    if (ch && s.crop.planter !== p.id && ch.players.includes(s.crop.planter)) fail('Durante el desafío cada uno cosecha lo que plantó');
    this.requireNear(p, x, y);
    const n = randInt(def.yield[0], def.yield[1]);
    const got = { [s.crop.type]: n };
    if (rand() < def.seedChance) got[def.seed] = 1;
    s.crop = null;
    this.give(p, got);
    this.score(p.id, 'cosecha', n);
    this.broadcast({ t: 'soil', k, s }, { map: 'isla' });
    this.fx('isla', { k: 'harvest', x, y, by: p.id, got });
    this.syncInv(p);
    this.dirty();
    return { got };
  },

  chest(p, m, t) {
    const o = this.d.objects[m.o];
    if (!o || o.kind !== 'cofre' || o.map !== p.map) fail('No hay ningún cofre');
    this.requireNear(p, o.x, o.y);
    const last = p.chests[o.id] || 0;
    if (t - last < D.CHEST_COOLDOWN_MS) {
      const mins = Math.ceil((D.CHEST_COOLDOWN_MS - (t - last)) / 60_000);
      fail(`Ya lo abriste. Se vuelve a llenar en ${mins} min`);
    }
    let got = rollDrops(D.CHEST_LOOT[o.loot || 0]);
    if (!Object.keys(got).length) got = { moneda: 1 };
    p.chests[o.id] = t;
    this.give(p, got);
    this.fx(p.map, { k: 'chest', o: o.id, by: p.id, got });
    this.syncInv(p);
    this.syncMe(p);
    this.dirty();
    return { got };
  },

  eat(p, m) {
    const it = D.ITEMS[m.item];
    if (!it || !it.heal) fail('Eso no se come');
    if (p.hp >= D.MAX_HP) fail('Ya tenés toda la vida');
    this.take(p, m.item, 1);
    p.hp = Math.min(D.MAX_HP, p.hp + it.heal);
    this.syncInv(p); this.syncHp(p);
    this.fx(p.map, { k: 'eat', p: p.id, x: p.x, y: p.y });
    this.dirty();
    return {};
  },

  craft(p, m) {
    const r = D.RECIPE_BY_ID[m.r];
    if (!r) fail('Esa receta no existe');
    const n = isInt(m.n, 1, 20) ? m.n : 1;
    if (r.unique) {
      if (n !== 1) fail('Las herramientas se fabrican de a una');
      for (const k of Object.keys(r.out)) if (this.has(p, k)) fail('Ya tenés esa herramienta');
    }
    for (const [k, v] of Object.entries(r.in)) if (!this.has(p, k, v * n)) fail(`Te falta ${D.itemName(k)}`);
    for (const [k, v] of Object.entries(r.in)) this.take(p, k, v * n);
    const out = {};
    for (const [k, v] of Object.entries(r.out)) out[k] = v * n;
    this.give(p, out);
    this.syncInv(p);
    this.fx(p.map, { k: 'craft', p: p.id, x: p.x, y: p.y, item: Object.keys(r.out)[0] });
    this.dirty();
    return { got: out };
  },

  place(p, m, t) {
    const def = D.FURNITURE[m.item];
    if (!def || D.ITEMS[m.item]?.cat !== 'mueble') fail('Eso no es un mueble');
    if (p.map !== 'casa') fail('Los muebles se ponen dentro de la casa');
    if (!isInt(m.x, 0, 13) || !isInt(m.y, 0, 10)) fail('Posición inválida');
    if (!this.has(p, m.item)) fail('No tenés ese mueble');
    const lvl = this.d.houseLevel, furn = Object.values(this.d.furniture);
    const cells = [];
    for (let dx = 0; dx < def.w; dx++) for (let dy = 0; dy < def.h; dy++) cells.push([m.x + dx, m.y + dy]);
    if (def.layer === 'wall') {
      if (M.houseTile(lvl, m.x, m.y) !== 'wallface') fail('Los cuadros van en la pared');
      if (furn.some(f => D.FURNITURE[f.item].layer === 'wall' && f.x === m.x && f.y === m.y)) fail('Ahí ya hay un cuadro');
    } else {
      for (const [x, y] of cells) {
        if (M.houseTile(lvl, x, y) !== 'floor') fail('No entra ahí');
        if (def.layer === 1 && x === M.HOUSE_DOOR.x && y === M.HOUSE_DOOR.y - 1) fail('Dejá libre la entrada');
      }
      const overlaps = (f) => {
        const fd = D.FURNITURE[f.item];
        if (fd.layer !== def.layer) return false;
        return m.x < f.x + fd.w && m.x + def.w > f.x && m.y < f.y + fd.h && m.y + def.h > f.y;
      };
      if (furn.some(overlaps)) fail('Ahí ya hay otro mueble');
      if (def.layer === 1) {
        if (this.playerOn('casa', m.x, m.y, def.w, def.h)) fail('Hay alguien parado ahí');
        if (!this.houseConnected(cells.map(([x, y]) => x + ',' + y))) fail('Así bloquearía el paso. Probá en otro lugar');
      }
    }
    this.take(p, m.item, 1);
    const f = { id: 'f' + newId(6), item: m.item, x: m.x, y: m.y, owner: p.id, at: t };
    this.d.furniture[f.id] = f;
    this.rebuildSolid();
    this.broadcast({ t: 'furn', f });
    this.syncInv(p);
    this.dirty();
    return { f: f.id };
  },

  pickup(p, m) {
    const f = this.d.furniture[m.f];
    if (!f) fail('Ese mueble ya no está');
    if (p.map !== 'casa') fail('Entrá a la casa');
    const owner = this.d.players[f.owner] || p;
    // si hay algo encima de la alfombra, primero eso
    const def = D.FURNITURE[f.item];
    if (def.layer === 0 && Object.values(this.d.furniture).some(g => {
      const gd = D.FURNITURE[g.item];
      return gd.layer === 1 && g.x < f.x + def.w && g.x + gd.w > f.x && g.y < f.y + def.h && g.y + gd.h > f.y;
    })) fail('Primero guardá lo que está encima de la alfombra');
    delete this.d.furniture[f.id];
    this.give(owner, { [f.item]: 1 });
    this.rebuildSolid();
    this.broadcast({ t: 'furn', del: f.id });
    this.syncInv(owner);
    this.dirty();
    return { owner: owner.id };
  },

  sit(p, m) {
    if (m.f) {
      const f = this.d.furniture[m.f];
      if (!f || p.map !== 'casa' || D.FURNITURE[f.item].use !== 'sit') fail('No hay dónde sentarse');
      this.requireNear(p, f.x, f.y);
      p.sit = { x: f.x + 0.5, y: f.y + 0.85, dir: 'down' };
      this.syncPl(p);
      return {};
    }
    const o = this.d.objects[m.o];
    if (!o || o.kind !== 'banco' || p.map !== 'isla') fail('No hay dónde sentarse');
    this.requireNear(p, o.x, o.y, o.w || 1, 1);
    const otherP = this.d.players[this.other(p.id)];
    const taken = otherP && otherP.sit && otherP.map === 'isla' ? otherP.sit.seat : -1;
    const seat = taken === 0 ? 1 : taken === 1 ? 0 : (p.x < o.x + 1 ? 0 : 1);
    p.sit = { x: o.x + seat + 0.5, y: o.y + 0.75, dir: 'down', seat, bench: o.id };
    this.syncPl(p);
    if (otherP && otherP.sit && otherP.sit.bench === o.id && this.online.has(otherP.id)) {
      this.fx('isla', { k: 'love', x: o.x + 1, y: o.y });
      if (!this.d.memories.bench) {
        this.d.memories.bench = Date.now();
        this.give(p, { cuadro: 1 }); this.give(otherP, { cuadro: 1 });
        this.syncInv(p); this.syncInv(otherP);
        for (const q of [p, otherP]) this.toast(q.id, 'Un ratito juntos mirando el mar 💛 Recibieron un Cuadro del atardecer para la casa.', 'love');
        this.addLog(`${p.name} y ${otherP.name} miraron el atardecer desde el mirador.`);
        this.dirty();
      }
    }
    return {};
  },

  rest(p, m) {
    const f = this.d.furniture[m.f];
    if (!f || p.map !== 'casa' || D.FURNITURE[f.item].use !== 'rest') fail('No hay cama');
    this.requireNear(p, f.x, f.y, 2, 2);
    p.hp = D.MAX_HP;
    this.syncHp(p);
    this.fx('casa', { k: 'zzz', p: p.id, x: f.x + 1, y: f.y + 1 });
    this.toast(p.id, 'Una siestita y quedaste como nuevo. Vida al máximo.', 'info');
    return {};
  },

  music(p, m) {
    const f = this.d.furniture[m.f];
    if (!f || p.map !== 'casa' || D.FURNITURE[f.item].use !== 'music') fail('No hay caja musical');
    this.requireNear(p, f.x, f.y);
    this.fx('casa', { k: 'music', f: f.id, x: f.x + 0.5, y: f.y + 0.5, by: p.id });
    return {};
  },

  contribute(p, m) {
    const pj = this.d.projects[m.pj], def = D.PROJECTS[m.pj];
    if (!pj || !def) fail('Ese proyecto no existe');
    if (pj.done) fail('¡Ese proyecto ya está terminado!');
    if (def.requires && !this.d.projects[def.requires].done) fail('Primero hay que terminar el proyecto anterior');
    const items = m.item ? [m.item] : Object.keys(def.needs);
    const given = {};
    for (const item of items) {
      if (!def.needs[item]) continue;
      const remaining = def.needs[item] - (pj.have[item] || 0);
      const want = m.item ? (isInt(m.qty, 1, 9999) ? m.qty : remaining) : remaining;
      const q = Math.min(want, remaining, p.inv[item] || 0);
      if (q <= 0) continue;
      this.take(p, item, q);
      pj.have[item] = (pj.have[item] || 0) + q;
      pj.contrib[p.id] = pj.contrib[p.id] || {};
      pj.contrib[p.id][item] = (pj.contrib[p.id][item] || 0) + q;
      given[item] = q;
    }
    if (!Object.keys(given).length) fail('No tenés materiales que le falten a este proyecto');
    const list = Object.entries(given).map(([k, v]) => `${v} ${D.itemName(k)}`).join(', ');
    this.addLog(`${p.name} aportó ${list} a “${def.name}”.`);
    const complete = Object.entries(def.needs).every(([k, v]) => (pj.have[k] || 0) >= v);
    if (complete) {
      pj.done = true; pj.doneAt = Date.now();
      if (m.pj === 'puente') this.d.bridge = true;
      if (m.pj === 'casa2') this.d.houseLevel = Math.max(this.d.houseLevel, 2);
      if (m.pj === 'casa3') this.d.houseLevel = Math.max(this.d.houseLevel, 3);
      this.addLog(`¡Proyecto terminado entre los dos: “${def.name}”!`);
      for (const pid of this.online) this.toast(pid, `¡Terminaron “${def.name}”! 🎉`, 'love');
      this.fx(null, { k: 'project', pj: m.pj });
    }
    this.syncProjects();
    this.syncInv(p);
    this.io.saveNow(this);
    return { given, complete };
  },

  mail_send(p, m, t) {
    const to = this.other(p.id);
    if (!to) fail('Todavía no hay nadie más en la isla. ¡Compartí el código de invitación!');
    const mb = Object.values(this.d.objects).find(o => o.kind === 'buzon');
    if (p.map !== 'isla' || !this.near(p, mb.x, mb.y, 1, 1, 3)) fail('Los regalos se dejan en el buzón');
    const note = cleanText(m.note, D.NOTE_MAX);
    let item = null, qty = 0;
    if (m.item) {
      item = m.item;
      const it = D.ITEMS[item];
      if (!it) fail('Ese objeto no existe');
      if (it.cat === 'herramienta') fail('Las herramientas no se pueden regalar (las necesitás vos)');
      qty = isInt(m.qty, 1, 999) ? m.qty : 1;
      if (!this.has(p, item, qty)) fail(`No tenés tantos: ${it.name}`);
    }
    if (!item && !note) fail('Escribí una nota o elegí un regalo');
    const pending = this.d.mail.filter(x => x.to === to && !x.claimed).length;
    if (pending >= 30) fail('El buzón está lleno. Esperá a que lo abran');
    if (item) this.take(p, item, qty);
    const mail = { id: 'm' + newId(6), from: p.id, to, item, qty, note, sentAt: t, claimed: false };
    this.d.mail.push(mail);
    // guardar historial acotado: se descartan las cartas ya abiertas más viejas
    while (this.d.mail.length > 60) {
      const i = this.d.mail.findIndex(x => x.claimed);
      if (i < 0) break;
      this.d.mail.splice(i, 1);
    }
    this.syncInv(p);
    this.syncMail();
    this.toast(to, `${p.name} te dejó ${item ? 'un regalo' : 'una cartita'} en el buzón 💌`, 'love');
    this.addLog(`${p.name} dejó ${item ? 'un regalo' : 'una cartita'} en el buzón.`);
    this.io.saveNow(this);
    return { mail: mail.id };
  },

  mail_claim(p, m, t) {
    const mail = this.d.mail.find(x => x.id === m.m);
    if (!mail || mail.to !== p.id) fail('Esa carta no es para vos');
    if (mail.claimed) fail('Ya abriste esa carta');
    const mb = Object.values(this.d.objects).find(o => o.kind === 'buzon');
    if (p.map !== 'isla' || !this.near(p, mb.x, mb.y, 1, 1, 3)) fail('Las cartas se abren en el buzón');
    mail.claimed = true; mail.claimedAt = t;
    if (mail.item) this.give(p, { [mail.item]: mail.qty });
    this.syncInv(p);
    this.syncMail();
    const from = this.d.players[mail.from];
    if (from) this.toast(from.id, `${p.name} abrió tu ${mail.item ? 'regalo' : 'cartita'} 💛`, 'love');
    this.io.saveNow(this);
    return { item: mail.item, qty: mail.qty };
  },

  pet(p, m, t) {
    const pt = this.d.pet;
    if (p.map !== 'isla' || dist(p.x, p.y - 0.3, pt.x, pt.y - 0.3) > 1.8) fail('Acercate al carpincho');
    if (!pt.name) fail('¡Primero ponele un nombre!', 'needs_name');
    const last = this.lastPet[p.id] || 0;
    this.lastPet[p.id] = t;
    let bonus = 0;
    const o = this.other(p.id);
    if (o && t - (this.lastPet[o] || 0) < 12_000 && t - last > 2000) bonus = 4;
    if (t - (pt.pettedAt[p.id] || 0) >= D.PET.petCooldownMs) {
      pt.affection = Math.min(100, pt.affection + 3 + bonus);
      pt.pettedAt[p.id] = t;
    }
    this.fx('isla', { k: bonus ? 'love' : 'hearts', x: pt.x, y: pt.y - 0.8, pet: 1 });
    let gift = null;
    if (pt.affection >= 25 && t - pt.lastGiftAt > D.PET.giftEveryMs && t - pt.fedAt < 30 * 60_000) {
      const [item, a, b] = D.PET.giftLoot[randInt(0, D.PET.giftLoot.length - 1)];
      gift = { [item]: randInt(a, b) };
      pt.lastGiftAt = t;
      this.give(p, gift);
      this.syncInv(p);
      this.toast(p.id, `¡${pt.name} te trajo ${D.itemName(item)}!`, 'love');
    }
    this.broadcast({ t: 'pet', pet: this.petPub() });
    this.dirty();
    return { gift, both: !!bonus };
  },

  feed(p, m, t) {
    const pt = this.d.pet;
    if (p.map !== 'isla' || dist(p.x, p.y - 0.3, pt.x, pt.y - 0.3) > 1.8) fail('Acercate al carpincho');
    if (!pt.name) fail('¡Primero ponele un nombre!', 'needs_name');
    const it = D.ITEMS[m.item];
    if (!it || !D.PET_FOOD_CATS.has(it.cat)) fail('Eso no le gusta. Probá con algo de la huerta o un pescado');
    this.take(p, m.item, 1);
    const hungry = t - pt.fedAt >= D.PET.fullMs;
    pt.affection = Math.min(100, pt.affection + (hungry ? (m.item === 'frutilla' ? 12 : 8) : 1));
    if (hungry) pt.fedAt = t;
    this.fx('isla', { k: 'yum', x: pt.x, y: pt.y - 0.8 });
    if (!hungry) this.toast(p.id, `${pt.name} está lleno, pero lo disfrutó igual`, 'info');
    this.syncInv(p);
    this.broadcast({ t: 'pet', pet: this.petPub() });
    this.dirty();
    return { hungry };
  },

  pet_name(p, m) {
    const pt = this.d.pet;
    const name = cleanText(m.name, D.NAME_MAX);
    if (!name) fail('Escribí un nombre');
    if (p.map !== 'isla' || dist(p.x, p.y - 0.3, pt.x, pt.y - 0.3) > 2.5) fail('Acercate al carpincho');
    const first = !pt.name;
    pt.name = name;
    this.addLog(first ? `${p.name} le puso nombre al carpincho: ${name}.` : `${p.name} rebautizó al carpincho: ${name}.`);
    this.broadcast({ t: 'pet', pet: this.petPub() });
    this.fx('isla', { k: 'hearts', x: pt.x, y: pt.y - 0.8 });
    this.dirty();
    return {};
  },

  fish_start(p, m, t) {
    if (!this.has(p, 'cana')) fail('Necesitás una caña (ramitas + fibra)', 'tool');
    if (!isInt(m.x, 0, 39) || !isInt(m.y, 0, 29)) fail('Ahí no hay agua');
    const spot = M.fishingSpot(p.map, p.x, p.y, m.x, m.y);
    if (!spot) fail('Mirá hacia el agua para pescar');
    this.requireNear(p, m.x, m.y);
    const w = D.FISH_SPOTS[spot].weights;
    let r = rand() * w.reduce((a, b) => a + b, 0), rarity = 0;
    for (let i = 0; i < w.length; i++) { if (r < w[i]) { rarity = i; break; } r -= w[i]; }
    const pool = D.FISH_BY_RARITY[rarity];
    const fish = pool[randInt(0, pool.length - 1)];
    const seed = randInt(1, 2 ** 31 - 1);
    const biteMs = randInt(900, 2600);
    const sid = newId(6);
    this.fishing[p.id] = { sid, fish, rarity, seed, startedAt: t, biteMs, spot };
    this.fx(p.map, { k: 'cast', p: p.id, x: m.x, y: m.y });
    return { sid, rarity, seed, biteMs, spot };
  },

  fish_end(p, m, t) {
    const s = this.fishing[p.id];
    if (!s || s.sid !== m.sid) fail('Esa pesca ya terminó');
    delete this.fishing[p.id]; // una sola vez por pique
    const taps = Array.isArray(m.taps) ? m.taps.slice(0, 12) : [];
    const elapsed = t - s.startedAt - s.biteMs;
    const lastTap = taps.length ? taps[taps.length - 1] : 0;
    if (lastTap > elapsed + 1500) fail('Se escapó…');
    const res = evalTaps(fishParams(s.rarity, s.seed), taps);
    if (!res.success) {
      this.fx(p.map, { k: 'splash', p: p.id });
      return { caught: false, hits: res.hits };
    }
    this.give(p, { [s.fish]: 1 });
    const pts = D.RARITY[s.rarity].points;
    this.score(p.id, 'pesca', 1, pts);
    this.syncInv(p);
    this.fx(p.map, { k: 'catch', p: p.id, fish: s.fish, rarity: s.rarity });
    if (s.rarity >= 2) {
      this.addLog(`${p.name} pescó ${s.rarity === 3 ? '¡¡una' : 'un'} ${D.itemName(s.fish)} en ${D.FISH_SPOTS[s.spot].name}${s.rarity === 3 ? '!!' : '.'}`);
      const o = this.other(p.id);
      if (o) this.toast(o, `${p.name} pescó: ${D.itemName(s.fish)} (${D.RARITY[s.rarity].name})`, 'info');
    }
    this.dirty();
    return { caught: true, fish: s.fish, rarity: s.rarity };
  },

  attack(p, m, t) {
    if (t - (this.lastAttack[p.id] || 0) < 330) return { hits: 0 };
    this.lastAttack[p.id] = t;
    const dir = M.DIRS[m.dir] ? m.dir : p.dir;
    if (M.DIRS[m.dir]) p.dir = dir;
    this.fx(p.map, { k: 'swing', p: p.id, dir });
    if (p.map !== 'cueva') return { hits: 0 };
    const [dx, dy] = M.DIRS[dir];
    const hx = p.x + dx * 0.8, hy = p.y - 0.35 + dy * 0.8;
    const dmg = this.has(p, 'espada') ? D.ITEMS.espada.dmg : 1;
    let hits = 0;
    for (const e of this.enemies) {
      if (!e.alive || dist(hx, hy, e.x, e.y) > 1.05) continue;
      hits++;
      e.hp -= dmg; e.hurtAt = t;
      const l = Math.hypot(e.x - p.x, e.y - (p.y - 0.3)) || 1;
      e.vx = ((e.x - p.x) / l) * 7; e.vy = ((e.y - (p.y - 0.3)) / l) * 7;
      e.stunUntil = t + 380;
      if (e.hp <= 0) {
        e.alive = false;
        const def = D.ENEMIES[e.kind];
        e.respawnAt = t + def.respawnMs;
        const got = rollDrops([def.drop]);
        if (Object.keys(got).length) { this.give(p, got); this.syncInv(p); }
        this.fx('cueva', { k: 'poof', x: e.x, y: e.y, by: p.id, got, enemy: e.kind });
      }
    }
    if (hits) this.broadcast({ t: 'en', l: this.enemyPub() }, { map: 'cueva' });
    return { hits };
  },

  emote(p, m, t) {
    if (!D.EMOTES.includes(m.e)) fail('Ese gesto no existe');
    if (t - (this.lastEmote[p.id] || 0) < 700) return {};
    this.lastEmote[p.id] = t;
    this.broadcast({ t: 'emote', p: p.id, e: m.e });
    return {};
  },

  look(p, m) {
    const prof = validateProfile({ name: m.name, look: m.look });
    const hat = m.look && m.look.hat;
    prof.look.hat = hat && p.cosmetics.includes(hat) ? hat : null;
    p.name = prof.name; p.look = prof.look;
    this.syncPl(p);
    this.dirty();
    return {};
  },

  ch_propose(p, m, t) {
    const def = D.CHALLENGES[m.type];
    if (!def) fail('Ese desafío no existe');
    const o = this.other(p.id);
    if (!o || !this.online.has(o)) fail('Los desafíos se juegan con los dos conectados');
    const c = this.d.challenge;
    if (c && (c.status === 'proposed' || c.status === 'countdown' || c.status === 'active')) fail('Ya hay un desafío en curso');
    this.d.challenge = {
      id: newId(6), type: m.type, status: 'proposed', by: p.id, players: [p.id, o],
      createdAt: t, expiresAt: t + D.CHALLENGE_PROPOSAL_MS, scores: { [p.id]: 0, [o]: 0 }, best: {}, sum: {}, rewarded: false,
    };
    this.syncChallenge();
    return { cid: this.d.challenge.id };
  },

  ch_answer(p, m, t) {
    const c = this.d.challenge;
    if (!c || c.id !== m.cid || c.status !== 'proposed') fail('Ese desafío ya no está disponible');
    if (c.by === p.id) fail('Esperá la respuesta');
    if (!c.players.includes(p.id)) fail('No es para vos');
    if (!m.accept) { this.d.challenge = null; this.syncChallenge(); this.toast(c.by, `${p.name} prefiere jugar al desafío en otro momento`, 'info'); return {}; }
    if (!this.online.has(c.by)) fail('Tu compañero/a se desconectó');
    const def = D.CHALLENGES[c.type];
    c.status = 'countdown';
    c.startsAt = t + D.CHALLENGE_COUNTDOWN_MS;
    c.endsAt = c.startsAt + def.durationMs;
    this.syncChallenge();
    this.dirty();
    return {};
  },

  ch_cancel(p, m) {
    const c = this.d.challenge;
    if (!c || c.id !== m.cid) fail('No hay desafío');
    if (c.status !== 'proposed' || c.by !== p.id) fail('Ya no se puede cancelar');
    this.d.challenge = null;
    this.syncChallenge();
    return {};
  },
};
