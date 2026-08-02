/**
 * FIXTURE UTENTI DI TEST — Sistema di isolamento della suite Playwright.
 *
 * REGOLA ASSOLUTA: MAI condividere un account tra test concorrenti.
 * Il signOut di Supabase è GLOBALE (scope: "global"): revoca TUTTE le
 * sessioni dell'utente. Se due test in parallelo usano lo stesso account,
 * il logout di uno invalida la sessione dell'altro → flakiness.
 *
 * Ogni spec importa SOLO da questo modulo: nessuna email/password hardcoded
 * nei test. Lo script scripts/setup-test-users.mjs crea/aggiorna questi
 * utenti in modo idempotente (auth admin + user_roles + negozio per i
 * merchant) e può essere eseguito infinite volte.
 *
 * Mappa di utilizzo (un account per test concorrente):
 *   - admin       → spec pannello amministratore + menu admin (nessun test
 *                   admin esegue mai signOut → condivisione sicura).
 *   - merchantA   → merchant-full-flow (fa logout/login multipli).
 *   - merchantB   → merchant-regression (fa logout).
 *   - merchantC   → trash-cestino.
 *   - merchantD   → accesso-ruoli (test merchant).
 *   - customerA   → accesso-ruoli (test customer).
 *   - customerB   → accesso-ruoli (test "Esci" — esegue signOut globale).
 *   - customerC   → riservato per futuri test customer.
 */

export type RuoloUtente = "admin" | "merchant" | "customer";

export interface UtenteFixture {
  /** Identificativo stabile usato dagli spec. */
  chiave: string;
  email: string;
  password: string;
  fullName: string;
  ruolo: RuoloUtente;
}

export const UTENTI = {
  admin: {
    chiave: "admin",
    email: "admin.test@localhub.it",
    password: "AdminTest123!",
    fullName: "Amministratore Test",
    ruolo: "admin",
  },
  merchantA: {
    chiave: "merchantA",
    email: "commerciante-a.test@localhub.it",
    password: "MerchantTest123!",
    fullName: "Commerciante A Test",
    ruolo: "merchant",
  },
  merchantB: {
    chiave: "merchantB",
    email: "commerciante-b.test@localhub.it",
    password: "MerchantTest123!",
    fullName: "Commerciante B Test",
    ruolo: "merchant",
  },
  merchantC: {
    chiave: "merchantC",
    email: "commerciante-c.test@localhub.it",
    password: "MerchantTest123!",
    fullName: "Commerciante C Test",
    ruolo: "merchant",
  },
  merchantD: {
    chiave: "merchantD",
    email: "commerciante-d.test@localhub.it",
    password: "MerchantTest123!",
    fullName: "Commerciante D Test",
    ruolo: "merchant",
  },
  customerA: {
    chiave: "customerA",
    email: "customer-a.test@localhub.it",
    password: "CustomerTest123!",
    fullName: "Cliente A Test",
    ruolo: "customer",
  },
  customerB: {
    chiave: "customerB",
    email: "customer-b.test@localhub.it",
    password: "CustomerTest123!",
    fullName: "Cliente B Test",
    ruolo: "customer",
  },
  customerC: {
    chiave: "customerC",
    email: "customer-c.test@localhub.it",
    password: "CustomerTest123!",
    fullName: "Cliente C Test",
    ruolo: "customer",
  },
} as const satisfies Record<string, UtenteFixture>;
