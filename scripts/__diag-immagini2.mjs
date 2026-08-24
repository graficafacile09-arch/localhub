/**
 * SCAN SISTEMICO IMMAGINI (FASE 7) — verifica se i 2 casi rotti sono isolati
 * o sistemici: confronta TUTTE le immagine_principale dei prodotti con gli
 * oggetti realmente presenti nel bucket. Solo lettura.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const BUCKET = "product-images";

// 1) tutti i prodotti con immagine
const { data: prodotti } = await db
  .from("prodotti")
  .select("id, negozio_id, nome, immagine_principale, attivo")
  .not("immagine_principale", "is", null);
console.log(`Prodotti con immagine: ${prodotti?.length ?? 0}`);

// 2) lista oggetti del bucket
const { data: files, error: errList } = await db.storage.from(BUCKET).list("", { limit: 10000, offset: 0 });
console.log(`Oggetti nel bucket ${BUCKET}: ${files?.length ?? 0} ${errList ? "ERR " + errList.message : ""}`);
const nomi = new Set((files ?? []).map((f) => f.name));

// 3) confronto
const rotti = [];
const perNegozio = {};
for (const p of prodotti ?? []) {
  const url = p.immagine_principale;
  if (!url) continue;
  // solo oggetti gestiti dall'app (path del bucket)
  const path = url.includes(`/${BUCKET}/`) ? url.split(`/${BUCKET}/`).pop()?.split("?")[0] : null;
  if (!path) continue;
  const esiste = nomi.has(path);
  if (!esiste) {
    rotti.push(p);
    perNegozio[p.negozio_id] = (perNegozio[p.negozio_id] || 0) + 1;
  }
}
console.log(`\nImmagini che referenziano oggetti ASSENTI dal bucket: ${rotti.length}`);
for (const p of rotti) {
  console.log(`  id=${p.id} | negozio=${p.negozio_id} | attivo=${p.attivo} | "${p.nome}"`);
  console.log(`    → ${p.immagine_principale}`);
}
if (rotti.length) {
  const ids = [...new Set(rotti.map((r) => r.negozio_id))];
  const { data: negozi } = await db.from("negozi").select("id, nome, deleted_at").in("id", ids);
  console.log("\nRipartizione per negozio:");
  for (const n of negozi ?? []) {
    console.log(`  ${n.id} "${n.nome}" deleted_at=${n.deleted_at ?? "no"} → ${perNegozio[n.id]} immagini rotte`);
  }
}
process.exit(0);
