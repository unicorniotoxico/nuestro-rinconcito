// Prueba de la app de Android en un emulador (la corre GitHub Actions).
// Un jugador usa el APK instalado en el emulador y el otro un navegador común:
// crean la isla desde la app, se unen, se ven, juntan algo, y se prueban las
// partes propias de la app (compartir, botón atrás, cambiar servidor, volver a abrir).
import { _android as android, chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { installHelpers, walk, ev, waitIn, act, target } from '../../test/e2e/lib.mjs';

const PKG = 'io.github.unicorniotoxico.rinconcito';
const OUT = process.env.SHOTS || 'capturas-android';
const WEB = process.env.SERVIDOR_LOCAL || 'http://localhost:3000';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (m) => console.log('  ✔', m);
const step = (m) => console.log('\n▶', m);

let [device] = await android.devices({ omitDriverInstall: true });
assert.ok(device, 'no hay ningún dispositivo Android conectado');
console.log('Dispositivo:', device.model(), device.serial());
const shell = async (cmd) => (await device.shell(cmd)).toString();
const limpiarAvisos = () => shell('am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS').catch(() => '');
const shot = async (n, limpiar = true) => { if (limpiar) { await limpiarAvisos(); await sleep(300); } return device.screenshot({ path: path.join(OUT, n + '.png') }); };
// Los botones que le hablan a la app (rinconcito://...) no navegan de verdad:
// no hay que esperar a que "termine la navegación".
const tocar = (loc) => loc.click({ noWaitAfter: true });
const abrirApp = () => shell(`am start -W -n ${PKG}/.MainActivity`);

// Busca la vista web de la app para manejarla. A veces el emulador tarda en
// publicarla: si pasa, se reconecta al dispositivo y se vuelve a abrir la app.
async function paginaDelJuego() {
  let wv = null;
  for (let intento = 1; !wv; intento++) {
    try { wv = await device.webView({ pkg: PKG }, { timeout: 40_000 }); }
    catch (e) {
      if (intento >= 3) throw e;
      console.log(`   (no aparece la vista web, reintento ${intento})`);
      try { device.close(); } catch { /* */ }
      [device] = await android.devices({ omitDriverInstall: true });
      await shell(`am force-stop ${PKG}`);
      await abrirApp();
      await sleep(2000);
    }
  }
  const page = await wv.page();
  page.on('pageerror', (e) => console.log('  ✖ [APK] error de página:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  · [APK] consola:', m.text()); });
  return page;
}

let browser;
try {
  step('1. Abrir la app recién instalada');
  await shell(`am force-stop ${PKG}`);
  await shell(`pm clear ${PKG}`);
  await abrirApp();
  await sleep(1500);
  await shot('01-abriendo');
  let A = await paginaDelJuego();
  await A.waitForURL(/10\.0\.2\.2:3000/, { timeout: 120_000 });
  await A.getByRole('button', { name: 'Crear nuestra isla' }).waitFor({ timeout: 30_000 });
  await sleep(800);
  await shot('02-inicio-en-la-app');
  const ua = await A.evaluate(() => navigator.userAgent);
  assert.match(ua, /RinconcitoApp\//);
  assert.equal(await A.evaluate(() => typeof navigator.share), 'function');
  ok('la app esperó al servidor, abrió el juego y se identifica como app: ' + ua.match(/RinconcitoApp\/\S+/)[0]);

  step('2. Crear la isla desde el celular Android');
  await A.getByRole('button', { name: 'Crear nuestra isla' }).click();
  await A.locator('input.text-in').fill('Lau');
  await A.getByRole('button', { name: 'Crear la isla' }).click();
  await waitIn(A, () => window.__rinconcito?.S.ready, null, { timeout: 30_000 });
  await A.getByRole('button', { name: '¡Vamos!' }).click();
  await A.locator('.code-big').waitFor();
  await sleep(500);
  await shot('03-isla-creada-codigo');
  const code = await ev(A, () => window.__rinconcito.S.code);
  assert.match(code, /^[A-Z2-9]{8}$/);
  ok('isla creada en la app, código ' + code);

  step('3. Compartir la invitación con el menú de Android');
  await tocar(A.getByRole('button', { name: 'Compartir' }));
  await sleep(2500);
  await shot('04-compartir-android', false);
  const top = await shell('dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity" | head -3');
  console.log('   actividad al frente:', top.trim().split('\n')[0]);
  assert.match(top, /ChooserActivity|ResolverActivity|intentresolver/i, 'debería abrirse el menú de compartir del teléfono');
  await shell('input keyevent 4');
  await sleep(1200);
  ok('se abrió el menú "Compartir con…" del teléfono');

  step('4. El botón atrás del teléfono cierra el menú del juego');
  assert.equal(await ev(A, () => document.getElementById('sheet').hidden), false);
  await shell('input keyevent 4');
  await waitIn(A, () => document.getElementById('sheet').hidden, null, { timeout: 5000 });
  ok('atrás cerró el menú (no cerró la app)');
  await installHelpers(A);
  await shot('05-juego-en-la-app');

  step('5. La otra persona se une desde un navegador común');
  browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const B = await ctx.newPage();
  await B.goto(`${WEB}/?codigo=${code}`);
  await B.getByRole('button', { name: 'Unirme a la isla 💛' }).click();
  await B.locator('input.text-in').first().fill('Sofi');
  await B.getByRole('button', { name: 'Entrar a la isla' }).click();
  await waitIn(B, () => window.__rinconcito?.S.ready, null, { timeout: 20_000 });
  await B.getByRole('button', { name: '¡Vamos!' }).click();
  await installHelpers(B);
  await waitIn(A, () => window.__rinconcito.S.players.p2?.online === true, null, { timeout: 10_000 });
  ok('la app ve a Sofi conectada');

  step('6. Moverse y juntar algo desde la app; el navegador lo ve');
  await walk(A, 16, 19);
  await waitIn(B, () => { const p = window.__rinconcito.S.players.p1; return Math.abs(p.rx - 16.5) < 0.4 && Math.abs(p.ry - 19.6) < 0.5; }, null, { timeout: 8000 });
  await walk(A, 15, 19, 'down');
  const t = await target(A);
  assert.equal(t.verb, 'Ramitas', JSON.stringify(t));
  await act(A);
  await waitIn(A, () => (window.__rinconcito.S.me.inv.ramita || 0) >= 1, null, { timeout: 8000 });
  await walk(B, 16, 20, 'left');
  await sleep(800);
  await shot('06-juntos-desde-la-app');
  ok('caminó, juntó ramitas y Sofi lo vio en tiempo real');

  step('7. Cambiar servidor desde Ajustes y volver');
  await A.locator('button[aria-label="Menú"]').click();
  await A.getByRole('tab', { name: 'Ajustes' }).click();
  await tocar(A.getByRole('button', { name: 'Cambiar servidor' }));
  await A.waitForURL(/android_asset\/app\.html#modo=config/, { timeout: 10_000 });
  await sleep(600);
  await shot('07-cambiar-servidor');
  assert.equal(await A.locator('#campo').inputValue(), 'http://10.0.2.2:3000');
  await tocar(A.getByRole('button', { name: 'Volver' }));
  await A.waitForURL(/10\.0\.2\.2:3000/, { timeout: 60_000 });
  await waitIn(A, () => window.__rinconcito?.S.ready && window.__rinconcito.S.you === 'p1', null, { timeout: 30_000 });
  ok('la pantalla de servidor muestra la dirección guardada y "Volver" regresa a la isla como Lau');

  step('8. Minimizar con atrás y volver a abrir');
  await installHelpers(A);
  await shell('input keyevent 4');
  await sleep(1500);
  const fondo = await shell('dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity" | head -1');
  assert.doesNotMatch(fondo, new RegExp(PKG), 'la app debería haber quedado en segundo plano');
  await abrirApp();
  await sleep(1500);
  await waitIn(A, () => !document.hidden && window.__rinconcito.net.status === 'online', null, { timeout: 20_000 });
  ok('se minimizó sin cerrarse y al volver siguió conectada');

  step('9. Cerrar la app del todo y volver a entrar: sigue siendo Lau');
  await shell(`am force-stop ${PKG}`);
  await sleep(800);
  await abrirApp();
  A = await paginaDelJuego();
  await A.waitForURL(/10\.0\.2\.2:3000/, { timeout: 60_000 });
  await waitIn(A, () => window.__rinconcito?.S.ready, null, { timeout: 30_000 });
  const yo = await ev(A, () => ({ you: window.__rinconcito.S.you, name: window.__rinconcito.S.players[window.__rinconcito.S.you].name, ramita: window.__rinconcito.S.me.inv.ramita || 0 }));
  assert.equal(yo.you, 'p1'); assert.equal(yo.name, 'Lau'); assert.ok(yo.ramita >= 1);
  await sleep(800);
  await shot('08-reabrir-sigue-siendo-lau');
  ok(`volvió como ${yo.name}, con sus ${yo.ramita} ramitas`);

  step('10. Celular apaisado');
  await shell('settings put system accelerometer_rotation 0');
  await shell('settings put system user_rotation 1');
  await sleep(2500);
  await shot('09-apaisado');
  await shell('settings put system user_rotation 0');
  ok('captura apaisada');
} catch (e) {
  console.error('\n✖ FALLÓ:', e.message);
  try { await shot('99-error'); } catch { /* */ }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  try { device.close(); } catch { /* */ }
  console.log('\nCapturas en:', OUT);
}
