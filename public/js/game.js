// Bucle del juego: movimiento con predicción local, objetivo contextual,
// acciones (que siempre confirma el servidor) y efectos.
import * as D from '../shared/data.js';
import * as M from '../shared/maps.js';
import { S, on, emit, ctxWorld, partner, count, furnitureAt } from './state.js';
import { audio } from './audio.js';

const VERB = {
  arbol: 'Talar', roca: 'Picar', roca_cobre: 'Picar', roca_cuarzo: 'Picar', arbusto: 'Ramitas', piedrita: 'Juntar',
  pasto: 'Cortar', flor_sol: 'Juntar', flor_azul: 'Juntar', flor_rosa: 'Juntar', flor_luna: 'Juntar',
  buzon: 'Buzón', tablon: 'Proyectos', banco: 'Sentarse', cofre: 'Abrir',
};
const ICON = {
  arbol: 'hacha', roca: 'pico', roca_cobre: 'pico', roca_cuarzo: 'pico_cobre', arbusto: 'ramita', piedrita: 'piedra', pasto: 'fibra',
  flor_sol: 'flor_sol', flor_azul: 'flor_azul', flor_rosa: 'flor_rosa', flor_luna: 'flor_luna', buzon: 'ramo', tablon: 'madera', banco: 'cuadro', cofre: 'moneda',
};

export class Game {
  constructor(net, renderer, input, ui) {
    this.net = net; this.r = renderer; this.input = input; this.ui = ui;
    this.lastSend = 0; this.lastSent = null;
    this.busy = false;         // esperando respuesta de una acción
    this.warping = false;
    this.target = null;
    this.swing = null;
    this.fishing = null;
    this.hurtUntil = 0;
    this.knock = null;
    this.hand = null;          // semilla/comida elegida
    this.decor = null;         // { item } modo decorar
    this.ghost = null;
    this.holding = false;
    this.lastT = performance.now();
    this.t0 = performance.now();
    this.running = false;
    this.wire();
  }

  wire() {
    const n = this.net;
    n.on('fx', (f) => this.onFx(f));
    n.on('emote', ({ p, e }) => {
      if (S.players[p]) S.players[p].emote = { e, at: this.net.now() };
      if (p !== S.you) audio.play('ui');
    });
    n.on('knock', ({ dx, dy }) => { this.knock = { dx, dy, until: performance.now() + 160 }; this.hurtUntil = this.net.now() + D.INVULN_MS; audio.play('hurt'); navigator.vibrate?.(60); });
    n.on('toast', ({ msg, kind }) => { this.ui.toast(msg, kind); if (kind === 'love') audio.play('love'); });
    on('pos', (m) => {
      this.warping = false;
      if (m.warp) { audio.play('door'); this.cancelFishing(); this.exitDecor(); }
      audio.setMood(this.mood());
    });
    on('mapchange', () => this.r.invalidate());
    on('welcome', () => { this.r.invalidate(); audio.setMood(this.mood()); });
    this.input.onKey = (e) => {
      if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') { e.preventDefault(); this.primary(); }
      if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); this.ui.openMenu('mochila'); }
      if (e.code === 'Escape') this.ui.closeAll();
    };
    this.input.onTapWorld = (cx, cy) => this.tapWorld(cx, cy);
  }

  mood() {
    const m = S.local.map;
    if (m === 'cueva') return 'cueva';
    if (m === 'casa') return 'casa';
    return 'isla';
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.lastT) / 1000);
      this.lastT = now;
      if (S.ready) { this.update(dt, now); this.render(dt, now); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ actualización
  update(dt, now) {
    const L = S.local;
    const online = this.net.status === 'online';
    let [vx, vy] = this.input.vector();
    if (!online || this.warping || this.fishing || this.ui.modalOpen()) { vx = 0; vy = 0; }
    const me = S.players[S.you];
    if (me && me.sit && (vx || vy)) me.sit = null;
    let moved = false;
    if (vx || vy) {
      const sp = D.SPEED * dt;
      const nx = L.x + vx * sp, ny = L.y + vy * sp;
      const ctx = ctxWorld();
      if (!M.collides(L.map, nx, L.y, ctx, S.solid)) { L.x = nx; moved = true; }
      if (!M.collides(L.map, L.x, ny, ctx, S.solid)) { L.y = ny; moved = true; }
      if (Math.abs(vx) > Math.abs(vy)) L.dir = vx > 0 ? 'right' : 'left'; else L.dir = vy > 0 ? 'down' : 'up';
    }
    if (this.knock && performance.now() < this.knock.until) {
      const k = 6 * dt, ctx = ctxWorld();
      const nx = L.x + this.knock.dx * k, ny = L.y + this.knock.dy * k;
      if (!M.collides(L.map, nx, ny, ctx, S.solid)) { L.x = nx; L.y = ny; moved = true; }
    }
    L.moving = moved && (vx !== 0 || vy !== 0);
    if (me) { me.x = L.x; me.y = L.y; me.rx = L.x; me.ry = L.y; me.dir = L.dir; me.map = L.map; }

    // enviar posición ~12 veces por segundo
    const changed = !this.lastSent || this.lastSent.x !== L.x || this.lastSent.y !== L.y || this.lastSent.dir !== L.dir || this.lastSent.mv !== L.moving;
    if (online && changed && now - this.lastSend > 80 && !this.warping) {
      this.net.sendRaw({ t: 'mv', map: L.map, x: +L.x.toFixed(3), y: +L.y.toFixed(3), dir: L.dir, mv: L.moving ? 1 : 0 });
      this.lastSend = now;
      this.lastSent = { x: L.x, y: L.y, dir: L.dir, mv: L.moving };
    }

    // portales
    if (online && !this.warping) {
      const w = M.warpAt(L.map, Math.floor(L.x), Math.floor(L.y - 0.1));
      if (w) {
        this.warping = true;
        this.net.sendRaw({ t: 'mv', map: L.map, x: +L.x.toFixed(3), y: +L.y.toFixed(3), dir: L.dir, mv: 0 });
        this.net.act('warp', { w: w.id }).then(res => { if (!res.ok) { this.warping = false; L.y += L.dir === 'up' ? 0.4 : -0.4; this.ui.toast(res.err, 'warn'); } });
      }
    }

    // interpolación de los demás
    const k = Math.min(1, dt * 12);
    for (const p of Object.values(S.players)) {
      if (p.id === S.you) continue;
      p.rx += (p.tx - p.rx) * k; p.ry += (p.ty - p.ry) * k;
    }
    if (S.pet) { S.pet.rx += (S.pet.x - S.pet.rx) * Math.min(1, dt * 8); S.pet.ry += (S.pet.y - S.pet.ry) * Math.min(1, dt * 8); }
    for (const e of S.enemies.values()) {
      if (Math.hypot(e.tx - e.rx, e.ty - e.ry) > 3) { e.rx = e.tx; e.ry = e.ty; }
      e.rx += (e.tx - e.rx) * Math.min(1, dt * 14); e.ry += (e.ty - e.ry) * Math.min(1, dt * 14);
    }

    // objetivo
    this.target = this.decor ? null : this.findTarget();
    this.ui.updateAction(this.target, this);
    if (this.holding && this.target && this.target.repeat && now - (this.lastPrimary || 0) > 340 && !this.busy) this.primary();
  }

  render(dt, now) {
    this.r.draw({
      now: this.net.now(), t: now - this.t0, dt, local: S.local, target: this.target,
      ghost: this.ghost, decor: !!this.decor, biasY: this.decor ? 110 : 0, swing: this.swing, fishing: this.fishing && this.fishing.tile, hurtUntil: this.hurtUntil,
    });
  }

  // ------------------------------------------------------------ objetivo contextual
  findTarget() {
    const L = S.local;
    const [fx, fy] = M.frontTile(L.x, L.y, L.dir);
    const bx = L.x, by = L.y - 0.3;
    const map = L.map;
    const inv = S.me.inv;

    // carpincho
    if (map === 'isla' && S.pet && Math.hypot(S.pet.rx - bx, S.pet.ry - 0.3 - by) < 1.5) {
      if (!S.pet.name) return { kind: 'pet_name', verb: 'Ponerle nombre', icon: 'corazon', x: Math.floor(S.pet.rx), y: Math.floor(S.pet.ry - 0.3) };
      const food = this.handFood();
      return { kind: 'pet', verb: 'Mimar', icon: 'corazon', x: Math.floor(S.pet.rx), y: Math.floor(S.pet.ry - 0.3), food };
    }

    // objetos cercanos: priorizo el de enfrente y luego el más cercano en la dirección que mirás
    const [dx, dy] = M.DIRS[L.dir];
    let best = null, bestScore = 9;
    for (let ty = Math.floor(by) - 2; ty <= Math.floor(by) + 2; ty++) {
      for (let tx = Math.floor(bx) - 2; tx <= Math.floor(bx) + 2; tx++) {
        const o = S.objAt.get(`${map}:${tx},${ty}`);
        if (!o || !VERB[o.kind]) continue;
        if (D.NODES[o.kind].drops && o.gone) continue;
        const w = o.w || 1;
        const nx = Math.max(o.x, Math.min(o.x + w, bx)), ny = Math.max(o.y, Math.min(o.y + 1, by));
        const d = Math.hypot(nx - bx, ny - by);
        if (d > 1.25) continue;
        const ox = o.x + w / 2 - bx, oy = o.y + 0.5 - by;
        const facing = (ox * dx + oy * dy) / (Math.hypot(ox, oy) || 1);
        const score = d - facing * 0.6 + (tx === fx && ty === fy ? -1 : 0);
        if (score < bestScore) { bestScore = score; best = o; }
      }
    }
    if (best) {
      const o = best, def = D.NODES[o.kind];
      const t = { kind: 'obj', o, x: o.x, y: o.y, w: o.w || 1, verb: VERB[o.kind], icon: ICON[o.kind], repeat: !!def.tool };
      if (def.tool === 'hacha' && !inv.hacha) t.missing = 'Necesitás un hacha';
      if (def.tool === 'pico' && !inv.pico && !inv.pico_cobre) t.missing = 'Necesitás un pico';
      if (def.minPower && !inv.pico_cobre) t.missing = 'Necesitás un pico de cobre';
      if (o.kind === 'roca_cuarzo') t.icon = 'cuarzo';
      return t;
    }

    // muebles
    if (map === 'casa') {
      for (const [tx, ty] of [[fx, fy], [Math.floor(bx), Math.floor(by)]]) {
        const f = furnitureAt(tx, ty);
        if (!f) continue;
        const use = D.FURNITURE[f.item].use;
        const d = D.FURNITURE[f.item];
        if (use === 'sit') return { kind: 'sit', f, x: f.x, y: f.y, w: d.w, h: d.h, verb: 'Sentarse', icon: 'silla' };
        if (use === 'rest') return { kind: 'rest', f, x: f.x, y: f.y, w: d.w, h: d.h, verb: 'Descansar', icon: 'cama' };
        if (use === 'music') return { kind: 'music', f, x: f.x, y: f.y, w: 1, h: 1, verb: 'Tocar', icon: 'caja_musical' };
      }
    }

    // huerta
    if (map === 'isla' && M.rawTile('isla', fx, fy) === 'f') {
      const s = S.soil[fx + ',' + fy];
      const base = { x: fx, y: fy };
      if (!s) return { ...base, kind: 'till', verb: 'Preparar', icon: 'azada', missing: inv.azada ? null : 'Necesitás la azada', repeat: false };
      if (!s.crop) {
        const seed = this.handSeed();
        return { ...base, kind: 'plant', seed, verb: 'Plantar', icon: seed || 'sem_rabanito', missing: seed ? null : 'No tenés semillas (se fabrican con cosechas + fibra)' };
      }
      const def = D.CROPS[s.crop.type];
      if (s.crop.step >= def.steps) return { ...base, kind: 'harvest', verb: 'Cosechar', icon: s.crop.type };
      if (!s.crop.watered) return { ...base, kind: 'water', verb: 'Regar', icon: 'regadera' };
      return { ...base, kind: 'growing', verb: 'Creciendo…', icon: 'regadera', disabled: true };
    }

    // agua
    if (map === 'isla' && M.fishingSpot('isla', L.x, L.y, fx, fy)) {
      return { kind: 'fish', x: fx, y: fy, verb: 'Pescar', icon: 'cana', missing: inv.cana ? null : 'Necesitás una caña de pescar' };
    }

    if (map === 'cueva') return { kind: 'attack', verb: 'Atacar', icon: inv.espada ? 'espada' : 'pico', x: fx, y: fy, noHighlight: true, repeat: true };
    return null;
  }

  handSeed() {
    if (this.hand && D.ITEMS[this.hand]?.cat === 'semilla' && count(this.hand)) return this.hand;
    return ['sem_rabanito', 'sem_frutilla', 'sem_calabaza'].find(k => count(k)) || null;
  }
  handFood() {
    if (this.hand && D.PET_FOOD_CATS.has(D.ITEMS[this.hand]?.cat) && count(this.hand)) return this.hand;
    return null;
  }

  // ------------------------------------------------------------ acciones
  doSwing(tool) { this.swing = { tool, at: this.net.now() }; }

  async primary() {
    // el objetivo se recalcula en el momento del toque (por si el mundo cambió en este mismo cuadro)
    if (S.ready && !this.decor) this.target = this.findTarget();
    const t = this.target;
    this.lastPrimary = performance.now();
    if (!t || t.disabled || this.busy || this.fishing) return;
    if (this.net.status !== 'online') { this.ui.toast('Sin conexión: esperá a que vuelva', 'warn'); return; }
    if (t.missing) { this.ui.toast(t.missing, 'warn'); audio.play('error'); return; }
    this.faceTo(t);
    const run = async (a, params, opts = {}) => {
      this.busy = true;
      const res = await this.net.act(a, params);
      this.busy = false;
      if (!res.ok && !opts.quiet) { this.ui.toast(res.err, 'warn'); audio.play('error'); if (res.code === 'needs_name') this.ui.petNameDialog(); }
      return res;
    };
    switch (t.kind) {
      case 'obj': {
        const o = t.o, k = o.kind;
        if (k === 'buzon') { audio.play('ui'); this.ui.openMailbox(); return; }
        if (k === 'tablon') { audio.play('ui'); this.ui.openMenu('proyectos'); return; }
        if (k === 'banco') { await run('sit', { o: o.id }); return; }
        if (k === 'cofre') {
          const res = await run('chest', { o: o.id });
          if (res.ok) { audio.play('catch'); this.popGot(o.x + 0.5, o.y, res.got); this.r.burst(o.x + 0.5, o.y + 0.3, 'spark', 10); }
          return;
        }
        const def = D.NODES[k];
        const tool = def.tool === 'hacha' ? 'hacha' : def.tool === 'pico' ? (count('pico_cobre') ? 'pico_cobre' : 'pico') : null;
        if (tool) this.doSwing(tool);
        audio.play(tool === 'hacha' ? 'chop' : tool ? 'mine' : 'pick');
        this.r.shake(o.id);
        const res = await run('gather', { o: o.id }, { quiet: !!t.repeat });
        if (!res.ok && t.repeat && !/Ya no queda/.test(res.err || '')) { this.ui.toast(res.err, 'warn'); audio.play('error'); }
        return;
      }
      case 'till': { this.doSwing('azada'); audio.play('till'); await run('till', { x: t.x, y: t.y }); return; }
      case 'plant': { audio.play('plant'); await run('plant', { x: t.x, y: t.y, seed: t.seed }); return; }
      case 'water': { this.doSwing('regadera'); audio.play('water'); this.r.burst(t.x + 0.5, t.y + 0.4, 'water', 8); await run('water', { x: t.x, y: t.y }); return; }
      case 'harvest': { audio.play('harvest'); await run('harvest', { x: t.x, y: t.y }); return; }
      case 'fish': return this.startFishing(t);
      case 'attack': {
        this.doSwing(count('espada') ? 'espada' : count('pico_cobre') ? 'pico_cobre' : count('pico') ? 'pico' : 'ramita');
        audio.play('swing');
        const res = await run('attack', { dir: S.local.dir }, { quiet: true });
        if (res.ok && res.hits) audio.play('hit');
        return;
      }
      case 'pet_name': this.ui.petNameDialog(); return;
      case 'pet': {
        if (t.food) {
          const res = await run('feed', { item: t.food });
          if (res.ok) { audio.play('eat'); }
          return;
        }
        const res = await run('pet', {});
        if (res.ok) { audio.play('love'); if (res.gift) this.popGot(S.pet.rx, S.pet.ry - 0.5, res.gift); }
        return;
      }
      case 'sit': await run('sit', { f: t.f.id }); return;
      case 'rest': { const r = await run('rest', { f: t.f.id }); if (r.ok) audio.play('love'); return; }
      case 'music': await run('music', { f: t.f.id }); return;
    }
  }

  faceTo(t) {
    const L = S.local;
    const cx = t.x + (t.w || 1) / 2, cy = t.y + (t.h || 1) / 2;
    const dx = cx - L.x, dy = cy - (L.y - 0.3);
    if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) return;
    L.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }

  popGot(x, y, got) {
    if (!got) return;
    let i = 0;
    for (const [k, v] of Object.entries(got)) {
      setTimeout(() => this.r.addText(x, y, `+${v} ${D.ITEMS[k]?.name || k}`, '#fff3c4'), i * 260);
      i++;
    }
  }

  // ------------------------------------------------------------ efectos del servidor
  onFx(f) {
    const mine = f.by === S.you || f.p === S.you;
    const obj = f.o ? S.objects.get(f.o) : null;
    switch (f.k) {
      case 'hit': if (obj) { this.r.shake(obj.id); this.r.burst(obj.x + 0.5, obj.y + 0.3, obj.kind === 'arbol' ? 'leaf' : 'rock', 4); if (!mine) audio.play(obj.kind === 'arbol' ? 'chop' : 'mine'); } break;
      case 'gather':
        if (obj) {
          const kind = obj.kind === 'arbol' ? 'leaf' : obj.kind.startsWith('roca') ? (obj.kind === 'roca_cobre' ? 'copper' : obj.kind === 'roca_cuarzo' ? 'pink' : 'rock') : obj.kind.startsWith('flor') ? 'heart' : 'leaf';
          this.r.burst(obj.x + 0.5, obj.y + 0.3, kind, 10);
          if (mine) { this.popGot(obj.x + 0.5, obj.y, f.got); audio.play('pick'); }
        }
        break;
      case 'till': this.r.burst(f.x + 0.5, f.y + 0.6, 'dirt', 6); break;
      case 'plant': this.r.burst(f.x + 0.5, f.y + 0.6, 'dirt', 4); break;
      case 'water': if (!mine) this.r.burst(f.x + 0.5, f.y + 0.4, 'water', 6); break;
      case 'harvest': this.r.burst(f.x + 0.5, f.y + 0.4, 'spark', 8); if (mine) this.popGot(f.x + 0.5, f.y, f.got); break;
      case 'chest': if (!mine && obj) this.r.burst(obj.x + 0.5, obj.y, 'spark', 6); break;
      case 'craft': this.r.burst(f.x, f.y - 0.6, 'spark', 8); if (mine) audio.play('craft'); break;
      case 'eat': if (mine) audio.play('eat'); this.r.hearts(f.x, f.y - 1, 2); break;
      case 'hearts': this.r.hearts(f.x, f.y, 4); break;
      case 'love': this.r.hearts(f.x, f.y, 10); audio.play('love'); break;
      case 'yum': this.r.hearts(f.x, f.y, 3); this.r.burst(f.x, f.y, 'spark', 5); break;
      case 'swing': { if (f.p !== S.you && S.players[f.p]) { S.players[f.p].swing = { tool: count('espada') ? 'espada' : 'pico', at: this.net.now() }; S.players[f.p].dir = f.dir; } break; }
      case 'poof': this.r.burst(f.x, f.y, 'poof', 12); audio.play('poof'); if (f.by === S.you) this.popGot(f.x, f.y, f.got); break;
      case 'hurt': if (f.p !== S.you) this.r.burst(f.x, f.y - 0.6, 'heart', 4); break;
      case 'cast': if (f.p !== S.you) audio.play('splash'); break;
      case 'splash': { const p = S.players[f.p]; if (p && f.p !== S.you) this.r.burst(p.rx, p.ry - 0.5, 'water', 6); break; }
      case 'catch': {
        const p = S.players[f.p];
        if (p && f.p !== S.you) { this.r.addText(p.rx, p.ry - 0.3, D.ITEMS[f.fish].name, D.RARITY[f.rarity].color); this.r.burst(p.rx, p.ry - 0.8, 'water', 8); }
        break;
      }
      case 'zzz': this.r.addText(f.x, f.y, 'Zzz', '#d4c3f0'); break;
      case 'music': audio.play('musicbox'); for (let i = 0; i < 5; i++) setTimeout(() => this.r.addText(f.x + (Math.random() - 0.5), f.y, '♥', '#f7a8c0'), i * 450); break;
      case 'project': audio.play('fanfare'); this.r.invalidate(); break;
    }
  }

  // ------------------------------------------------------------ pesca
  async startFishing(t) {
    this.busy = true;
    audio.play('splash');
    this.doSwing('cana');
    const res = await this.net.act('fish_start', { x: t.x, y: t.y });
    this.busy = false;
    if (!res.ok) { this.ui.toast(res.err, 'warn'); audio.play('error'); return; }
    this.fishing = { tile: { tx: t.x, ty: t.y, bite: false }, res };
    this.ui.fishing(res, async (taps) => {
      const end = await this.net.act('fish_end', { sid: res.sid, taps });
      this.fishing = null;
      return end;
    }, () => { if (this.fishing) this.fishing.tile.bite = true; });
  }
  cancelFishing() { if (this.fishing) { this.fishing = null; this.ui.closeFishing(); } }

  // ------------------------------------------------------------ decorar
  enterDecor(item = null) {
    if (S.local.map !== 'casa') { this.ui.toast('Entrá a la casa para decorar', 'info'); return; }
    this.decor = { item };
    this.ghost = null;
    if (item) {
      const [fx, fy] = M.frontTile(S.local.x, S.local.y, S.local.dir);
      this.setGhost(fx, fy);
    }
    this.input.placing = true;
    this.ui.showDecorBar(this);
  }
  exitDecor() {
    if (!this.decor) return;
    this.decor = null; this.ghost = null; this.input.placing = false;
    this.ui.hideDecorBar();
  }
  setGhost(x, y) {
    const item = this.decor && this.decor.item;
    if (!item) return;
    const d = D.FURNITURE[item];
    this.ghost = { item, x, y, ok: this.validPlace(item, x, y, d) };
    this.ui.showDecorBar(this);
  }
  validPlace(item, x, y, d) {
    const lvl = S.houseLevel;
    if (d.layer === 'wall') return M.houseTile(lvl, x, y) === 'wallface' && ![...S.furniture.values()].some(f => D.FURNITURE[f.item].layer === 'wall' && f.x === x && f.y === y);
    for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) {
      if (M.houseTile(lvl, x + i, y + j) !== 'floor') return false;
      if (d.layer === 1 && x + i === M.HOUSE_DOOR.x && y + j === M.HOUSE_DOOR.y - 1) return false;
    }
    for (const f of S.furniture.values()) {
      const fd = D.FURNITURE[f.item];
      if (fd.layer !== d.layer) continue;
      if (x < f.x + fd.w && x + d.w > f.x && y < f.y + fd.h && y + d.h > f.y) return false;
    }
    return true;
  }
  tapWorld(cx, cy) {
    if (!this.decor) return;
    const w = this.r.screenToWorld(cx, cy);
    const tx = Math.floor(w.x), ty = Math.floor(w.y);
    if (this.decor.item) {
      const d = D.FURNITURE[this.decor.item];
      this.setGhost(tx - (d.w > 1 && w.x - tx < 0.5 ? 1 : 0), ty - (d.h > 1 && w.y - ty < 0.5 ? 1 : 0));
      return;
    }
    const f = furnitureAt(tx, ty) || [...S.furniture.values()].find(q => D.FURNITURE[q.item].layer === 'wall' && q.x === tx && q.y === ty);
    if (f) this.ui.furnitureMenu(f, this);
  }
  async placeGhost() {
    const gh = this.ghost;
    if (!gh) return;
    const res = await this.net.act('place', { item: gh.item, x: gh.x, y: gh.y });
    if (!res.ok) { this.ui.toast(res.err, 'warn'); audio.play('error'); return; }
    audio.play('craft');
    this.r.burst(gh.x + 0.5, gh.y + 0.5, 'spark', 10);
    if (!count(gh.item)) { this.decor.item = null; this.ghost = null; }
    this.ui.showDecorBar(this);
  }
  async pickupFurniture(f) {
    const res = await this.net.act('pickup', { f: f.id });
    if (!res.ok) { this.ui.toast(res.err, 'warn'); return; }
    audio.play('pick');
    const owner = S.players[res.owner];
    if (res.owner !== S.you && owner) this.ui.toast(`Volvió a la mochila de ${owner.name}`, 'info');
  }
}
