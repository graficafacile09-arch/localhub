/**
 * AUDIT (SOLA LETTURA) — flusso creazione negozio.
 *
 * Confronta "Panificio Prova" con gli altri negozi reali e mostra, per ognuno:
 *   - moduli_attivi / data.tipo_attivita / config pacco
 *   - righe in negozio_metodi_pagamento
 *   - righe in negozio_metodi_spedizione
 *   - righe in negozio_pagamenti (Stripe Connect)
 *
 * Uso: node scripts/__audit-flusso-negozio.mjs
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

const NEGOZI_COLS =
  "id, nome, slug, categoria, attivo, is_demo, deleted_at, created_at, owner_user_id, merchant_id, moduli_attivi, data, pacco_peso_grammi, pacco_lunghezza_cm, pacco_larghezza_cm, pacco_altezza_cm, pacco_peso_max_grammi";

async function dettaglio(n) {
  const pag = await db
    .from("negozio_metodi_pagamento")
    .select("metodo, attivo, ordine_mostra")
    .eq("negozio_id", n.id)
    .order("ordine_mostra");
  const sped = await db
    .from("negozio_metodi_spedizione")
    .select("carrier, servizio, attivo, spedizione_gratuita, costo_euro")
    .eq("negozio_id", n.id);
  const conn = await db
    .from("negozio_pagamenti")
    .select("provider, attivo, onboarding_status, charges_enabled, payouts_enabled, klarna_enabled, account_id, test_mode")
    .eq("negozio_id", n.id);

  const data = (n.data ?? {}) || {};
  return {
    id: n.id,
    nome: n.nome,
    slug: n.slug,
    categoria: n.categoria,
    attivo: n.attivo,
    is_demo: n.is_demo,
    deleted_at: n.deleted_at ?? null,
    created_at: n.created_at,
    tipo_attivita: data.tipo_attivita ?? null,
    operativita: data.operativita ?? null,
    moduli_attivi: n.moduli_attivi ?? null,
    pacco: {
      peso_g: n.pacco_peso_grammi,
      dims: [n.pacco_lunghezza_cm, n.pacco_larghezza_cm, n.pacco_altezza_cm],
      peso_max_g: n.pacco_peso_max_grammi,
    },
    metodi_pagamento_rows: pag.data ?? null,
    metodi_pagamento_err: pag.error?.message ?? null,
    metodi_spedizione_rows: sped.data ?? null,
    metodi_spedizione_err: sped.error?.message ?? null,
    pagamenti_connect_rows: conn.data ?? null,
    pagamenti_connect_err: conn.error?.message ?? null,
  };
}

const out = {};

// 1) Panificio Prova (qualsiasi stato, anche cancellato)
const prova = await db.from("negozi").select(NEGOZI_COLS).ilike("nome", "%Panificio Prova%");
out.panificio_prova = [];
for (const n of prova.data ?? []) out.panificio_prova.push(await dettaglio(n));
out.panificio_prova_err = prova.error?.message ?? null;

// 2) Gli ultimi negozi reali creati (esclusi i demo seed)
const recenti = await db
  .from("negozi")
  .select(NEGOZI_COLS)
  .is("deleted_at", null)
  .order("created_at", { ascending: false })
  .limit(8);
out.ultimi_negozi = [];
for (const n of recenti.data ?? []) out.ultimi_negozi.push(await dettaglio(n));

// 3) Conteggi aggregati: quanti negozi hanno almeno una riga
const tutti = await db.from("negozi").select("id, is_demo, deleted_at");
const ids = (tutti.data ?? []).filter((n) => !n.deleted_at).map((n) => n.id);
const pagRows = await db.from("negozio_metodi_pagamento").select("negozio_id");
const spedRows = await db.from("negozio_metodi_spedizione").select("negozio_id");
const pagSet = new Set((pagRows.data ?? []).map((r) => r.negozio_id));
const spedSet = new Set((spedRows.data ?? []).map((r) => r.negozio_id));
out.conteggi = {
  negozi_non_cancellati: ids.length,
  con_metodi_pagamento: ids.filter((id) => pagSet.has(id)).length,
  con_metodi_spedizione: ids.filter((id) => spedSet.has(id)).length,
};

console.log(JSON.stringify(out, null, 2));
process.exit(0);
