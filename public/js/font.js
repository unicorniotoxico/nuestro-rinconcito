// Fuente pixel propia (5 px de alto) para escribir dentro del mundo:
// nombres sobre los personajes, números que flotan, etc.
const G = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '#.#', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  '+': ['...', '.#.', '###', '.#.', '...'], '-': ['...', '...', '###', '...', '...'], '!': ['#', '#', '#', '.', '#'],
  '?': ['##.', '..#', '.#.', '...', '.#.'], '.': ['.', '.', '.', '.', '#'], ',': ['..', '..', '..', '.#', '#.'],
  ':': ['.', '#', '.', '#', '.'], '/': ['..#', '..#', '.#.', '#..', '#..'], ' ': ['..', '..', '..', '..', '..'],
  '¡': ['#', '.', '#', '#', '#'], '¿': ['.#.', '...', '.#.', '#..', '.##'], "'": ['#', '#', '.', '.', '.'],
  '(': ['.#', '#.', '#.', '#.', '.#'], ')': ['#.', '.#', '.#', '.#', '#.'], '×': ['...', '#.#', '.#.', '#.#', '...'],
  '♥': ['.#.#.', '#####', '#####', '.###.', '..#..'], '%': ['#.#', '..#', '.#.', '#..', '#.#'],
};
const ACCENT = { 'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ü': 'U', 'Ñ': 'N' };

function glyph(ch) {
  const up = ch.toUpperCase();
  if (G[up]) return { rows: G[up], mark: null };
  if (ACCENT[up]) return { rows: G[ACCENT[up]], mark: up === 'Ñ' ? 'tilde' : up === 'Ü' ? 'dots' : 'acute' };
  return { rows: G['?'], mark: null };
}

export function textWidth(str) {
  let w = 0;
  for (const ch of str) w += glyph(ch).rows[0].length + 1;
  return Math.max(0, w - 1);
}

const cache = new Map();
// Devuelve un canvas con el texto y un borde oscuro para que se lea sobre cualquier fondo.
export function textSprite(str, color = '#fff8ee', outline = '#3d2a35') {
  const key = str + '|' + color + '|' + outline;
  if (cache.has(key)) return cache.get(key);
  const w = textWidth(str) + 2, h = 9;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const drawAll = (col, ox, oy) => {
    g.fillStyle = col;
    let x = 1;
    for (const ch of str) {
      const { rows, mark } = glyph(ch);
      const gw = rows[0].length;
      for (let y = 0; y < 5; y++) for (let i = 0; i < gw; i++) if (rows[y][i] === '#') g.fillRect(x + i + ox, 3 + y + oy, 1, 1);
      if (mark === 'acute') g.fillRect(x + Math.floor(gw / 2) + ox, 1 + oy, 1, 1);
      if (mark === 'tilde') { g.fillRect(x + ox, 1 + oy, 2, 1); g.fillRect(x + 2 + ox, 0 + oy, 1, 1); }
      if (mark === 'dots') { g.fillRect(x + ox, 1 + oy, 1, 1); g.fillRect(x + gw - 1 + ox, 1 + oy, 1, 1); }
      x += gw + 1;
    }
  };
  if (outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) drawAll(outline, ox, oy);
  drawAll(color, 0, 0);
  cache.set(key, c);
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  return c;
}
