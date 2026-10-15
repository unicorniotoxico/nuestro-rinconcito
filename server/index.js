// Servidor de "Nuestro rinconcito": sirve la PWA y el WebSocket del juego.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Hub } from './hub.js';
import { FileStore } from './store/file-store.js';
import { SupabaseStore } from './store/supabase-store.js';
import { ActionError } from './game/island.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;

// Carga opcional de un archivo .env (KEY=valor por línea). Lo que ya esté
// definido en el entorno tiene prioridad.
try {
  const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    if (env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no hay .env: se usan los valores por defecto */ }

export const config = {
  port: Number(env.PORT || 3000),
  host: env.HOST || '0.0.0.0',
  dataDir: env.DATA_DIR || path.join(ROOT, 'data'),
  storage: (env.STORAGE || 'file').toLowerCase(),
  trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
  allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  maxIslands: Number(env.MAX_ISLANDS || 500),
  createPerHour: Number(env.CREATE_PER_HOUR || 6),
  joinTriesPer10Min: Number(env.JOIN_TRIES_PER_10MIN || 20),
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; media-src 'self' blob:; worker-src 'self'; manifest-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let rel = decodeURIComponent(url.pathname);
  // /healthz lo consulta la app de Android para saber si el servidor ya "despertó" (CORS abierto: no tiene datos)
  if (rel === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); return res.end('ok'); }
  let base = path.join(ROOT, 'public');
  if (rel.startsWith('/shared/')) { base = path.join(ROOT, 'shared'); rel = rel.slice('/shared'.length); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.resolve(base, '.' + rel);
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
      return res.end('No encontrado');
    }
    const ext = path.extname(file);
    const immutable = rel.startsWith('/icons/') || rel.startsWith('/fonts/');
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': immutable ? 'public, max-age=604800' : 'no-cache',
      ...SECURITY_HEADERS,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// Límite simple por IP con ventana deslizante
class RateLimiter {
  constructor(max, windowMs) { this.max = max; this.windowMs = windowMs; this.hits = new Map(); }
  allow(key) {
    const t = Date.now();
    const arr = (this.hits.get(key) || []).filter(x => t - x < this.windowMs);
    if (arr.length >= this.max) { this.hits.set(key, arr); return false; }
    arr.push(t); this.hits.set(key, arr);
    return true;
  }
  sweep() { const t = Date.now(); for (const [k, v] of this.hits) if (!v.some(x => t - x < this.windowMs)) this.hits.delete(k); }
}

export async function startServer(overrides = {}) {
  const cfg = { ...config, ...overrides };
  const store = cfg.store || (cfg.storage === 'supabase' && !overrides.dataDir
    ? new SupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, env.SUPABASE_TABLE || 'islands')
    : new FileStore(cfg.dataDir));
  const hub = new Hub(store, { maxIslands: cfg.maxIslands });
  const loaded = await hub.init();

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res);
  });

  const createLimit = new RateLimiter(cfg.createPerHour, 60 * 60_000);
  const joinLimit = new RateLimiter(cfg.joinTriesPer10Min, 10 * 60_000);
  const helloLimit = new RateLimiter(60, 60_000);

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024, perMessageDeflate: false });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws') { socket.destroy(); return; }
    const origin = req.headers.origin;
    if (origin) {
      // Solo se aceptan conexiones desde la propia página del juego (evita que otro
      // sitio abra un WebSocket en nombre del visitante).
      let ok = false;
      try {
        const o = new URL(origin);
        const hosts = [req.headers.host, req.headers['x-forwarded-host']].filter(Boolean).map(h => String(h).split(',')[0].trim());
        ok = cfg.allowedOrigins.length ? cfg.allowedOrigins.includes(o.origin) : hosts.includes(o.host);
      } catch { ok = false; }
      if (!ok) {
        console.warn(`[ws] conexión rechazada desde el origen ${origin} (host ${req.headers.host}). Si es tu dominio, agregalo a ALLOWED_ORIGINS.`);
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return;
      }
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });

  const clientIp = (req) => {
    if (cfg.trustProxy && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
    return req.socket.remoteAddress || '?';
  };

  wss.on('connection', (ws, req) => {
    ws.ip = clientIp(req);
    ws.alive = true;
    ws.bucket = { tokens: 80, last: Date.now() };
    ws.strikes = 0;
    ws.authTimer = setTimeout(() => { if (!ws.ctx) ws.close(4000, 'sin identificar'); }, 20_000);
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (raw, isBinary) => {
      if (isBinary) return;
      // límite de mensajes por conexión (cubeta de fichas: 45/s, ráfaga de 90)
      const t = Date.now();
      const b = ws.bucket;
      b.tokens = Math.min(90, b.tokens + ((t - b.last) / 1000) * 45);
      b.last = t;
      if (b.tokens < 1) { if (++ws.strikes > 300) ws.close(4008, 'demasiados mensajes'); return; }
      b.tokens -= 1;
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      ws.alive = true;
      if (msg.t === 'ping') { hub.sendRaw(ws, { t: 'pong', now: Date.now(), c: msg.c }); return; }
      if (!ws.ctx) { handleAuth(ws, msg); return; }
      ws.ctx.island.handle(ws.ctx.pid, msg);
    });
    ws.on('close', () => { clearTimeout(ws.authTimer); hub.detach(ws); });
    ws.on('error', () => { /* el cierre se maneja en close */ });
  });

  function authErr(ws, err, code) { hub.sendRaw(ws, { t: 'autherr', err, code }); }

  function handleAuth(ws, msg) {
    try {
      if (msg.t === 'hello') {
        if (!helloLimit.allow(ws.ip)) return authErr(ws, 'Demasiados intentos. Esperá un minuto', 'rate');
        const a = hub.auth(msg.token);
        if (!a) return authErr(ws, 'No encontramos tu isla con esa llave. ¿Quizás se borró el servidor?', 'bad_token');
        hub.attach(ws, a.island, a.pid);
      } else if (msg.t === 'create') {
        if (!createLimit.allow(ws.ip)) return authErr(ws, 'Se crearon demasiadas islas desde esta conexión. Probá más tarde', 'rate');
        const r = hub.createIsland(msg.profile);
        hub.sendRaw(ws, { t: 'token', token: r.token, pid: r.pid, islandId: r.island.id });
        hub.attach(ws, r.island, r.pid);
      } else if (msg.t === 'join') {
        if (!joinLimit.allow(ws.ip)) return authErr(ws, 'Demasiados intentos con códigos. Esperá unos minutos', 'rate');
        const r = hub.joinIsland(msg.code, msg.profile);
        hub.sendRaw(ws, { t: 'token', token: r.token, pid: r.pid, islandId: r.island.id });
        hub.attach(ws, r.island, r.pid);
      }
    } catch (e) {
      if (e instanceof ActionError) authErr(ws, e.message, e.code);
      else { console.error('[auth]', e); authErr(ws, 'Error del servidor'); }
    }
  }

  // latidos: cierra conexiones muertas (celulares que se quedaron sin señal)
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      try { ws.ping(); } catch { /* nada */ }
    }
    createLimit.sweep(); joinLimit.sweep(); helloLimit.sweep();
  }, 20_000);

  let lastFast = Date.now();
  const fast = setInterval(() => { const t = Date.now(); hub.fastTick(t, Math.min(250, t - lastFast)); lastFast = t; }, 50);
  const slow = setInterval(() => hub.slowTick(Date.now()), 1000);

  await new Promise((resolve) => server.listen(cfg.port, cfg.host, resolve));
  const port = server.address().port;

  async function stop() {
    clearInterval(heartbeat); clearInterval(fast); clearInterval(slow);
    for (const ws of wss.clients) { try { ws.close(1001, 'reinicio'); } catch { /* */ } }
    await hub.flushAll();
    await new Promise(r => server.close(() => r()));
  }

  return { server, hub, port, stop, store, loaded };
}

// Arranque directo: `node server/index.js`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().then(({ port, stop, store, loaded }) => {
    console.log(`🌴 Nuestro rinconcito escuchando en http://localhost:${port}`);
    console.log(`   Guardado: ${store.describe()} · islas cargadas: ${loaded}`);
    let stopping = false;
    const bye = async (sig) => {
      if (stopping) return; stopping = true;
      console.log(`\n${sig}: guardando todo antes de cerrar…`);
      try { await stop(); } catch (e) { console.error(e); }
      process.exit(0);
    };
    process.on('SIGINT', () => bye('SIGINT'));
    process.on('SIGTERM', () => bye('SIGTERM'));
  }).catch((e) => {
    console.error('No se pudo iniciar el servidor:', e.message);
    process.exit(1);
  });
}
