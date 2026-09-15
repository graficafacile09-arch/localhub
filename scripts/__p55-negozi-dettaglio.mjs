// P5.5 — DETTAGLIO PER NEGOZIO (SOLO LETTURA).
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  const txt = fs.readFileSync(path, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
    }
  }
}
loadEnv(".env.prod");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const NEGOZI = [
  { nome: "Panificio Rossi", id: "f3a82af7-dd47-482f-8a49-ea58e692238c" },
  { nome: "Barone Gioielli", id: "cd45ea2b-ec22-4bd8-a214-0e7cc47c1f67" },
  { nome: "Bar dei Capoccioni", id: "11d677f1-5b22-464d-b57e-2fa20a74fde3" },
  { nome: "Terre del Pollino – DEMO", id: "20000000-0000-4000-8000-000000000002" },
  { nome: "Bottega del Pollino – DEMO", id: "20000000-0000-4000-8000-000000000001" },
  { nome: "Sapori di Castrovillari – DEMO", id: "20000000-0000-4000-8000-000000000003" },
];

const out = [];
for (const n of NEGOZI) {
  const riga = { nome: n.nome, id: n.id };

  // provider configurati (negozio_pagamenti) — per negozio, ordinati
  const p = await db
    .from("negozio_pagamenti")
    .select("provider, attivo, test_mode, client_id, secret_encrypted, webhook_secret_encrypted, account_id, account_name, onboarding_status, payouts_enabled, charges_enabled, iban, payee_email")
    .eq("negozio_id", n.id)
    .order("provider");
  riga.provider = (p.data ?? []).map((r) => ({
    provider: r.provider,
    attivo: r.attivo,
    test_mode: r.test_mode,
    client_id: r.client_id ? String(r.client_id).slice(0, 10) + "..." : null,
    has_secret: !!r.secret_encrypted,
    has_webhook_secret: !!r.webhook_secret_encrypted,
    account_id: r.account_id,
    account_name: r.account_name,
    onboarding_status: r.onboarding_status,
    payouts_enabled: r.payouts_enabled,
    charges_enabled: r.charges_enabled,
    iban: r.iban ? String(r.iban).slice(0, 10) + "..." : null,
    payee_email: r.payee_email,
  }));

  // metodi attivati (negozio_metodi_pagamento)
  const m = await db
    .from("negozio_metodi_pagamento")
    .select("metodo, ordine_mostra, attivo")
    .eq("negozio_id", n.id)
    .order("ordine_mostra");
  riga.metodi = (m.data ?? []).map((r) => ({ metodo: r.metodo, ordine_mostra: r.ordine_mostra, attivo: r.attivo }));

  // prodotti attivi
  const pr = await db
    .from("prodotti")
    .select("id", { count: "exact", head: true })
    .eq("negozio_id", n.id)
    .eq("attivo", true);
  riga.prodotti_attivi = pr.count ?? 0;

  // bonifico: RPC leggi (dati pubblici)
  const b = await db.rpc("pagamenti_credenziali_leggi", {
    p_negozio_id: n.id,
    p_provider: "bonifico",
    p_decifra: false,
    p_chiave: null,
  });
  riga.bonifico_rpc = b.error ? "ERR " + b.error.message.slice(0, 60) : b.data;

  // Stripe Connect: stato account (per verificare charges/payouts reali)
  const s = await db.rpc("pagamenti_credenziali_leggi", {
    p_negozio_id: n.id,
    p_provider: "stripe",
    p_decifra: false,
    p_chiave: null,
  });
  riga.stripe_rpc = s.error ? "ERR " + s.error.message.slice(0, 60) : s.data;

  out.push(riga);
}

console.log(JSON.stringify(out, null, 1));