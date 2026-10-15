// Joystick virtual flotante (aparece donde apoyás el dedo) + teclado para compu.
export class Input {
  constructor(layer, stickEl, knobEl) {
    this.layer = layer; this.stick = stickEl; this.knob = knobEl;
    this.vx = 0; this.vy = 0;
    this.pid = null; this.ox = 0; this.oy = 0;
    this.keys = new Set();
    this.onTapWorld = null; // toque corto en el mapa (para decorar)
    this.enabled = true;
    const R = () => Math.min(60, Math.max(44, window.innerWidth * 0.12));

    layer.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      const leftZone = e.clientX < window.innerWidth * 0.6;
      this.downAt = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      if (this.pid !== null || !leftZone || this.placing) return;
      this.pid = e.pointerId;
      this.ox = e.clientX; this.oy = e.clientY;
      this.stick.style.left = `${e.clientX}px`; this.stick.style.top = `${e.clientY}px`;
      this.stick.classList.add('active');
      this.knob.style.transform = 'translate(-50%, -50%)';
      try { layer.setPointerCapture(e.pointerId); } catch { /* */ }
    });
    layer.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pid) return;
      const r = R();
      let dx = e.clientX - this.ox, dy = e.clientY - this.oy;
      const l = Math.hypot(dx, dy);
      if (l > r) {
        // el joystick "sigue" al dedo si se pasa del borde
        this.ox += (dx / l) * (l - r); this.oy += (dy / l) * (l - r);
        this.stick.style.left = `${this.ox}px`; this.stick.style.top = `${this.oy}px`;
        dx = e.clientX - this.ox; dy = e.clientY - this.oy;
      }
      const m = Math.min(1, Math.hypot(dx, dy) / r);
      const dead = 0.18;
      if (m < dead) { this.vx = 0; this.vy = 0; } else {
        const a = Math.atan2(dy, dx), k = Math.min(1, (m - dead) / (1 - dead) * 1.25);
        this.vx = Math.cos(a) * k; this.vy = Math.sin(a) * k;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const end = (e) => {
      const d = this.downAt;
      if (d && d.id === e.pointerId && performance.now() - d.t < 300 && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 12 && this.onTapWorld) this.onTapWorld(e.clientX, e.clientY);
      if (e.pointerId !== this.pid) return;
      this.pid = null; this.vx = 0; this.vy = 0;
      this.stick.classList.remove('active');
    };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
      if (this.onKey) this.onKey(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.pid = null; this.vx = 0; this.vy = 0; this.stick.classList.remove('active'); });
  }

  vector() {
    if (!this.enabled) return [0, 0];
    let kx = 0, ky = 0;
    const k = this.keys;
    if (k.has('ArrowLeft') || k.has('KeyA')) kx -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) kx += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) ky -= 1;
    if (k.has('ArrowDown') || k.has('KeyS')) ky += 1;
    if (kx || ky) { const l = Math.hypot(kx, ky); return [kx / l, ky / l]; }
    return [this.vx, this.vy];
  }

  reset() { this.pid = null; this.vx = 0; this.vy = 0; this.keys.clear(); this.stick.classList.remove('active'); }
}
