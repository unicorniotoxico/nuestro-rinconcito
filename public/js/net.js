// Conexión con el servidor: WebSocket con reconexión automática,
// acciones con id único (si se reintenta, el servidor no las repite) y
// detección de "sin conexión".
export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.pending = new Map();
    this.status = 'idle'; // idle | connecting | online | offline
    this.auth = null;     // { t:'hello', token } o create/join
    this.retry = 0;
    this.lastMsgAt = 0;
    this.serverOffset = 0;
    this.rtt = 0;
    this.seq = 0;
    this.stopped = false;
    this.onStatus = () => {};
    setInterval(() => this.heartbeat(), 2500);
    window.addEventListener('online', () => { if (this.status === 'offline') this.reconnectNow(); });
    window.addEventListener('offline', () => this.setStatus('offline'));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.auth && this.status !== 'online') this.reconnectNow();
      if (!document.hidden && this.ws && this.ws.readyState === 1) this.ping();
    });
  }

  url() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}${location.pathname.replace(/[^/]*$/, '')}ws`;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }
  emit(type, msg) { for (const fn of this.handlers.get(type) || []) fn(msg); }

  setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.onStatus(s);
  }

  connect(auth) {
    this.auth = auth;
    this.stopped = false;
    this.open();
  }

  stop() { this.stopped = true; this.auth = null; if (this.ws) try { this.ws.close(); } catch { /* */ } }

  open() {
    if (this.stopped) return;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    this.setStatus(this.status === 'online' ? 'offline' : 'connecting');
    let ws;
    try { ws = new WebSocket(this.url()); } catch { this.scheduleRetry(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.lastMsgAt = Date.now();
      ws.send(JSON.stringify(this.auth));
      this.ping();
    };
    ws.onmessage = (e) => {
      this.lastMsgAt = Date.now();
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === 'pong') {
        if (msg.c) { this.rtt = Date.now() - msg.c; this.serverOffset = msg.now + this.rtt / 2 - Date.now(); }
        return;
      }
      if (msg.t === 'welcome') {
        this.retry = 0;
        this.serverOffset = msg.serverNow - Date.now();
        this.setStatus('online');
      }
      if (msg.t === 'res') {
        const p = this.pending.get(msg.id);
        if (p) { this.pending.delete(msg.id); clearTimeout(p.timer); p.resolve(msg); }
        return;
      }
      if (msg.t === 'token') {
        // a partir de ahora siempre volvemos con la llave personal
        this.auth = { t: 'hello', token: msg.token };
      }
      if (msg.t === 'autherr' || msg.t === 'kicked') this.stopped = true;
      this.emit(msg.t, msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      for (const [id, p] of this.pending) { clearTimeout(p.timer); p.resolve({ ok: false, err: 'Se cortó la conexión', offline: true, id }); }
      this.pending.clear();
      if (this.stopped) return;
      this.setStatus('offline');
      this.scheduleRetry();
    };
    ws.onerror = () => { /* onclose se encarga */ };
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    const wait = Math.min(8000, 700 * 2 ** this.retry) + Math.random() * 300;
    this.retry++;
    this.retryTimer = setTimeout(() => this.open(), wait);
  }
  reconnectNow() {
    if (!this.auth) return;
    this.stopped = false;
    clearTimeout(this.retryTimer);
    this.retry = 0;
    if (this.ws && this.ws.readyState === 1) return;
    if (this.ws) { try { this.ws.close(); } catch { /* */ } this.ws = null; }
    this.open();
  }

  ping() { this.sendRaw({ t: 'ping', c: Date.now() }); }
  heartbeat() {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ping();
    // sin noticias del servidor hace rato: la conexión está muerta aunque el navegador no lo sepa
    if (Date.now() - this.lastMsgAt > 9000) { try { this.ws.close(); } catch { /* */ } }
  }

  sendRaw(msg) {
    if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(msg)); return true; }
    return false;
  }

  // Acción con respuesta. Nunca se reintenta sola: si no hay conexión, falla.
  act(a, params = {}) {
    const id = `${Date.now().toString(36)}${(++this.seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    return new Promise((resolve) => {
      if (this.status !== 'online' || !this.sendRaw({ t: 'act', id, a, ...params })) {
        resolve({ ok: false, err: 'Sin conexión: esperá a que vuelva', offline: true });
        return;
      }
      const timer = setTimeout(() => { this.pending.delete(id); resolve({ ok: false, err: 'El servidor tardó demasiado', timeout: true }); }, 9000);
      this.pending.set(id, { resolve, timer });
    });
  }

  now() { return Date.now() + this.serverOffset; }
}
