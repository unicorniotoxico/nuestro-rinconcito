// Minijuego de pesca determinista: el servidor manda una semilla y la rareza,
// el cliente dibuja el marcador y registra cuándo tocaste, y el servidor
// vuelve a calcular el resultado con los mismos números. Así nadie puede
// "inventarse" un pez legendario mandando un simple "gané".
import { RARITY, FISH_HITS, FISH_MISSES, FISH_MAX_MS } from './data.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fishParams(rarity, seed) {
  const r = RARITY[rarity] || RARITY[0];
  const rnd = mulberry32(seed);
  const zone = r.zone;
  const centers = [];
  for (let i = 0; i < FISH_HITS; i++) centers.push(zone / 2 + 0.04 + rnd() * (1 - zone - 0.08));
  return { rarity: r.id, zone, speed: r.speed, phase: rnd() * 2, wobble: 0.04 + r.id * 0.03, wobbleF: 1.3 + rnd() * 1.4, centers };
}

// Posición del marcador (0..1) a los t ms del comienzo.
export function markerPos(t, p) {
  const s = t / 1000;
  let u = (s * p.speed * 2 + p.phase + p.wobble * Math.sin(s * p.wobbleF * Math.PI * 2)) % 2;
  if (u < 0) u += 2;
  return u < 1 ? u : 2 - u;
}

// Evalúa la lista de toques (ms desde el comienzo). Tolerancia mínima para
// compensar el redondeo de cuadros del celular.
export function evalTaps(p, taps, tolerance = 0.025) {
  let hits = 0, misses = 0, last = -1;
  const detail = [];
  for (const t of taps) {
    if (typeof t !== 'number' || !Number.isFinite(t) || t < last || t < 0 || t > FISH_MAX_MS) return { hits: 0, misses: FISH_MISSES, success: false, invalid: true, detail };
    last = t;
    const c = p.centers[Math.min(hits, p.centers.length - 1)];
    const ok = Math.abs(markerPos(t, p) - c) <= p.zone / 2 + tolerance;
    detail.push(ok);
    if (ok) hits++; else misses++;
    if (hits >= FISH_HITS || misses >= FISH_MISSES) break;
  }
  return { hits, misses, success: hits >= FISH_HITS, detail };
}
