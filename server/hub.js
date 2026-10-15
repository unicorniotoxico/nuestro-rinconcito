// El "hub" reúne todas las islas en memoria, los índices de acceso
// (llave personal → jugador, código de invitación → isla), las conexiones
// activas y el guardado.
import { Island, createIslandData, createPlayerData, validateProfile, ActionError } from './game/island.js';
import { newId, newInviteCode, newToken, hashToken, normalizeCode } from './game/util.js';

export class Hub {
  constructor(store, opts = {}) {
    this.store = store;
    this.opts = { maxIslands: 500, ...opts };
    this.islands = new Map();
    this.byToken = new Map();
    this.byCode = new Map();
    this.conns = new Map();
    this.saves = new Map();
    this.writing = new Map();
    this.io = {
      send: (iid, pid, msg) => this.send(iid, pid, msg),
      dirty: (isl) => this.scheduleSave(isl, 2500),
      saveNow: (isl) => this.scheduleSave(isl, 150),
    };
  }

  async init() {
    await this.store.init();
    const all = await this.store.loadAll();
    for (const d of all) this.addIsland(d);
    return all.length;
  }

  addIsland(d) {
    const isl = new Island(d, this.io);
    this.islands.set(d.id, isl);
    for (const p of Object.values(d.players)) this.byToken.set(p.tokenHash, { iid: d.id, pid: p.id });
    if (d.inviteCode && !isl.isFull()) this.byCode.set(d.inviteCode, d.id);
    return isl;
  }

  // ------------------------------------------------------------ alta
  createIsland(profileRaw) {
    if (this.islands.size >= this.opts.maxIslands) throw new ActionError('El servidor alcanzó el máximo de islas configurado');
    const profile = validateProfile(profileRaw);
    let id; do { id = newId(9); } while (this.islands.has(id));
    let code; do { code = newInviteCode(); } while (this.byCode.has(code));
    const t = Date.now();
    const d = createIslandData(id, code, t);
    const token = newToken();
    d.players.p1 = createPlayerData('p1', hashToken(token), profile, t);
    d.log.push({ at: t, text: `${profile.name} llegó a la isla y empezó a armar el rinconcito.` });
    const isl = this.addIsland(d);
    this.scheduleSave(isl, 0);
    return { island: isl, pid: 'p1', token };
  }

  joinIsland(codeRaw, profileRaw) {
    const code = normalizeCode(codeRaw);
    const iid = this.byCode.get(code);
    const isl = iid && this.islands.get(iid);
    if (!isl) throw new ActionError('No encontramos una isla con ese código. Revisalo y probá de nuevo', 'bad_code');
    if (isl.isFull()) throw new ActionError('Esa isla ya tiene a sus dos habitantes', 'full');
    const profile = validateProfile(profileRaw);
    const t = Date.now();
    const token = newToken();
    isl.d.players.p2 = createPlayerData('p2', hashToken(token), profile, t);
    // el código de invitación se usa una sola vez: ya nadie más puede entrar ni reemplazar a nadie
    this.byCode.delete(code);
    isl.d.inviteCode = null;
    this.byToken.set(isl.d.players.p2.tokenHash, { iid: isl.id, pid: 'p2' });
    isl.addLog(`${profile.name} llegó a la isla. ¡Ya son dos! 💛`);
    isl.broadcast({ t: 'pl', p: isl.pub(isl.d.players.p2) });
    isl.broadcast({ t: 'code', code: null });
    this.scheduleSave(isl, 0);
    return { island: isl, pid: 'p2', token };
  }

  auth(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const ref = this.byToken.get(hashToken(token));
    if (!ref) return null;
    const isl = this.islands.get(ref.iid);
    return isl ? { island: isl, pid: ref.pid } : null;
  }

  // ------------------------------------------------------------ conexiones
  key(iid, pid) { return iid + ':' + pid; }

  attach(ws, isl, pid) {
    const k = this.key(isl.id, pid);
    const prev = this.conns.get(k);
    if (prev && prev !== ws) {
      prev.ctx = null; // la conexión vieja ya no habla por este jugador
      this.sendRaw(prev, { t: 'kicked', msg: 'Abriste el juego en otro lugar. Esta pestaña quedó en pausa.' });
      try { prev.close(4001, 'otra sesion'); } catch { /* ya cerrada */ }
      isl.online.delete(pid);
    }
    ws.ctx = { island: isl, pid };
    this.conns.set(k, ws);
    isl.onConnect(pid);
  }

  detach(ws) {
    const c = ws.ctx;
    if (!c) return;
    ws.ctx = null;
    const k = this.key(c.island.id, c.pid);
    if (this.conns.get(k) === ws) {
      this.conns.delete(k);
      c.island.onDisconnect(c.pid);
    }
  }

  sendRaw(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  send(iid, pid, msg) {
    const ws = this.conns.get(this.key(iid, pid));
    if (ws) this.sendRaw(ws, msg);
  }

  // ------------------------------------------------------------ ticks
  fastTick(t, dt) { for (const isl of this.islands.values()) if (isl.online.size) isl.fastTick(t, dt); }
  slowTick(t) {
    for (const isl of this.islands.values()) {
      if (isl.online.size || (isl.d.challenge && isl.d.challenge.status !== 'finished')) isl.slowTick(t);
    }
  }

  // ------------------------------------------------------------ guardado
  scheduleSave(isl, delay) {
    const due = Date.now() + delay;
    const cur = this.saves.get(isl.id);
    if (cur && cur.due <= due) return;
    if (cur) clearTimeout(cur.timer);
    const timer = setTimeout(() => { this.saves.delete(isl.id); this.saveIsland(isl); }, delay);
    this.saves.set(isl.id, { timer, due });
  }

  saveIsland(isl) {
    const json = JSON.parse(JSON.stringify(isl.d)); // foto del estado en este instante
    const prev = this.writing.get(isl.id) || Promise.resolve();
    const p = prev.then(() => this.store.save(json)).catch(e => {
      console.error(`[guardado] error guardando ${isl.id}:`, e.message);
      this.scheduleSave(isl, 5000);
    });
    this.writing.set(isl.id, p);
    return p;
  }

  async flushAll() {
    for (const [id, s] of this.saves) { clearTimeout(s.timer); this.saves.delete(id); }
    await Promise.all([...this.islands.values()].map(isl => this.saveIsland(isl)));
  }
}
