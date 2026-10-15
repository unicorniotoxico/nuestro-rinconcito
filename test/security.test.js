// Pruebas de seguridad básicas del servidor.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import WS from 'ws';
import { startServer } from '../server/index.js';
import { Client, tmpDir, sleep } from './helpers.js';

let srv, url;
before(async () => {
  srv = await startServer({ port: 0, host: '127.0.0.1', dataDir: tmpDir('rinconcito-seg'), joinTriesPer10Min: 3, createPerHour: 50 });
  url = `ws://127.0.0.1:${srv.port}/ws`;
});
after(() => srv.stop());

function rawGet(path) {
  return new Promise((resolve) => {
    const s = net.connect(srv.port, '127.0.0.1', () => s.write(`GET ${path} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`));
    let buf = '';
    s.on('data', d => { buf += d; });
    s.on('end', () => resolve(buf));
  });
}

test('no se puede leer código del servidor ni salir de las carpetas públicas', async () => {
  for (const p of ['/..%2fserver/index.js', '/shared/..%2f..%2fserver/hub.js', '/%2e%2e/package.json', '/../data/islands']) {
    const r = await rawGet(p);
    assert.match(r, /^HTTP\/1\.1 (403|404)/, p);
    assert.doesNotMatch(r, /startServer|tokenHash/);
  }
});

test('cabeceras de seguridad en la página', async () => {
  const r = await fetch(`http://127.0.0.1:${srv.port}/`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  const sw = await fetch(`http://127.0.0.1:${srv.port}/sw.js`);
  assert.equal(sw.status, 200);
});

test('el WebSocket rechaza otros orígenes (otro sitio no puede conectarse en tu nombre)', async () => {
  const err = await new Promise((resolve) => {
    const w = new WS(url, { origin: 'https://sitio-malo.example' });
    w.on('open', () => resolve('abrió'));
    w.on('unexpected-response', (req, res) => resolve(res.statusCode));
    w.on('error', (e) => resolve(e.message));
  });
  assert.equal(err, 403);
  const ok = await new Promise((resolve) => {
    const w = new WS(url, { origin: `http://127.0.0.1:${srv.port}` });
    w.on('open', () => { w.close(); resolve(true); });
    w.on('error', () => resolve(false));
  });
  assert.ok(ok, 'el mismo origen sí');
});

test('mensajes gigantes cierran la conexión y basura no rompe nada', async () => {
  const c = await new Client(url).create('Lau');
  for (const m of ['no-json', '[]', 'null', '{"t":"act","id":"abcd","a":"__proto__"}', '{"t":"act","id":"abce","a":"constructor"}', '{"t":"act","id":"abcf","a":"craft","r":{"x":1}}', '{"t":"mv","map":"isla","x":"NaN","y":1e309}']) c.ws.send(m);
  const r = await c.act('constructor', {});
  assert.equal(r.ok, false);
  const r2 = await c.act('toString', {});
  assert.equal(r2.ok, false);
  c.ws.send('x'.repeat(20_000));
  await sleep(200);
  assert.ok(c.closed, 'cerrada por tamaño');
  // el servidor sigue andando
  const d = await new Client(url).create('Otro');
  assert.ok(d.welcome);
  await d.close();
});

test('adivinar códigos de invitación tiene un límite de intentos', async () => {
  const codes = [];
  for (let i = 0; i < 5; i++) {
    const c = new Client(url);
    const r = await c.join('ZZZZZZZZ', 'X');
    codes.push(r.code);
    await c.close();
  }
  assert.deepEqual(codes.slice(0, 3), ['bad_code', 'bad_code', 'bad_code']);
  assert.equal(codes[3], 'rate');
});

test('las llaves se guardan solo como hash (si roban el archivo de guardado, no sirven para entrar)', async () => {
  const c = await new Client(url).create('Lau');
  const isl = srv.hub.islands.get(c.welcome.islandId);
  const json = JSON.stringify(isl.d);
  assert.ok(!json.includes(c.token), 'la llave no aparece en el guardado');
  const r = await new Client(url).hello(isl.d.players.p1.tokenHash);
  assert.equal(r.t, 'autherr', 'el hash no sirve como llave');
  await c.close();
});
