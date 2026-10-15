// Datos del juego compartidos entre servidor y cliente.
// Todo lo que afecta reglas (recetas, tiempos, recompensas) vive acá para que
// el servidor sea la autoridad y el cliente solo lo muestre.

export const TILE = 16;
export const SPEED = 4.6;            // casillas por segundo
export const MAX_HP = 10;            // medias vidas (5 corazones)
export const REACH = 1.9;            // distancia máxima (en casillas) para interactuar
export const DAY_MS = 24 * 60 * 1000; // un día del juego = 24 minutos reales
export const NOTE_MAX = 140;
export const NAME_MAX = 14;

// ---------------------------------------------------------------- objetos
// cat: herramienta | material | flor | semilla | cultivo | pez | comida | mueble
export const ITEMS = {
  azada:        { name: 'Azada', cat: 'herramienta', desc: 'Prepara la tierra de la huerta.' },
  regadera:     { name: 'Regadera', cat: 'herramienta', desc: 'Riega los cultivos. Nunca se vacía.' },
  hacha:        { name: 'Hacha', cat: 'herramienta', desc: 'Tala árboles para conseguir madera.' },
  pico:         { name: 'Pico', cat: 'herramienta', desc: 'Rompe piedras y minerales.', power: 1 },
  pico_cobre:   { name: 'Pico de cobre', cat: 'herramienta', desc: 'Pica el doble de rápido y rompe cuarzo.', power: 2 },
  cana:         { name: 'Caña de pescar', cat: 'herramienta', desc: 'Pescá desde la orilla o el muelle.' },
  espada:       { name: 'Espada de madera', cat: 'herramienta', desc: 'Para defenderse en la cueva.', dmg: 2 },

  ramita:       { name: 'Ramita', cat: 'material', desc: 'Sale de los arbustos y los árboles.' },
  piedra:       { name: 'Piedra', cat: 'material', desc: 'Firme y útil para construir.' },
  madera:       { name: 'Madera', cat: 'material', desc: 'Tablas para muebles y proyectos.' },
  fibra:        { name: 'Fibra', cat: 'material', desc: 'Pasto alto trenzado.' },
  cobre:        { name: 'Cobre', cat: 'material', desc: 'Mineral rojizo de la cueva.' },
  cuarzo:       { name: 'Cuarzo rosa', cat: 'material', desc: 'Cristal rosado y escaso.' },
  musgo:        { name: 'Gelatina de musgo', cat: 'material', desc: 'La deja un Musguito al irse.' },
  polvo:        { name: 'Polvo brillante', cat: 'material', desc: 'Lo suelta un Polillín. Brilla de noche.' },
  perla:        { name: 'Perla de cueva', cat: 'material', desc: 'Un tesoro escondido.' },
  moneda:       { name: 'Moneda antigua', cat: 'material', desc: 'De algún viajero de otra época.' },

  flor_sol:     { name: 'Margarita de sol', cat: 'flor', desc: 'Amarilla y alegre.' },
  flor_azul:    { name: 'Campanilla', cat: 'flor', desc: 'Suena bajito cuando hay viento.' },
  flor_rosa:    { name: 'Rosa del alba', cat: 'flor', desc: 'Huele a mañana tranquila.' },
  flor_luna:    { name: 'Flor de luna', cat: 'flor', desc: 'Solo crece en el mirador.' },

  sem_rabanito: { name: 'Semillas de rabanito', cat: 'semilla', crop: 'rabanito', desc: 'Crece rápido (2 riegos).' },
  sem_frutilla: { name: 'Semillas de frutilla', cat: 'semilla', crop: 'frutilla', desc: 'Da varias frutillas (3 riegos).' },
  sem_calabaza: { name: 'Semillas de calabaza', cat: 'semilla', crop: 'calabaza', desc: 'Lenta pero generosa (3 riegos).' },

  rabanito:     { name: 'Rabanito', cat: 'cultivo', heal: 1, desc: 'Crocante. Recupera ½ corazón.' },
  frutilla:     { name: 'Frutilla', cat: 'cultivo', heal: 2, desc: 'Dulce. Recupera 1 corazón.' },
  calabaza:     { name: 'Calabaza', cat: 'cultivo', heal: 3, desc: 'Enorme. Recupera 1½ corazón.' },

  sardinita:    { name: 'Sardinita', cat: 'pez', rarity: 0, desc: 'Pequeña y plateada.' },
  pez_boton:    { name: 'Pez botón', cat: 'pez', rarity: 0, desc: 'Redondito, como un botón.' },
  trucha_melon: { name: 'Trucha melón', cat: 'pez', rarity: 1, desc: 'Verde con rayas claras.' },
  farolito:     { name: 'Pez farolito', cat: 'pez', rarity: 2, desc: 'Lleva una lucecita en la frente.' },
  carpa_corazon:{ name: 'Carpa corazón', cat: 'pez', rarity: 3, desc: 'Tiene una mancha con forma de corazón.' },

  ensalada:     { name: 'Ensalada de la huerta', cat: 'comida', heal: 4, desc: 'Recupera 2 corazones.' },
  pescado_asado:{ name: 'Pescado asado', cat: 'comida', heal: 4, desc: 'Recupera 2 corazones.' },
  sopa_calabaza:{ name: 'Sopa de calabaza', cat: 'comida', heal: 8, desc: 'Recupera 4 corazones.' },

  silla:        { name: 'Silla', cat: 'mueble', desc: 'Para sentarse un ratito.' },
  mesa:         { name: 'Mesa', cat: 'mueble', desc: 'Ocupa 2 casillas.' },
  cama:         { name: 'Cama doble', cat: 'mueble', desc: 'Descansar recupera toda la vida. 2×2.' },
  alfombra:     { name: 'Alfombra tejida', cat: 'mueble', desc: 'Se pueden poner muebles encima. 2×2.' },
  maceta:       { name: 'Maceta con margaritas', cat: 'mueble', desc: 'Un toque de verde.' },
  farol:        { name: 'Farol cálido', cat: 'mueble', desc: 'Ilumina la casa de noche.' },
  estante:      { name: 'Estante', cat: 'mueble', desc: 'Ocupa 2 casillas.' },
  caja_musical: { name: 'Caja musical', cat: 'mueble', desc: 'Tocala para escuchar una melodía.' },
  lampara:      { name: 'Lámpara de cuarzo', cat: 'mueble', desc: 'Luz rosada y suave.' },
  ramo:         { name: 'Ramo de flores', cat: 'mueble', desc: 'Un regalo lindo para la mesa o para alguien.' },
  cuadro:       { name: 'Cuadro del atardecer', cat: 'mueble', desc: 'Se cuelga en la pared. Un recuerdo del mirador.' },
  trofeo:       { name: 'Trofeo amistoso', cat: 'mueble', desc: 'Recuerdo de un desafío compartido.' },
};

export const FOOD_CATS = new Set(['cultivo', 'comida']);
export const PET_FOOD_CATS = new Set(['cultivo', 'comida', 'pez']);
export const TOOLS = ['azada', 'regadera', 'hacha', 'pico', 'pico_cobre', 'cana', 'espada'];

// ---------------------------------------------------------------- muebles
// layer 0: alfombras (se puede poner algo encima) · 1: muebles comunes · wall: en la pared
export const FURNITURE = {
  silla:        { w: 1, h: 1, layer: 1, use: 'sit' },
  mesa:         { w: 2, h: 1, layer: 1 },
  cama:         { w: 2, h: 2, layer: 1, use: 'rest' },
  alfombra:     { w: 2, h: 2, layer: 0 },
  maceta:       { w: 1, h: 1, layer: 1 },
  farol:        { w: 1, h: 1, layer: 1, light: '#ffcf7a' },
  estante:      { w: 2, h: 1, layer: 1 },
  caja_musical: { w: 1, h: 1, layer: 1, use: 'music' },
  lampara:      { w: 1, h: 1, layer: 1, light: '#ffb3c7' },
  ramo:         { w: 1, h: 1, layer: 1 },
  cuadro:       { w: 1, h: 1, layer: 'wall' },
  trofeo:       { w: 1, h: 1, layer: 1 },
};

// ---------------------------------------------------------------- recetas
export const RECIPES = [
  { id: 'hacha',        cat: 'Herramientas', out: { hacha: 1 }, in: { ramita: 3, piedra: 2 }, unique: true },
  { id: 'pico',         cat: 'Herramientas', out: { pico: 1 }, in: { ramita: 3, piedra: 3 }, unique: true },
  { id: 'cana',         cat: 'Herramientas', out: { cana: 1 }, in: { ramita: 3, fibra: 3 }, unique: true },
  { id: 'espada',       cat: 'Herramientas', out: { espada: 1 }, in: { madera: 6, fibra: 2 }, unique: true },
  { id: 'pico_cobre',   cat: 'Herramientas', out: { pico_cobre: 1 }, in: { pico: 1, cobre: 6, madera: 4 }, unique: true },

  { id: 'silla',        cat: 'Muebles', out: { silla: 1 }, in: { madera: 4 } },
  { id: 'mesa',         cat: 'Muebles', out: { mesa: 1 }, in: { madera: 8 } },
  { id: 'estante',      cat: 'Muebles', out: { estante: 1 }, in: { madera: 6, piedra: 2 } },
  { id: 'cama',         cat: 'Muebles', out: { cama: 1 }, in: { madera: 12, fibra: 6 } },
  { id: 'alfombra',     cat: 'Muebles', out: { alfombra: 1 }, in: { fibra: 8, flor_rosa: 1 } },
  { id: 'maceta',       cat: 'Muebles', out: { maceta: 1 }, in: { piedra: 3, flor_sol: 1 } },
  { id: 'ramo',         cat: 'Muebles', out: { ramo: 1 }, in: { flor_sol: 1, flor_azul: 1, flor_rosa: 1 } },
  { id: 'farol',        cat: 'Muebles', out: { farol: 1 }, in: { piedra: 3, madera: 1, polvo: 2 } },
  { id: 'caja_musical', cat: 'Muebles', out: { caja_musical: 1 }, in: { moneda: 2, madera: 4 } },
  { id: 'lampara',      cat: 'Muebles', out: { lampara: 1 }, in: { cuarzo: 2, polvo: 2 } },

  { id: 'ensalada',     cat: 'Cocina', out: { ensalada: 1 }, in: { rabanito: 2, frutilla: 1 } },
  { id: 'asado_sardi',  cat: 'Cocina', out: { pescado_asado: 1 }, in: { sardinita: 1, madera: 1 } },
  { id: 'asado_boton',  cat: 'Cocina', out: { pescado_asado: 1 }, in: { pez_boton: 1, madera: 1 } },
  { id: 'sopa',         cat: 'Cocina', out: { sopa_calabaza: 1 }, in: { calabaza: 1, rabanito: 1 } },

  { id: 'sem_rabanito', cat: 'Semillas', out: { sem_rabanito: 3 }, in: { rabanito: 1, fibra: 1 } },
  { id: 'sem_frutilla', cat: 'Semillas', out: { sem_frutilla: 3 }, in: { frutilla: 1, fibra: 1 } },
  { id: 'sem_calabaza', cat: 'Semillas', out: { sem_calabaza: 2 }, in: { calabaza: 1, fibra: 1 } },
];
export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map(r => [r.id, r]));

// ---------------------------------------------------------------- huerta
// steps: cantidad de riegos/etapas hasta estar lista. stepMs: duración de cada etapa regada.
export const CROPS = {
  rabanito: { name: 'Rabanito', seed: 'sem_rabanito', steps: 2, stepMs: 40_000, yield: [1, 2], seedChance: 0.55 },
  frutilla: { name: 'Frutilla', seed: 'sem_frutilla', steps: 3, stepMs: 55_000, yield: [2, 3], seedChance: 0.45 },
  calabaza: { name: 'Calabaza', seed: 'sem_calabaza', steps: 3, stepMs: 80_000, yield: [1, 2], seedChance: 0.6 },
};

// ---------------------------------------------------------------- pesca
export const RARITY = [
  { id: 0, name: 'Común',      points: 1, zone: 0.30, speed: 0.55, color: '#9fb7c9' },
  { id: 1, name: 'Poco común', points: 2, zone: 0.24, speed: 0.70, color: '#7ccf8a' },
  { id: 2, name: 'Raro',       points: 4, zone: 0.19, speed: 0.85, color: '#7aa8f0' },
  { id: 3, name: 'Legendario', points: 8, zone: 0.15, speed: 1.00, color: '#f08cb4' },
];
export const FISH_BY_RARITY = [['sardinita', 'pez_boton'], ['trucha_melon'], ['farolito'], ['carpa_corazon']];
export const FISH_SPOTS = {
  orilla:  { name: 'la orilla',  weights: [62, 26, 10, 2] },
  muelle:  { name: 'el muelle',  weights: [52, 30, 14, 4] },
  mirador: { name: 'el mirador', weights: [38, 32, 21, 9] },
};
export const FISH_HITS = 3;
export const FISH_MISSES = 3;
export const FISH_MAX_MS = 25_000;

// ---------------------------------------------------------------- recursos del mundo
// drops: [item, min, max, probabilidad]
export const NODES = {
  arbol:       { name: 'Árbol', tool: 'hacha', hits: 3, solid: true, respawnMs: 6 * 60_000, drops: [['madera', 2, 3, 1], ['ramita', 1, 1, 0.5]] },
  roca:        { name: 'Roca', tool: 'pico', hits: 2, solid: true, mineral: true, respawnMs: 5 * 60_000, drops: [['piedra', 2, 3, 1]] },
  roca_cobre:  { name: 'Veta de cobre', tool: 'pico', hits: 3, solid: true, mineral: true, respawnMs: 4 * 60_000, drops: [['cobre', 1, 2, 1], ['piedra', 1, 1, 0.5]] },
  roca_cuarzo: { name: 'Cuarzo rosa', tool: 'pico', minPower: 2, hits: 3, solid: true, mineral: true, respawnMs: 6 * 60_000, drops: [['cuarzo', 1, 1, 1]] },
  arbusto:     { name: 'Arbusto', hits: 1, solid: true, respawnMs: 3 * 60_000, drops: [['ramita', 2, 3, 1]] },
  piedrita:    { name: 'Piedritas', hits: 1, respawnMs: 3 * 60_000, drops: [['piedra', 1, 2, 1]] },
  pasto:       { name: 'Pasto alto', hits: 1, respawnMs: 3 * 60_000, drops: [['fibra', 1, 2, 1]] },
  flor_sol:    { name: 'Margarita de sol', hits: 1, respawnMs: 4 * 60_000, drops: [['flor_sol', 1, 1, 1]] },
  flor_azul:   { name: 'Campanilla', hits: 1, respawnMs: 4 * 60_000, drops: [['flor_azul', 1, 1, 1]] },
  flor_rosa:   { name: 'Rosa del alba', hits: 1, respawnMs: 4 * 60_000, drops: [['flor_rosa', 1, 1, 1]] },
  flor_luna:   { name: 'Flor de luna', hits: 1, respawnMs: 6 * 60_000, drops: [['flor_luna', 1, 1, 1]] },
  // decorativos / interactivos (no se recolectan)
  cerca:       { name: 'Cerca', solid: true, deco: true },
  farola:      { name: 'Farola', solid: true, deco: true, light: '#ffd28a' },
  buzon:       { name: 'Buzón', solid: true, special: 'mail' },
  tablon:      { name: 'Tablón de proyectos', solid: true, special: 'projects' },
  banco:       { name: 'Banco del mirador', solid: true, special: 'bench' },
  cofre:       { name: 'Cofre', solid: true, special: 'chest' },
  canasta:     { name: 'Camita del carpincho', solid: false, deco: true },
};
export const CHEST_COOLDOWN_MS = 30 * 60_000;
export const CHEST_LOOT = [
  [['perla', 1, 1, 0.6], ['moneda', 1, 2, 0.8], ['cuarzo', 1, 1, 0.3], ['sem_calabaza', 1, 2, 0.5]],
  [['moneda', 1, 1, 0.7], ['polvo', 1, 2, 0.6], ['sem_frutilla', 2, 3, 0.6], ['cobre', 2, 3, 0.6]],
  [['perla', 1, 1, 0.4], ['moneda', 1, 2, 0.7], ['flor_luna', 1, 1, 0.3], ['cuarzo', 1, 1, 0.5]],
];

// ---------------------------------------------------------------- criaturas de la cueva
export const ENEMIES = {
  musguito: { name: 'Musguito', hp: 4, speed: 1.6, dmg: 1, drop: ['musgo', 1, 1, 0.8], respawnMs: 60_000 },
  polillin: { name: 'Polillín', hp: 3, speed: 2.3, dmg: 1, drop: ['polvo', 1, 1, 0.8], respawnMs: 75_000 },
};
export const INVULN_MS = 1200;
export const REGEN_EVERY_MS = 6000;

// ---------------------------------------------------------------- proyectos compartidos
export const PROJECTS = {
  puente: { name: 'Reparar el puente del mirador', desc: 'Del otro lado hay un banco con la mejor vista, flores de luna y peces más raros.', needs: { madera: 20, piedra: 12, fibra: 8 } },
  casa2:  { name: 'Ampliar la casa', desc: 'Tirar una pared para tener el doble de lugar.', needs: { madera: 30, piedra: 20, cobre: 6 } },
  casa3:  { name: 'Sumar un rincón con ventanal', desc: 'Un cuarto nuevo al fondo, con ventanas grandes.', needs: { madera: 40, piedra: 25, cobre: 10, cuarzo: 3 }, requires: 'casa2' },
};

// ---------------------------------------------------------------- desafíos amistosos
export const CHALLENGES = {
  pesca: {
    name: 'El pez más raro',
    durationMs: 4 * 60_000,
    rules: ['Gana quien pesque el pez de mayor rareza.', 'Si empatan, cuenta la suma de puntos de todos los peces.', 'Común 1 · Poco común 2 · Raro 4 · Legendario 8'],
    reward: { pescado_asado: 2, sardinita: 1 },
    hat: 'sombrero_pescador',
  },
  mineria: {
    name: 'Carrera de minerales',
    durationMs: 3 * 60_000,
    rules: ['Gana quien junte más minerales picando rocas (en la isla o en la cueva).', 'Durante el desafío las rocas reaparecen enseguida: nadie se queda sin.'],
    reward: { cobre: 3, piedra: 4 },
    hat: 'casco_minero',
  },
  cosecha: {
    name: 'Cosecha relámpago',
    durationMs: 4 * 60_000,
    rules: ['Gana quien coseche más productos.', 'Llueve magia: todo se riega solo y crece 4 veces más rápido.', 'Cada uno solo puede cosechar lo que plantó.'],
    reward: { sem_rabanito: 4, sem_frutilla: 2, sem_calabaza: 1 },
    hat: 'corona_flores',
  },
};
export const CHALLENGE_PROPOSAL_MS = 45_000;
export const CHALLENGE_COUNTDOWN_MS = 3_000;
export const HATS = {
  sombrero_pescador: 'Sombrero de pescador',
  casco_minero: 'Casco con farolito',
  corona_flores: 'Corona de flores',
};

// ---------------------------------------------------------------- personalización
export const LOOK = {
  skin: ['#f8dcc2', '#eebd96', '#d29a72', '#a8714f', '#734a33'],
  hairStyles: ['Corto', 'Largo', 'Rodete', 'Rulos'],
  hairColors: ['#3b2a26', '#6e4429', '#b8783a', '#e2c07a', '#d26b5f', '#8f6bc6', '#4f72b5', '#ece6dc'],
  clothes: ['#f29bb0', '#f2c46d', '#94d39a', '#8cc7e8', '#b9a3ea', '#f6f1e4', '#e8836b', '#5d7aa2'],
};
export const DEFAULT_LOOK = { skin: 1, hair: 0, hairColor: 1, shirt: 0, pants: 7, hat: null };

export const START_ITEMS = { azada: 1, regadera: 1, sem_rabanito: 6, sem_frutilla: 3, sem_calabaza: 2 };

// ---------------------------------------------------------------- mascota
export const PET = {
  species: 'carpincho',
  petCooldownMs: 20_000,
  fullMs: 8 * 60_000,
  giftEveryMs: 12 * 60_000,
  giftLoot: [['flor_sol', 1, 1], ['flor_azul', 1, 1], ['flor_rosa', 1, 1], ['ramita', 2, 2], ['piedra', 2, 2], ['sem_frutilla', 1, 2], ['moneda', 1, 1]],
};

export const EMOTES = ['corazon', 'saludo', 'nota', 'risa', 'estrella', 'pregunta'];

export function itemName(id, qty = 1) {
  const it = ITEMS[id];
  return it ? it.name : id;
}
