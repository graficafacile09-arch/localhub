/**
 * Test INTEGRAZIONE — AZIONI ORDINI ADMIN (riuso RPC esistenti).
 *
 * Verifica che l'admin possa cambiare stato ordine e stato spedizione via
 * aggiornaStatoOrdineAdmin / aggiornaStatoSpedizioneAdmin (RPC esistenti),
 * e che un utente NON admin/non owner venga rifiutato (difesa in profondità
 * della RPC). Crea utenti/negozio/ordine temporanei, poi pulisce tutto.
 *
 * Uso: npx tsx scripts/test-admin-ordini.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  aggiornaStatoOrdineAdmin,
  aggiornaStatoSpedizioneAdmin,
} from "../lib/amministratore/ordini";

try {
  const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!URL || !KEY) {
  console.error("Manca NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (.env.local).");
  process.exit(2);
}

const db = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passati = 0;
let falliti = 0;
function check(nome: string, condizione: boolean, dettaglio?: unknown) {
  if (condizione) {
    passati++;
    console.log(`  ✅ ${nome}`);
  } else {
    falliti++;
    console.log(`  ❌ ${nome}${dettaglio !== undefined ? ` → ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

async function main() {
  const ts = Date.now();
  let adminId = "";
  let ownerId = "";
  let negozioId = "";
  let ordineId = "";

  try {
    // ── Setup: admin + owner + negozio + ordine temporanei ───────────────
    const { data: admin, error: eAdmin } = await db.auth.admin.createUser({
      email: `admin-ord-${ts}@example.com`,
      password: "TestPass123!",
      email_confirm: true,
    });
    if (eAdmin || !admin.user) throw new Error("createUser admin: " + (eAdmin?.message ?? "no user"));
    adminId = admin.user.id;
    await db.from("user_roles").insert({ user_id: adminId, role: "admin" });

    const { data: owner, error: eOwner } = await db.auth.admin.createUser({
      email: `owner-ord-${ts}@example.com`,
      password: "TestPass123!",
      email_confirm: true,
    });
    if (eOwner || !owner.user) throw new Error("createUser owner: " + (eOwner?.message ?? "no user"));
    ownerId = owner.user.id;

    const { data: n, error: eN } = await db
      .from("negozi")
      .insert({ nome: `AdminOrd-${ts}`, slug: `admin-ord-${ts}`, attivo: true, is_demo: true, owner_user_id: ownerId })
      .select("id")
      .single();
    if (eN || !n) throw new Error("negozio: " + (eN?.message ?? "no data"));
    negozioId = String(n.id);

    const { data: o, error: eO } = await db
      .from("ordini")
      .insert({
        idempotency_key: `admin-ord-${ts}`,
        modalita: "spedizione",
        stato: "in_preparazione",
        totale: 10,
        negozio_id: negozioId,
        negozio_nome: "AdminOrd",
        cliente_nome: "C",
        cliente_cognome: "C",
      })
      .select("id")
      .single();
    if (eO || !o) throw new Error("ordine: " + (eO?.message ?? "no data"));
    ordineId = String(o.id);

    // ── 1. Admin cambia stato ordine (NON è il proprietario) ─────────────
    const r1 = await aggiornaStatoOrdineAdmin(adminId, ordineId, "confermato");
    check("1) admin conferma ordine → ok", r1.ok === true, r1);
    const st1 = await db.from("ordini").select("stato").eq("id", ordineId).single();
    check("1) stato ordine = confermato", st1.data?.stato === "confermato", st1.data);

    // ── 2. Admin cambia stato spedizione (affida con tracking) ───────────
    const r2 = await aggiornaStatoSpedizioneAdmin(adminId, ordineId, "affidata", { trackingCode: "TRKADMIN" });
    check("2) admin affida spedizione → ok", r2.ok === true, r2);
    const st2 = await db.from("ordini").select("stato_spedizione, tracking_code").eq("id", ordineId).single();
    check("2) stato_spedizione = affidata", st2.data?.stato_spedizione === "affidata", st2.data);
    check("2) tracking salvato", st2.data?.tracking_code === "TRKADMIN");

    // ── 3. Utente non admin/non owner → rifiutato dalla RPC ──────────────
    const intruso = "00000000-0000-0000-0000-000000000000";
    const r3 = await aggiornaStatoOrdineAdmin(intruso, ordineId, "in_lavorazione");
    check("3) non admin → FORBIDDEN", r3.ok === false && r3.codice === "FORBIDDEN", r3);

    // ── 4. Tracking obbligatorio per affida (stessa macchina RPC) ────────
    // (ordine già affidata → in_transito è la prossima; verifichiamo il flusso)
    const r4 = await aggiornaStatoSpedizioneAdmin(adminId, ordineId, "in_transito");
    check("4) admin segna in transito → ok", r4.ok === true, r4);
  } catch (err) {
    falliti++;
    console.error("  ❌ ERRORE nel test:", err instanceof Error ? err.message : String(err));
  } finally {
    // ── Cleanup (self-cleaning) ──────────────────────────────────────────
    if (ordineId) {
      await db.from("ordini_eventi").delete().eq("ordine_id", ordineId);
      await db.from("ordini").delete().eq("id", ordineId);
    }
    if (negozioId) await db.from("negozi").delete().eq("id", negozioId);
    if (adminId) {
      await db.from("user_roles").delete().eq("user_id", adminId);
      await db.auth.admin.deleteUser(adminId).catch(() => {});
    }
    if (ownerId) await db.auth.admin.deleteUser(ownerId).catch(() => {});
  }

  console.log(`\nTest admin ordini: ${passati} passati, ${falliti} falliti.`);
  if (falliti > 0) process.exit(1);
}

main();
