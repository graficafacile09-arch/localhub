/**
 * Provisioning idempotente degli utenti di test (fix del parser env di
 * scripts/setup-test-users.mjs che non gestisce i valori con virgolette).
 * Stessa logica: crea/aggiorna utenti, ruoli, negozio fixture per i merchant.
 * Uso: node scripts/__provision-test-users.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const env = {};
  const content = readFileSync(".env.local", "utf8");
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
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
const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });

const UTENTI = [
  { chiave: "admin", email: "admin.test@localhub.it", password: "AdminTest123!", fullName: "Amministratore Test", ruolo: "admin" },
  { chiave: "merchantA", email: "commerciante-a.test@localhub.it", password: "MerchantTest123!", fullName: "Commerciante A Test", ruolo: "merchant", nomeNegozio: "Negozio QA Commerciante A" },
  { chiave: "merchantB", email: "commerciante-b.test@localhub.it", password: "MerchantTest123!", fullName: "Commerciante B Test", ruolo: "merchant", nomeNegozio: "Negozio QA Commerciante B" },
  { chiave: "merchantC", email: "commerciante-c.test@localhub.it", password: "MerchantTest123!", fullName: "Commerciante C Test", ruolo: "merchant", nomeNegozio: "Negozio QA Commerciante C" },
  { chiave: "merchantD", email: "commerciante-d.test@localhub.it", password: "MerchantTest123!", fullName: "Commerciante D Test", ruolo: "merchant", nomeNegozio: "Negozio QA Commerciante D" },
  { chiave: "customerA", email: "customer-a.test@localhub.it", password: "CustomerTest123!", fullName: "Cliente A Test", ruolo: "customer" },
  { chiave: "customerB", email: "customer-b.test@localhub.it", password: "CustomerTest123!", fullName: "Cliente B Test", ruolo: "customer" },
];

async function trovaUtente(utente) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const candidati = [utente.email].map((e) => e.toLowerCase());
  return data.users.find((u) => u.email && candidati.includes(u.email.toLowerCase())) ?? null;
}

async function assicuraNegozio(userId, nomeCanonico) {
  const { data: negozi, error } = await admin
    .from("negozi").select("id, nome, attivo")
    .eq("owner_user_id", userId).is("deleted_at", null);
  if (error) { console.error(`ERRORE lettura negozi per ${userId}:`, error.message); return; }
  const attivi = negozi ?? [];
  const fixture = attivi.find((n) => n.nome === nomeCanonico || n.nome === "Negozio QA") ?? attivi.find((n) => n.nome.startsWith("Negozio QA Merchant")) ?? null;
  if (fixture) {
    if (fixture.nome !== nomeCanonico) await admin.from("negozi").update({ nome: nomeCanonico }).eq("id", fixture.id);
    if (fixture.attivo !== true) await admin.from("negozi").update({ attivo: true }).eq("id", fixture.id);
    console.log(`  Negozio fixture ok: "${nomeCanonico}" (${fixture.id}, attivo=true)`);
    return fixture.id;
  }
  if (attivi.length > 0) {
    console.log(`  Merchant con ${attivi.length} negozi attivi ma senza fixture — nessuna creazione.`);
    return null;
  }
  const { data, error: err2 } = await admin.from("negozi").insert({
    owner_user_id: userId, nome: nomeCanonico, categoria: "Bar", citta: "Castrovillari", attivo: true,
  }).select("id").single();
  if (err2) { console.error(`ERRORE creazione negozio:`, err2.message); return null; }
  console.log(`  Negozio creato: "${nomeCanonico}" (${data.id})`);
  return data.id;
}

for (const utente of UTENTI) {
  let user = await trovaUtente(utente);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: utente.email, password: utente.password, email_confirm: true,
      user_metadata: { full_name: utente.fullName },
    });
    if (error) { console.error(`ERRORE creazione ${utente.email}:`, error.message); continue; }
    user = data.user;
    console.log(`Utente creato: ${utente.email} (${user.id})`);
  } else {
    await admin.auth.admin.updateUserById(user.id, { password: utente.password, email_confirm: true, user_metadata: { full_name: utente.fullName } });
    console.log(`Utente esistente (allineato): ${utente.email}`);
  }
  const { error: roleError } = await admin.from("user_roles").upsert({ user_id: user.id, role: utente.ruolo }, { onConflict: "user_id,role" });
  if (roleError) { console.error(`ERRORE ruolo:`, roleError.message); continue; }
  console.log(`Ruolo assegnato: ${utente.email} → ${utente.ruolo}`);
  if (utente.ruolo === "merchant") {
    const storeId = await assicuraNegozio(user.id, utente.nomeNegozio);
    if (storeId) console.log(`  STORE_ID ${utente.chiave}=${storeId}`);
  }
}
console.log("Provisioning completato.");
