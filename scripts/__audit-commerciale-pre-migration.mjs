/**
 * VERIFICA PRE-MIGRATION (SOLA LETTURA — nessuna scrittura).
 *
 * Riproduce in JavaScript la STESSA espressione di `v_commerciale` usata dalla
 * migration 20261024000000_inizializza_metodi_negozio.sql:
 *
 *   commerciale =
 *     data.tipo_attivita in ('ecommerce','alimentari')
 *     OR (moduli_attivi array AND moduli_attivi ? 'prodotti')
 *
 * Mostra per ogni negozio non cancellato quanti record il backfill creerebbe
 * (0 se già presenti: `on conflict do nothing`). Non esegue alcun
 * INSERT/UPDATE/DELETE.
 *
 * Uso: node scripts/__audit-commerciale-pre-migration.mjs
 */

import fs from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  if (!fs.existsSync(path)) return;
  const txt = fs.readFileSync(path, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
    }
  }
}
loadEnv(".env.local");

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const METODI_PAGAMENTO = [
  "carta",
  "klarna",
  "paypal",
  "sepa_debit",
  "bonifico_istantaneo",
  "bonifico_diretto_venditore",
];
const SERVIZI_SPEDIZIONE = [
  "poste_italiane:standard",
  "brt:online",
  "gls:standard",
  "poste_italiane:express",
  "locale:locale",
];

const { data: negozi, error } = await db
  .from("negozi")
  .select("id, nome, slug, data, moduli_attivi, deleted_at, created_at")
  .is("deleted_at", null)
  .order("created_at", { ascending: true });

if (error) {
  console.error("ERRORE lettura negozi:", error.message);
  process.exit(1);
}

const { data: pagRows } = await db.from("negozio_metodi_pagamento").select("negozio_id, metodo");
const { data: spedRows } = await db.from("negozio_metodi_spedizione").select("negozio_id, carrier, servizio");
const pagBy = new Map();
for (const r of pagRows ?? []) pagBy.set(r.negozio_id, (pagBy.get(r.negozio_id) ?? 0) + 1);
const spedBy = new Map();
for (const r of spedRows ?? []) spedBy.set(r.negozio_id, (spedBy.get(r.negozio_id) ?? 0) + 1);

function commerciale(n) {
  const tipo = (n.data ?? {})?.tipo_attivita ?? null;
  if (tipo === "ecommerce" || tipo === "alimentari") return true;
  return Array.isArray(n.moduli_attivi) && n.moduli_attivi.includes("prodotti");
}

const dettaglio = (negozi ?? []).map((n) => {
  const com = commerciale(n);
  const pag = pagBy.get(n.id) ?? 0;
  const sped = spedBy.get(n.id) ?? 0;
  return {
    nome: n.nome,
    tipo_attivita: (n.data ?? {})?.tipo_attivita ?? null,
    moduli_prodotti: Array.isArray(n.moduli_attivi) && n.moduli_attivi.includes("prodotti"),
    commerciale: com,
    pag_attuali: pag,
    sped_attuali: sped,
    // on conflict do nothing → vengono create solo le righe MANCANTI
    creerebbe_pag: com ? Math.max(0, METODI_PAGAMENTO.length - pag) : 0,
    creerebbe_sped: com ? Math.max(0, SERVIZI_SPEDIZIONE.length - sped) : 0,
  };
});

const commerciali = dettaglio.filter((d) => d.commerciale).length;
const toccati = dettaglio.filter((d) => d.creerebbe_pag + d.creerebbe_sped > 0);
const nonCommerciali = dettaglio.length - commerciali;

console.log(`Negozi non cancellati:                 ${dettaglio.length}`);
console.log(`Classificati COMMERCIALI:              ${commerciali}`);
console.log(`NON commerciali (0 righe create):      ${nonCommerciali}`);
console.log(`Toccati dal backfill (righe mancanti): ${toccati.length}`);
console.log(`Righe totali che verrebbero create:    pag=${toccati.reduce((a, d) => a + d.creerebbe_pag, 0)} sped=${toccati.reduce((a, d) => a + d.creerebbe_sped, 0)}`);
console.log("\nDettaglio:");
console.table(dettaglio);
process.exit(0);
