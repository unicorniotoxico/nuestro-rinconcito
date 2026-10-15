// Ayudantes para manejar el cliente real dentro de un navegador (Playwright).
// Caminar usa el mismo código de movimiento y colisiones del juego: solo se
// reemplaza el joystick por una "mano invisible" que sigue un camino.
export async function installHelpers(page) {
  await page.evaluate(async () => {
    const M = await import('/shared/maps.js');
    const R = window.__rinconcito;
    const H = {};
    H.tileOf = () => [Math.floor(R.S.local.x), Math.floor(R.S.local.y - 0.1)];
    H.path = (tx, ty) => {
      const map = R.S.local.map, m = M.MAPS[map];
      const ctx = { bridge: R.S.bridge, houseLevel: R.S.houseLevel };
      const [sx, sy] = H.tileOf();
      const key = (x, y) => x + ',' + y;
      const prev = new Map([[key(sx, sy), null]]);
      const q = [[sx, sy]];
      while (q.length) {
        const [x, y] = q.shift();
        if (x === tx && y === ty) break;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k = key(nx, ny);
          if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || prev.has(k)) continue;
          const isGoal = nx === tx && ny === ty;
          if (!isGoal && M.warpAt(map, nx, ny)) continue;
          if (M.collides(map, nx + 0.5, ny + 0.6, ctx, R.S.solid)) continue;
          prev.set(k, [x, y]); q.push([nx, ny]);
        }
      }
      if (!prev.has(key(tx, ty))) return null;
      const out = [];
      for (let c = [tx, ty]; c; c = prev.get(key(c[0], c[1]))) out.unshift(c);
      return out;
    };
    H.startWalk = (tx, ty, face) => {
      H.walkState = { done: false, err: null };
      H.walkTo(tx, ty, face).then(() => { H.walkState.done = true; }, (e) => { H.walkState.done = true; H.walkState.err = e.message; });
      return true;
    };
    H.walkTo = (tx, ty, face = null) => new Promise((resolve, reject) => {
      const p = H.path(tx, ty);
      if (!p) { reject(new Error(`sin camino a ${tx},${ty}`)); return; }
      const inp = R.game.input;
      const orig = inp.__orig || inp.vector.bind(inp);
      inp.__orig = orig;
      let i = 0;
      const id = (H.walkId = (H.walkId || 0) + 1);
      const startMap = R.S.local.map;
      inp.vector = () => {
        const L = R.S.local;
        if (L.map !== startMap) { inp.vector = orig; setTimeout(() => resolve('portal'), 300); return [0, 0]; } // entró por una puerta
        while (i < p.length) {
          const [wx, wy] = p[i];
          const gx = wx + 0.5, gy = wy + 0.62;
          const dx = gx - L.x, dy = gy - L.y, d = Math.hypot(dx, dy);
          if (d < 0.12) { i++; continue; }
          return [dx / d, dy / d];
        }
        inp.vector = orig;
        if (face) R.S.local.dir = face;
        setTimeout(() => resolve(true), 150);
        return [0, 0];
      };
      setTimeout(() => { if (H.walkId === id && inp.vector !== orig) { inp.vector = orig; reject(new Error(`no llegué a ${tx},${ty} (estoy en ${H.tileOf()})`)); } }, 25000 + p.length * 400);
    });
    H.face = (dir) => { R.S.local.dir = dir; };
    H.target = () => { const t = R.game.target; return t ? { kind: t.kind, verb: t.verb, missing: t.missing || null } : null; };
    H.inv = () => ({ ...R.S.me.inv });
    // registro de acciones y avisos para diagnosticar
    H.log = [];
    const origAct = R.net.act.bind(R.net);
    R.net.act = async (a, params) => { const r = await origAct(a, params); H.log.push({ a, ok: r.ok, err: r.err, at: Math.round(performance.now()) }); if (H.log.length > 30) H.log.shift(); return r; };
    new MutationObserver(() => { for (const t of document.querySelectorAll('.toast')) if (!t.dataset.seen) { t.dataset.seen = 1; H.log.push({ toast: t.textContent }); } }).observe(document.getElementById('toasts'), { childList: true });
    window.__H = H;
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// evaluate corto con reintento: algunas versiones de Chromium/Playwright pierden
// el contexto de evaluaciones largas aunque la página siga intacta
export async function ev(page, fn, arg) {
  for (let i = 0; ; i++) {
    try { return await page.evaluate(fn, arg); }
    catch (e) { if (i < 5 && /Execution context was destroyed|Cannot find context/.test(e.message)) { await sleep(120); continue; } throw e; }
  }
}
// espera a que una condición sea verdadera en la página (sondeo cada 80 ms)
export async function waitIn(page, fn, arg = null, opts = {}) {
  const timeout = opts.timeout || 15000, t0 = Date.now();
  for (;;) {
    if (await ev(page, fn, arg)) return true;
    if (Date.now() - t0 > timeout) throw new Error('tiempo agotado esperando: ' + String(fn).slice(0, 120));
    await sleep(80);
  }
}
export async function walk(page, x, y, f) {
  await ev(page, ([x, y, f]) => window.__H.startWalk(x, y, f), [x, y, f || null]);
  await waitIn(page, () => window.__H.walkState.done, null, { timeout: 60000 });
  const err = await ev(page, () => window.__H.walkState.err);
  if (err) throw new Error(err);
}
export const target = (page) => ev(page, () => window.__H.target());
export const inv = (page) => ev(page, () => window.__H.inv());
export const face = (page, d) => ev(page, (d) => window.__H.face(d), d);

// Toca el botón grande de acción como lo haría un dedo
export async function act(page, times = 1, wait = 420) {
  for (let i = 0; i < times; i++) {
    await page.locator('button.action').dispatchEvent('pointerdown');
    await page.locator('button.action').dispatchEvent('pointerup');
    await page.waitForTimeout(wait);
  }
}
