/**
 * Setup idempotente degli utenti di test per la suite e2e.
 *
 * Regole:
 *   - crea gli utenti se mancanti;
 *   - aggiorna password/nome/email_confirm di quelli esistenti;
 *   - assegna il ruolo corretto su public.user_roles (upsert);
 *   - per i merchant crea automaticamente un negozio "Negozio QA"
 *     SOLO se l'utente non possiede già negozi attivi (idempotenza);
 *   - eseguibile infinite volte senza effetti collaterali.
 *
 * L'elenco qui sotto DEVE restare allineato a tests/fixtures/users.ts
 * (stessa email, password, nome e ruolo).
 *
 * Uso: node scripts/setup-test-users.mjs
 * Legge URL e SERVICE_ROLE_KEY da .env.local.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const env = {};
  const content = readFileSync(".env.local", "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, "");
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  console.error("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** ⚠️ Tenere allineato con tests/fixtures/users.ts. */
const UTENTI = [
  { chiave: "admin", email: "admin.test@localhub.it", password: "AdminTest123!", fullName: "Amministratore Test", ruolo: "admin" },
  { chiave: "merchantA", email: "commerciante-a.test@localhub.it", vecchiaEmail: "merchant-a.test@localhub.it", password: "MerchantTest123!", fullName: "Commerciante A Test", ruolo: "merchant", nomeNegozio: "Negozio QA Commerciante A" },
  { chiave: "merchantB", email: "commerciante-b.test@localhub.it", vecchiaEmail: "merchant-b.test@localhub.it", password: "MerchantTest123!", fullName: "Commerciante B Test", ruolo: "merchant", nomeNegozio: "Negozio QA Commerciante B" },
  { chiave: "merchantC", email: "commerciante-c.test@localhub.it", vecchiaEmail: "merchant-c.test@localhub.it", password: "MerchantTest123!", fullName: "Commerciante C Test", ruolo: "merchant", nomeNegozio: "Negozio QA Commerciante C" },
  { chiave: "merchantD", email: "commerciante-d.test@localhub.it", vecchiaEmail: "merchant-d.test@localhub.it", password: "MerchantTest123!", fullName: "Commerciante D Test", ruolo: "merchant", nomeNegozio: "Negozio QA Commerciante D" },
  { chiave: "customerA", email: "customer-a.test@localhub.it", password: "CustomerTest123!", fullName: "Cliente A Test", ruolo: "customer" },
  { chiave: "customerB", email: "customer-b.test@localhub.it", password: "CustomerTest123!", fullName: "Cliente B Test", ruolo: "customer" },
  { chiave: "customerC", email: "customer-c.test@localhub.it", password: "CustomerTest123!", fullName: "Cliente C Test", ruolo: "customer" },
];

/** Cerca l'utente per email nuova O per email precedente (rinnovo idempotente). */
async function trovaUtente(utente) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const candidati = [utente.email, utente.vecchiaEmail].filter(Boolean).map((e) => e.toLowerCase());
  return data.users.find((u) => u.email && candidati.includes(u.email.toLowerCase())) ?? null;
}

/**
 * Assicura il negozio fixture del merchant con nome UNIVOCO (mai condiviso
 * tra merchant: evita collisioni di nomi nei test strict-mode).
 * - Se esiste il negozio "Negozio QA" (vecchio nome) o il nome canonico,
 *   allinea il nome al canonico (idempotente, auto-riparante).
 * - Se non possiede negozi attivi, crea il negozio con il nome canonico.
 */
async function assicuraNegozio(userId, nomeCanonico) {
  const { data: negozi, error } = await admin
    .from("negozi")
    .select("id, nome")
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    console.error(`ERRORE lettura negozi per ${userId}:`, error.message);
    return;
  }

  const attivi = negozi ?? [];
  // Trova il negozio fixture anche con i nomi storici ("Negozio QA Merchant …")
  // così la rinomina al canonico è idempotente e auto-riparante.
  const negozioFixture =
    attivi.find((n) => n.nome === nomeCanonico || n.nome === "Negozio QA") ??
    attivi.find((n) => n.nome.startsWith("Negozio QA Merchant")) ??
    null;

  if (negozioFixture) {
    if (negozioFixture.nome !== nomeCanonico) {
      const { error: renameError } = await admin
        .from("negozi")
        .update({ nome: nomeCanonico })
        .eq("id", negozioFixture.id);
      if (renameError) {
        console.error(`ERRORE rinomina negozio ${negozioFixture.id}:`, renameError.message);
        return;
      }
      console.log(`  Negozio rinominato → "${nomeCanonico}" (${negozioFixture.id}).`);
    } else {
      console.log(`  Negozio fixture già presente: "${nomeCanonico}".`);
    }
    return;
  }

  if (attivi.length > 0) {
    console.log(`  Merchant con ${attivi.length} negozi attivi ma senza fixture "${nomeCanonico}" — nessuna creazione.`);
    return;
  }

  const { data, error: createError } = await admin.from("negozi").insert({
    owner_user_id: userId,
    nome: nomeCanonico,
    categoria: "Bar",
    citta: "Castrovillari",
    attivo: false,
  }).select("id").single();

  if (createError) {
    console.error(`ERRORE creazione negozio per ${userId}:`, createError.message);
    return;
  }
  console.log(`  Negozio "${nomeCanonico}" creato (${data.id}).`);
}

/**
 * Pulisce i NEGOZI DI TEST accumulati dai run Playwright precedenti
 * ("E2E ...", "Negozio Rinominato ..." creati dai journey merchant).
 * Senza questa pulizia l'elenco negozi dell'utente cresce a ogni run e i
 * test merchant diventano progressivamente più lenti fino al timeout.
 *
 * Mantiene SOLO il negozio fixture canonico (nomeNegozio). Idempotente:
 * può essere eseguito infinite volte senza effetti collaterali.
 * I nomi di test sono univoci (contengono un timestamp) quindi il filtro
 * non tocca mai dati reali o altri negozi dell'utente.
 */
async function pulisciNegoziDiTest(userId, nomeCanonico) {
  const { data: negozi, error } = await admin
    .from("negozi")
    .select("id, nome")
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    console.error(`ERRORE lettura negozi (cleanup) per ${userId}:`, error.message);
    return;
  }

  const daEliminare = (negozi ?? []).filter((n) => {
    if (n.nome === nomeCanonico || n.nome === "Negozio QA" || n.nome.startsWith("Negozio QA Merchant")) return false;
    // Nomi generati dai test merchant (sempre con timestamp o prefisso E2E).
    return /^(E2E|Negozio Rinominato)\s/.test(n.nome);
  });

  if (daEliminare.length === 0) {
    console.log(`  Cleanup negozi di test: nessuno da eliminare per ${userId}.`);
    return;
  }

  for (const n of daEliminare) {
    await admin.from("negozi").delete().eq("id", n.id);
  }
  console.log(`  Cleanup negozi di test: eliminati ${daEliminare.length} (${daEliminare.map((n) => n.nome).join(", ")}).`);
}

for (const utente of UTENTI) {
  let user = await trovaUtente(utente);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: utente.email,
      password: utente.password,
      email_confirm: true,
      user_metadata: { full_name: utente.fullName },
    });
    if (error) {
      console.error(`ERRORE creazione ${utente.email}:`, error.message);
      process.exit(1);
    }
    user = data.user;
    console.log(`Utente creato: ${utente.email} (${user.id})`);
  } else {
    // Allinea password, conferma email e nome (idempotenza completa).
    // Se l'email è cambiata (es. merchant-a → commerciante-a), la rinnova
    // mantenendo lo stesso user id (ruoli e negozi restano collegati).
    const updatePayload = {
      password: utente.password,
      email_confirm: true,
      user_metadata: { full_name: utente.fullName },
    };
    if (user.email?.toLowerCase() !== utente.email.toLowerCase()) {
      updatePayload.email = utente.email;
      console.log(`  Email aggiornata: ${user.email} → ${utente.email}`);
    }
    await admin.auth.admin.updateUserById(user.id, updatePayload);
    console.log(`Utente esistente (allineato): ${utente.email} (${user.id})`);
  }

  const { error: roleError } = await admin
    .from("user_roles")
    .upsert({ user_id: user.id, role: utente.ruolo }, { onConflict: "user_id,role" });

  if (roleError) {
    console.error(`ERRORE ruolo ${utente.ruolo} per ${utente.email}:`, roleError.message);
    process.exit(1);
  }
  console.log(`Ruolo assegnato: ${utente.email} → ${utente.ruolo}`);

  if (utente.ruolo === "merchant") {
    await assicuraNegozio(user.id, utente.nomeNegozio);
    await pulisciNegoziDiTest(user.id, utente.nomeNegozio);
  }
}

console.log("Setup completato.");
