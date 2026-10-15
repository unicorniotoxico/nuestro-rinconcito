// Utilidades de prueba: un servidor real en un puerto libre y clientes
// WebSocket independientes (como dos celulares distintos).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server/index.js';

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export function tmpDir(name = 'rinconcito') {
  return fs.mkdtempSync(path.join(os.tmpdir(), name + '-'));
}

export async function server(dataDir = tmpDir()) {
  const s = await startServer({ port: 0, host: '127.0.0.1', dataDir, createPerHour: 1000, joinTriesPer10Min: 1000 });
  return { ...s, dataDir, url: `ws://127.0.0.1:${s.port}/ws` };
}

export class Client {
  constructor(url) {
    this.url = url;
    this.msgs = [];
    this.waiters = [];
    this.seq = 0;
  }
  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => resolve(this);
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        this.msgs.push(m);
        if (m.t === 'welcome') this.welcome = m;
        if (m.t === 'token') this.token = m.token;
        if (m.t === 'inv') this.inv = m.inv;
        if (m.t === 'hp') this.hp = m.hp;
        if (m.t === 'pos') this.pos = m;
        for (const w of [...this.waiters]) if (w.pred(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); clearTimeout(w.timer); w.resolve(m); }
      };
      this.ws.onclose = () => { this.closed = true; };
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  waitFor(pred, ms = 3000, what = 'mensaje') {
    const found = this.msgs.find(pred);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve, timer: setTimeout(() => reject(new Error(`timeout esperando ${what}`)), ms) };
      this.waiters.push(w);
    });
  }
  // espera un mensaje NUEVO (que llegue después de ahora)
  next(pred, ms = 3000, what = 'mensaje') {
    return new Promise((resolve, reject) => {
      const w = { pred, resolve, timer: setTimeout(() => reject(new Error(`timeout esperando ${what}`)), ms) };
      this.waiters.push(w);
    });
  }
  async act(a, params = {}, id = null) {
    id = id || `t${Date.now().toString(36)}${++this.seq}`;
    const p = this.next(m => m.t === 'res' && m.id === id, 4000, `respuesta a ${a}`);
    this.send({ t: 'act', id, a, ...params });
    return p;
  }
  async create(name = 'Lau', look = {}) {
    await this.open();
    this.send({ t: 'create', profile: { name, look } });
    await this.waitFor(m => m.t === 'welcome' || m.t === 'autherr', 3000, 'welcome');
    return this;
  }
  async join(code, name = 'Sofi') {
    await this.open();
    this.send({ t: 'join', code, profile: { name, look: { hair: 1 } } });
    const m = await this.waitFor(m => m.t === 'welcome' || m.t === 'autherr', 3000, 'welcome');
    return m;
  }
  async hello(token) {
    await this.open();
    this.send({ t: 'hello', token });
    return this.waitFor(m => m.t === 'welcome' || m.t === 'autherr', 3000, 'welcome');
  }
  close() { try { this.ws.close(); } catch { /* */ } return sleep(80); }
}

// Coloca al jugador en una posición (preparación de la prueba, del lado servidor)
export function place(srv, client, x, y, map = 'isla', dir = 'down') {
  const isl = srv.hub.islands.get(client.welcome.islandId);
  const p = isl.d.players[client.welcome.you];
  Object.assign(p, { map, x, y, dir });
  isl.lastMove[p.id] = Date.now();
  return { isl, p };
}

export function islandOf(srv, client) { return srv.hub.islands.get(client.welcome.islandId); }
