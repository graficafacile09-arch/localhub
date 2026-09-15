import fs from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  const txt = fs.readFileSync(path, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      v = v.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
      process.env[m[1]] = v;
    }
  }
}
loadEnv(".env.local");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const out = {};
const s = await db
  .from("negozi")
  .select("id, slug, nome, is_demo, attivo, deleted_at, owner_user_id")
  .eq("id", "f3a82af7-dd47-482f-8a49-ea58e692238c");
out.negozioCoca = s.data ?? null;

const p = await db
  .from("prodotti")
  .select("*")
  .eq("id", 1395);
out.cocaCola = (p.data ?? []).map((r) => ({
  id: r.id,
  slug: r.slug,
  nome: r.nome,
  negozio_id: r.negozio_id,
  prezzo: r.prezzo,
  attivo: r.attivo,
  qta_disponibile: r.quantita_disponibile,
  qta_riservata: r.quantita_riservata,
  ha_varianti: r.ha_varianti,
  immagine_principale: r.immagine_principale,
  categoria: r.categoria,
  marca: r.marca,
  prodotto_tipico: r.prodotto_tipico,
}));

console.log(JSON.stringify(out, null, 2));
process.exit(0);