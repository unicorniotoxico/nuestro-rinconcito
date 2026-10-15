// Guarda cada isla como un JSON en DATA_DIR/islands/<id>.json.
// Escritura atómica: archivo temporal + fsync + rename, y una copia .bak
// de la versión anterior por si algo sale mal a mitad de camino.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const SAFE_ID = /^[A-Za-z0-9_-]{4,40}$/;

export class FileStore {
  constructor(dataDir) {
    this.dir = path.resolve(dataDir, 'islands');
  }

  describe() { return `archivos en ${this.dir}`; }

  async init() {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async loadAll() {
    const out = [];
    const files = await fs.readdir(this.dir);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const file = path.join(this.dir, f);
      try {
        out.push(JSON.parse(await fs.readFile(file, 'utf8')));
      } catch (e) {
        console.warn(`[guardado] ${f} está dañado (${e.message}); probando con la copia .bak`);
        try { out.push(JSON.parse(await fs.readFile(file + '.bak', 'utf8'))); }
        catch { console.error(`[guardado] no se pudo recuperar ${f}`); }
      }
    }
    return out;
  }

  async save(data) {
    if (!SAFE_ID.test(data.id)) throw new Error('id de isla inválido');
    const file = path.join(this.dir, data.id + '.json');
    const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    const fh = await fs.open(tmp, 'w');
    try {
      await fh.writeFile(JSON.stringify(data));
      await fh.sync();
    } finally {
      await fh.close();
    }
    try { await fs.copyFile(file, file + '.bak'); } catch { /* primera vez */ }
    await fs.rename(tmp, file);
  }
}
