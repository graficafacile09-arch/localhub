// P5.5 — Sonda RPC + colonne (SOLO LETTURA, firme corrette).
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

const out = {};

// RPC con la firma ESATTA della migration (p_payload jsonb)
const r1 = await db.rpc("checkout_intento_crea", { p_payload: { probe: 1 } });
out.intento_crea = r1.error ? "ERR: " + r1.error.message.slice(0, 110) : JSON.stringify(r1.data);

const r2 = await db.rpc("checkout_intento_conferma", {
  p_sessione_id: null,
  p_payment_id: null,
  p_transaction_id: null,
  p_importo: 0,
  p_valuta: "EUR",
});
out.intento_conferma = r2.error ? "ERR: " + r2.error.message.slice(0, 110) : JSON.stringify(r2.data);

const r3 = await db.rpc("checkout_intento_scaduto", { p_sessione_id: null });
out.intento_scaduto = r3.error ? "ERR: " + r3.error.message.slice(0, 110) : JSON.stringify(r3.data);

const r4 = await db.rpc("checkout_intento_annulla", { p_checkout_id: null });
out.intento_annulla = r4.error ? "ERR: " + r4.error.message.slice(0, 110) : JSON.stringify(r4.data);

const r5 = await db.rpc("pagamenti_credenziali_leggi", {
  p_negozio_id: "f3a82af7-dd47-482f-8a49-ea58e692238c",
  p_provider: "stripe",
  p_decifra: false,
  p_chiave: null,
});
out.credenziali_leggi = r5.error ? "ERR: " + r5.error.message.slice(0, 110) : JSON.stringify(r5.data);

// Colonne pagamenti_sessioni (select limit 0: esistenza colonna)
for (const col of ["ordine_id", "checkout_payload", "checkout_key"]) {
  const c = await db.from("pagamenti_sessioni").select(col).limit(0);
  out["colonna_" + col] = c.error ? "ERR: " + c.error.message.slice(0, 80) : "OK (colonna esiste)";
}

// Altri negozi (demo pollino + sapori)
const sl = await db
  .from("negozi")
  .select("id, slug, nome, is_demo, attivo, deleted_at")
  .or("slug.ilike.%pollino%,slug.ilike.%sapori%,slug.ilike.%capoccioni%");
out.altri_negozi = sl.data ?? [];

console.log(JSON.stringify(out, null, 2));