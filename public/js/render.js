// Dibujo del mundo: capa de suelo pre-renderizada + entidades ordenadas por
// profundidad + luz (día/noche, cueva) + efectos. Resolución interna baja y
// escalado entero: se ve nítido y anda bien en celulares modestos.
import * as Sp from './sprites.js';
import { textSprite } from './font.js';
import { MAPS, rawTile, houseTile, houseFloorRect, HOUSE_DOOR } from '../shared/maps.js';
import { FURNITURE, CROPS, DAY_MS } from '../shared/data.js';
import { S } from './state.js';

const T = 16;
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export function dayInfo(now) {
  // (para pruebas: localStorage 'rinconcito.hora' fija la hora del día)
  const forced = typeof window !== 'undefined' && window.__debugHora != null ? window.__debugHora : null;
  const h = forced != null ? forced : ((now % DAY_MS) / DAY_MS) * 24;
  let dark = 0, warm = 0;
  if (h >= 17 && h < 19.5) { warm = (h - 17) / 2.5; dark = warm * 0.2; }
  else if (h >= 19.5 && h < 21) { warm = 1 - (h - 19.5) / 1.5; dark = 0.2 + (h - 19.5) / 1.5 * 0.38; }
  else if (h >= 21 || h < 5) { dark = 0.58; }
  else if (h >= 5 && h < 7) { dark = 0.58 * (1 - (h - 5) / 2); warm = 0.4 * (1 - Math.abs(h - 6)); }
  return { h, dark, warm, night: dark > 0.3 };
}

export class Renderer {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d', { alpha: false });
    this.layers = new Map();
    this.fx = [];
    this.texts = [];
    this.hitAt = new Map();
    this.light = mk(1, 1);
    this.glowCache = new Map();
    this.cam = { x: 0, y: 0 };
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = window.innerWidth, ch = window.innerHeight;
    const short = Math.min(cw, ch) * dpr;
    this.scale = Math.max(2, Math.round(Math.max(2, Math.round(short / 205)) * (this.zoom || 1)));
    this.vw = Math.ceil(cw * dpr / this.scale);
    this.vh = Math.ceil(ch * dpr / this.scale);
    this.c.width = this.vw; this.c.height = this.vh;
    this.c.style.width = cw + 'px'; this.c.style.height = ch + 'px';
    this.g.imageSmoothingEnabled = false;
    this.light.width = this.vw; this.light.height = this.vh;
    this.cssPerPx = cw / this.vw;
  }

  invalidate() { this.layers.clear(); }

  // ------------------------------------------------------------ capa de suelo
  layerKey(map) { return map === 'isla' ? `isla|${S.bridge ? 1 : 0}` : map === 'casa' ? `casa|${S.houseLevel}` : map; }
  layer(map, frame) {
    const key = this.layerKey(map);
    if (!this.layers.has(key)) this.layers.set(key, [this.buildLayer(map, 0), this.buildLayer(map, 1)]);
    return this.layers.get(key)[frame];
  }
  buildLayer(map, frame) {
    const m = MAPS[map];
    const c = mk(m.w * T, m.h * T), g = c.getContext('2d');
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) g.drawImage(this.tileImg(map, x, y, frame), x * T, y * T);
    if (map === 'isla') {
      // entrada de la cueva
      const cx = 7 * T, cy = 4 * T;
      g.fillStyle = '#2a2230'; g.fillRect(cx + 3, cy + 4, 10, 12); g.fillRect(cx + 4, cy + 2, 8, 2);
      g.fillStyle = '#3d3245'; g.fillRect(cx + 4, cy + 5, 8, 2);
      g.fillStyle = Sp.C.cliffD; g.fillRect(cx + 2, cy + 3, 1, 13); g.fillRect(cx + 13, cy + 3, 1, 13);
    }
    if (map === 'cueva') {
      for (const x of [13, 14]) { g.fillStyle = 'rgba(255,240,200,0.25)'; g.fillRect(x * T, 19 * T, T, T); }
    }
    return c;
  }
  tileImg(map, x, y, frame) {
    if (map === 'casa') return Sp.tileHouse(houseTile(S.houseLevel, x, y), x, y);
    const t = rawTile(map, x, y);
    if (map === 'cueva') {
      if (t === '#') { const below = rawTile('cueva', x, y + 1); return Sp.tileCave('wall', x, y, below && below !== '#'); }
      return Sp.tileCave('floor', x, y);
    }
    const isW = (a, b) => { const k = rawTile('isla', a, b); return k === null || k === '~' || k === 'b'; };
    switch (t) {
      case '~': return Sp.tileWater(x, y, { u: !isW(x, y - 1), d: !isW(x, y + 1), l: !isW(x - 1, y), r: !isW(x + 1, y) }, frame);
      case ':': return Sp.tileSand(x, y);
      case 'p': case 'D': {
        const isP = (a, b) => ['p', 'D', '=', 'H', 'C', 'b'].includes(rawTile('isla', a, b));
        return Sp.tilePath(x, y, { u: isP(x, y - 1), d: isP(x, y + 1), l: isP(x - 1, y), r: isP(x + 1, y) });
      }
      case '=': return Sp.tileDock(x, y);
      case 'b': return Sp.tileBridge(!S.bridge, frame);
      case '#': case 'C': { const b = rawTile('isla', x, y + 1); return Sp.tileCliff(x, y, b !== '#' && b !== 'C'); }
      case 'f': return Sp.tileGrass(x, y, 'f');
      default: return Sp.tileGrass(x, y);
    }
  }

  // ------------------------------------------------------------ efectos
  addText(x, y, text, color = '#fff8ee') { this.texts.push({ x, y, text, color, t: 0, life: 1.4 }); }
  burst(x, y, kind, n = 8) {
    const cols = {
      leaf: ['#78c05c', '#9bd775', '#5c9f48'], rock: ['#b6aeb0', '#918a8f', '#d2cccd'], water: ['#93d9f3', '#eafbff', '#6cc4e6'],
      dirt: ['#a8754e', '#8b5d3c', '#c99a72'], heart: ['#ef6f8b', '#f7a8c0'], spark: ['#fff6c4', '#ffe58a', '#ffffff'],
      pink: ['#f7a8c8', '#ffd9e8'], copper: ['#e0874e', '#ffc08a'], poof: ['#ffffff', '#e9e4f2', '#d4c3f0'],
    }[kind] || ['#fff'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.8;
      this.fx.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'heart' ? 1.4 : 1.2),
        g: kind === 'heart' || kind === 'spark' || kind === 'poof' ? 0.2 : 5, life: 0.6 + Math.random() * 0.5, t: 0,
        col: cols[i % cols.length], heart: kind === 'heart', size: kind === 'poof' ? 2 : 1,
      });
    }
  }
  hearts(x, y, n = 5) {
    for (let i = 0; i < n; i++) this.fx.push({ x: x + (Math.random() - 0.5) * 0.8, y, vx: (Math.random() - 0.5) * 0.5, vy: -1.2 - Math.random(), g: -0.1, life: 1.3, t: -i * 0.12, col: '#ef6f8b', heart: true, size: 1 });
  }
  shake(id) { this.hitAt.set(id, performance.now()); }

  glow(r, col) {
    const key = r + col;
    if (this.glowCache.has(key)) return this.glowCache.get(key);
    const c = mk(r * 2, r * 2), g = c.getContext('2d');
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, col); gr.addColorStop(0.45, col.replace(/,[\d.]+\)$/, ',0.5)')); gr.addColorStop(1, col.replace(/,[\d.]+\)$/, ',0)'));
    g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
    this.glowCache.set(key, c);
    return c;
  }

  // ------------------------------------------------------------ cuadro
  draw(view) {
    const { now, t, dt, local, target, ghost, decor } = view;
    const g = this.g, map = local.map, m = MAPS[map];
    const zoom = map === 'casa' ? 1.5 : 1;
    if (zoom !== (this.zoom || 1)) { this.zoom = zoom; this.resize(); }
    const W = m.w * T, H = m.h * T;
    const bias = (view.biasY || 0) / this.cssPerPx;
    const px = local.x * T, py = local.y * T - 8 + bias;
    let cx, cy;
    if (map === 'isla') { // afuera del mapa hay mar: la cámara siempre centra al personaje
      cx = Math.max(-this.vw * 0.25, Math.min(W - this.vw * 0.75, px - this.vw / 2));
      cy = Math.max(-this.vh * 0.25, Math.min(H - this.vh * 0.75, py - this.vh / 2));
    } else {
      cx = W > this.vw ? Math.max(0, Math.min(W - this.vw, px - this.vw / 2)) : (W - this.vw) / 2;
      cy = H > this.vh ? Math.max(0, Math.min(H - this.vh, py - this.vh / 2)) : (H - this.vh) / 2 + bias;
    }
    cx = Math.round(cx); cy = Math.round(cy);
    this.cam.x = cx; this.cam.y = cy;
    const frame = Math.floor(t / 700) % 2;

    if (map === 'isla') {
      if (!this.seaPat) this.seaPat = [0, 1].map(f => g.createPattern(Sp.tileWater(3, 3, {}, f), 'repeat'));
      g.save(); g.translate(-cx, -cy); g.fillStyle = this.seaPat[frame]; g.fillRect(cx, cy, this.vw, this.vh); g.restore();
    } else {
      g.fillStyle = map === 'cueva' ? '#1c1620' : Sp.C.void;
      g.fillRect(0, 0, this.vw, this.vh);
    }
    const L = this.layer(map, frame);
    const sx = Math.max(0, cx), sy = Math.max(0, cy);
    const sw = Math.min(L.width - sx, this.vw), sh = Math.min(L.height - sy, this.vh);
    if (sw > 0 && sh > 0) g.drawImage(L, sx, sy, sw, sh, sx - cx, sy - cy, sw, sh);
    g.save();
    g.translate(-cx, -cy);

    const inView = (x, y, pad = 3) => x * T > cx - pad * T && x * T < cx + this.vw + pad * T && y * T > cy - pad * T && y * T < cy + this.vh + pad * T;
    const day = dayInfo(now);

    // --- suelo: huerta
    if (map === 'isla') {
      for (const [k, s] of Object.entries(S.soil)) {
        const [x, y] = k.split(',').map(Number);
        if (!inView(x, y)) continue;
        g.drawImage(Sp.tileSoil(!!(s.crop && s.crop.watered), x, y), x * T, y * T);
        if (s.crop) {
          const def = CROPS[s.crop.type];
          const ready = s.crop.step >= def.steps;
          const bob = ready ? Math.round(Math.sin(t / 300 + x) * 0.6) : 0;
          g.drawImage(Sp.crop(s.crop.type, s.crop.step, def.steps), x * T, y * T - 2 + bob);
          if (ready && Math.floor(t / 600 + x + y) % 4 === 0) { g.fillStyle = '#fff6c4'; g.fillRect(x * T + 12, y * T + 1, 1, 1); }
        }
      }
    }
    // --- casa: ventanas, alfombras y cuadros
    if (map === 'casa') this.drawInteriorStatic(g, day, t);

    // --- entidades ordenadas por profundidad
    const ents = [];
    for (const o of S.objects.values()) {
      if (o.map !== map || !inView(o.x, o.y)) continue;
      const flat = ['flor_sol', 'flor_azul', 'flor_rosa', 'flor_luna', 'pasto', 'piedrita', 'canasta'].includes(o.kind) || (o.gone && o.kind !== 'arbol' && o.kind !== 'arbusto');
      ents.push({ y: (o.y + (flat ? 0.3 : 1)) * T, draw: () => this.drawObject(g, o, t) });
    }
    if (map === 'isla') ents.push({ y: 8 * T, draw: () => this.drawHouse(g, day, t) });
    if (map === 'casa') {
      for (const f of S.furniture.values()) {
        const d = FURNITURE[f.item];
        if (d.layer !== 1) continue;
        ents.push({ y: (f.y + d.h) * T - 1, draw: () => this.drawFurniture(g, f, t) });
      }
    }
    for (const p of Object.values(S.players)) {
      if (!p.online && p.id !== S.you) continue;
      const isMe = p.id === S.you;
      const pm = isMe ? local.map : p.map;
      if (pm !== map) continue;
      const x = isMe ? local.x : p.rx, y = isMe ? local.y : p.ry;
      const sitY = p.sit ? p.sit.y : y;
      ents.push({ y: sitY * T + (p.sit ? 1 : 0), draw: () => this.drawPlayer(g, p, isMe, x, y, view) });
    }
    if (map === 'isla' && S.pet) ents.push({ y: S.pet.ry * T, draw: () => this.drawPet(g, t) });
    if (map === 'cueva') for (const e of S.enemies.values()) if (e.alive && inView(e.rx, e.ry)) ents.push({ y: e.ry * T + (e.kind === 'polillin' ? 6 : 0), draw: () => this.drawEnemy(g, e, t, now) });
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.draw();

    // --- objetivo y fantasma de decoración
    if (target && !decor) this.drawTarget(g, target, t);
    if (ghost) this.drawGhost(g, ghost, t);
    if (decor) this.drawDecorGrid(g);

    // --- partículas
    for (const p of this.fx) {
      p.t += dt;
      if (p.t < 0) continue;
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.t / p.life;
      if (a <= 0) continue;
      g.globalAlpha = Math.min(1, a * 1.5);
      g.fillStyle = p.col;
      const X = Math.round(p.x * T), Y = Math.round(p.y * T);
      if (p.heart) { g.fillRect(X - 1, Y, 1, 1); g.fillRect(X + 1, Y, 1, 1); g.fillRect(X - 1, Y + 1, 3, 1); g.fillRect(X, Y + 2, 1, 1); }
      else g.fillRect(X, Y, p.size, p.size);
    }
    g.globalAlpha = 1;
    this.fx = this.fx.filter(p => p.t < p.life);
    g.restore();

    // --- luz
    this.drawLighting(g, map, day, now, t, cx, cy);

    // --- textos flotantes y nombres encima de la luz
    g.save(); g.translate(-cx, -cy);
    for (const p of Object.values(S.players)) {
      if (!p.online && p.id !== S.you) continue;
      const isMe = p.id === S.you;
      if ((isMe ? local.map : p.map) !== map) continue;
      const x = isMe ? local.x : p.rx, y = p.sit ? p.sit.y : (isMe ? local.y : p.ry);
      const xx = p.sit ? p.sit.x : x;
      if (!isMe) { const ts = textSprite(p.name, '#fff8ee'); g.drawImage(ts, Math.round(xx * T - ts.width / 2), Math.round(y * T - 30)); }
      if (p.emote && now - p.emote.at < 2600) {
        const e = Sp.emote(p.emote.e);
        const bob = Math.round(Math.sin((now - p.emote.at) / 160) * 1);
        g.drawImage(e, Math.round(xx * T - 7), Math.round(y * T - (isMe ? 36 : 44)) + bob);
      }
    }
    if (map === 'isla' && S.pet && S.pet.name) {
      const ts = textSprite(S.pet.name, '#ffe9c7');
      if (Math.hypot(S.pet.rx - local.x, S.pet.ry - local.y) < 4) g.drawImage(ts, Math.round(S.pet.rx * T - ts.width / 2), Math.round(S.pet.ry * T - 24));
    }
    for (const tx of this.texts) {
      tx.t += dt;
      const a = 1 - tx.t / tx.life;
      if (a <= 0) continue;
      const ts = textSprite(tx.text, tx.color);
      g.globalAlpha = Math.min(1, a * 2);
      g.drawImage(ts, Math.round(tx.x * T - ts.width / 2), Math.round(tx.y * T - 24 - tx.t * 14));
    }
    g.globalAlpha = 1;
    this.texts = this.texts.filter(x => x.t < x.life);
    g.restore();
  }

  drawObject(g, o, t) {
    const x = o.x * T, y = o.y * T;
    let sh = 0;
    const hit = this.hitAt.get(o.id);
    if (hit && performance.now() - hit < 220) sh = Math.round(Math.sin((performance.now() - hit) / 25) * 1.5);
    switch (o.kind) {
      case 'arbol': {
        const img = Sp.tree(o.gone);
        g.fillStyle = 'rgba(40,60,30,0.18)'; g.fillRect(x - 2, y + 12, 20, 4);
        g.drawImage(img, x - 8 + sh, y - 18);
        break;
      }
      case 'roca': case 'roca_cobre': case 'roca_cuarzo':
        if (o.gone) g.drawImage(Sp.rubble(), x, y); else g.drawImage(Sp.rock(o.kind), x + sh, y - 1);
        break;
      case 'arbusto': g.drawImage(Sp.bush(o.gone), x + sh, y - 1); break;
      case 'piedrita': if (!o.gone) g.drawImage(Sp.pebbles(), x, y); break;
      case 'pasto': if (!o.gone) g.drawImage(Sp.tallGrass(), x + Math.round(Math.sin(t / 700 + o.x) * 0.6), y - 1); break;
      case 'flor_sol': case 'flor_azul': case 'flor_rosa': case 'flor_luna':
        if (!o.gone) g.drawImage(Sp.flower(o.kind), x, y - 2 + (Math.floor(t / 900 + o.x) % 2 ? 0 : 0));
        break;
      case 'cerca': {
        const n = (dx, dy) => { const q = S.objAt.get(`isla:${o.x + dx},${o.y + dy}`); return q && q.kind === 'cerca'; };
        g.drawImage(Sp.fence({ l: n(-1, 0), r: n(1, 0), u: n(0, -1), d: n(0, 1) }), x, y - 2);
        break;
      }
      case 'farola': g.drawImage(Sp.lampPost(), x, y - 12); break;
      case 'buzon': {
        const flag = S.mail.some(m => m.to === S.you && !m.claimed);
        g.drawImage(Sp.mailbox(flag), x, y - 8);
        if (flag) { const b = Math.round(Math.sin(t / 250)); g.drawImage(Sp.emote('corazon'), x + 1, y - 24 + b); }
        break;
      }
      case 'tablon': g.drawImage(Sp.board(), x, y - 8); break;
      case 'banco': g.drawImage(Sp.bench(), x, y - 4); break;
      case 'canasta': g.drawImage(Sp.petBed(), x, y); break;
      case 'cofre': {
        const last = (S.me && S.me.chests[o.id]) || 0;
        const open = Date.now() - last < 30 * 60_000;
        g.drawImage(Sp.chest(open), x, y);
        if (!open && Math.floor(t / 500) % 3 === 0) { g.fillStyle = '#fff6c4'; g.fillRect(x + 12, y + 3, 1, 1); }
        break;
      }
    }
  }

  drawHouse(g, day, t) {
    const lvl = S.houseLevel;
    const img = Sp.houseExterior(lvl);
    const x = 15 * T - 4, y = 4 * T - 16;
    g.drawImage(img, x, y);
    if (day.night) {
      g.fillStyle = 'rgba(255,214,120,0.85)';
      for (const [wx, wy] of Sp.houseWindows(lvl)) g.fillRect(x + wx, y + wy, 14, 12);
      g.fillStyle = Sp.C.wood;
      for (const [wx, wy] of Sp.houseWindows(lvl)) { g.fillRect(x + wx + 6, y + wy, 2, 12); g.fillRect(x + wx, y + wy + 5, 14, 2); }
    }
    if (lvl >= 2) g.drawImage(Sp.smoke(t), x + 4 + 52, y - 14);
  }

  drawInteriorStatic(g, day, t) {
    const lvl = S.houseLevel, r = houseFloorRect(lvl);
    // ventanas en la pared
    const sky = day.night ? '#2c3566' : day.warm > 0.3 ? '#f7b68a' : '#a9dcf2';
    for (let x = r.x0; x <= r.x1; x++) {
      if ((x - r.x0) % 4 !== 1 || x === r.x1) continue;
      const wx = x * T + 2, wy = (r.y0 - 1) * T + 2;
      g.fillStyle = Sp.C.wood; g.fillRect(wx - 1, wy - 1, 14, 11);
      g.fillStyle = sky; g.fillRect(wx, wy, 12, 9);
      if (day.night) { g.fillStyle = '#fff6c4'; g.fillRect(wx + 3, wy + 2, 1, 1); g.fillRect(wx + 8, wy + 5, 1, 1); }
      else { g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(wx + 1, wy + 1, 3, 2); }
      g.fillStyle = Sp.C.wood; g.fillRect(wx + 5, wy, 2, 9); g.fillRect(wx, wy + 4, 12, 1);
      g.fillStyle = '#f3b7c2'; g.fillRect(wx - 2, wy - 2, 3, 12); g.fillRect(wx + 11, wy - 2, 3, 12);
    }
    // alfombras
    for (const f of S.furniture.values()) if (FURNITURE[f.item].layer === 0) this.drawFurniture(g, f, t);
    // cuadros
    for (const f of S.furniture.values()) if (FURNITURE[f.item].layer === 'wall') this.drawFurniture(g, f, t);
  }

  drawFurniture(g, f, t) {
    const d = FURNITURE[f.item], img = Sp.furniture(f.item);
    const x = f.x * T + Math.floor((d.w * T - img.width) / 2);
    const y = (f.y + d.h) * T - img.height + (d.layer === 'wall' ? -2 : 0);
    g.drawImage(img, x, d.layer === 0 ? f.y * T : y);
  }

  drawPlayer(g, p, isMe, x, y, view) {
    const { t, now } = view;
    const dir = isMe ? view.local.dir : p.dir;
    const moving = isMe ? view.local.moving : p.moving && performance.now() - (p.lastMoveAt || 0) < 250;
    const frame = moving ? 1 + (Math.floor(t / 140) % 2) : 0;
    if (p.sit) {
      const img = Sp.character(p.look, p.sit.dir || 'down', 0, 'sit');
      g.drawImage(img, Math.round(p.sit.x * T - 8), Math.round(p.sit.y * T - 22));
      return;
    }
    const hurt = isMe && view.hurtUntil && now < view.hurtUntil && Math.floor(t / 80) % 2 === 0;
    g.fillStyle = 'rgba(40,40,60,0.22)'; g.fillRect(Math.round(x * T - 5), Math.round(y * T - 1), 10, 2);
    const img = Sp.character(p.look, dir, frame);
    if (!hurt) g.drawImage(img, Math.round(x * T - 8), Math.round(y * T - 19));
    // herramienta en uso
    const sw = isMe ? view.swing : p.swing;
    if (sw && now - sw.at < 260) {
      const k = (now - sw.at) / 260;
      const icon = Sp.icon(sw.tool);
      const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir] || [0, 1];
      g.save();
      g.translate(Math.round(x * T + dx * 8), Math.round(y * T - 9 + dy * 6));
      g.rotate((dx >= 0 ? 1 : -1) * (-1.2 + k * 2.2));
      g.drawImage(icon, -4, -14);
      g.restore();
    }
    // pesca: línea y boya
    const fs = isMe ? view.fishing : null;
    if (fs) {
      const bx = (fs.tx + 0.5) * T, by = (fs.ty + 0.5) * T + Math.round(Math.sin(t / 220) * (fs.bite ? 2 : 0.6));
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(Math.round(x * T + (dir === 'left' ? -6 : 6)) + 0.5, Math.round(y * T - 18) + 0.5); g.lineTo(bx + 0.5, by + 0.5); g.stroke();
      g.fillStyle = '#ec4b5e'; g.fillRect(bx - 1, by - 2, 3, 2); g.fillStyle = '#fff'; g.fillRect(bx - 1, by, 3, 1);
    }
  }

  drawPet(g, t) {
    const p = S.pet;
    const moving = p.mv;
    const frame = moving ? Math.floor(t / 160) % 2 : 0;
    g.fillStyle = 'rgba(40,40,60,0.2)'; g.fillRect(Math.round(p.rx * T - 7), Math.round(p.ry * T - 1), 14, 2);
    g.drawImage(Sp.carpincho(p.dir || 'down', frame), Math.round(p.rx * T - 10), Math.round(p.ry * T - 15));
    if (!moving && Math.floor(t / 2600) % 5 === 0) { // parpadeo de "zzz" o corazoncito
      g.fillStyle = '#fff'; g.fillRect(Math.round(p.rx * T + 7), Math.round(p.ry * T - 18), 1, 1);
    }
  }

  drawEnemy(g, e, t, now) {
    const hurt = now - (e.hurtAt || 0) < 250;
    const frame = Math.floor(t / (e.kind === 'polillin' ? 120 : 330)) % 2;
    const X = Math.round(e.rx * T - 8);
    if (e.kind === 'musguito') {
      g.fillStyle = 'rgba(20,10,30,0.3)'; g.fillRect(X + 3, Math.round(e.ry * T + 2), 10, 2);
      g.drawImage(Sp.musguito(frame, hurt), X, Math.round(e.ry * T - 12));
    } else {
      const bob = Math.round(Math.sin(t / 180 + e.id) * 2);
      g.fillStyle = 'rgba(20,10,30,0.25)'; g.fillRect(X + 5, Math.round(e.ry * T + 4), 6, 2);
      g.drawImage(Sp.polillin(frame, hurt), X, Math.round(e.ry * T - 16) + bob);
    }
  }

  drawTarget(g, tg, t) {
    const b = Math.floor(t / 300) % 2;
    const x0 = tg.x * T - b, y0 = tg.y * T - b, x1 = (tg.x + (tg.w || 1)) * T - 1 + b, y1 = (tg.y + (tg.h || 1)) * T - 1 + b;
    g.fillStyle = 'rgba(255,248,230,0.95)';
    for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      g.fillRect(x, y, 4 * sx || 1, 1); g.fillRect(x, y, 1, 4 * sy || 1);
      g.fillRect(sx > 0 ? x : x - 3, y, 4, 1); g.fillRect(x, sy > 0 ? y : y - 3, 1, 4);
    }
  }

  drawGhost(g, gh, t) {
    const d = FURNITURE[gh.item];
    g.globalAlpha = 0.6;
    this.drawFurniture(g, { item: gh.item, x: gh.x, y: gh.y }, t);
    g.globalAlpha = 0.35;
    g.fillStyle = gh.ok ? '#7be08a' : '#f06a6a';
    g.fillRect(gh.x * T, gh.y * T, d.w * T, d.h * T);
    g.globalAlpha = 1;
  }

  drawDecorGrid(g) {
    const r = houseFloorRect(S.houseLevel);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { g.fillRect(x * T, y * T, T, 1); g.fillRect(x * T, y * T, 1, T); }
  }

  drawLighting(g, map, day, now, t, cx, cy) {
    let dark = 0, color = '15,18,48';
    if (map === 'cueva') { dark = 0.74; color = '16,10,24'; }
    else if (map === 'casa') { dark = day.night ? 0.32 : 0.06; color = '40,22,30'; }
    else dark = day.dark;
    const lights = [];
    const add = (x, y, r, col) => lights.push({ x: x * T - cx, y: y * T - cy, r, col });
    if (map === 'isla' && day.dark > 0.05) {
      for (const o of S.objects.values()) if (o.kind === 'farola' && o.map === 'isla') add(o.x + 0.5, o.y - 0.3, 46, 'rgba(255,214,140,0.9)');
      add(15.9, 6.5, 30, 'rgba(255,214,120,0.8)'); add(18.75, 6.5, 30, 'rgba(255,214,120,0.8)');
    }
    if (map === 'casa') {
      for (const f of S.furniture.values()) { const d = FURNITURE[f.item]; if (d.light) add(f.x + 0.5, f.y + 0.2, 52, d.light === '#ffb3c7' ? 'rgba(255,170,200,0.9)' : 'rgba(255,214,140,0.9)'); }
      add(HOUSE_DOOR.x + 0.5, HOUSE_DOOR.y, 34, 'rgba(255,240,210,0.5)');
    }
    if (map === 'cueva') {
      const r = 58 + Math.sin(t / 300) * 2;
      for (const p of Object.values(S.players)) {
        if (!p.online && p.id !== S.you) continue;
        const me = p.id === S.you;
        if ((me ? S.local.map : p.map) !== 'cueva') continue;
        add(me ? S.local.x : p.rx, (me ? S.local.y : p.ry) - 0.5, r, 'rgba(255,220,170,1)');
      }
      for (const o of S.objects.values()) if (o.map === 'cueva' && o.kind === 'roca_cuarzo' && !o.gone) add(o.x + 0.5, o.y + 0.4, 22, 'rgba(255,160,200,0.8)');
      for (const o of S.objects.values()) if (o.map === 'cueva' && o.kind === 'cofre') add(o.x + 0.5, o.y + 0.5, 14, 'rgba(255,230,160,0.6)');
      for (const e of S.enemies.values()) if (e.alive && e.kind === 'polillin') add(e.rx, e.ry - 0.6, 20, 'rgba(255,240,160,0.8)');
      add(14, 19.5, 64, 'rgba(255,245,220,1)');
    }
    if (dark > 0.01) {
      const L = this.light, lg = L.getContext('2d');
      lg.globalCompositeOperation = 'source-over';
      lg.clearRect(0, 0, this.vw, this.vh);
      lg.fillStyle = `rgba(${color},${dark})`;
      lg.fillRect(0, 0, this.vw, this.vh);
      lg.globalCompositeOperation = 'destination-out';
      for (const l of lights) lg.drawImage(this.glow(l.r, 'rgba(0,0,0,1)'), Math.round(l.x - l.r), Math.round(l.y - l.r));
      g.drawImage(L, 0, 0);
    }
    if (day.warm > 0.01 && map === 'isla') {
      g.globalCompositeOperation = 'soft-light';
      g.fillStyle = `rgba(255,140,80,${day.warm * 0.55})`;
      g.fillRect(0, 0, this.vw, this.vh);
      g.globalCompositeOperation = 'source-over';
    }
    if (lights.length && (dark > 0.2 || map === 'casa')) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = map === 'cueva' ? 0.12 : 0.16;
      for (const l of lights) { const r = Math.round(l.r * 0.6); g.drawImage(this.glow(r, l.col), Math.round(l.x - r), Math.round(l.y - r)); }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  }

  // de coordenadas de pantalla (CSS px) a casillas del mundo
  screenToWorld(clientX, clientY) {
    return { x: (clientX / this.cssPerPx + this.cam.x) / T, y: (clientY / this.cssPerPx + this.cam.y) / T };
  }
}
