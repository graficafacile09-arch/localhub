/**
 * DEBUG (SOLA LETTURA) — replica ESATTAMENTE il percorso della
 * GET /api/merchant/stores/[negozioId]/pagamenti:
 *   1. gating commerciale (getModuliAttiviNegozio → canManageStorePayments)
 *   2. RPC pagamenti_credenziali_leggi per ogni provider dell'allowlist
 *   3. RPC pagamenti_bonifico_diretto_leggi
 *   4. select negozio_metodi_pagamento (metodo, attivo, ordine_mostra)
 * e stampa l'oggetto che la API restituirebbe.
 *
 * Uso: node scripts/__debug-pagamenti-api-db.mjs [negozioId...]
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

// ── Specchio di lib/profili-attivita.ts (PROFILO_DI_TEMPLATE + preset) ──
const PROFILI = {
  ecommerce: ["informazioni", "immagini", "prodotti", "offerte", "eventi", "contatti", "posizione", "orari", "social", "seo", "ai", "pagamenti", "impostazioni"],
  alimentari: ["informazioni", "immagini", "prodotti", "offerte", "contatti", "posizione", "orari", "social", "seo", "ai", "pagamenti", "impostazioni"],
  ristorante: ["informazioni", "immagini", "servizi", "offerte", "eventi", "contatti", "posizione", "orari", "social", "seo", "ai", "impostazioni", "prenotazioni"],
  beauty: ["informazioni", "immagini", "servizi", "offerte", "contatti", "posizione", "orari", "social", "seo", "ai", "impostazioni", "richiesta_info", "prenotazioni"],
  medico: ["informazioni", "immagini", "servizi", "contatti", "posizione", "orari", "social", "seo", "impostazioni", "richiesta_info", "prenotazioni"],
  immobiliare: ["informazioni", "immagini", "servizi", "offerte", "contatti", "posizione", "orari", "social", "seo", "ai", "impostazioni", "richiesta_info"],
  artigiano: ["informazioni", "immagini", "servizi", "offerte", "contatti", "posizione", "orari", "social", "seo", "ai", "impostazioni", "richiesta_info"],
  ricettivo: ["informazioni", "immagini", "servizi", "offerte", "eventi", "contatti", "posizione", "orari", "social", "seo", "ai", "impostazioni", "richiesta_info", "prenotazioni"],
  professionista: ["informazioni", "immagini", "servizi", "contatti", "posizione", "orari", "social", "seo", "impostazioni", "richiesta_info", "prenotazioni"],
  altro: ["informazioni", "immagini", "servizi", "contatti", "posizione", "orari", "social", "seo", "ai", "impostazioni", "richiesta_info"],
};

const PROVIDER_PAGAMENTO_VALIDI = ["stripe", "bonifico"];
const METODI_PAGAMENTO_VALIDI = [
  "carta", "klarna", "paypal", "sepa_debit", "bonifico_istantaneo", "bonifico_diretto_venditore",
];

function moduliEffettivi(data, moduliAttivi) {
  const tipo = data?.tipo_attivita;
  if (typeof tipo === "string" && PROFILI[tipo]) return PROFILI[tipo];
  if (Array.isArray(moduliAttivi) && moduliAttivi.length > 0) return moduliAttivi;
  return null;
}

async function replica(negozioId) {
  const { data: riga, error: errRiga } = await db
    .from("negozi")
    .select("id, nome, data, moduli_attivi, deleted_at, owner_user_id")
    .eq("id", negozioId)
    .maybeSingle();

  console.log("\n================================================================");
  console.log("NEGOZIO", negozioId);
  console.log("================================================================");
  if (errRiga || !riga) {
    console.log("LETTURA NEGOZIO FALLITA:", errRiga?.message ?? "non trovato");
    return;
  }
  console.log("nome:", riga.nome, "| deleted_at:", riga.deleted_at ?? "—");
  console.log("data.tipo_attivita:", riga.data?.tipo_attivita ?? "—");

  const moduli = moduliEffettivi(riga.data, riga.moduli_attivi);
  console.log("moduli effettivi:", moduli ?? "null");
  const commerciale = Array.isArray(moduli) ? moduli.includes("prodotti") : false;
  console.log(">>> canManageStorePayments (prodotti presente):", commerciale, commerciale ? "" : "→ la GET risponde 403 e la pagina mostra 'Pagamenti non disponibili'");

  // RPC provider
  for (const provider of PROVIDER_PAGAMENTO_VALIDI) {
    const { data, error } = await db.rpc("pagamenti_credenziali_leggi", {
      p_negozio_id: negozioId,
      p_provider: provider,
      p_decifra: false,
      p_chiave: null,
    });
    console.log(
      `RPC pagamenti_credenziali_leggi(${provider}):`,
      error ? `ERRORE ${error.code ?? ""} ${error.message}` : JSON.stringify(data)
    );
  }

  const { data: diretto, error: errDiretto } = await db.rpc("pagamenti_bonifico_diretto_leggi", {
    p_negozio_id: negozioId,
  });
  console.log(
    "RPC pagamenti_bonifico_diretto_leggi:",
    errDiretto ? `ERRORE ${errDiretto.code ?? ""} ${errDiretto.message}` : JSON.stringify(diretto)
  );

  // Metodi
  const { data: metodiRow, error: metodiError } = await db
    .from("negozio_metodi_pagamento")
    .select("metodo, attivo, ordine_mostra")
    .eq("negozio_id", negozioId)
    .order("ordine_mostra", { ascending: true });

  if (metodiError) {
    console.log("LETTURA METODI FALLITA:", metodiError.code, metodiError.message);
  } else {
    console.log("righe negozio_metodi_pagamento:", (metodiRow ?? []).length, JSON.stringify(metodiRow));
  }

  const presenti = new Map();
  for (const m of metodiRow ?? []) {
    if (METODI_PAGAMENTO_VALIDI.includes(m.metodo)) presenti.set(m.metodo, m);
  }
  const metodi = METODI_PAGAMENTO_VALIDI.map((metodo, index) => {
    const e = presenti.get(metodo);
    return { metodo, attivo: e?.attivo ?? false, ordine_mostra: e?.ordine_mostra ?? index };
  });
  console.log(">>> payload GET .data.metodi =", JSON.stringify(metodi));
}

const argomenti = process.argv.slice(2).filter((a) => !a.startsWith("-"));
let ids = argomenti;
if (ids.length === 0) {
  const { data } = await db
    .from("negozi")
    .select("id, nome, deleted_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(4);
  ids = (data ?? []).map((r) => r.id);
  console.log("Nessun id passato: uso gli ultimi 4 negozi non eliminati");
  for (const r of data ?? []) console.log(" -", r.nome, r.id);
}

for (const id of ids) await replica(id);
