// Pruebas de punta a punta del servidor con dos clientes independientes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { server, Client, place, islandOf, sleep, tmpDir } from './helpers.js';
import { fishParams, markerPos } from '../shared/fishing.js';
import * as D from '../shared/data.js';

let srv;
before(async () => { srv = await server(); });
after(async () => { await srv.stop(); });

async function pair() {
  const a = await new Client(srv.url).create('Lau');
  const code = a.welcome.code;
  const b = new Client(srv.url);
  const w = await b.join(code, 'Sofi');
  assert.equal(w.t, 'welcome');
  return { a, b, code };
}
const obj = (isl, kind, map = 'isla') => Object.values(isl.d.objects).find(o => o.kind === kind && o.map === map && !o.gone);

test('crear isla, unirse con código y el código no sirve para una tercera persona', async () => {
  const { a, b, code } = await pair();
  assert.equal(a.welcome.you, 'p1');
  assert.equal(b.welcome.you, 'p2');
  assert.match(code, /^[A-Z2-9]{8}$/);
  assert.ok(a.token && b.token && a.token !== b.token, 'cada uno tiene su propia llave');
  assert.equal(b.welcome.code, null, 'la isla llena ya no muestra código');
  await a.waitFor(m => m.t === 'pl' && m.p.id === 'p2' && m.p.online, 2000, 'que A vea a B');
  const c = new Client(srv.url);
  const res = await c.join(code, 'Intruso');
  assert.equal(res.t, 'autherr');
  assert.equal(res.code, 'bad_code');
  const isl = islandOf(srv, a);
  assert.deepEqual(Object.keys(isl.d.players).sort(), ['p1', 'p2']);
  for (const x of [a, b, c]) await x.close();
});

test('cada jugador conserva su identidad al volver con su llave; una llave falsa no entra', async () => {
  const { a, b } = await pair();
  const tokA = a.token, tokB = b.token;
  await a.close(); await b.close();
  const a2 = new Client(srv.url); const wa = await a2.hello(tokA);
  const b2 = new Client(srv.url); const wb = await b2.hello(tokB);
  assert.equal(wa.you, 'p1'); assert.equal(wb.you, 'p2');
  assert.equal(wa.players.p1.name, 'Lau'); assert.equal(wb.players.p2.name, 'Sofi');
  const bad = new Client(srv.url);
  const r = await bad.hello('x'.repeat(43));
  assert.equal(r.t, 'autherr');
  for (const x of [a2, b2, bad]) await x.close();
});

test('los movimientos se ven en tiempo real y el servidor rechaza teletransportes y paredes', async () => {
  const { a, b } = await pair();
  place(srv, a, 17.5, 21.5);
  a.send({ t: 'mv', map: 'isla', x: 17.8, y: 21.5, dir: 'right', mv: 1 });
  const pm = await b.next(m => m.t === 'pm' && m.p === 'p1', 2000, 'movimiento de A');
  assert.equal(pm.x, 17.8);
  // teletransporte
  await sleep(60);
  a.send({ t: 'mv', map: 'isla', x: 30, y: 5, dir: 'right', mv: 1 });
  const corr = await a.next(m => m.t === 'pos', 2000, 'corrección');
  assert.ok(Math.abs(corr.x - 17.8) < 0.01);
  // al agua no
  place(srv, a, 17.5, 27.5);
  await sleep(150);
  a.send({ t: 'mv', map: 'isla', x: 16.6, y: 28.6, dir: 'down', mv: 1 });
  await a.next(m => m.t === 'pos', 2000, 'corrección por agua');
  await a.close(); await b.close();
});

test('acciones simultáneas sobre la misma flor: solo una persona la recibe', async () => {
  const { a, b } = await pair();
  const isl = islandOf(srv, a);
  const f = obj(isl, 'flor_rosa');
  place(srv, a, f.x + 0.5, f.y + 1.6);
  place(srv, b, f.x + 0.5, f.y - 0.1);
  const [ra, rb] = await Promise.all([a.act('gather', { o: f.id }), b.act('gather', { o: f.id })]);
  const oks = [ra, rb].filter(r => r.ok);
  assert.equal(oks.length, 1, 'exactamente una recolección');
  assert.equal(oks[0].got.flor_rosa, 1);
  const total = (isl.d.players.p1.inv.flor_rosa || 0) + (isl.d.players.p2.inv.flor_rosa || 0);
  assert.equal(total, 1, 'no se duplicó la flor');
  assert.ok(isl.d.objects[f.id].gone && isl.d.objects[f.id].respawnAt > Date.now());
  await a.close(); await b.close();
});

test('reintentar la misma acción (mismo id) no duplica el efecto', async () => {
  const { a, b } = await pair();
  const isl = islandOf(srv, a);
  const p1 = isl.d.players.p1;
  Object.assign(p1.inv, D.RECIPE_BY_ID.hacha.in);
  const r1 = await a.act('craft', { r: 'hacha' }, 'reintento-1');
  const r2 = await a.act('craft', { r: 'hacha' }, 'reintento-1');
  assert.ok(r1.ok); assert.deepEqual(r1, r2);
  assert.equal(p1.inv.hacha, 1);
  assert.equal(p1.inv.ramita, undefined);
  await a.close(); await b.close();
});

test('árbol compartido: los golpes de los dos suman y el último recibe la madera', async () => {
  const { a, b } = await pair();
  const isl = islandOf(srv, a);
  isl.d.players.p1.inv.hacha = 1; isl.d.players.p2.inv.hacha = 1;
  const t = obj(isl, 'arbol');
  place(srv, a, t.x - 0.4, t.y + 0.9); place(srv, b, t.x + 1.4, t.y + 0.9);
  assert.equal((await a.act('gather', { o: t.id })).hit, 1);
  assert.equal((await b.act('gather', { o: t.id })).hit, 2);
  const last = await a.act('gather', { o: t.id });
  assert.ok(last.got.madera >= 2);
  const again = await b.act('gather', { o: t.id });
  assert.equal(again.ok, false);
  await a.close(); await b.close();
});

test('huerta: preparar, plantar, regar, crecer y cosechar (y los cultivos no mueren)', async () => {
  const { a, b } = await pair();
  const isl = islandOf(srv, a);
  place(srv, a, 23.5, 11.7, 'isla', 'up');
  assert.ok((await a.act('till', { x: 23, y: 10 })).ok);
  assert.equal((await a.act('till', { x: 23, y: 10 })).ok, false);
  assert.equal((await a.act('till', { x: 5, y: 20 })).ok, false, 'fuera de la huerta no');
  assert.ok((await a.act('plant', { x: 23, y: 10, seed: 'sem_rabanito' })).ok);
  const water = await b.act('water', { x: 23, y: 10 });
  assert.equal(water.ok, false, 'B está lejos');
  place(srv, b, 23.5, 11.7);
  assert.ok((await b.act('water', { x: 23, y: 10 })).ok, 'B también puede regar');
  assert.equal((await a.act('water', { x: 23, y: 10 })).ok, false, 'no se riega dos veces');
  const s = isl.d.soil['23,10'];
  // pasa mucho tiempo sin entrar: el cultivo solo espera
  s.crop.readyAt = Date.now() - 1; isl.slowTick(Date.now());
  assert.equal(s.crop.step, 1); assert.equal(s.crop.watered, false);
  isl.slowTick(Date.now() + 10 * 24 * 3600_000);
  assert.equal(s.crop.step, 1, 'sin riego no avanza, pero tampoco muere');
  await a.act('water', { x: 23, y: 10 });
  s.crop.readyAt = Date.now() - 1; isl.slowTick(Date.now());
  assert.equal(s.crop.step, 2);
  const h = await b.act('harvest', { x: 23, y: 10 });
  assert.ok(h.ok && h.got.rabanito >= 1);
  assert.equal((await a.act('harvest', { x: 23, y: 10 })).ok, false, 'no se cosecha dos veces');
  await a.close(); await b.close();
});

test('buzón: regalo con nota para alguien desconectado, se recibe una sola vez', async () => {
  const { a, b, } = await pair();
  const isl = islandOf(srv, a);
  const tokB = b.token;
  await b.close();
  isl.d.players.p1.inv.frutilla = 5;
  place(srv, a, 20.5, 8.8);
  const r = await a.act('mail_send', { item: 'frutilla', qty: 3, note: 'Para vos 💛 <script>alert(1)</script>' });
  assert.ok(r.ok);
  assert.equal(isl.d.players.p1.inv.frutilla, 2);
  const tooMany = await a.act('mail_send', { item: 'frutilla', qty: 9, note: '' });
  assert.equal(tooMany.ok, false);
  const tool = await a.act('mail_send', { item: 'azada', qty: 1 });
  assert.equal(tool.ok, false, 'las herramientas no se regalan');
  const b2 = new Client(srv.url);
  const w = await b2.hello(tokB);
  const mail = w.mail.find(m => m.to === 'p2');
  assert.ok(mail && !mail.claimed && mail.note.includes('Para vos'));
  await b2.waitFor(m => m.t === 'toast' && /buzón/.test(m.msg), 2000, 'aviso de regalo');
  place(srv, b2, 20.5, 8.8);
  const before = isl.d.players.p2.inv.frutilla || 0;
  const [c1, c2] = await Promise.all([b2.act('mail_claim', { m: mail.id }), b2.act('mail_claim', { m: mail.id })]);
  assert.equal([c1, c2].filter(x => x.ok).length, 1, 'el regalo se abre una sola vez');
  assert.equal(isl.d.players.p2.inv.frutilla, before + 3);
  const steal = await a.act('mail_claim', { m: mail.id });
  assert.equal(steal.ok, false, 'no se puede abrir el regalo del otro');
  await a.close(); await b2.close();
});

test('reconexión: el otro ve la desconexión y al volver sigue todo igual; una segunda sesión reemplaza a la vieja', async () => {
  const { a, b } = await pair();
  const isl = islandOf(srv, a);
  isl.d.players.p1.inv.madera = 7;
  place(srv, a, 12.3, 18.4);
  const tok = a.token;
  await a.close();
  await b.waitFor(m => m.t === 'pl' && m.p.id === 'p1' && !m.p.online, 2000, 'A desconectado');
  const a2 = new Client(srv.url);
  const w = await a2.hello(tok);
  assert.equal(w.me.inv.madera, 7);
  assert.equal(w.me.x, 12.3); assert.equal(w.me.y, 18.4);
  const a3 = new Client(srv.url);
  await a3.hello(tok);
  await a2.waitFor(m => m.t === 'kicked', 2000, 'aviso a la sesión vieja');
  assert.ok(isl.online.has('p1'));
  await a2.close(); await a3.close(); await b.close();
});

test('proyecto compartido: entre los dos reparan el puente y se puede cruzar', async () => {
  const { a, b } = await pair();
  const isl = islandOf(srv, a);
  isl.d.players.p1.inv.madera = 12; isl.d.players.p1.inv.piedra = 12;
  isl.d.players.p2.inv.madera = 30; isl.d.players.p2.inv.fibra = 8;
  const r1 = await a.act('contribute', { pj: 'puente' });
  assert.ok(r1.ok && !r1.complete);
  const r2 = await b.act('contribute', { pj: 'puente' });
  assert.ok(r2.ok && r2.complete);
  assert.equal(isl.d.bridge, true);
  assert.equal(isl.d.players.p2.inv.madera, 22, 'solo se toma lo que faltaba');
  assert.deepEqual(isl.d.projects.puente.contrib.p1, { madera: 12, piedra: 12 });
  const r3 = await a.act('contribute', { pj: 'puente' });
  assert.equal(r3.ok, false);
  // cruzar el puente
  place(srv, a, 29.5, 6.8, 'isla', 'right');
  a.send({ t: 'mv', map: 'isla', x: 30.1, y: 6.8, dir: 'right', mv: 1 });
  await sleep(120);
  a.send({ t: 'mv', map: 'isla', x: 30.6, y: 6.8, dir: 'right', mv: 1 });
  await b.next(m => m.t === 'pm' && m.p === 'p1' && m.x === 30.6, 2000, 'cruce del puente');
  await a.close(); await b.close();
});

test('casa: muebles en posiciones válidas, sin bloquear la puerta, y vuelven a su dueño', async () => {
  const { a, b } = await pair();
  const isl = islandOf(srv, a);
  isl.d.players.p1.inv.mesa = 1; isl.d.players.p1.inv.silla = 2; isl.d.players.p1.inv.cuadro = 1;
  place(srv, a, 4.5, 9.6, 'casa');
  place(srv, b, 8.5, 9.6, 'casa');
  assert.equal((await a.act('place', { item: 'mesa', x: 0, y: 5 })).ok, false, 'pared');
  assert.equal((await a.act('place', { item: 'silla', x: 6, y: 9 })).ok, false, 'frente a la puerta');
  assert.equal((await a.act('place', { item: 'silla', x: 8, y: 9 })).ok, false, 'hay alguien parado');
  const ok = await a.act('place', { item: 'mesa', x: 4, y: 6 });
  assert.ok(ok.ok);
  assert.equal((await a.act('place', { item: 'silla', x: 5, y: 6 })).ok, false, 'superpuesto');
  assert.ok((await a.act('place', { item: 'cuadro', x: 5, y: 4 })).ok, 'cuadro en la pared');
  assert.equal((await a.act('place', { item: 'silla', x: 5, y: 4 })).ok, false, 'silla en la pared no');
  // B guarda la mesa: vuelve a la mochila de A (no se la "roba")
  const pk = await b.act('pickup', { f: ok.f });
  assert.ok(pk.ok && pk.owner === 'p1');
  assert.equal(isl.d.players.p1.inv.mesa, 1);
  assert.equal(isl.d.players.p2.inv.mesa, undefined);
  await a.close(); await b.close();
});

test('pesca: el servidor valida los toques y entrega el pez una sola vez', async () => {
  const { a, b } = await pair();
  const isl = islandOf(srv, a);
  isl.d.players.p1.inv.cana = 1;
  place(srv, a, 17.5, 28.8, 'isla', 'down'); // punta del muelle
  const st = await a.act('fish_start', { x: 17, y: 29 });
  assert.ok(st.ok, st.err);
  assert.equal(st.spot, 'muelle');
  const p = fishParams(st.rarity, st.seed);
  const taps = [];
  let t = 50;
  for (let k = 0; k < 3; k++) {
    while (Math.abs(markerPos(t, p) - p.centers[k]) > p.zone * 0.2) t += 3;
    taps.push(t); t += 60;
  }
  // esperar como un jugador real
  await sleep(st.biteMs + taps[2] - 1200);
  const before = Object.values(isl.d.players.p1.inv).reduce((s, v) => s + v, 0);
  const end = await a.act('fish_end', { sid: st.sid, taps });
  assert.ok(end.ok && end.caught, JSON.stringify(end));
  const again = await a.act('fish_end', { sid: st.sid, taps });
  assert.equal(again.ok, false, 'no se cobra dos veces el mismo pique');
  const after = Object.values(isl.d.players.p1.inv).reduce((s, v) => s + v, 0);
  assert.equal(after, before + 1);
  // toques "del futuro" (antes de que pase el tiempo real) no valen
  const st2 = await a.act('fish_start', { x: 17, y: 29 });
  const cheat = await a.act('fish_end', { sid: st2.sid, taps: [9000, 9100, 9200] });
  assert.equal(cheat.ok, false);
  await a.close(); await b.close();
});

test('cueva: entrar, pelear, desmayarse sin perder nada y volver a casa', async () => {
  const { a, b } = await pair();
  const isl = islandOf(srv, a);
  isl.d.players.p1.inv.espada = 1; isl.d.players.p1.inv.cobre = 4;
  place(srv, a, 7.5, 4.6, 'isla', 'up');
  const w = await a.act('warp', { w: 'cueva_entrar' });
  assert.ok(w.ok);
  assert.equal(isl.d.players.p1.map, 'cueva');
  await a.waitFor(m => m.t === 'en', 2000, 'criaturas');
  // pelear con una criatura
  const e = isl.enemies.find(x => x.kind === 'musguito');
  e.x = 14; e.y = 16.5; e.stunUntil = Date.now() + 5000;
  place(srv, a, 14, 17.6, 'cueva', 'up');
  let killed = false;
  for (let i = 0; i < 4 && !killed; i++) {
    Object.assign(e, { x: 14, y: 16.5, vx: 0, vy: 0 });
    await a.act('attack', { dir: 'up' }); await sleep(360); killed = !e.alive;
  }
  assert.ok(killed, 'la criatura se fue');
  // desmayo: vida 1 y una criatura encima
  const p1 = isl.d.players.p1;
  p1.hp = 1;
  const e2 = isl.enemies.find(x => x.kind === 'polillin');
  place(srv, a, 4.5, 11.9, 'cueva');
  Object.assign(e2, { x: 4.5, y: 11.6, alive: true, stunUntil: 0, retreatUntil: 0 });
  await a.waitFor(m => m.t === 'toast' && /desmayaste/.test(m.msg), 3000, 'desmayo');
  assert.equal(p1.map, 'isla');
  assert.equal(p1.hp, D.MAX_HP);
  assert.equal(p1.inv.cobre, 4, 'el inventario sigue intacto');
  assert.equal(p1.inv.espada, 1);
  await a.close(); await b.close();
});

test('carpincho compartido: nombre, mimos y comida', async () => {
  const { a, b } = await pair();
  const isl = islandOf(srv, a);
  const pet = isl.d.pet;
  isl.pet.next = Date.now() + 60_000; isl.pet.tx = pet.x; isl.pet.ty = pet.y; // quieto para la prueba
  place(srv, a, pet.x, pet.y + 0.6); place(srv, b, pet.x + 0.4, pet.y + 0.6);
  const no = await a.act('pet', {});
  assert.equal(no.code, 'needs_name');
  assert.ok((await b.act('pet_name', { name: '  Panchito\u0007 ' })).ok);
  assert.equal(pet.name, 'Panchito');
  isl.d.players.p1.inv.frutilla = 2;
  const fed = await a.act('feed', { item: 'frutilla' });
  assert.ok(fed.ok && fed.hungry);
  const pet1 = await a.act('pet', {});
  assert.ok(pet1.ok);
  await sleep(2100);
  const pet2 = await b.act('pet', {});
  assert.ok(pet2.ok && pet2.both, 'mimos de los dos');
  assert.ok(pet.affection >= 8 + 3 + 7);
  await a.close(); await b.close();
});

test('desafío de minería: solo con los dos conectados, premio para ambos y reconocimiento al ganador, una sola vez', async () => {
  const { a, b } = await pair();
  const isl = islandOf(srv, a);
  const tokB = b.token;
  await b.close();
  const solo = await a.act('ch_propose', { type: 'mineria' });
  assert.equal(solo.ok, false, 'sin la otra persona no se puede');
  const b2 = new Client(srv.url); await b2.hello(tokB);
  const pr = await a.act('ch_propose', { type: 'mineria' });
  assert.ok(pr.ok);
  await b2.waitFor(m => m.t === 'chal' && m.challenge && m.challenge.status === 'proposed', 2000, 'propuesta');
  const self = await a.act('ch_answer', { cid: pr.cid, accept: true });
  assert.equal(self.ok, false, 'no se acepta el propio desafío');
  assert.ok((await b2.act('ch_answer', { cid: pr.cid, accept: true })).ok);
  const c = isl.d.challenge;
  assert.equal(c.status, 'countdown');
  c.startsAt = Date.now() - 1; isl.slowTick(Date.now());
  assert.equal(c.status, 'active');
  // A pica una roca, B no
  isl.d.players.p1.inv.pico = 1;
  const roca = obj(isl, 'roca');
  place(srv, a, roca.x + 0.5, roca.y + 1.6, 'isla', 'up');
  await a.act('gather', { o: roca.id }); const g2 = await a.act('gather', { o: roca.id });
  assert.ok(g2.got.piedra >= 2);
  assert.ok(isl.d.objects[roca.id].respawnAt - Date.now() < 20_000, 'durante el desafío las rocas vuelven rápido');
  const piedraB = isl.d.players.p2.inv.piedra || 0;
  c.endsAt = Date.now() - 1;
  isl.slowTick(Date.now());
  isl.slowTick(Date.now()); // un segundo tick no paga de nuevo
  isl.finishChallenge(Date.now());
  assert.equal(c.status, 'finished');
  assert.deepEqual(c.result.winners, ['p1']);
  assert.equal(isl.d.players.p1.wins.mineria, 1);
  assert.ok(isl.d.players.p1.cosmetics.includes('casco_minero'));
  assert.equal(isl.d.players.p1.look.hat, 'casco_minero');
  assert.equal((isl.d.players.p2.inv.piedra || 0), piedraB + D.CHALLENGES.mineria.reward.piedra, 'B también recibe premio, una sola vez');
  assert.equal(isl.d.players.p2.inv.cobre, D.CHALLENGES.mineria.reward.cobre);
  await a.waitFor(m => m.t === 'chal' && m.challenge && m.challenge.status === 'finished', 2000, 'resultado');
  await a.close(); await b2.close();
});

test('desafío de cosecha: cada uno cosecha lo suyo y crece más rápido', async () => {
  const { a, b } = await pair();
  const isl = islandOf(srv, a);
  place(srv, a, 24.5, 11.7, 'isla', 'up'); place(srv, b, 25.5, 11.7, 'isla', 'up');
  await a.act('till', { x: 24, y: 10 }); await a.act('plant', { x: 24, y: 10, seed: 'sem_rabanito' });
  const pr = await a.act('ch_propose', { type: 'cosecha' });
  await b.act('ch_answer', { cid: pr.cid, accept: true });
  const c = isl.d.challenge;
  c.startsAt = Date.now() - 1; isl.slowTick(Date.now());
  const crop = isl.d.soil['24,10'].crop;
  assert.ok(crop.watered, 'lluvia mágica: se riega solo');
  assert.ok(crop.readyAt - Date.now() <= D.CROPS.rabanito.stepMs / 4 + 50);
  crop.step = 2; crop.watered = false;
  const steal = await b.act('harvest', { x: 24, y: 10 });
  assert.equal(steal.ok, false, 'no se cosecha lo del otro durante el desafío');
  const mine = await a.act('harvest', { x: 24, y: 10 });
  assert.ok(mine.ok);
  assert.ok(c.scores.p1 >= 1);
  c.endsAt = Date.now() - 1; isl.slowTick(Date.now());
  assert.deepEqual(c.result.winners, ['p1']);
  assert.ok(isl.d.players.p1.cosmetics.includes('corona_flores'));
  await a.close(); await b.close();
});

test('guardado: todo sobrevive a un reinicio del servidor', async () => {
  const dir = tmpDir('rinconcito-guardado');
  let s1 = await server(dir);
  const a = await new Client(s1.url).create('Lau');
  const b = new Client(s1.url); await b.join(a.welcome.code, 'Sofi');
  const isl = s1.hub.islands.get(a.welcome.islandId);
  isl.d.players.p1.inv.mesa = 1; isl.d.players.p2.inv.perla = 3;
  place(s1, a, 6.5, 9.6, 'casa');
  await a.act('place', { item: 'mesa', x: 7, y: 6 });
  place(s1, a, 22.5, 11.7, 'isla', 'up');
  await a.act('till', { x: 22, y: 10 });
  await a.act('plant', { x: 22, y: 10, seed: 'sem_frutilla' });
  const tokA = a.token, tokB = b.token;
  await a.close(); await b.close();
  await s1.stop();
  const s2 = await server(dir);
  const a2 = new Client(s2.url); const wa = await a2.hello(tokA);
  const b2 = new Client(s2.url); const wb = await b2.hello(tokB);
  assert.equal(wa.you, 'p1'); assert.equal(wb.you, 'p2');
  assert.equal(wb.me.inv.perla, 3);
  assert.ok(wa.furniture.some(f => f.item === 'mesa' && f.x === 7 && f.y === 6));
  assert.equal(wa.soil['22,10'].crop.type, 'frutilla');
  assert.equal(wa.me.inv.sem_frutilla, D.START_ITEMS.sem_frutilla - 1);
  await a2.close(); await b2.close();
  await s2.stop();
});

test('cofres por persona, comida, cama, gestos y sombreros solo si se ganaron', async () => {
  const { a, b } = await pair();
  const isl = islandOf(srv, a);
  const chest = Object.values(isl.d.objects).find(o => o.kind === 'cofre');
  place(srv, a, chest.x + 0.5, chest.y + 1.7, 'cueva', 'up');
  place(srv, b, chest.x + 0.5, chest.y - 0.05, 'cueva', 'down');
  const [ca, cb] = await Promise.all([a.act('chest', { o: chest.id }), b.act('chest', { o: chest.id })]);
  assert.ok(ca.ok && cb.ok, 'cada uno abre su propio cofre: nadie le quita el tesoro al otro');
  assert.equal((await a.act('chest', { o: chest.id })).ok, false, 'después hay que esperar a que se vuelva a llenar');
  // comida
  const p1 = isl.d.players.p1;
  p1.hp = 4; p1.inv.sopa_calabaza = 1;
  assert.ok((await a.act('eat', { item: 'sopa_calabaza' })).ok);
  assert.equal(p1.hp, 10);
  assert.equal((await a.act('eat', { item: 'madera' })).ok, false);
  // cama
  p1.inv.cama = 1;
  place(srv, a, 6.5, 9.6, 'casa');
  const bed = await a.act('place', { item: 'cama', x: 3, y: 5 });
  assert.ok(bed.ok, bed.err);
  p1.hp = 2;
  place(srv, a, 4, 7.6, 'casa', 'up');
  assert.ok((await a.act('rest', { f: bed.f })).ok);
  assert.equal(p1.hp, 10);
  // gestos
  const em = b.next(m => m.t === 'emote' && m.p === 'p1', 2000, 'gesto');
  await a.act('emote', { e: 'corazon' });
  assert.equal((await em).e, 'corazon');
  // sombreros: no se puede usar uno que no se ganó
  await a.act('look', { name: 'Lau', look: { hat: 'corona_flores', hair: 2 } });
  assert.equal(p1.look.hat, null);
  assert.equal(p1.look.hair, 2);
  p1.cosmetics.push('corona_flores');
  await a.act('look', { name: 'Lau 🌸', look: { hat: 'corona_flores' } });
  assert.equal(p1.look.hat, 'corona_flores');
  assert.equal(p1.name, 'Lau 🌸');
  // herramientas únicas
  p1.inv.ramita = 10; p1.inv.piedra = 10;
  assert.ok((await a.act('craft', { r: 'hacha' })).ok);
  assert.equal((await a.act('craft', { r: 'hacha' })).ok, false, 'no se fabrica dos veces la misma herramienta');
  await a.close(); await b.close();
});
