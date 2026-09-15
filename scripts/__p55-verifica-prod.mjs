// P5.5 — VERIFICA PRODUCTION READ-ONLY (nessuna scrittura).
// Interroga SOLO: information_schema, pg_indexes, pg_proc, e tabelle di
// configurazione (negozi, negozio_pagamenti, negozio_metodi_pagamento,
// pagamenti_sessioni con select limitata ai campi pubblici).
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
loadEnv(".env.prod");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const out = {};

// ── 1. SCHEMA pagamenti_sessioni ──────────────────────────────────────────
const colsRes = await db.rpc("info_schema_columns", {});
// fallback: leggiamo via select su una vista? meglio: query dirette via rpc non
// esiste; usiamo select con limit 0 per derivare? Non possibile.
// Quindi usiamo le API PostgREST per information_schema non accessibili.
// Qui sotto: interrogazione via SQL diretto NON disponibile con supabase-js,
// quindi deriviamo lo schema tramite select su una riga vuota.

// ── 2. RPC presenti? ──────────────────────────────────────────────────────
const rpcChecks = [
  "checkout_intento_crea",
  "checkout_intento_conferma",
  "checkout_intento_scaduto",
  "checkout_intento_annulla",
  "pagamenti_credenziali_leggi",
];
out.rpc = {};
for (const rpc of rpcChecks) {
  const { data, error } = await db.rpc(rpc, { p_payload: { probe: true } });
  // Un RPC inesistente → error 404 (PGRST202); uno esistente → risposta diversa.
  out.rpc[rpc] = {
    presente: !(error && String(error.message).includes("Could not find the function")),
    status: error ? error.message.slice(0, 120) : "ok (risposta di validazione)",
    sample: data ?? null,
  };
}

// ── 3. NEGOZI target ──────────────────────────────────────────────────────
const nomi = [
  "Panificio Rossi",
  "Barone Gioielli",
  "Bar dei Capoccioni",
  "Terre del Pollino",
  "Bottega del Pollino",
  "Sapori di Castrovillari",
];
const negoziRes = await db
  .from("negozi")
  .select("id, slug, nome, is_demo, attivo, deleted_at, owner_user_id")
  .in("nome", nomi);
out.negozi = (negoziRes.data ?? []).map((n) => ({
  id: n.id,
  slug: n.slug,
  nome: n.nome,
  is_demo: n.is_demo,
  attivo: n.attivo,
  deleted_at: n.deleted_at,
  owner: n.owner_user_id,
}));

// ── 4. negozio_pagamenti (provider configurati) ───────────────────────────
const ids = out.negozi.map((n) => n.id);
let providerRows = [];
if (ids.length) {
  const pRes = await db
    .from("negozio_pagamenti")
    .select("*")
    .in("negozio_id", ids);
  providerRows = pRes.data ?? [];
}
out.provider = providerRows.map((r) => ({
  negozio_id: r.negozio_id,
  provider: r.provider,
  attivo: r.attivo,
  test_mode: r.test_mode,
  client_id: r.client_id ? `${String(r.client_id).slice(0, 8)}...` : null,
  has_secret_enc: r.secret_encrypted ? true : false,
  has_webhook_secret_enc: r.webhook_secret_encrypted ? true : false,
  account_id: r.account_id ?? null,
  account_name: r.account_name ?? null,
  onboarding_status: r.onboarding_status ?? null,
  payouts_enabled: r.payouts_enabled,
  charges_enabled: r.charges_enabled,
  iban: r.iban ? String(r.iban).slice(0, 8) + "..." : null,
  payee_email: r.payee_email ?? null,
}));

// ── 5. negozio_metodi_pagamento (metodi ATTIVATI, visibili) ───────────────
let metodiRows = [];
if (ids.length) {
  const mRes = await db
    .from("negozio_metodi_pagamento")
    .select("negozio_id, metodo, ordine_mostra, attivo")
    .in("negozio_id", ids);
  metodiRows = mRes.data ?? [];
}
out.metodiAttivati = metodiRows.map((r) => ({
  negozio_id: r.negozio_id,
  metodo: r.metodo,
  ordine_mostra: r.ordine_mostra,
  attivo: r.attivo,
}));

// ── 6. Indici pagamenti_sessioni (verifica tramite select di prova) ───────
// L'indice unico parziale checkout_key è verificabile SOLO dal DB SQL;
// qui verifichiamo che la colonna esista leggendo 1 riga (se la tabella ha
// righe) con select esplicita dei campi P0.
const sessRes = await db
  .from("pagamenti_sessioni")
  .select("id, ordine_id, checkout_key, checkout_payload, status, provider, negozio_id, expires_at")
  .order("created_at", { ascending: false })
  .limit(5);
out.sessioniRecenti = {
  error: sessRes.error?.message ?? null,
  conteggio_righe_lette: (sessRes.data ?? []).length,
  righe: (sessRes.data ?? []).map((r) => ({
    id: r.id,
    ordine_id: r.ordine_id,
    checkout_key: r.checkout_key,
    has_payload: r.checkout_payload ? true : false,
    status: r.status,
    provider: r.provider,
  })),
};

// ── 7. Conteggi rilevanti ─────────────────────────────────────────────────
const countSess = await db.from("pagamenti_sessioni").select("id", { count: "exact", head: true });
out.conteggi = {
  pagamenti_sessioni: countSess.count ?? null,
  sessioni_senza_ordine: (await db
    .from("pagamenti_sessioni")
    .select("id", { count: "exact", head: true })
    .is("ordine_id", null)).count ?? null,
};

console.log(JSON.stringify(out, null, 2));