// Arranque: pantalla de inicio, crear / unirse / volver, y conexión del juego.
import { Net } from './net.js';
import { S, handlers, on } from './state.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { audio } from './audio.js';
import { characterEditor } from './creator.js';
import { h, clear } from './dom.js';
import * as Sp from './sprites.js';
import { initialObjects } from '../shared/maps.js';

const TOKEN_KEY = 'rinconcito.token';
const $ = (id) => document.getElementById(id);

const net = new Net();
handlers(net);
const renderer = new Renderer($('world'));
const input = new Input($('touch'), $('stick'), $('knob'));
const ui = new UI(net);
const game = new Game(net, renderer, input, ui);
ui.setGame(game);
window.__rinconcito = { S, net, game }; // útil para depurar y para las pruebas automáticas
try { const hh = localStorage.getItem('rinconcito.hora'); if (hh !== null && hh !== '') window.__debugHora = Number(hh); } catch { /* */ }

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 200));
document.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
document.addEventListener('keydown', () => audio.unlock(), { capture: true });
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__installPrompt = e; });
if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {
  navigator.serviceWorker?.register('sw.js').catch(() => {});
}
// evitar el zoom con doble toque / gestos en iOS
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// ---------------------------------------------------------------- conexión
net.onStatus = (s) => {
  ui.setOffline(s);
  const lc = document.querySelector('.loading p');
  if (lc && !S.ready && s === 'offline') {
    lc.textContent = 'No hay conexión con el servidor. Sigo intentando…';
    if (!document.querySelector('.loading .btn')) lc.after(h('button', { type: 'button', class: 'btn ghost', onclick: () => { net.stop(); showTitle(); } }, 'Volver al inicio'));
  }
  const el = $('offline');
  if (!el.hidden) {
    $('offline-msg').textContent = s === 'connecting' ? 'Conectando con la isla…' : 'Se perdió la conexión. Reconectando…';
  }
};
net.on('token', (m) => { try { localStorage.setItem(TOKEN_KEY, m.token); } catch { /* */ } });
net.on('welcome', () => {
  if (location.search.includes('codigo=')) history.replaceState(null, '', location.pathname);
  clear($('screens'));
  $('hud').hidden = false;
  $('touch').hidden = false;
  game.start();
  ui.setOffline('online');
  renderer.resize();
  maybeTutorial();
});
net.on('autherr', (m) => {
  showTitle(m.err, m.code === 'bad_token');
});
net.on('kicked', (m) => {
  const el = h('div', { class: 'screen center' }, h('div', { class: 'card' }, h('h2', { text: 'En pausa' }), h('p', { text: m.msg }),
    h('button', { type: 'button', class: 'btn primary big', onclick: () => { el.remove(); net.reconnectNow(); } }, 'Jugar acá')));
  $('screens').append(el);
});
$('offline-retry').addEventListener('click', () => net.reconnectNow());

// ---------------------------------------------------------------- pantalla de inicio
function titleScene() {
  const c = h('canvas', { class: 'title-scene', width: 288, height: 176 });
  const g = c.getContext('2d');
  const layer = renderer.buildLayer('isla', 0);
  const ox = 9 * 16, oy = 2 * 16;
  g.drawImage(layer, ox, oy, 288, 176, 0, 0, 288, 176);
  const objs = initialObjects().filter(o => o.map === 'isla' && o.x >= 8 && o.x <= 27 && o.y >= 1 && o.y <= 14).sort((a, b) => a.y - b.y);
  const draw = (o) => {
    const x = o.x * 16 - ox, y = o.y * 16 - oy;
    if (o.kind === 'arbol') g.drawImage(Sp.tree(false), x - 8, y - 18);
    else if (o.kind.startsWith('roca')) g.drawImage(Sp.rock(o.kind), x, y - 1);
    else if (o.kind.startsWith('flor')) g.drawImage(Sp.flower(o.kind), x, y - 2);
    else if (o.kind === 'pasto') g.drawImage(Sp.tallGrass(), x, y - 1);
    else if (o.kind === 'arbusto') g.drawImage(Sp.bush(false), x, y - 1);
    else if (o.kind === 'farola') g.drawImage(Sp.lampPost(), x, y - 12);
    else if (o.kind === 'buzon') g.drawImage(Sp.mailbox(true), x, y - 8);
    else if (o.kind === 'tablon') g.drawImage(Sp.board(), x, y - 8);
    else if (o.kind === 'canasta') g.drawImage(Sp.petBed(), x, y);
    else if (o.kind === 'cerca') g.drawImage(Sp.fence({ l: o.y === 9 || o.y === 16, r: o.y === 9 || o.y === 16, u: o.x === 21 || o.x === 28, d: o.x === 21 || o.x === 28 }), x, y - 2);
  };
  objs.filter(o => o.y < 8).forEach(draw);
  g.drawImage(Sp.houseExterior(1), 15 * 16 - 4 - ox, 4 * 16 - 16 - oy);
  objs.filter(o => o.y >= 8).forEach(draw);
  g.drawImage(Sp.character({ skin: 1, hair: 1, hairColor: 4, shirt: 0, pants: 7 }, 'right', 0), 16 * 16 - ox, 9 * 16 - 19 - oy + 8);
  g.drawImage(Sp.character({ skin: 2, hair: 0, hairColor: 0, shirt: 3, pants: 5 }, 'left', 0), 17 * 16 + 4 - ox, 9 * 16 - 19 - oy + 8);
  g.drawImage(Sp.carpincho('down', 0), 13 * 16 - ox, 11 * 16 - 15 - oy);
  g.drawImage(Sp.emote('corazon'), 16 * 16 + 9 - ox, 9 * 16 - 38 - oy + 8);
  return c;
}

function showTitle(error = null, badToken = false) {
  $('hud').hidden = true;
  $('touch').hidden = true;
  const screens = clear($('screens'));
  const params = new URLSearchParams(location.search);
  const invited = params.get('codigo');
  const token = localStorage.getItem(TOKEN_KEY);
  const err = h('p', { class: 'form-err', role: 'alert', text: error || '' });
  const buttons = [];
  if (token && !badToken) buttons.push(h('button', { type: 'button', class: 'btn primary big', onclick: () => connect({ t: 'hello', token }) }, 'Volver a nuestra isla'));
  if (invited && !token) buttons.push(h('button', { type: 'button', class: 'btn primary big', onclick: () => joinFlow(invited) }, 'Unirme a la isla 💛'));
  buttons.push(
    h('button', { type: 'button', class: 'btn ' + (token || invited ? '' : 'primary') + ' big', onclick: () => createFlow() }, 'Crear nuestra isla'),
    h('button', { type: 'button', class: 'btn big', onclick: () => joinFlow(invited || '') }, 'Tengo un código'),
    h('button', { type: 'button', class: 'btn ghost', onclick: () => keyFlow() }, 'Entrar con mi llave'),
  );
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone && !token) buttons.push(h('p', { class: 'hint', text: '¿Ya jugabas desde el navegador? En iPhone la app instalada no ve esos datos: copiá tu llave allá (Menú → Isla → Tu llave personal) y tocá “Entrar con mi llave”.' }));
  if (badToken && token) buttons.push(h('button', { type: 'button', class: 'btn ghost', onclick: () => { localStorage.removeItem(TOKEN_KEY); showTitle(); } }, 'Olvidar la llave guardada'));
  screens.append(h('div', { class: 'screen title' },
    h('div', { class: 'title-art' }, titleScene()),
    h('div', { class: 'card title-card' },
      h('h1', { class: 'logo' }, h('span', { text: 'Nuestro' }), h('span', { class: 'logo-big', text: 'rinconcito' })),
      h('p', { class: 'muted', text: invited && !token ? 'Te invitaron a una isla para construir juntos.' : 'Una islita para cultivar, pescar, decorar y explorar de a dos.' }),
      err,
      h('div', { class: 'stack' }, buttons),
      h('p', { class: 'small muted', text: 'Necesita internet: la isla vive en el servidor y se sincroniza en tiempo real.' }),
    ),
  ));
}

async function guardExisting() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return true;
  return ui.confirm('Ya tenés una isla en este celular', 'Si seguís, este dispositivo va a usar la nueva. Antes copiá tu llave personal (Menú → Isla) si querés volver a la anterior.', 'Seguir');
}

async function createFlow() {
  if (!(await guardExisting())) return;
  clear($('screens'));
  const res = await characterEditor({ title: '¿Quién sos?', subtitle: 'Armá tu personaje. Después vas a poder cambiarlo.', submitLabel: 'Crear la isla' });
  if (!res) return showTitle();
  connect({ t: 'create', profile: { name: res.name, look: res.look } }, true);
}

async function joinFlow(code) {
  if (!(await guardExisting())) return;
  clear($('screens'));
  const inp = h('input', { class: 'text-in code-in', type: 'text', maxlength: '9', placeholder: 'ABCD-EFGH', autocomplete: 'off', autocapitalize: 'characters', value: code || '' });
  const extra = h('div', { class: 'field' }, h('span', { class: 'label', text: 'Código de la isla' }), inp);
  extra.getValue = () => inp.value;
  const res = await characterEditor({ title: 'Unirme a una isla', subtitle: 'Poné el código que te pasaron y armá tu personaje.', submitLabel: 'Entrar a la isla', extra });
  if (!res) return showTitle();
  const c = (res.extra || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (c.length < 8) return showTitle('El código tiene 8 letras y números. Revisalo y probá de nuevo.');
  connect({ t: 'join', code: c, profile: { name: res.name, look: res.look } });
}

function keyFlow() {
  const ta = h('textarea', { class: 'text-in', rows: '3', placeholder: 'Pegá acá tu llave personal', autocomplete: 'off', spellcheck: 'false' });
  ui.modal({
    title: 'Entrar con mi llave',
    body: h('div', {}, h('p', { class: 'muted', text: 'La llave está en Menú → Isla → Tu llave personal (en el otro celular o navegador).' }), ta),
    actions: [{ label: 'Cancelar' }, { label: 'Entrar', primary: true, onClick: () => {
      const t = ta.value.trim();
      if (t.length < 20) { ui.toast('Esa llave parece incompleta', 'warn'); return true; }
      localStorage.setItem(TOKEN_KEY, t);
      connect({ t: 'hello', token: t });
    } }],
  });
  setTimeout(() => ta.focus(), 50);
}

function connect(auth, isNew = false) {
  window.__isNewIsland = isNew;
  clear($('screens')).append(h('div', { class: 'screen center' }, h('div', { class: 'card loading' }, h('div', { class: 'spinner' }), h('p', { text: 'Entrando a la isla…' }))));
  net.connect(auth);
}

function maybeTutorial() {
  const seen = localStorage.getItem('rinconcito.tutorial');
  if (window.__isNewIsland && S.code) {
    window.__isNewIsland = false;
    setTimeout(() => ui.openMenu('isla'), 400);
  }
  if (seen) return;
  localStorage.setItem('rinconcito.tutorial', '1');
  const li = (t) => h('li', { text: t });
  ui.modal({
    title: '¡Bienvenida/o a la isla!',
    body: h('ul', { class: 'rules' },
      li('Apoyá el dedo en la mitad izquierda de la pantalla para caminar.'),
      li('El botón grande hace lo que tenga sentido: talar, picar, regar, cosechar, pescar, abrir…'),
      li('Primero juntá ramitas (arbustos) y piedras para fabricar un hacha y un pico.'),
      li('La huerta está al este de la casa. Preparala con la azada, plantá y regá.'),
      li('El buzón (al lado de la casa) sirve para dejarse regalos y cartitas.'),
      li('Nada se pierde si no entran por días: los cultivos esperan tranquilos.')),
    actions: [{ label: '¡Vamos!', primary: true }],
  });
}

// ---------------------------------------------------------------- arranque
const saved = localStorage.getItem(TOKEN_KEY);
if (saved) connect({ t: 'hello', token: saved });
else showTitle();
on('welcome', () => { document.title = 'Nuestro rinconcito'; });
