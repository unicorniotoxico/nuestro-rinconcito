// Ayudantes de DOM. Todo el texto entra con textContent (nunca innerHTML con
// datos de jugadores), así un nombre o una nota no pueden inyectar código.
import * as Sp from './sprites.js';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const urls = new Map();
export function iconURL(id) {
  if (!urls.has(id)) urls.set(id, Sp.icon(id).toDataURL());
  return urls.get(id);
}
export function icon(id, cls = 'ico') { return h('img', { class: cls, src: iconURL(id), alt: '', draggable: 'false' }); }
export function canvasImg(canvas, cls = 'ico') { return h('img', { class: cls, src: canvas.toDataURL(), alt: '', draggable: 'false' }); }

export function ago(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'recién';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const hh = Math.round(m / 60);
  if (hh < 24) return `hace ${hh} h`;
  const d = Math.round(hh / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

export function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
