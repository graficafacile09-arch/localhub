#!/usr/bin/env node
/**
 * CHECK CATEGORIE PUBBLICHE
 *
 * Confronta la FONTE UNICA dell'editor (lib/categorie-negozio.ts) con
 * l'elenco usato dalla navigazione pubblica (stesso file: CATEGORIE_NEGOZIO_META)
 * e con la mappa icone centralizzata (lib/categorie-icone.ts).
 *
 * Atteso:
 *   71 categorie editor
 *   71 categorie pubbliche
 *   0  mancanti
 *   0  extra
 *   0  duplicate
 *   71 icone associate
 *
 * Esegui con:  node scripts/check-categorie-pubbliche.mjs
 * Esce con codice != 0 se una verifica fallisce.
 */

import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const srcCategorie = readFileSync(new URL("../lib/categorie-negozio.ts", import.meta.url), "utf8");
const srcIcone = readFileSync(new URL("../lib/categorie-icone.ts", import.meta.url), "utf8");

/** Estrarre il testo compreso tra due marker (esclusi). */
function blocco(src, start, end) {
  const i = src.indexOf(start);
  if (i < 0) throw new Error(`Marker non trovato: ${start}`);
  const j = src.indexOf(end, i);
  if (j < 0) throw new Error(`Marker non trovato: ${end}`);
  return src.slice(i + start.length, j);
}

/** Stessa logica di lib/slug.ts → toSlug (tenere allineata). */
function toSlug(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

// ── 1. Categorie editor (nomi) ────────────────────────────────────────────────
const nomi = blocco(srcCategorie, "export const CATEGORIE_NEGOZIO: string[] = [", "].sort(")
  .match(/"([^"]+)"/g)
  .map((s) => s.slice(1, -1));

// ── 2. Override slug (es. B&B → bed-and-breakfast) ────────────────────────────
const override = {};
const overrideBlock = blocco(
  srcCategorie,
  "const SLUG_CATEGORIA_OVERRIDE: Record<string, string> = {",
  "};"
);
for (const m of overrideBlock.matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)) override[m[1]] = m[2];

// ── 3. Slug pubblici (CATEGORIE_NEGOZIO_META) ─────────────────────────────────
const slugs = nomi.map((n) => override[n] ?? toSlug(n));

// ── 4. Chiavi della mappa icone (slug) ────────────────────────────────────────
const iconBlock = blocco(
  srcIcone,
  "export const ICONE_CATEGORIE: Record<string, StileIconaCategoria> = {",
  "};"
);
const iconKeys = [];
for (const m of iconBlock.matchAll(/^\s*(?:"([^"]+)"|([A-Za-z0-9_-]+))\s*:/gm)) {
  iconKeys.push(m[1] ?? m[2]);
}

// ── 5. Verifiche ──────────────────────────────────────────────────────────────
const duplicatiNomi = nomi.filter((n, i) => nomi.indexOf(n) !== i);
const duplicatiSlug = slugs.filter((s, i) => slugs.indexOf(s) !== i);

const iconSet = new Set(iconKeys);
const mancanti = slugs.filter((s) => !iconSet.has(s));
const extra = iconKeys.filter((s) => !slugs.includes(s));
const iconeAssociate = slugs.filter((s) => iconSet.has(s)).length;

const riga = (ok, msg) => `${ok ? "✅" : "❌"} ${msg}`;

console.log("=== CHECK CATEGORIE PUBBLICHE ===\n");
console.log(riga(nomi.length === 71, `categorie editor: ${nomi.length} (attese 71)`));
console.log(riga(slugs.length === 71, `categorie pubbliche (META): ${slugs.length} (attese 71)`));
console.log(riga(mancanti.length === 0, `mancanti: ${mancanti.length}${mancanti.length ? " → " + mancanti.join(", ") : ""}`));
console.log(riga(extra.length === 0, `extra (icone senza categoria): ${extra.length}${extra.length ? " → " + extra.join(", ") : ""}`));
console.log(riga(duplicatiNomi.length === 0, `duplicati nomi: ${duplicatiNomi.length}${duplicatiNomi.length ? " → " + duplicatiNomi.join(", ") : ""}`));
console.log(riga(duplicatiSlug.length === 0, `duplicati slug: ${duplicatiSlug.length}${duplicatiSlug.length ? " → " + duplicatiSlug.join(", ") : ""}`));
console.log(riga(iconeAssociate === 71, `icone associate: ${iconeAssociate} (attese 71)`));

const ok =
  nomi.length === 71 &&
  slugs.length === 71 &&
  mancanti.length === 0 &&
  extra.length === 0 &&
  duplicatiNomi.length === 0 &&
  duplicatiSlug.length === 0 &&
  iconeAssociate === 71;

console.log(ok ? "\n✅ TUTTO OK: 71/71 categorie + 71 icone" : "\n❌ CHECK FALLITO");
process.exit(ok ? 0 : 1);
