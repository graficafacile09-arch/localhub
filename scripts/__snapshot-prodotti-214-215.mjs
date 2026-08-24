/**
 * SNAPSHOT DI ROLLBACK — prodotti 214 e 215 (FASE 8)
 * Salva lo stato completo dei due record (tutti i campi) prima della pulizia.
 * Solo lettura. Il file di output permette un ripristino manuale.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

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
const IDS = [214, 215];

const { data: prodotti } = await db.from("prodotti").select("*").in("id", IDS);
const { data: media } = await db
  .from("product_media")
  .select("*")
  .in("product_id", IDS.map(String));
const { data: varianti } = await db
  .from("prodotto_varianti")
  .select("*")
  .in("prodotto_id", IDS);

const snapshot = {
  data: new Date().toISOString(),
  prodotti: prodotti ?? [],
  product_media: media ?? [],
  prodotto_varianti: varianti ?? [],
};
writeFileSync("scripts/__snapshot-prodotti-214-215.json", JSON.stringify(snapshot, null, 2));
console.log("Snapshot salvato: scripts/__snapshot-prodotti-214-215.json");
console.log(`Prodotti: ${(prodotti ?? []).length} | media: ${(media ?? []).length} | varianti: ${(varianti ?? []).length}`);
for (const p of prodotti ?? []) {
  console.log(`  [${p.id}] "${p.nome}" | negozio=${p.negozio_id} | attivo=${p.attivo} | origine=${p.origine_pubblicazione}`);
  console.log(`    immagine_principale=${p.immagine_principale}`);
}
process.exit(0);
