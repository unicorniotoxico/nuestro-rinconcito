// Prueba de punta a punta con DOS navegadores independientes (emulando un
// iPhone y un Android) contra el servidor real. Recorre todas las funciones
// usando la interfaz como lo haría una persona y guarda capturas.
//
// Uso:  npm run test:e2e            (necesita: npm i -D playwright && npx playwright install chromium)
//       SHOTS=./capturas npm run test:e2e
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startServer } from '../../server/index.js';
import { installHelpers, walk, target, inv, act, face, ev, waitIn } from './lib.mjs';

const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'rinconcito-capturas');
fs.mkdirSync(SHOTS, { recursive: true });
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'rinconcito-e2e-'));
const ok = (msg) => console.log('  ✔', msg);
const step = (msg) => console.log('\n▶', msg);
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });
const errors = [];

let srv = await startServer({ port: 0, host: '127.0.0.1', dataDir: DATA });
const PORT = srv.port;
const BASE = `http://localhost:${PORT}/`;
const browser = await chromium.launch();

async function phone(tag, device) {
  const ctx = await browser.newContext({ ...devices[device], serviceWorkers: process.env.SW === '0' ? 'block' : 'allow' });
  const page = await ctx.newPage();
  page.on('crash', () => console.log(`  ✖ [${tag}] la pestaña se colgó (crash)`));
  page.on('close', () => console.log(`  · [${tag}] pestaña cerrada`));
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log(`  · [${tag}] navegó a`, f.url()); });
  page.on('pageerror', (e) => { errors.push(`[${tag}] ${e.message}`); console.log(`  ✖ [${tag}] error de página:`, e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|WebSocket connection/.test(m.text())) { errors.push(`[${tag}] ${m.text()}`); console.log(`  ✖ [${tag}] consola:`, m.text()); } });
  return { ctx, page };
}
const island = () => [...srv.hub.islands.values()][0];
// espera una condición en la página; si falla, muestra qué estaba viendo ese celular
async function until(page, fn, arg = null, timeout = 6000) {
  try { await waitIn(page, fn, arg, { timeout }); }
  catch (e) {
    const st = await ev(page, () => ({ target: window.__H?.target(), local: window.__rinconcito.S.local, log: window.__H?.log.slice(-8), net: window.__rinconcito.net.status, busy: window.__rinconcito.game.busy })).catch(x => 'sin acceso: ' + x.message);
    console.log('  DIAGNÓSTICO', JSON.stringify(st));
    throw e;
  }
}
const give = (pid, items) => { const isl = island(); isl.give(isl.d.players[pid], items); isl.syncInv(isl.d.players[pid]); };
const closeModals = async (page) => { for (const b of await page.locator('.modal-wrap').all()) await b.evaluate(el => el.remove()); await page.evaluate(() => { window.__rinconcito.game.ui.modals = []; }); };

try {
  // ------------------------------------------------------------------------
  step('1. Crear la isla desde el primer celular (iPhone)');
  const A = await phone('A', 'iPhone 13');
  await A.page.goto(BASE);
  await shot(A.page, '01-inicio');
  await A.page.getByRole('button', { name: 'Crear nuestra isla' }).click();
  await A.page.locator('input.text-in').fill('Lau');
  await A.page.getByRole('button', { name: 'Rulos' }).click();
  await shot(A.page, '02-personaje');
  await A.page.getByRole('button', { name: 'Crear la isla' }).click();
  await waitIn(A.page, () => window.__rinconcito?.S.ready);
  await A.page.waitForTimeout(600);
  await shot(A.page, '03-bienvenida');
  await A.page.getByRole('button', { name: '¡Vamos!' }).click();
  const code = await ev(A.page, () => window.__rinconcito.S.code);
  assert.match(code, /^[A-Z2-9]{8}$/);
  await A.page.waitForSelector('.code-big');
  await shot(A.page, '04-codigo-invitacion');
  if (process.env.SW !== '0') {
    await waitIn(A.page, async () => !!(await navigator.serviceWorker.getRegistration()), null, { timeout: 10000 });
    const mf = await ev(A.page, async () => { const r = await fetch(document.querySelector('link[rel=manifest]').href); return r.json(); });
    assert.equal(mf.display, 'standalone');
    assert.ok(mf.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
    ok('PWA: service worker registrado y manifest instalable (standalone, íconos 192/512/maskable)');
  }
  await A.page.getByRole('button', { name: 'Cerrar' }).click();
  ok(`isla creada, código ${code}`);

  // ------------------------------------------------------------------------
  step('2. Unirse con el enlace de invitación desde el segundo celular (Android)');
  const B = await phone('B', 'Pixel 7');
  await B.page.goto(`${BASE}?codigo=${code}`);
  await B.page.getByRole('button', { name: 'Unirme a la isla 💛' }).click();
  await B.page.locator('input.text-in').first().fill('Sofi');
  await B.page.getByRole('button', { name: 'Largo' }).click();
  await B.page.getByRole('button', { name: 'Entrar a la isla' }).click();
  await waitIn(B.page, () => window.__rinconcito?.S.ready);
  await B.page.getByRole('button', { name: '¡Vamos!' }).click();
  await waitIn(A.page, () => Object.values(window.__rinconcito.S.players).length === 2 && Object.values(window.__rinconcito.S.players).every(p => p.online));
  ok('los dos están en la isla y se ven conectados');
  const C = await phone('C', 'iPhone 13');
  await C.page.goto(`${BASE}?codigo=${code}`);
  await C.page.getByRole('button', { name: 'Unirme a la isla 💛' }).click();
  await C.page.locator('input.text-in').first().fill('Intruso');
  await C.page.getByRole('button', { name: 'Entrar a la isla' }).click();
  await C.page.waitForSelector('.form-err:not(:empty)');
  const errText = await C.page.locator('.form-err').textContent();
  assert.match(errText, /código/i);
  await shot(C.page, '05-tercera-persona-rechazada');
  await C.ctx.close();
  ok('una tercera persona con el mismo código es rechazada: ' + errText);

  for (const P of [A, B]) await installHelpers(P.page);

  // ------------------------------------------------------------------------
  step('3. Movimiento en tiempo real');
  await walk(A.page, 16, 19);
  await waitIn(B.page, () => { const p = window.__rinconcito.S.players.p1; return Math.abs(p.rx - 16.5) < 0.3 && Math.abs(p.ry - 19.6) < 0.4; }, null, { timeout: 4000 });
  ok('B ve a A llegar a (16,19)');
  await walk(B.page, 18, 19);
  await waitIn(A.page, () => { const p = window.__rinconcito.S.players.p2; return Math.abs(p.rx - 18.5) < 0.3; }, null, { timeout: 4000 });
  ok('A ve a B moverse');
  await shot(A.page, '06-juntos-en-la-isla');

  // ------------------------------------------------------------------------
  step('4. Recolección y fabricación: ramitas + piedras → hacha y pico');
  // arbusto (15,20) y piedritas (19,21)
  await walk(A.page, 15, 19, 'down');
  let t = await target(A.page);
  assert.equal(t.kind, 'obj');
  assert.equal(t.verb, 'Ramitas');
  await act(A.page);
  await waitIn(A.page, () => window.__rinconcito.S.me.inv.ramita >= 1);
  ok('A juntó ramitas del arbusto');
  await walk(B.page, 19, 20, 'down');
  t = await target(B.page);
  assert.equal(t.verb, 'Juntar');
  await act(B.page);
  await waitIn(B.page, () => window.__rinconcito.S.me.inv.piedra >= 1);
  ok('B juntó piedritas');
  give('p1', { ramita: 8, piedra: 6 });
  await waitIn(A.page, () => window.__rinconcito.S.me.inv.ramita >= 8);
  await A.page.locator('button[aria-label="Mochila"]').click();
  await A.page.getByRole('tab', { name: 'Fabricar' }).click();
  await shot(A.page, '07-fabricar');
  const craftBtn = (page, name) => page.locator('.recipe').filter({ has: page.locator('.recipe-main > b', { hasText: new RegExp('^' + name + '$') }) }).getByRole('button', { name: 'Fabricar' });
  await craftBtn(A.page, 'Hacha').click();
  await waitIn(A.page, () => window.__rinconcito.S.me.inv.hacha === 1);
  await craftBtn(A.page, 'Pico').click();
  await waitIn(A.page, () => window.__rinconcito.S.me.inv.pico === 1);
  ok('A fabricó hacha y pico desde el menú');
  await A.page.getByRole('button', { name: 'Cerrar' }).click();

  // ------------------------------------------------------------------------
  step('5. Talar un árbol entre los dos');
  give('p2', { hacha: 1 });
  await walk(A.page, 12, 21, 'left');   // árbol en (13,21)? -> A a la izquierda
  await face(A.page, 'right');
  t = await target(A.page);
  assert.equal(t.verb, 'Talar', JSON.stringify(t));
  await walk(B.page, 14, 21, 'left');
  const maderaA0 = (await inv(A.page)).madera || 0, maderaB0 = (await inv(B.page)).madera || 0;
  await act(A.page); await act(B.page); await act(A.page, 2);
  await A.page.waitForTimeout(500);
  const maderaTot = ((await inv(A.page)).madera || 0) - maderaA0 + ((await inv(B.page)).madera || 0) - maderaB0;
  assert.ok(maderaTot >= 2 && maderaTot <= 3, `madera total ${maderaTot}`);
  ok(`árbol talado entre los dos: ${maderaTot} de madera (sin duplicar)`);
  await shot(B.page, '08-tala');

  // ------------------------------------------------------------------------
  step('6. Huerta: preparar, plantar, regar, cosechar');
  await walk(A.page, 23, 11, 'up');
  t = await target(A.page);
  assert.equal(t.kind, 'till', JSON.stringify(t));
  await act(A.page);
  await waitIn(A.page, () => window.__rinconcito.S.soil['23,10']);
  assert.equal((await target(A.page)).kind, 'plant');
  await act(A.page);
  await waitIn(A.page, () => window.__rinconcito.S.soil['23,10']?.crop);
  await walk(A.page, 22, 12);
  await walk(B.page, 23, 11, 'up');
  t = await target(B.page);
  assert.equal(t.kind, 'water', JSON.stringify(t));
  await act(B.page);
  await waitIn(A.page, () => window.__rinconcito.S.soil['23,10']?.crop?.watered);
  ok('A preparó y plantó; B regó la planta de A y A lo vio');
  // el tiempo pasa (avanzamos el reloj del cultivo del lado servidor)
  {
    const isl = island(); const c = isl.d.soil['23,10'].crop; c.readyAt = Date.now() - 1; isl.slowTick(Date.now());
  }
  await waitIn(B.page, () => { const c = window.__rinconcito.S.soil['23,10'].crop; return c.step === 1 && !c.watered; }, null, { timeout: 5000 }).catch(async (e) => {
    console.log('DEBUG', JSON.stringify(island().d.soil['23,10']), await ev(B.page, () => JSON.stringify({ s: window.__rinconcito.S.soil['23,10'], t: window.__H.target(), l: window.__rinconcito.S.local })));
    throw e;
  });
  await act(B.page);
  await until(B.page, () => window.__rinconcito.S.soil['23,10'].crop.watered);
  { const isl = island(); const c = isl.d.soil['23,10'].crop; c.readyAt = Date.now() - 1; isl.slowTick(Date.now()); }
  await waitIn(B.page, () => { const s = window.__rinconcito.S.soil['23,10']; return s?.crop?.step >= 2; });
  await shot(B.page, '09-huerta-lista');
  t = await target(B.page);
  assert.equal(t.kind, 'harvest');
  await act(B.page);
  await waitIn(B.page, () => (window.__rinconcito.S.me.inv.rabanito || 0) >= 1);
  ok('cosecha de rabanitos');

  // ------------------------------------------------------------------------
  step('7. Pesca con el minijuego táctil (desde la punta del muelle)');
  give('p1', { cana: 1 });
  await walk(A.page, 17, 28, 'down');
  t = await target(A.page);
  assert.equal(t.kind, 'fish', JSON.stringify(t));
  await act(A.page, 1, 100);
  await A.page.waitForSelector('.fishing');
  await shot(A.page, '10-pesca-espera');
  // tocar en el momento justo, como una persona con buena puntería
  const caught = await ev(A.page, () => { (async () => {
    const F = await import('/shared/fishing.js');
    const ui = window.__rinconcito.game.ui;
    while (!ui.fishState || !ui.fishEl) await new Promise(r => setTimeout(r, 20));
    const { start, params: p } = ui.fishState;
    const btn = document.querySelector('.f-tap');
    for (let k = 0; k < 3; k++) {
      for (;;) {
        const tt = performance.now() - start;
        if (Math.abs(F.markerPos(tt, p) - p.centers[k]) < p.zone * 0.22) break;
        await new Promise(r => setTimeout(r, 4));
      }
      btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      await new Promise(r => setTimeout(r, 60));
    }
  })(); return true; });
  assert.ok(caught);
  await waitIn(A.page, () => /Pescaste|escapó/.test(document.querySelector('.f-msg')?.textContent || ''), null, { timeout: 8000 });
  const fishMsg = await A.page.locator('.f-msg').textContent();
  await shot(A.page, '11-pesca-resultado');
  ok('resultado de la pesca: ' + fishMsg.trim());
  await A.page.locator('.f-tap').click();

  // ------------------------------------------------------------------------
  step('8. Carpincho: nombre, mimos y comida');
  {
    // el carpincho pasea solo; para la prueba lo dejamos quieto en un lugar conocido
    const isl = island();
    Object.assign(isl.d.pet, { x: 14.5, y: 12.2 });
    Object.assign(isl.pet, { tx: 14.5, ty: 12.2, next: Date.now() + 600_000 });
    isl.broadcast({ t: 'petpos', x: 14.5, y: 12.2, dir: 'down', mv: 0 });
  }
  try { await walk(B.page, 15, 12, 'left'); } catch (e) {
    console.log('  DEBUG walk falló:', e.message);
    await B.page.waitForTimeout(500);
    console.log('  DEBUG estado:', await ev(B.page, () => ({ url: location.href, H: !!window.__H, R: !!window.__rinconcito, ready: window.__rinconcito?.S.ready, nav: performance.getEntriesByType('navigation').map(n => n.type), t: performance.now() })));
    throw e;
  }
  t = await target(B.page);
  assert.equal(t.kind, 'pet_name', JSON.stringify(t));
  await act(B.page);
  await B.page.locator('.modal input.text-in').fill('Panchito');
  await shot(B.page, '12-nombre-carpincho');
  await B.page.getByRole('button', { name: 'Listo' }).click();
  await waitIn(A.page, () => window.__rinconcito.S.pet.name === 'Panchito');
  await waitIn(B.page, () => window.__rinconcito.S.pet.name === 'Panchito' && window.__H.target()?.kind === 'pet');
  t = await target(B.page);
  assert.equal(t.kind, 'pet');
  await act(B.page);
  await ev(B.page, () => { window.__rinconcito.game.hand = 'rabanito'; });
  t = await target(B.page);
  assert.equal(t.verb, 'Mimar');
  await act(B.page);
  await shot(B.page, '13-carpincho');
  ok('B le puso nombre (A lo ve), lo mimó y le dio de comer');

  // ------------------------------------------------------------------------
  step('9. Casa: entrar, fabricar muebles, colocarlos y guardarlos');
  give('p1', { madera: 30, fibra: 10, flor_sol: 2 });
  await A.page.locator('button[aria-label="Mochila"]').click();
  await A.page.getByRole('tab', { name: 'Fabricar' }).click();
  await craftBtn(A.page, 'Silla').click();
  await waitIn(A.page, () => window.__rinconcito.S.me.inv.silla === 1);
  await craftBtn(A.page, 'Cama doble').click();
  await waitIn(A.page, () => window.__rinconcito.S.me.inv.cama === 1);
  await A.page.getByRole('button', { name: 'Cerrar' }).click();
  await walk(A.page, 17, 7);
  await waitIn(A.page, () => window.__rinconcito.S.local.map === 'casa');
  ok('A entró a la casa');
  await A.page.waitForTimeout(400);
  await A.page.getByRole('button', { name: 'Decorar' }).click();
  await A.page.locator('.decor-bar .cell[aria-label="Cama doble"]').click();
  // tocar el piso en la casilla (4,5)
  const tapTile = async (page, tx, ty) => {
    const pos = await page.evaluate(([tx, ty]) => { const r = window.__rinconcito.game.r; return { x: ((tx + 0.5) * 16 - r.cam.x) * r.cssPerPx, y: ((ty + 0.5) * 16 - r.cam.y) * r.cssPerPx }; }, [tx, ty]);
    await page.locator('#touch').dispatchEvent('pointerdown', { clientX: pos.x, clientY: pos.y, pointerId: 7 });
    await page.locator('#touch').dispatchEvent('pointerup', { clientX: pos.x, clientY: pos.y, pointerId: 7 });
  };
  await tapTile(A.page, 4, 5);
  await A.page.waitForTimeout(200);
  await shot(A.page, '14-decorar-fantasma');
  await A.page.getByRole('button', { name: 'Poner acá' }).click();
  await waitIn(A.page, () => [...window.__rinconcito.S.furniture.values()].some(f => f.item === 'cama'));
  await A.page.locator('.decor-bar .cell[aria-label="Silla"]').click();
  await tapTile(A.page, 6, 9); // delante de la puerta: no se puede
  await A.page.waitForTimeout(150);
  assert.equal(await A.page.getByRole('button', { name: 'Poner acá' }).isDisabled(), true);
  await tapTile(A.page, 8, 6);
  await A.page.getByRole('button', { name: 'Poner acá' }).click();
  await waitIn(A.page, () => [...window.__rinconcito.S.furniture.values()].some(f => f.item === 'silla'));
  await A.page.getByRole('button', { name: 'Listo' }).click();
  ok('cama y silla colocadas; frente a la puerta no se puede');
  // B entra y ve los muebles
  await walk(B.page, 17, 7);
  await waitIn(B.page, () => window.__rinconcito.S.local.map === 'casa' && window.__rinconcito.S.furniture.size === 2);
  await B.page.waitForTimeout(300);
  await shot(B.page, '15-casa-de-los-dos');
  ok('B entra a la casa y ve los muebles que puso A');
  await walk(A.page, 4, 7, 'up');
  t = await target(A.page);
  assert.equal(t.kind, 'rest', JSON.stringify(t));

  // ------------------------------------------------------------------------
  step('10. Buzón: regalo y cartita mientras la otra persona está desconectada');
  await walk(B.page, 6, 10);
  await waitIn(B.page, () => window.__rinconcito.S.local.map === 'isla');
  const tokenA = await ev(A.page, () => localStorage.getItem('rinconcito.token'));
  await A.ctx.close();
  await waitIn(B.page, () => !window.__rinconcito.S.players.p1.online);
  ok('B ve que A se desconectó');
  await walk(B.page, 20, 8, 'up');
  t = await target(B.page);
  assert.equal(t.verb, 'Buzón', JSON.stringify(t));
  await act(B.page);
  await B.page.getByRole('button', { name: 'Enviar' }).click();
  await B.page.locator('.mail-body .cell[aria-label="Rabanito"], .mail-body .cell[aria-label="Piedra"]').first().click();
  await B.page.locator('.mail-body textarea').fill('Te dejé esto para la sopa 💛');
  await shot(B.page, '16-buzon-enviar');
  await B.page.getByRole('button', { name: 'Dejar en el buzón' }).click();
  await waitIn(B.page, () => window.__rinconcito.S.mail.some(m => m.from === 'p2'));
  await closeModals(B.page);
  ok('B dejó un regalo con nota');

  step('11. Reconexión: A vuelve con su llave, en otro "celular"');
  const A2 = await phone('A2', 'iPhone 13');
  await A2.page.addInitScript((tk) => { localStorage.setItem('rinconcito.token', tk); localStorage.setItem('rinconcito.tutorial', '1'); }, tokenA);
  await A2.page.goto(BASE);
  await waitIn(A2.page, () => window.__rinconcito?.S.ready);
  await installHelpers(A2.page);
  const meA = await ev(A2.page, () => ({ you: window.__rinconcito.S.you, map: window.__rinconcito.S.local.map, inv: window.__rinconcito.S.me.inv }));
  assert.equal(meA.you, 'p1');
  assert.equal(meA.map, 'casa', 'vuelve donde estaba');
  assert.equal(meA.inv.hacha, 1);
  await A2.page.waitForSelector('.toast');
  ok('A volvió como A (no como B), en la casa, con su inventario, y le avisaron del regalo');
  await walk(A2.page, 6, 10);
  await waitIn(A2.page, () => window.__rinconcito.S.local.map === 'isla');
  await walk(A2.page, 20, 8, 'up');
  await A2.page.waitForTimeout(300);
  await shot(A2.page, '17-buzon-con-bandera');
  await act(A2.page);
  await A2.page.getByRole('button', { name: /Abrir regalo/ }).click();
  await A2.page.waitForSelector('.note');
  await shot(A2.page, '18-buzon-recibido');
  const note = await A2.page.locator('.note').first().textContent();
  assert.match(note, /sopa/);
  ok('A abrió el regalo y leyó la nota: "' + note + '"');
  await closeModals(A2.page);

  // ------------------------------------------------------------------------
  step('12. Proyecto compartido: reparar el puente');
  give('p1', { madera: 12, piedra: 12 }); give('p2', { madera: 20, fibra: 10 });
  await A2.page.locator('button[aria-label="Mochila"]').click();
  await A2.page.getByRole('tab', { name: 'Proyectos' }).click();
  await A2.page.locator('.project', { hasText: 'puente' }).getByRole('button', { name: 'Aportar todo lo que pueda' }).click();
  await waitIn(A2.page, () => (window.__rinconcito.S.projects.puente.have.madera || 0) > 0);
  await shot(A2.page, '19-proyecto-aporte');
  await A2.page.getByRole('button', { name: 'Cerrar' }).click();
  await B.page.locator('button[aria-label="Mochila"]').click();
  await B.page.getByRole('tab', { name: 'Proyectos' }).click();
  await B.page.locator('.project', { hasText: 'puente' }).getByRole('button', { name: 'Aportar todo lo que pueda' }).click();
  await waitIn(A2.page, () => window.__rinconcito.S.bridge === true);
  await B.page.getByRole('button', { name: 'Cerrar' }).click();
  ok('puente reparado entre los dos');
  await walk(B.page, 34, 5, 'up');
  ok('B cruzó el puente al mirador');
  await walk(A2.page, 35, 5, 'up');
  await act(A2.page); await act(B.page);
  await A2.page.waitForTimeout(500);
  await shot(A2.page, '20-mirador-juntos');
  const cuadro = await ev(A2.page, () => window.__rinconcito.S.me.inv.cuadro || 0);
  ok(`se sentaron juntos en el banco del mirador (recuerdo: ${cuadro} cuadro)`);

  // ------------------------------------------------------------------------
  step('13. Cueva: entrar, criaturas, combate');
  give('p1', { espada: 1 });
  await walk(A2.page, 7, 5);
  await walk(A2.page, 7, 4);
  await waitIn(A2.page, () => window.__rinconcito.S.local.map === 'cueva');
  await waitIn(A2.page, () => window.__rinconcito.S.enemies.size > 0);
  await walk(A2.page, 13, 13, 'up');
  await A2.page.waitForTimeout(600);
  await shot(A2.page, '21-cueva');
  t = await target(A2.page);
  assert.equal(t.kind, 'attack');
  await act(A2.page, 3, 380);
  ok('A está en la cueva, ve criaturas y puede atacar');

  // ------------------------------------------------------------------------
  step('14. Desafío amistoso (pesca), propuesto y aceptado por la interfaz');
  await walk(A2.page, 13, 18);
  await walk(A2.page, 13, 19);
  await waitIn(A2.page, () => window.__rinconcito.S.local.map === 'isla');
  await A2.page.locator('button[aria-label="Mochila"]').click();
  await A2.page.getByRole('tab', { name: 'Desafíos' }).click();
  await shot(A2.page, '22-desafios');
  await A2.page.locator('.challenge', { hasText: 'El pez más raro' }).getByRole('button', { name: 'Proponer este desafío' }).click();
  await B.page.waitForSelector('.modal >> text=te desafía');
  await shot(B.page, '23-invitacion-desafio');
  await B.page.getByRole('button', { name: '¡Acepto!' }).click();
  await A2.page.getByRole('button', { name: 'Cerrar' }).click();
  await waitIn(A2.page, () => window.__rinconcito.S.challenge?.status === 'active', null, { timeout: 8000 });
  await A2.page.waitForTimeout(800);
  await shot(A2.page, '24-desafio-en-curso');
  ok('desafío activo, con tiempo en pantalla');
  // simulamos que pescaron: B saca un pez raro
  { const isl = island(); isl.score('p2', 'pesca', 1, 4); isl.score('p1', 'pesca', 1, 1); }
  { const isl = island(); isl.d.challenge.endsAt = Date.now() - 1; isl.slowTick(Date.now()); }
  await B.page.waitForSelector('.modal >> text=Ganaste');
  await shot(B.page, '25-resultado-desafio');
  const hatB = await ev(B.page, () => window.__rinconcito.S.players.p2.look.hat);
  assert.equal(hatB, 'sombrero_pescador');
  const rewardsA = await ev(A2.page, () => window.__rinconcito.S.me.inv.pescado_asado || 0);
  assert.ok(rewardsA >= 2);
  ok('ganó B (sombrero de pescador) y los dos recibieron premio');
  await closeModals(A2.page); await closeModals(B.page);

  // ------------------------------------------------------------------------
  step('15. Corte del servidor: aviso claro y reconexión sin perder nada');
  await srv.stop();
  await A2.page.waitForSelector('#offline:not([hidden])', { timeout: 15000 });
  await shot(A2.page, '26-sin-conexion');
  ok('se muestra el aviso de "sin conexión"');
  srv = await startServer({ port: PORT, host: '127.0.0.1', dataDir: DATA });
  await ev(A2.page, () => window.__rinconcito.net.reconnectNow());
  await A2.page.waitForSelector('#offline', { state: 'hidden', timeout: 20000 });
  await B.page.waitForSelector('#offline', { state: 'hidden', timeout: 20000 });
  const after = await ev(A2.page, () => ({ bridge: window.__rinconcito.S.bridge, furn: window.__rinconcito.S.furniture.size, pet: window.__rinconcito.S.pet.name, hat: window.__rinconcito.S.players.p2.look.hat }));
  assert.deepEqual(after, { bridge: true, furn: 2, pet: 'Panchito', hat: 'sombrero_pescador' });
  ok('el servidor volvió y todo seguía guardado: ' + JSON.stringify(after));

  // ------------------------------------------------------------------------
  step('16. Noche y vista apaisada');
  await ev(A2.page, () => { window.__debugHora = 22.5; });
  await walk(A2.page, 17, 9);
  await A2.page.waitForTimeout(400);
  await shot(A2.page, '27-noche');
  await A2.page.setViewportSize({ width: 844, height: 390 });
  await A2.page.waitForTimeout(400);
  await shot(A2.page, '28-apaisado');
  ok('capturas de noche y apaisado');
} catch (e) {
  console.error('\n✖ FALLÓ:', e.message, (e.stack || '').split('\n').filter(l => l.includes('dos-celulares')).slice(0, 2).join(' | '));
  process.exitCode = 1;
} finally {
  await browser.close();
  await srv.stop().catch(() => {});
  if (errors.length) { console.log('\nErrores de página:', errors); process.exitCode = 1; }
  console.log(`\nCapturas en: ${SHOTS}`);
}
