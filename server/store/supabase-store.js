// Guarda las islas en una tabla de Supabase (Postgres) usando su API REST.
// Sirve para hostings gratuitos sin disco persistente (por ejemplo Render free).
// No necesita dependencias: usa fetch de Node.
//
// Clave: la "secret key" (sb_secret_...) o la vieja "service_role". Nunca la publiques.
//
// SQL para crear la tabla (Supabase → SQL Editor):
//   create table if not exists islands (
//     id text primary key,
//     data jsonb not null,
//     updated_at timestamptz not null default now()
//   );
//   alter table islands enable row level security;  -- sin políticas: solo la service key accede
export class SupabaseStore {
  constructor(url, serviceKey, table = 'islands') {
    if (!url || !serviceKey) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
    this.base = url.replace(/\/+$/, '') + '/rest/v1/' + encodeURIComponent(table);
    this.key = serviceKey;
    this.table = table;
  }

  describe() { return `Supabase (tabla ${this.table})`; }

  headers(extra = {}) {
    // Las claves nuevas de Supabase (sb_secret_...) van solo en "apikey"; las
    // viejas (service_role, que son JWT) también en Authorization.
    const isJwt = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(this.key);
    return { apikey: this.key, ...(isJwt ? { Authorization: `Bearer ${this.key}` } : {}), 'Content-Type': 'application/json', ...extra };
  }

  async init() {
    const r = await fetch(`${this.base}?select=id&limit=1`, { headers: this.headers() });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`No pude leer la tabla "${this.table}" en Supabase (${r.status}). ¿La creaste con el SQL del README? ${body.slice(0, 200)}`);
    }
  }

  async loadAll() {
    const out = [];
    const page = 200;
    for (let offset = 0; ; offset += page) {
      const r = await fetch(`${this.base}?select=id,data&order=id.asc&limit=${page}&offset=${offset}`, { headers: this.headers() });
      if (!r.ok) throw new Error(`Supabase respondió ${r.status} al cargar islas`);
      const rows = await r.json();
      for (const row of rows) if (row && row.data) out.push(row.data);
      if (rows.length < page) break;
    }
    return out;
  }

  async save(data) {
    const r = await fetch(`${this.base}?on_conflict=id`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify([{ id: data.id, data, updated_at: new Date().toISOString() }]),
    });
    if (!r.ok) throw new Error(`Supabase respondió ${r.status} al guardar: ${(await r.text()).slice(0, 200)}`);
  }
}
