// Editor de personaje: nombre, piel, peinado, color de pelo, remera, pantalón y sombrero.
import { LOOK, DEFAULT_LOOK, NAME_MAX, HATS } from '../shared/data.js';
import * as Sp from './sprites.js';
import { h, clear } from './dom.js';
import { audio } from './audio.js';

export function characterEditor({ title, subtitle, initial, submitLabel, hats = [], extra = null, onBack = null }) {
  return new Promise((resolve) => {
    const look = { ...DEFAULT_LOOK, ...(initial?.look || {}) };
    if (!initial) { // un toque de azar para que cada uno arranque distinto
      look.hair = Math.floor(Math.random() * LOOK.hairStyles.length);
      look.hairColor = Math.floor(Math.random() * LOOK.hairColors.length);
      look.shirt = Math.floor(Math.random() * LOOK.clothes.length);
    }
    const prev = h('canvas', { class: 'char-preview', width: 32, height: 40 });
    const pg = prev.getContext('2d');
    let dirI = 0, frame = 0, alive = true;
    const dirs = ['down', 'right', 'up', 'left'];
    const draw = () => {
      pg.clearRect(0, 0, 32, 40);
      pg.fillStyle = 'rgba(60,40,60,0.18)'; pg.fillRect(10, 36, 12, 2);
      pg.drawImage(Sp.character(look, dirs[dirI], frame ? 1 + (frame % 2) : 0), 8, 17);
    };
    const anim = setInterval(() => { if (!alive) return; frame = (frame + 1) % 8; if (frame === 0) dirI = (dirI + 1) % 4; draw(); }, 220);

    const name = h('input', { class: 'text-in', type: 'text', maxlength: String(NAME_MAX), placeholder: 'Tu nombre', autocomplete: 'off', enterkeyhint: 'done', value: initial?.name || '' });
    const err = h('p', { class: 'form-err', role: 'alert' });

    const swatchRow = (label, colors, key) => {
      const row = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': label });
      colors.forEach((col, i) => {
        const b = h('button', { class: 'swatch', type: 'button', 'aria-label': `${label} ${i + 1}`, style: { background: col }, onclick: () => { look[key] = i; audio.play('ui'); sync(); draw(); } });
        b.dataset.i = i;
        row.append(b);
      });
      return h('div', { class: 'field' }, h('span', { class: 'label', text: label }), row);
    };
    const hairRow = h('div', { class: 'swatches' });
    LOOK.hairStyles.forEach((nm, i) => {
      const b = h('button', { class: 'chip', type: 'button', text: nm, onclick: () => { look.hair = i; audio.play('ui'); sync(); draw(); } });
      b.dataset.i = i;
      hairRow.append(b);
    });
    const hatRow = h('div', { class: 'swatches' });
    const hatOpts = [null, ...hats];
    hatOpts.forEach((hat) => {
      const b = h('button', { class: 'chip', type: 'button', onclick: () => { look.hat = hat; audio.play('ui'); sync(); draw(); } }, hat ? HATS[hat] : 'Sin sombrero');
      b.dataset.hat = hat || '';
      hatRow.append(b);
    });

    const fields = h('div', { class: 'fields' },
      h('div', { class: 'field' }, h('span', { class: 'label', text: 'Nombre' }), name),
      swatchRow('Piel', LOOK.skin, 'skin'),
      h('div', { class: 'field' }, h('span', { class: 'label', text: 'Peinado' }), hairRow),
      swatchRow('Color de pelo', LOOK.hairColors, 'hairColor'),
      swatchRow('Remera', LOOK.clothes, 'shirt'),
      swatchRow('Pantalón', LOOK.clothes, 'pants'),
      hats.length ? h('div', { class: 'field' }, h('span', { class: 'label', text: 'Sombrero (premio de desafíos)' }), hatRow) : null,
      extra,
    );
    const sync = () => {
      for (const b of fields.querySelectorAll('.swatches')) {
        const key = b.closest('.field').querySelector('.label').textContent;
        const map = { 'Piel': 'skin', 'Color de pelo': 'hairColor', 'Remera': 'shirt', 'Pantalón': 'pants', 'Peinado': 'hair' };
        if (map[key] !== undefined) for (const s of b.children) s.classList.toggle('on', Number(s.dataset.i) === look[map[key]]);
        else for (const s of b.children) s.classList.toggle('on', (s.dataset.hat || null) === (look.hat || null));
      }
    };

    const submit = h('button', { class: 'btn primary big', type: 'button', text: submitLabel });
    const close = (val) => { alive = false; clearInterval(anim); wrap.remove(); resolve(val); };
    submit.addEventListener('click', () => {
      const nm = name.value.trim();
      if (!nm) { err.textContent = 'Poné un nombre (puede ser un apodo)'; name.focus(); audio.play('error'); return; }
      audio.play('ui');
      close({ name: nm, look: { ...look }, extra: extra ? extra.getValue?.() : null });
    });
    const back = onBack !== false ? h('button', { class: 'btn ghost', type: 'button', text: 'Volver', onclick: () => close(null) }) : null;

    const wrap = h('div', { class: 'screen creator' },
      h('div', { class: 'card creator-card' },
        h('h2', { text: title }),
        subtitle ? h('p', { class: 'muted', text: subtitle }) : null,
        h('div', { class: 'creator-body' }, h('div', { class: 'preview-box' }, prev), fields),
        err,
        h('div', { class: 'row-end' }, back, submit),
      ),
    );
    document.getElementById('screens').append(wrap);
    sync(); draw();
    if (!initial) setTimeout(() => name.focus(), 50);
  });
}

export { clear };
