// Guardado: archivos (atómico + copia de seguridad) y Supabase (contra un
// servidor falso que imita la API REST de Supabase/PostgREST).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { FileStore } from '../server/store/file-store.js';
import { SupabaseStore } from '../server/store/supabase-store.js';
import { startServer } from '../server/index.js';
import { Client, tmpDir } from './helpers.js';

function fakeSupabase(key) {
  const rows = new Map();
  const seen = [];
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    seen.push({ method: req.method, path: url.pathname, prefer: req.headers.prefer });
    if (req.headers.apikey !== key || (req.headers.authorization && req.headers.authorization !== `Bearer ${key}`)) { res.writeHead(401); return res.end('{"message":"no autorizado"}'); }
    if (/^eyJ/.test(key) !== !!req.headers.authorization) { res.writeHead(401); return res.end('{"message":"Authorization solo para claves JWT"}'); }
    if (url.pathname !== '/rest/v1/islands') { res.writeHead(404); return res.end('{"message":"tabla inexistente"}'); }
    if (req.method === 'GET') {
      const all = [...rows.values()].sort((a, b) => a.id.localeCompare(b.id));
      const off = Number(url.searchParams.get('offset') || 0), lim = Number(url.searchParams.get('limit') || 1000);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(all.slice(off, off + lim)));
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        assert.match(req.headers.prefer, /resolution=merge-duplicates/);
        for (const r of JSON.parse(body)) rows.set(r.id, r);
        res.writeHead(201); res.end();
      });
      return;
    }
    res.writeHead(405); res.end();
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, rows, seen, url: `http://127.0.0.1:${srv.address().port}` })));
}

test('archivos: guarda de forma atómica y recupera desde la copia si el archivo se daña', async () => {
  const dir = tmpDir('rinconcito-files');
  const st = new FileStore(dir);
  await st.init();
  await st.save({ id: 'isla_1', n: 1 });
  await st.save({ id: 'isla_1', n: 2 });
  let all = await st.loadAll();
  assert.deepEqual(all, [{ id: 'isla_1', n: 2 }]);
  fs.writeFileSync(path.join(dir, 'islands', 'isla_1.json'), '{roto');
  all = await st.loadAll();
  assert.deepEqual(all, [{ id: 'isla_1', n: 1 }], 'usa la copia .bak');
  await assert.rejects(st.save({ id: '../afuera', n: 0 }), /inválido/);
});

test('Supabase: con clave vieja tipo JWT también manda Authorization', async () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.firma-falsa';
  const fake = await fakeSupabase(jwt);
  const st = new SupabaseStore(fake.url, jwt);
  await st.init();
  await st.save({ id: 'isla1', n: 1 });
  assert.equal((await st.loadAll()).length, 1);
  fake.srv.close();
});

test('Supabase: guarda, carga y avisa claro si falta la tabla o la clave', async () => {
  const fake = await fakeSupabase('sb_secret_clave');
  const st = new SupabaseStore(fake.url, 'sb_secret_clave');
  await st.init();
  for (let i = 0; i < 205; i++) await st.save({ id: `isla${String(i).padStart(3, '0')}`, n: i });
  await st.save({ id: 'isla000', n: 999 });
  const all = await st.loadAll();
  assert.equal(all.length, 205, 'pagina de a 200');
  assert.equal(all.find(x => x.id === 'isla000').n, 999, 'upsert');
  await assert.rejects(new SupabaseStore(fake.url, 'otra').init(), /No pude leer la tabla/);
  await assert.rejects(new SupabaseStore(fake.url, 'sb_secret_clave', 'otra_tabla').init(), /No pude leer la tabla/);
  assert.throws(() => new SupabaseStore('', ''), /Faltan/);
  fake.srv.close();
});

test('Supabase: una isla sobrevive a un reinicio del servidor del juego', async () => {
  const fake = await fakeSupabase('k');
  const s1 = await startServer({ port: 0, host: '127.0.0.1', store: new SupabaseStore(fake.url, 'k') });
  const a = await new Client(`ws://127.0.0.1:${s1.port}/ws`).create('Lau');
  const tok = a.token;
  await a.close();
  await s1.stop();
  assert.equal(fake.rows.size, 1);
  const s2 = await startServer({ port: 0, host: '127.0.0.1', store: new SupabaseStore(fake.url, 'k') });
  const a2 = new Client(`ws://127.0.0.1:${s2.port}/ws`);
  const w = await a2.hello(tok);
  assert.equal(w.t, 'welcome');
  assert.equal(w.players.p1.name, 'Lau');
  await a2.close();
  await s2.stop();
  fake.srv.close();
});
