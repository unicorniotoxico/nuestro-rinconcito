import crypto from 'node:crypto';

export const now = () => Date.now();
export const rand = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;
export const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I
export function newInviteCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  return s;
}
export function normalizeCode(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}
export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
export const newId = (n = 9) => crypto.randomBytes(n).toString('base64url');

// Texto libre (nombres, notas): sin caracteres de control, espacios colapsados.
// Caracteres invisibles o de control que no queremos en nombres ni notas
const BAD_RANGES = [[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]];
const isBad = (cp) => BAD_RANGES.some(([a, b]) => cp >= a && cp <= b);
export function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  let out = '';
  for (const ch of s.normalize('NFC')) out += isBad(ch.codePointAt(0)) ? ' ' : ch;
  return [...out.replace(/\s+/g, ' ').trim()].slice(0, max).join('');
}

export function rollDrops(drops) {
  const out = {};
  for (const [item, min, max, p = 1] of drops) {
    if (rand() <= p) {
      const n = randInt(min, max);
      if (n > 0) out[item] = (out[item] || 0) + n;
    }
  }
  return out;
}

export function isInt(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max;
}
export function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
