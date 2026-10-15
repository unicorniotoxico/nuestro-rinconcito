// Interfaz del juego: HUD, menús, buzón, pesca, desafíos y decoración.
import * as D from '../shared/data.js';
import { MAPS } from '../shared/maps.js';
import { fishParams, markerPos, evalTaps } from '../shared/fishing.js';
import { S, on, partner, partnerId, count } from './state.js';
import * as Sp from './sprites.js';
import { audio } from './audio.js';
import { h, icon, iconURL, canvasImg, ago, mmss, clear } from './dom.js';
import { dayInfo } from './render.js';
import { characterEditor } from './creator.js';

const CAT_ORDER = [['herramienta', 'Herramientas'], ['material', 'Materiales'], ['flor', 'Flores'], ['semilla', 'Semillas'], ['cultivo', 'Cosechas'], ['pez', 'Peces'], ['comida', 'Comida'], ['mueble', 'Muebles']];
const PLACE = { isla: 'La isla', casa: 'Nuestra casa', cueva: 'La cueva' };
const WHERE = { isla: 'en la isla', casa: 'en casa', cueva: 'en la cueva' };
const CH_ICON = { pesca: 'carpa_corazon', mineria: 'cobre', cosecha: 'frutilla' };

export class UI {
  constructor(net) {
    this.net = net;
    this.game = null;
    this.tab = 'mochila';
    this.sel = null;
    this.modals = [];
    this.lastActionKey = '';
    this.buildHud();
    this.wireState();
    setInterval(() => this.tickHud(), 500);
  }

  setGame(game) { this.game = game; }

  // ------------------------------------------------------------ HUD
  buildHud() {
    const hud = document.getElementById('hud');
    this.hearts = h('div', { class: 'hearts', 'aria-label': 'Vida' });
    this.place = h('div', { class: 'place' });
    this.partnerChip = h('button', { class: 'partner-chip', type: 'button', onclick: () => this.openMenu('isla') });
    this.banner = h('div', { class: 'ch-banner', hidden: true });
    this.btnEmote = h('button', { class: 'round', type: 'button', 'aria-label': 'Gestos', onclick: () => this.toggleEmotes() }, canvasImg(Sp.emote('corazon')));
    this.btnMenu = h('button', { class: 'round', type: 'button', 'aria-label': 'Menú', onclick: () => this.openMenu(this.tab) }, h('span', { class: 'burger' }, h('i'), h('i'), h('i')));
    this.btnDecor = h('button', { class: 'pill', type: 'button', hidden: true, onclick: () => this.game.decor ? this.game.exitDecor() : this.game.enterDecor() }, icon('silla'), h('span', { text: 'Decorar' }));
    this.emotes = h('div', { class: 'popover emotes', hidden: true }, D.EMOTES.map(e => h('button', { type: 'button', class: 'emote-btn', 'aria-label': e, onclick: () => { this.net.act('emote', { e }); this.emotes.hidden = true; } }, canvasImg(Sp.emote(e), 'ico'))));
    this.actIcon = h('img', { class: 'act-ico', alt: '' });
    this.actLabel = h('span', { class: 'act-label' });
    this.btnAction = h('button', { class: 'action', type: 'button', 'aria-label': 'Acción' }, this.actIcon, this.actLabel);
    const hold = (on) => { this.game.holding = on; };
    this.btnAction.addEventListener('pointerdown', (e) => { e.preventDefault(); audio.unlock(); hold(true); this.game.primary(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.btnAction.addEventListener(ev, () => hold(false));
    this.btnHand = h('button', { class: 'round small hand', type: 'button', 'aria-label': 'Objeto en la mano', onclick: () => this.toggleHand() });
    this.btnBag = h('button', { class: 'round small', type: 'button', 'aria-label': 'Mochila', onclick: () => this.openMenu('mochila') }, icon('mochila'));
    this.handPop = h('div', { class: 'popover hand-pop', hidden: true });
    this.decorBar = h('div', { class: 'decor-bar', hidden: true });

    hud.append(
      h('div', { class: 'hud-top' },
        h('div', { class: 'hud-left' }, this.hearts, this.place),
        this.banner,
        h('div', { class: 'hud-right' }, this.partnerChip, h('div', { class: 'row' }, this.btnDecor, this.btnEmote, this.btnMenu), this.emotes),
      ),
      h('div', { class: 'hud-bottom' }, h('div', { class: 'acts' }, h('div', { class: 'acts-small' }, this.btnHand, this.btnBag), this.btnAction), this.handPop),
      this.decorBar,
    );
    this.sheet = document.getElementById('sheet');
    this.toasts = document.getElementById('toasts');
    document.getElementById('touch').addEventListener('pointerdown', () => { this.emotes.hidden = true; this.handPop.hidden = true; });
  }

  wireState() {
    on('hp', ({ old, hp }) => { this.renderHearts(); if (hp < old) document.body.classList.add('ouch'), setTimeout(() => document.body.classList.remove('ouch'), 250); });
    on('inv', () => { this.renderHand(); this.refreshSheet(); this.refreshMailbox(); });
    on('players', () => { this.renderPartner(); this.refreshSheet(); });
    on('welcome', () => { this.renderHearts(); this.renderPartner(); this.renderHand(); this.refreshSheet(); this.onChallenge({ prev: null }); });
    on('proj', () => this.refreshSheet());
    on('pet', () => this.refreshSheet());
    on('log', () => this.refreshSheet());
    on('mail', () => { this.refreshMailbox(); this.refreshSheet(); });
    on('chal', (e) => { this.onChallenge(e); this.refreshSheet(); });
    on('chscore', () => this.renderBanner());
    on('pos', () => { this.btnDecor.hidden = S.local.map !== 'casa'; this.renderPlace(); });
  }

  renderHearts() {
    const hp = S.me ? S.me.hp : 0;
    const kids = [];
    for (let i = 0; i < D.MAX_HP / 2; i++) {
      const v = Math.max(0, Math.min(2, hp - i * 2));
      kids.push(canvasImg(Sp.heart(v), 'heart'));
    }
    clear(this.hearts).append(...kids);
    this.hearts.setAttribute('aria-label', `Vida: ${hp / 2} de ${D.MAX_HP / 2} corazones`);
  }

  renderPlace() {
    const d = dayInfo(this.net.now());
    const hh = Math.floor(d.h), mm = Math.floor((d.h - hh) * 60 / 10) * 10;
    this.place.textContent = `${PLACE[S.local.map] || ''} · ${d.night ? '☾' : '☀'} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.btnDecor.hidden = S.local.map !== 'casa';
    this.btnDecor.classList.toggle('on', !!this.game?.decor);
  }

  renderPartner() {
    const p = partner();
    clear(this.partnerChip);
    if (!p) {
      this.partnerChip.append(h('span', { class: 'dot wait' }), h('span', { class: 'pc-text' }, h('b', { text: 'Invitá a tu pareja' }), h('small', { text: S.code ? `Código: ${S.code}` : '' })));
      return;
    }
    const av = h('canvas', { class: 'pc-av', width: 16, height: 14 });
    av.getContext('2d').drawImage(Sp.character(p.look, 'down', 0), 0, 0, 16, 14, 0, 0, 16, 14);
    const status = p.online ? WHERE[p.map] || 'en la isla' : `sin conexión · ${ago(p.lastSeen, this.net.now())}`;
    this.partnerChip.append(h('span', { class: 'dot ' + (p.online ? 'on' : 'off') }), av, h('span', { class: 'pc-text' }, h('b', { text: p.name }), h('small', { text: status })));
  }

  renderHand() {
    const g = this.game;
    clear(this.btnHand);
    const item = g && g.hand && count(g.hand) ? g.hand : null;
    if (g && g.hand && !count(g.hand)) g.hand = null;
    if (item) this.btnHand.append(icon(item), h('span', { class: 'badge', text: count(item) }));
    else this.btnHand.append(h('span', { class: 'hand-empty', text: 'Mano' }));
  }

  toggleHand() {
    audio.play('ui');
    if (!this.handPop.hidden) { this.handPop.hidden = true; return; }
    const items = Object.keys(S.me.inv).filter(k => ['semilla', 'cultivo', 'comida', 'pez'].includes(D.ITEMS[k]?.cat));
    clear(this.handPop).append(
      h('p', { class: 'pop-title', text: 'Llevar en la mano' }),
      h('p', { class: 'pop-hint', text: 'Semillas para plantar, o comida para darle al carpincho.' }),
      h('div', { class: 'pop-grid' },
        h('button', { type: 'button', class: 'cell', onclick: () => { this.game.hand = null; this.renderHand(); this.handPop.hidden = true; } }, h('span', { class: 'hand-empty', text: 'Nada' })),
        items.map(k => h('button', { type: 'button', class: 'cell' + (this.game.hand === k ? ' on' : ''), 'aria-label': D.ITEMS[k].name, onclick: () => { this.game.hand = k; this.renderHand(); this.handPop.hidden = true; } }, icon(k), h('span', { class: 'badge', text: S.me.inv[k] })))),
    );
    // atajo para comer sin abrir la mochila (útil en la cueva)
    const food = Object.keys(S.me.inv).filter(k => D.ITEMS[k]?.heal).sort((a, b) => D.ITEMS[a].heal - D.ITEMS[b].heal);
    if (food.length && S.me.hp < D.MAX_HP) {
      this.handPop.append(h('p', { class: 'pop-title', text: 'Comer algo' }), h('div', { class: 'row' }, food.slice(0, 4).map(k => h('button', { type: 'button', class: 'btn tiny', onclick: async () => {
        const r = await this.net.act('eat', { item: k });
        if (!r.ok) this.toast(r.err, 'warn');
        this.handPop.hidden = true;
      } }, icon(k, 'ico sm'), `+${D.ITEMS[k].heal / 2}♥`))));
    }
    this.handPop.hidden = false;
    this.emotes.hidden = true;
  }
  toggleEmotes() { audio.play('ui'); this.emotes.hidden = !this.emotes.hidden; this.handPop.hidden = true; }

  updateAction(t, game) {
    const offline = this.net.status !== 'online';
    const key = t ? `${t.kind}|${t.verb}|${t.icon}|${t.missing ? 1 : 0}|${t.disabled ? 1 : 0}|${t.food || ''}|${offline}` : `none|${offline}`;
    if (key === this.lastActionKey) return;
    this.lastActionKey = key;
    if (!t) { this.btnAction.classList.add('idle'); this.actLabel.textContent = ''; this.actIcon.src = iconURL('mano'); this.btnAction.setAttribute('aria-label', 'Nada para hacer acá'); return; }
    this.btnAction.classList.remove('idle');
    const verb = t.kind === 'pet' && t.food ? 'Dar de comer' : t.verb;
    this.actLabel.textContent = verb;
    this.actIcon.src = t.icon === 'corazon' ? Sp.emote('corazon').toDataURL() : iconURL(t.food || t.icon || 'ramo');
    this.btnAction.classList.toggle('missing', !!t.missing || !!t.disabled);
    this.btnAction.setAttribute('aria-label', verb);
  }

  tickHud() {
    if (!S.ready) return;
    this.renderPlace();
    if (S.local.map === 'isla') audio.setMood(dayInfo(this.net.now()).night ? 'noche' : 'isla');
    this.renderBanner();
    if (partner() && !partner().online) this.renderPartner();
    if (this.sheet && !this.sheet.hidden && this.tab === 'desafios') this.refreshSheet();
  }

  toast(msg, kind = 'info') {
    if (!msg) return;
    const now = performance.now();
    if (this.lastToast && this.lastToast.msg === msg && now - this.lastToast.at < 1800) return; // sin repetir el mismo aviso
    this.lastToast = { msg, at: now };
    const el = h('div', { class: 'toast ' + kind, role: 'status' }, msg);
    this.toasts.append(el);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => el.classList.add('out'), kind === 'love' ? 4200 : 2800);
    setTimeout(() => el.remove(), kind === 'love' ? 4700 : 3300);
  }

  // ------------------------------------------------------------ modales
  modalOpen() { return this.modals.length > 0 || !this.sheet.hidden || !!this.fishEl; }
  modal({ title, body, actions = [], onClose = null, cls = '' }) {
    const root = document.getElementById('modal-root');
    const close = () => { el.remove(); this.modals = this.modals.filter(m => m !== el); if (onClose) onClose(); };
    const el = h('div', { class: 'modal-wrap', onclick: (e) => { if (e.target === el) close(); } },
      h('div', { class: 'modal card ' + cls, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '' },
        title ? h('h3', { text: title }) : null,
        body,
        actions.length ? h('div', { class: 'row-end' }, actions.map(a => h('button', { type: 'button', class: 'btn ' + (a.cls || (a.primary ? 'primary' : 'ghost')), disabled: a.disabled, onclick: async () => { audio.play('ui'); const keep = a.onClick ? await a.onClick() : false; if (keep !== true) close(); } }, a.label))) : null,
      ),
    );
    root.append(el);
    this.modals.push(el);
    this.game?.input.reset();
    return { el, close };
  }
  closeAll() {
    for (const m of [...this.modals]) m.remove();
    this.modals = [];
    this.closeMenu();
    this.emotes.hidden = true; this.handPop.hidden = true;
  }

  confirm(title, text, okLabel = 'Sí', cls = 'primary') {
    return new Promise((resolve) => {
      this.modal({ title, body: h('p', { text }), actions: [{ label: 'Cancelar', onClick: () => resolve(false) }, { label: okLabel, cls, onClick: () => resolve(true) }], onClose: () => resolve(false) });
    });
  }

  // ------------------------------------------------------------ menú principal
  openMenu(tab) {
    audio.play('ui');
    this.tab = tab || this.tab;
    this.sheet.hidden = false;
    this.game?.input.reset();
    this.emotes.hidden = true; this.handPop.hidden = true;
    this.refreshSheet(true);
  }
  closeMenu() { if (this.sheet) this.sheet.hidden = true; this.sel = null; }

  refreshSheet(force = false) {
    if (!this.sheet || this.sheet.hidden || !S.ready) return;
    const scroll = this.sheet.querySelector('.sheet-body')?.scrollTop || 0;
    const active = document.activeElement;
    if (!force && active && this.sheet.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    const tabs = [['mochila', 'Mochila'], ['fabricar', 'Fabricar'], ['proyectos', 'Proyectos'], ['desafios', 'Desafíos'], ['isla', 'Isla'], ['ajustes', 'Ajustes']];
    const body = h('div', { class: 'sheet-body' });
    const fn = { mochila: this.tabBag, fabricar: this.tabCraft, proyectos: this.tabProjects, desafios: this.tabChallenges, isla: this.tabIsland, ajustes: this.tabSettings }[this.tab];
    fn.call(this, body);
    clear(this.sheet).append(
      h('div', { class: 'sheet-head' },
        h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, l]) => h('button', { type: 'button', role: 'tab', class: 'tab' + (k === this.tab ? ' on' : ''), 'aria-selected': k === this.tab ? 'true' : 'false', onclick: () => { audio.play('ui'); this.tab = k; this.sel = null; this.refreshSheet(true); } }, l))),
        h('button', { type: 'button', class: 'round close', 'aria-label': 'Cerrar', onclick: () => { audio.play('ui'); this.closeMenu(); } }, '✕'),
      ),
      body,
    );
    if (!force) body.scrollTop = scroll;
  }

  // Mochila
  tabBag(body) {
    const inv = S.me.inv;
    const sel = this.sel && inv[this.sel] ? this.sel : null;
    if (sel) {
      const it = D.ITEMS[sel];
      const acts = [];
      if (it.heal) acts.push(h('button', { type: 'button', class: 'btn primary', onclick: async () => { const r = await this.net.act('eat', { item: sel }); if (!r.ok) this.toast(r.err, 'warn'); } }, `Comer (+${it.heal / 2} ♥)`));
      if (['semilla', 'cultivo', 'comida', 'pez'].includes(it.cat)) acts.push(h('button', { type: 'button', class: 'btn', onclick: () => { this.game.hand = sel; this.renderHand(); this.toast(`Ahora llevás ${it.name} en la mano`, 'info'); this.closeMenu(); } }, 'Llevar en la mano'));
      if (it.cat === 'mueble') acts.push(h('button', { type: 'button', class: 'btn primary', onclick: () => { this.closeMenu(); this.game.enterDecor(sel); } }, 'Poner en la casa'));
      body.append(h('div', { class: 'detail card' }, h('div', { class: 'detail-head' }, icon(sel, 'ico big'), h('div', {}, h('b', { text: `${it.name} × ${inv[sel]}` }), h('p', { class: 'muted', text: it.desc }))), acts.length ? h('div', { class: 'row' }, acts) : null));
    }
    let any = false;
    for (const [cat, label] of CAT_ORDER) {
      const items = Object.keys(inv).filter(k => D.ITEMS[k]?.cat === cat);
      if (!items.length) continue;
      any = true;
      body.append(h('h4', { text: label }), h('div', { class: 'grid' }, items.map(k => h('button', { type: 'button', class: 'cell' + (k === sel ? ' on' : ''), 'aria-label': `${D.ITEMS[k].name}: ${inv[k]}`, onclick: () => { audio.play('ui'); this.sel = k; this.refreshSheet(); } }, icon(k), D.ITEMS[k].cat !== 'herramienta' ? h('span', { class: 'badge', text: inv[k] }) : null))));
    }
    if (!any) body.append(h('p', { class: 'muted', text: 'La mochila está vacía.' }));
    body.append(h('p', { class: 'hint', text: 'Tip: juntá ramitas de los arbustos y piedritas del suelo para fabricar tu primer hacha y tu pico.' }));
  }

  // Fabricar
  tabCraft(body) {
    const inv = S.me.inv;
    let lastCat = null;
    for (const r of D.RECIPES) {
      if (r.cat !== lastCat) { body.append(h('h4', { text: r.cat })); lastCat = r.cat; }
      const out = Object.keys(r.out)[0];
      const owned = r.unique && (inv[out] || (out === 'pico' && inv.pico_cobre));
      const can = Object.entries(r.in).every(([k, v]) => (inv[k] || 0) >= v);
      const ins = Object.entries(r.in).map(([k, v]) => h('span', { class: 'need ' + ((inv[k] || 0) >= v ? 'ok' : 'no'), title: D.ITEMS[k].name }, icon(k, 'ico sm'), `${Math.min(inv[k] || 0, 999)}/${v}`));
      body.append(h('div', { class: 'recipe card' },
        icon(out, 'ico big'),
        h('div', { class: 'recipe-main' }, h('b', { text: D.ITEMS[out].name + (r.out[out] > 1 ? ` × ${r.out[out]}` : '') }), h('small', { class: 'muted', text: D.ITEMS[out].desc }), h('div', { class: 'needs' }, ins)),
        h('button', { type: 'button', class: 'btn ' + (can && !owned ? 'primary' : 'ghost'), disabled: !can || owned, onclick: async (e) => {
          e.currentTarget.disabled = true;
          const res = await this.net.act('craft', { r: r.id });
          if (!res.ok) this.toast(res.err, 'warn'); else this.toast(`Fabricaste: ${D.ITEMS[out].name}`, 'ok');
        } }, owned ? 'Ya la tenés' : 'Fabricar'),
      ));
    }
  }

  // Proyectos compartidos
  tabProjects(body) {
    body.append(h('p', { class: 'muted', text: 'Proyectos de los dos: cada uno aporta lo que puede, cuando puede.' }));
    for (const [id, def] of Object.entries(D.PROJECTS)) {
      const pj = S.projects[id];
      const locked = def.requires && !S.projects[def.requires].done;
      const rows = Object.entries(def.needs).map(([k, need]) => {
        const have = pj.have[k] || 0;
        return h('div', { class: 'prog-row' }, icon(k, 'ico sm'), h('span', { class: 'prog-name', text: D.ITEMS[k].name }),
          h('div', { class: 'bar' }, h('i', { style: { width: `${Math.min(100, have / need * 100)}%` } })),
          h('span', { class: 'prog-num', text: `${have}/${need}` }),
          !pj.done && !locked && have < need && count(k) ? h('button', { type: 'button', class: 'btn tiny', onclick: async () => { const r = await this.net.act('contribute', { pj: id, item: k }); if (!r.ok) this.toast(r.err, 'warn'); else audio.play('craft'); } }, `+${Math.min(count(k), need - have)}`) : null);
      });
      const contrib = Object.entries(pj.contrib || {}).map(([pid, items]) => {
        const p = S.players[pid];
        const n = Object.values(items).reduce((a, b) => a + b, 0);
        return p ? `${p.name}: ${n}` : null;
      }).filter(Boolean);
      body.append(h('div', { class: 'project card' + (pj.done ? ' done' : '') },
        h('div', { class: 'proj-head' }, h('b', { text: def.name }), pj.done ? h('span', { class: 'tag ok', text: '¡Listo!' }) : locked ? h('span', { class: 'tag', text: 'Bloqueado' }) : null),
        h('p', { class: 'muted', text: locked ? 'Se habilita cuando terminen “' + D.PROJECTS[def.requires].name + '”.' : def.desc }),
        rows,
        contrib.length ? h('p', { class: 'small', text: 'Aportes · ' + contrib.join(' · ') }) : null,
        !pj.done && !locked ? h('button', { type: 'button', class: 'btn primary', onclick: async () => { const r = await this.net.act('contribute', { pj: id }); if (!r.ok) this.toast(r.err, 'warn'); else audio.play('craft'); } }, 'Aportar todo lo que pueda') : null,
      ));
    }
  }

  // Desafíos
  tabChallenges(body) {
    const p = partner();
    const c = S.challenge;
    const now = this.net.now();
    if (c && c.status !== 'finished') {
      const def = D.CHALLENGES[c.type];
      const txt = c.status === 'proposed' ? (c.by === S.you ? `Esperando que ${p?.name || 'tu pareja'} acepte…` : `${S.players[c.by]?.name} te propone este desafío`) : c.status === 'countdown' ? '¡Arranca en segundos!' : `En juego · quedan ${mmss(c.endsAt - now)}`;
      body.append(h('div', { class: 'card highlight' }, h('b', { text: def.name }), h('p', { text: txt }),
        c.status === 'proposed' && c.by === S.you ? h('button', { type: 'button', class: 'btn ghost', onclick: () => this.net.act('ch_cancel', { cid: c.id }) }, 'Cancelar') : null,
        c.status === 'proposed' && c.by !== S.you ? h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onclick: () => this.net.act('ch_answer', { cid: c.id, accept: true }) }, 'Aceptar'), h('button', { type: 'button', class: 'btn ghost', onclick: () => this.net.act('ch_answer', { cid: c.id, accept: false }) }, 'Ahora no')) : null));
    }
    const canPropose = p && p.online && (!c || c.status === 'finished');
    if (!p) body.append(h('p', { class: 'muted', text: 'Los desafíos se juegan de a dos. Cuando tu pareja entre a la isla con el código, van a poder jugarlos.' }));
    else if (!p.online) body.append(h('p', { class: 'muted', text: `Los desafíos se inician con los dos conectados. ${p.name} está sin conexión.` }));
    for (const [type, def] of Object.entries(D.CHALLENGES)) {
      body.append(h('div', { class: 'card challenge' },
        h('div', { class: 'proj-head' }, icon(CH_ICON[type], 'ico'), h('b', { text: def.name }), h('span', { class: 'tag', text: mmss(def.durationMs) })),
        h('ul', { class: 'rules' }, def.rules.map(r => h('li', { text: r }))),
        h('p', { class: 'small', text: `Premio para los dos: ${Object.entries(def.reward).map(([k, v]) => `${v} ${D.ITEMS[k].name}`).join(', ')}. Quien gana se lleva: ${D.HATS[def.hat]}.` }),
        h('button', { type: 'button', class: 'btn ' + (canPropose ? 'primary' : 'ghost'), disabled: !canPropose, onclick: async () => { const r = await this.net.act('ch_propose', { type }); if (!r.ok) this.toast(r.err, 'warn'); else this.toast('Desafío enviado. ¡A esperar la respuesta!', 'info'); } }, 'Proponer este desafío'),
      ));
    }
    body.append(h('h4', { text: 'Trofeos' }));
    const ps = Object.values(S.players);
    body.append(h('div', { class: 'card' }, ps.map(pl => h('p', {}, h('b', { text: pl.name + ': ' }), `${pl.wins?.pesca || 0} de pesca · ${pl.wins?.mineria || 0} de minería · ${pl.wins?.cosecha || 0} de cosecha`))));
    if (S.history.length) {
      body.append(h('h4', { text: 'Últimos desafíos' }));
      for (const hst of S.history.slice(0, 6)) {
        const def = D.CHALLENGES[hst.type];
        const res = hst.result.nobody ? 'Nadie sumó puntos' : hst.result.tie ? 'Empate' : `Ganó ${S.players[hst.result.winners[0]]?.name}`;
        body.append(h('p', { class: 'small' }, `${def.name} · ${res} · ${ago(hst.at, now)}`));
      }
    }
  }

  // Isla
  tabIsland(body) {
    const p = partner();
    if (S.code) {
      const link = `${location.origin}${location.pathname}?codigo=${S.code}`;
      body.append(h('div', { class: 'card highlight' },
        h('b', { text: 'Invitá a tu pareja' }),
        h('p', { text: 'Pasale este código (o el enlace). Sirve una sola vez: cuando entre, la isla queda cerrada para ustedes dos.' }),
        h('div', { class: 'code-big', text: S.code.replace(/(.{4})/, '$1-') }),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn', onclick: () => this.copy(S.code, 'Código copiado') }, 'Copiar código'),
          navigator.share ? h('button', { type: 'button', class: 'btn primary', onclick: () => navigator.share({ title: 'Nuestro rinconcito', text: `Vení a nuestra isla 💛 Código: ${S.code}`, url: link }).catch(() => {}) }, 'Compartir') : h('button', { type: 'button', class: 'btn primary', onclick: () => this.copy(link, 'Enlace copiado') }, 'Copiar enlace'))));
    }
    if (p) {
      body.append(h('div', { class: 'card' }, h('b', { text: p.name }), h('p', { class: 'muted', text: p.online ? `Conectada/o ahora, ${WHERE[p.map] || ''}` : `Sin conexión · última vez ${ago(p.lastSeen, this.net.now())}` }),
        h('p', { class: 'small', text: 'Aunque no esté, podés seguir jugando y dejarle regalos en el buzón.' })));
    }
    const pet = S.pet;
    if (pet) {
      const hearts = Math.round(pet.affection / 20);
      body.append(h('div', { class: 'card' },
        h('div', { class: 'proj-head' }, canvasImg(Sp.carpincho('down', 0), 'ico big'), h('b', { text: pet.name ? `${pet.name}, el carpincho` : 'Un carpincho sin nombre' })),
        h('p', { class: 'muted', text: pet.name ? `Cariño: ${'♥'.repeat(hearts)}${'♡'.repeat(5 - hearts)} · ${this.net.now() - pet.fedAt < D.PET.fullMs ? 'panza llena' : 'tiene hambre'}` : 'Vive cerca de su camita, al lado de la casa. Acercate para ponerle nombre.' }),
        h('p', { class: 'small', text: 'Mimalo y dale de comer (frutillas son su favorito). Si lo cuidan, a veces trae regalitos.' })));
    }
    body.append(h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn', onclick: () => this.editCharacter() }, 'Cambiar mi personaje'),
      pet && pet.name ? h('button', { type: 'button', class: 'btn ghost', onclick: () => this.petNameDialog(true) }, 'Renombrar al carpincho') : null));
    body.append(h('h4', { text: 'Diario de la isla' }));
    const log = [...S.log].reverse().slice(0, 25);
    body.append(h('div', { class: 'card log' }, log.length ? log.map(e => h('p', {}, h('small', { class: 'muted', text: ago(e.at, this.net.now()) + ' · ' }), e.text)) : h('p', { class: 'muted', text: 'Todavía no pasó nada.' })));
    // llave personal
    const key = localStorage.getItem('rinconcito.token') || '';
    const keyBox = h('div', { class: 'code-key', hidden: true, text: key });
    body.append(h('h4', { text: 'Tu llave personal' }), h('div', { class: 'card' },
      h('p', { class: 'small', text: 'Con esta llave volvés a entrar como vos desde otro celular o si instalás la app. Es secreta: con ella cualquiera podría jugar como vos.' }),
      keyBox,
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn ghost', onclick: (e) => { keyBox.hidden = !keyBox.hidden; e.currentTarget.textContent = keyBox.hidden ? 'Mostrar' : 'Ocultar'; } }, 'Mostrar'),
        h('button', { type: 'button', class: 'btn', onclick: () => this.copy(key, 'Llave copiada. Guardala en un lugar seguro') }, 'Copiar llave'))));
  }

  tabSettings(body) {
    const slider = (label, key) => {
      const inp = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(audio.prefs[key]), 'aria-label': label });
      inp.addEventListener('input', () => audio.set(key, Number(inp.value)));
      return h('label', { class: 'field' }, h('span', { class: 'label', text: label }), inp);
    };
    const mute = h('input', { type: 'checkbox', checked: audio.prefs.muted });
    mute.addEventListener('change', () => audio.set('muted', mute.checked));
    body.append(h('div', { class: 'card' }, h('h4', { text: 'Sonido' }), slider('Música', 'music'), slider('Efectos', 'sfx'), h('label', { class: 'check' }, mute, h('span', { text: 'Silenciar todo' }))));
    if (/RinconcitoApp\//.test(navigator.userAgent)) {
      body.append(h('div', { class: 'card' }, h('h4', { text: 'Servidor de la isla' }),
        h('p', { class: 'small code-key', text: location.origin }),
        h('p', { class: 'small', text: 'Tu llave queda guardada en este celular. Si cambiás de servidor, vas a empezar en otra isla.' }),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => { if (window.RinconcitoApp) window.RinconcitoApp.config(); else location.href = 'rinconcito://config'; } }, 'Cambiar servidor')));
    }
    const install = h('div', { class: 'card app-hide' }, h('h4', { text: 'Instalar en el celular' }));
    if (window.__installPrompt) install.append(h('button', { type: 'button', class: 'btn primary', onclick: async () => { window.__installPrompt.prompt(); window.__installPrompt = null; } }, 'Instalar app'));
    install.append(h('p', { class: 'small', text: 'iPhone: en Safari tocá Compartir → “Agregar a inicio”. Android: menú ⋮ → “Instalar app” o “Agregar a la pantalla principal”.' }),
      h('p', { class: 'small', text: 'Importante en iPhone: la app instalada no comparte datos con Safari. Copiá tu llave personal (pestaña Isla) y usala en “Entrar con mi llave” la primera vez que abras la app.' }));
    body.append(install);
    body.append(h('div', { class: 'card' }, h('h4', { text: 'Este dispositivo' }),
      h('p', { class: 'small', text: 'Salir borra la llave de este celular. Tu isla y tu progreso siguen guardados en el servidor; para volver vas a necesitar la llave.' }),
      h('button', { type: 'button', class: 'btn danger', onclick: async () => {
        const ok = await this.confirm('¿Salir de la isla en este celular?', '¿Ya copiaste tu llave personal? Sin ella no vas a poder volver a entrar como vos.', 'Salir', 'danger');
        if (ok) { localStorage.removeItem('rinconcito.token'); location.href = location.pathname; }
      } }, 'Salir en este dispositivo')));
    body.append(h('p', { class: 'small muted', text: 'Nuestro rinconcito · arte, música y sonidos creados por código para este juego. Sin publicidad, sin compras, sin apuros.' }));
  }

  async editCharacter() {
    this.closeMenu();
    const me = S.players[S.you];
    const res = await characterEditor({ title: 'Tu personaje', initial: { name: me.name, look: me.look }, submitLabel: 'Guardar', hats: S.me.cosmetics || [] });
    if (!res) return;
    const r = await this.net.act('look', { name: res.name, look: res.look });
    if (!r.ok) this.toast(r.err, 'warn'); else this.toast('¡Listo!', 'ok');
  }

  copy(text, msg) {
    const ok = () => this.toast(msg, 'ok');
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, () => this.fallbackCopy(text, msg));
    else this.fallbackCopy(text, msg);
  }
  fallbackCopy(text, msg) {
    const ta = h('textarea', { class: 'offscreen' }); ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); this.toast(msg, 'ok'); } catch { this.toast('No se pudo copiar. Mantené apretado el texto para copiarlo', 'warn'); }
    ta.remove();
  }

  // ------------------------------------------------------------ buzón
  openMailbox() {
    this.mailTab = this.mailTab || 'recibido';
    this.mailSel = null; this.mailQty = 1;
    this.mailbox = this.modal({ title: 'Buzón', body: h('div', { class: 'mail-body' }), cls: 'wide', onClose: () => { this.mailbox = null; } });
    this.refreshMailbox();
  }
  refreshMailbox() {
    if (!this.mailbox) return;
    const box = this.mailbox.el.querySelector('.mail-body');
    const active = document.activeElement;
    const noteVal = box.querySelector('textarea')?.value || '';
    if (active && box.contains(active) && active.tagName === 'TEXTAREA') return;
    const p = partner();
    const tabs = h('div', { class: 'tabs' }, [['recibido', 'Recibido'], ['enviar', 'Enviar']].map(([k, l]) => h('button', { type: 'button', class: 'tab' + (this.mailTab === k ? ' on' : ''), onclick: () => { this.mailTab = k; this.refreshMailbox(); } }, l)));
    clear(box).append(tabs);
    if (this.mailTab === 'recibido') {
      const mine = S.mail.filter(m => m.to === S.you).sort((a, b) => b.sentAt - a.sentAt);
      if (!mine.length) box.append(h('p', { class: 'muted', text: 'Todavía no hay cartas. ¡Ya van a llegar!' }));
      for (const m of mine) {
        const from = S.players[m.from]?.name || '???';
        box.append(h('div', { class: 'letter card' + (m.claimed ? '' : ' new') },
          h('div', { class: 'proj-head' }, m.item ? icon(m.item) : canvasImg(Sp.emote('corazon')), h('b', { text: `De ${from}` }), h('small', { class: 'muted', text: ago(m.sentAt, this.net.now()) })),
          m.claimed ? [m.note ? h('p', { class: 'note', text: m.note }) : null, m.item ? h('p', { class: 'small', text: `Te regaló ${m.qty} ${D.ITEMS[m.item].name}` }) : null]
            : h('button', { type: 'button', class: 'btn primary', onclick: async () => { const r = await this.net.act('mail_claim', { m: m.id }); if (!r.ok) this.toast(r.err, 'warn'); else { audio.play('love'); if (r.item) this.toast(`Recibiste ${r.qty} ${D.ITEMS[r.item].name}`, 'love'); } } }, m.item ? 'Abrir regalo 💌' : 'Leer cartita 💌'),
        ));
      }
      return;
    }
    if (!p) { box.append(h('p', { class: 'muted', text: 'Cuando tu pareja llegue a la isla, vas a poder dejarle regalos y cartitas acá.' })); return; }
    const items = Object.keys(S.me.inv).filter(k => D.ITEMS[k] && D.ITEMS[k].cat !== 'herramienta');
    if (this.mailSel && !count(this.mailSel)) this.mailSel = null;
    const sel = this.mailSel;
    const qty = Math.min(this.mailQty || 1, sel ? count(sel) : 1);
    const note = h('textarea', { class: 'text-in', maxlength: String(D.NOTE_MAX), rows: '3', placeholder: `Una nota para ${p.name} (opcional)` });
    note.value = noteVal;
    const counter = h('small', { class: 'muted', text: `${note.value.length}/${D.NOTE_MAX}` });
    note.addEventListener('input', () => { counter.textContent = `${note.value.length}/${D.NOTE_MAX}`; });
    box.append(
      h('p', { class: 'small', text: `Elegí un regalo para ${p.name} (o mandá solo una cartita):` }),
      h('div', { class: 'grid' }, items.map(k => h('button', { type: 'button', class: 'cell' + (k === sel ? ' on' : ''), 'aria-label': D.ITEMS[k].name, onclick: () => { this.mailSel = k === sel ? null : k; this.mailQty = 1; this.refreshMailbox(); } }, icon(k), h('span', { class: 'badge', text: S.me.inv[k] })))),
      sel ? h('div', { class: 'row qty' }, h('span', { text: D.ITEMS[sel].name }),
        h('button', { type: 'button', class: 'btn tiny', onclick: () => { this.mailQty = Math.max(1, qty - 1); this.refreshMailbox(); } }, '−'),
        h('b', { text: String(qty) }),
        h('button', { type: 'button', class: 'btn tiny', onclick: () => { this.mailQty = Math.min(count(sel), qty + 1); this.refreshMailbox(); } }, '+')) : null,
      note, counter,
      h('div', { class: 'row-end' }, h('button', { type: 'button', class: 'btn primary', onclick: async (e) => {
        if (!sel && !note.value.trim()) { this.toast('Elegí un regalo o escribí una nota', 'warn'); return; }
        e.currentTarget.disabled = true;
        const r = await this.net.act('mail_send', { item: sel || null, qty, note: note.value });
        if (!r.ok) { this.toast(r.err, 'warn'); e.currentTarget.disabled = false; return; }
        audio.play('love');
        this.toast(`Lo dejaste en el buzón para ${p.name} 💌`, 'love');
        this.mailSel = null; note.value = '';
        this.mailTab = 'enviar';
        this.refreshMailbox();
      } }, 'Dejar en el buzón')),
    );
    const sent = S.mail.filter(m => m.from === S.you).sort((a, b) => b.sentAt - a.sentAt).slice(0, 5);
    if (sent.length) {
      box.append(h('h4', { text: 'Lo que dejaste' }));
      for (const m of sent) box.append(h('p', { class: 'small' }, `${m.item ? `${m.qty} ${D.ITEMS[m.item].name}` : 'Cartita'} · ${m.claimed ? '✓ ya lo abrió' : 'todavía sin abrir'} · ${ago(m.sentAt, this.net.now())}`));
    }
  }

  // ------------------------------------------------------------ carpincho
  petNameDialog(rename = false) {
    const inp = h('input', { class: 'text-in', type: 'text', maxlength: String(D.NAME_MAX), placeholder: 'Por ejemplo: Panchito', value: rename ? (S.pet.name || '') : '' });
    this.modal({
      title: rename ? 'Nuevo nombre' : '¿Cómo se va a llamar?',
      body: h('div', {}, h('p', { class: 'muted', text: 'Un carpincho bebé encontró su lugar en la isla. Es de los dos.' }), canvasImg(Sp.carpincho('down', 0), 'ico huge'), inp),
      actions: [{ label: 'Más tarde' }, { label: 'Listo', primary: true, onClick: async () => {
        const name = inp.value.trim();
        if (!name) { this.toast('Escribí un nombre', 'warn'); return true; }
        const r = await this.net.act('pet_name', { name });
        if (!r.ok) { this.toast(r.err, 'warn'); return true; }
        audio.play('love');
        return false;
      } }],
    });
    setTimeout(() => inp.focus(), 60);
  }

  furnitureMenu(f, game) {
    const owner = S.players[f.owner];
    this.modal({
      title: D.ITEMS[f.item].name,
      body: h('p', { class: 'muted', text: `Lo puso ${owner ? owner.name : 'alguien'}. Si lo guardás, vuelve a su mochila.` }),
      actions: [{ label: 'Dejarlo' }, { label: 'Guardar', primary: true, onClick: () => game.pickupFurniture(f) }],
    });
  }

  showDecorBar(game) {
    const bar = this.decorBar;
    bar.hidden = false;
    this.btnDecor.classList.add('on');
    clear(bar);
    if (game.decor.item) {
      const gh = game.ghost;
      bar.append(h('p', { text: gh && !gh.ok ? 'Ahí no entra: tocá otro lugar del piso' : `Tocá el piso donde va: ${D.ITEMS[game.decor.item].name}` }),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn ghost', onclick: () => { game.decor.item = null; game.ghost = null; this.showDecorBar(game); } }, 'Otro mueble'),
          h('button', { type: 'button', class: 'btn ghost', onclick: () => game.exitDecor() }, 'Terminar'),
          h('button', { type: 'button', class: 'btn primary grow', disabled: !gh || !gh.ok, onclick: () => game.placeGhost() }, 'Poner acá')));
    } else {
      const furn = Object.keys(S.me.inv).filter(k => D.ITEMS[k]?.cat === 'mueble');
      bar.append(h('p', { text: furn.length ? 'Elegí un mueble para poner, o tocá uno de la casa para guardarlo.' : 'No tenés muebles en la mochila. Tocá uno de la casa para guardarlo, o fabricá más.' }),
        h('div', { class: 'row' },
          h('div', { class: 'row scroll grow' }, furn.map(k => h('button', { type: 'button', class: 'cell', 'aria-label': D.ITEMS[k].name, onclick: () => game.enterDecor(k) }, icon(k), h('span', { class: 'badge', text: S.me.inv[k] })))),
          h('button', { type: 'button', class: 'btn primary', onclick: () => game.exitDecor() }, 'Listo')));
    }
  }
  hideDecorBar() { this.decorBar.hidden = true; this.btnDecor.classList.remove('on'); }

  // ------------------------------------------------------------ pesca
  fishing(res, finish, onBite) {
    const params = fishParams(res.rarity, res.seed);
    const R = D.RARITY[res.rarity];
    const zone = h('div', { class: 'f-zone' });
    const marker = h('div', { class: 'f-marker' }, canvasImg(Sp.icon('sardinita'), 'ico'));
    const track = h('div', { class: 'f-track' }, zone, marker);
    const pips = h('div', { class: 'f-pips' });
    const msg = h('p', { class: 'f-msg', text: 'Esperando que pique…' });
    const title = h('b', { text: `Pescando en ${D.FISH_SPOTS[res.spot].name}` });
    const tapBtn = h('button', { type: 'button', class: 'btn primary big f-tap', text: 'Esperá…' });
    const giveUp = h('button', { type: 'button', class: 'btn ghost', text: 'Soltar' });
    const el = h('div', { class: 'fishing' }, h('div', { class: 'card f-card' }, title, msg, track, pips, h('div', { class: 'row-end' }, giveUp, tapBtn)));
    document.getElementById('modal-root').append(el);
    this.fishEl = el;
    this.game?.input.reset();
    let start = 0, bitten = false, done = false, raf = 0;
    const taps = [];
    const renderPips = (r) => {
      clear(pips);
      for (let i = 0; i < D.FISH_HITS; i++) pips.append(h('i', { class: 'pip ' + (i < r.hits ? 'hit' : '') }));
      pips.append(h('span', { class: 'sep' }));
      for (let i = 0; i < D.FISH_MISSES; i++) pips.append(h('i', { class: 'pip ' + (i < r.misses ? 'miss' : '') }));
    };
    renderPips({ hits: 0, misses: 0 });
    track.hidden = true;
    const end = async () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      tapBtn.disabled = true; giveUp.disabled = true;
      msg.textContent = '…';
      const r = await finish(taps.slice());
      if (r.ok && r.caught) {
        audio.play('catch');
        clear(msg).append(icon(r.fish, 'ico big'), ` ¡Pescaste ${D.ITEMS[r.fish].name}! (${D.RARITY[r.rarity].name})`);
        this.game?.r.addText(S.local.x, S.local.y - 0.4, D.ITEMS[r.fish].name, D.RARITY[r.rarity].color);
      } else {
        audio.play('lost');
        msg.textContent = r.ok ? 'Se escapó… ¡la próxima sale!' : (r.err || 'Se escapó…');
      }
      tapBtn.textContent = 'Seguir';
      tapBtn.disabled = false;
      tapBtn.onclick = () => this.closeFishing();
    };
    const step = () => {
      if (done) return;
      const t = performance.now() - start;
      const pos = markerPos(t, params);
      const r = evalTaps(params, taps);
      const center = params.centers[Math.min(r.hits, params.centers.length - 1)];
      zone.style.left = `${(center - params.zone / 2) * 100}%`;
      zone.style.width = `${params.zone * 100}%`;
      marker.style.left = `${pos * 100}%`;
      if (t > D.FISH_MAX_MS) { end(); return; }
      raf = requestAnimationFrame(step);
    };
    const tap = (e) => {
      e?.preventDefault?.();
      if (done) return;
      if (!bitten) { msg.textContent = '¡Paciencia! Todavía no picó'; audio.play('tick'); return; }
      const t = performance.now() - start;
      taps.push(Math.round(t));
      const r = evalTaps(params, taps);
      audio.play(r.detail[r.detail.length - 1] ? 'good' : 'bad');
      navigator.vibrate?.(r.detail[r.detail.length - 1] ? 25 : 70);
      renderPips(r);
      if (r.success || r.misses >= D.FISH_MISSES) end();
    };
    tapBtn.addEventListener('pointerdown', tap);
    giveUp.onclick = () => end();
    this.fishTimer = setTimeout(() => {
      if (done) return;
      bitten = true;
      onBite?.();
      audio.play('bite');
      navigator.vibrate?.([40, 40, 40]);
      msg.textContent = `¡Pica! Algo ${R.name.toLowerCase()}… Tocá cuando el pez esté en la zona verde (3 aciertos).`;
      marker.firstChild.src = iconURL(D.FISH_BY_RARITY[res.rarity][0]);
      track.hidden = false;
      track.style.setProperty('--rar', R.color);
      tapBtn.textContent = '¡Ahora!';
      start = performance.now();
      this.fishState = { start, params };
      raf = requestAnimationFrame(step);
    }, res.biteMs);
  }
  closeFishing() {
    clearTimeout(this.fishTimer);
    if (this.fishEl) { this.fishEl.remove(); this.fishEl = null; }
    if (this.game) this.game.fishing = null;
  }

  // ------------------------------------------------------------ desafíos
  onChallenge({ prev }) {
    const c = S.challenge;
    this.renderBanner();
    if (!c) { if (this.chInvite) { this.chInvite.close(); this.chInvite = null; } return; }
    const def = D.CHALLENGES[c.type];
    if (c.status === 'proposed' && c.by !== S.you && !this.chInvite) {
      audio.play('love');
      const from = S.players[c.by]?.name || 'Tu pareja';
      this.chInvite = this.modal({
        title: `${from} te desafía`,
        body: h('div', {}, h('div', { class: 'proj-head' }, icon(CH_ICON[c.type], 'ico big'), h('b', { text: `${def.name} · ${mmss(def.durationMs)}` })), h('ul', { class: 'rules' }, def.rules.map(r => h('li', { text: r }))), h('p', { class: 'small', text: `Los dos reciben premio. Quien gana: ${D.HATS[def.hat]}.` })),
        actions: [
          { label: 'Ahora no', onClick: () => this.net.act('ch_answer', { cid: c.id, accept: false }) },
          { label: '¡Acepto!', primary: true, onClick: async () => { const r = await this.net.act('ch_answer', { cid: c.id, accept: true }); if (!r.ok) this.toast(r.err, 'warn'); } },
        ],
        onClose: () => { this.chInvite = null; },
      });
    }
    if (c.status !== 'proposed' && this.chInvite) { this.chInvite.close(); this.chInvite = null; }
    if (c.status === 'countdown' && (!prev || prev.status !== 'countdown')) this.countdown(c);
    if (c.status === 'finished' && prev && prev.status === 'active') this.challengeResult(c);
  }
  countdown(c) {
    const el = h('div', { class: 'countdown' });
    document.body.append(el);
    const tick = () => {
      const left = c.startsAt - this.net.now();
      if (left <= -700 || S.challenge?.id !== c.id) { el.remove(); return; }
      const txt = left > 0 ? String(Math.ceil(left / 1000)) : '¡Ya!';
      if (el.textContent !== txt) { el.textContent = txt; audio.play(left > 0 ? 'tick' : 'fanfare'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
      requestAnimationFrame(tick);
    };
    tick();
  }
  challengeResult(c) {
    const def = D.CHALLENGES[c.type];
    const [a, b] = c.players;
    const val = (pid) => c.type === 'pesca' ? `${c.best?.[pid] ? D.RARITY.find(r => r.points === c.best[pid])?.name || c.best[pid] : 'sin peces'} (${c.sum?.[pid] || 0} pts)` : `${c.scores[pid] || 0}`;
    const won = c.result.winners.includes(S.you);
    const title = c.result.nobody ? 'Terminó el desafío' : c.result.tie ? '¡Empate!' : won ? '¡Ganaste! 🏆' : `¡Ganó ${S.players[c.result.winners[0]]?.name}!`;
    audio.play('fanfare');
    this.modal({
      title,
      body: h('div', {},
        h('p', { class: 'muted', text: def.name }),
        h('div', { class: 'scores' }, [a, b].map(pid => h('div', { class: 'score' + (c.result.winners.includes(pid) && !c.result.tie ? ' win' : '') }, h('b', { text: S.players[pid]?.name || '' }), h('span', { text: val(pid) })))),
        h('p', { text: `Premio para los dos: ${Object.entries(def.reward).map(([k, v]) => `${v} ${D.ITEMS[k].name}`).join(', ')}.` }),
        c.result.winners.length ? h('p', { class: 'small', text: `${c.result.winners.map(k => S.players[k]?.name).join(' y ')} ${c.result.winners.length > 1 ? 'ganan' : 'gana'}: ${D.HATS[def.hat]} (se cambia en “Cambiar mi personaje”).` }) : null),
      actions: [{ label: '¡Buenísimo!', primary: true }],
    });
  }
  renderBanner() {
    const c = S.challenge, b = this.banner;
    if (!c || c.status === 'finished' || c.status === 'proposed' && c.by !== S.you) { b.hidden = true; return; }
    const def = D.CHALLENGES[c.type];
    const now = this.net.now();
    b.hidden = false;
    const o = partnerId();
    const me = S.you;
    const val = (pid) => c.type === 'pesca' ? `${c.best?.[pid] || 0}★` : `${c.scores?.[pid] || 0}`;
    clear(b);
    if (c.status === 'proposed') b.append(h('span', { text: `Esperando respuesta · ${def.name}` }));
    else if (c.status === 'countdown') b.append(h('span', { text: `${def.name} · ¡ya empieza!` }));
    else b.append(icon(CH_ICON[c.type], 'ico sm'), h('b', { text: mmss(c.endsAt - now) }), h('span', { text: ` Vos ${val(me)} · ${S.players[o]?.name || ''} ${val(o)}` }));
    b.onclick = () => this.openMenu('desafios');
  }

  // ------------------------------------------------------------ conexión
  setOffline(status) {
    const el = document.getElementById('offline');
    el.hidden = status === 'online' || !S.ready;
  }
}
