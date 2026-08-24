/**
 * DIAGNOSTICA IMMAGINI PRODOTTO ROTTE (FASE 7 — SOLO LETTURA)
 *
 * Individua i prodotti che referenziano le due immagini 400 (027b5b72…,
 * eb113d40…), verifica gli oggetti Storage e confronta con immagini
 * funzionanti. Non modifica nulla.
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
const URL_SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(URL_SUPABASE, SERVICE_KEY);
const BUCKET = "product-images";
const IDS_ROTTI = ["027b5b72-177b-430e-b69b-b24f2212e616", "eb113d40-ca29-4860-9efe-edab69cd5efa"];

// ── 1. Prodotti che referenziano le due immagini ─────────────────────────
const { data: prodotti, error: errP } = await db
  .from("prodotti")
  .select("id, negozio_id, nome, immagine_principale, attivo")
  .or(
    IDS_ROTTI.map((id) => `immagine_principale.ilike.%${id}%`).join(",")
  );
console.log("== PRODOTTI con immagini rotte ==");
if (errP) console.log("  ERR:", errP.message);
for (const p of prodotti ?? []) {
  console.log(`  id=${p.id} | negozio=${p.negozio_id} | nome="${p.nome}" | attivo=${p.attivo}`);
  console.log(`    immagine_principale=${p.immagine_principale}`);
}

// righe product_media che referenziano i path rotti
const { data: media, error: errM } = await db
  .from("product_media")
  .select("id, product_id, storage_bucket, storage_path, public_url, role, position")
  .or(IDS_ROTTI.map((id) => `storage_path.ilike.%${id}%`).join(","));
console.log("== product_media con path rotti ==");
if (errM) console.log("  ERR:", errM.message);
for (const m of media ?? []) {
  console.log(`  media_id=${m.id} | product_id=${m.product_id} | role=${m.role} | pos=${m.position}`);
  console.log(`    bucket=${m.storage_bucket} | path=${m.storage_path}`);
  console.log(`    public_url=${m.public_url}`);
}

// nome negozi
const negozioIds = [...new Set([...(prodotti ?? []).map((p) => p.negozio_id), ...(media ?? []).map((m) => m.product_id).map(() => null)].filter(Boolean))];
if (negozioIds.length) {
  const { data: negozi } = await db.from("negozi").select("id, nome, slug").in("id", negozioIds);
  for (const n of negozi ?? []) console.log(`== Negozio ${n.id}: "${n.nome}" (slug ${n.slug})`);
}

// ── 2. Verifica oggetti Storage ──────────────────────────────────────────
console.log("\n== STORAGE bucket", BUCKET, "==");
// lista completa del bucket (per cercare i nomi esatti)
const { data: files, error: errList } = await db.storage.from(BUCKET).list("", { limit: 5000, offset: 0 });
if (errList) console.log("  ERR list:", errList.message);
const nomi = new Set((files ?? []).map((f) => f.name));
for (const id of IDS_ROTTI) {
  const candidati = (files ?? []).filter((f) => f.name.startsWith(id) || f.name.includes(id.slice(0, 8)));
  console.log(`  oggetto "${id}" → trovato in lista: ${candidati.length ? candidati.map((c) => `${c.name} (${c.metadata?.size ?? "?"}B, ${c.metadata?.mimetype ?? "?"})`).join(" | ") : "NO — assente dal bucket"}`);
}
console.log(`  tot oggetti nel bucket: ${files?.length ?? "?"}`);

// ── 3. Confronto: immagini FUNZIONANTI ───────────────────────────────────
console.log("\n== IMMAGINI FUNZIONANTI (campione) ==");
const { data: okProdotti } = await db
  .from("prodotti")
  .select("id, negozio_id, nome, immagine_principale")
  .not("immagine_principale", "is", null)
  .not("immagine_principale", "ilike", "%027b5b72%")
  .not("immagine_principale", "ilike", "%eb113d40%")
  .limit(5);
for (const p of okProdotti ?? []) {
  const url = p.immagine_principale;
  const path = url ? url.split(`/${BUCKET}/`).pop()?.split("?")[0] : null;
  const f = path ? (files ?? []).find((x) => x.name === path) : null;
  console.log(`  prodotto=${p.id} ("${p.nome}")`);
  console.log(`    url=${url}`);
  console.log(`    path=${path} | esiste=${!!f} | ${f ? `size=${f.metadata?.size}B mime=${f.metadata?.mimetype} created=${f.created_at}` : "ASSENTE"}`);
}

// ── 4. HTTP status delle URL (rotte + sane) ──────────────────────────────
console.log("\n== HTTP STATUS ==");
for (const p of [...(prodotti ?? []), ...(okProdotti ?? [])]) {
  const url = p.immagine_principale;
  if (!url) continue;
  try {
    const r = await fetch(url, { method: "HEAD" });
    console.log(`  ${r.status} ${url.slice(-70)}`);
  } catch (e) {
    console.log(`  ERR ${url.slice(-70)} — ${String(e).slice(0, 80)}`);
  }
}
process.exit(0);
