import fs from "fs";
import { createClient } from "@supabase/supabase-js";

// Carica manualmente le variabili da .env.local (Next.js lo fa solo in build/dev).
function loadEnv(path) {
  const txt = fs.readFileSync(path, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      v = v.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
      v = v.replace(/\s+#.*$/, "");
      process.env[m[1]] = v;
    }
  }
}
loadEnv(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("ENV MANCANTE");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const out = {};

// 1) Colonna prodotto_offerta esiste?
const col = await db.from("prodotti").select("prodotto_offerta").limit(1);
out.colonnaProdottoOfferta = col.error ? `NO (${col.error.message})` : "SI";

// 2) Negozi demo
const stores = await db
  .from("negozi")
  .select("id, slug, nome, is_demo, attivo, deleted_at")
  .in("slug", ["demo-bottega-pollino", "demo-terre-pollino", "demo-sapori-castrovillari"]);
out.negoziDemo = (stores.data ?? []).map((s) => ({
  id: s.id,
  slug: s.slug,
  nome: s.nome,
  is_demo: s.is_demo,
  attivo: s.attivo,
  deleted_at: s.deleted_at,
}));
out.negoziDemoError = stores.error?.message ?? null;

// 3) Prodotti che potrebbero coincidere con i 4 richiesti
const termini = ["nutella", "caffè", "caffe", "coca", "cola", "latte", "polenghi", "pane", "acqua"];
const prodotti = await db
  .from("prodotti")
  .select("id, slug, negozio_id, nome, prezzo, attivo, quantita_disponibile, immagine_principale, prodotto_tipico, ha_varianti, created_at")
  .ilike("nome", "%" + "%") // tutti, poi filtro in memoria per termini
  .limit(300);
const rows = prodotti.data ?? [];
out.totaleProdottiQuery = rows.length;
out.match = rows
  .filter((p) => {
    const n = (p.nome ?? "").toLowerCase();
    return termini.some((t) => n.includes(t));
  })
  .map((p) => ({ id: p.id, slug: p.slug, nome: p.nome, negozio_id: p.negozio_id, prezzo: p.prezzo, attivo: p.attivo, qta: p.quantita_disponibile, tipico: p.prodotto_tipico }))
  .slice(0, 40);

// 4) Tutti i prodotti dei 3 negozi demo
const storeIds = (stores.data ?? []).map((s) => s.id);
if (storeIds.length) {
  const pDemo = await db
    .from("prodotti")
    .select("id, slug, nome, prezzo, attivo, quantita_disponibile")
    .in("negozio_id", storeIds)
    .limit(200);
  out.prodottiNegoziDemo = (pDemo.data ?? []).map((p) => ({ slug: p.slug, nome: p.nome, prezzo: p.prezzo, attivo: p.attivo, qta: p.quantita_disponibile }));
  out.prodottiNegoziDemoCount = (pDemo.data ?? []).length;
}

console.log(JSON.stringify(out, null, 2));
process.exit(0);