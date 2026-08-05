import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { eNegozioDaEscludere } from "./negozi";
import type { FiltroRuoloUtente, RuoloUtente, Utente } from "./types";

/**
 * Elenco utenti REALE della piattaforma per il modulo /amministratore/utenti.
 * Fonti:
 *   - auth.admin.listUsers() (Auth Admin API, service role: legge auth.users
 *     anche dove PostgREST non espone lo schema "auth");
 *   - user_roles (ruoli, tabella public);
 *   - cliente_profili (nome e cognome dove presenti);
 *   - negozi (conteggio per proprietario, demo esclusi).
 * Nessun dato demo: tutto viene letto dal database.
 */

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

/** Ruolo memorizzato in user_roles → ruolo dell'Area Amministratore. */
export const RUOLO_AREA: Record<string, RuoloUtente> = {
  admin: "amministratore",
  merchant: "commerciante",
  customer: "utente",
};

/** Priorità del ruolo Area Amministratore (per gli utenti multi-ruolo). */
export const PRIORITÀ_AREA: Record<RuoloUtente, number> = {
  amministratore: 2,
  commerciante: 1,
  utente: 0,
};

/** Ruolo primario dell'Area Amministratore (priorità massima posseduta). */
export function ruoloPrimario(ruoli: string[]): RuoloUtente {
  return (
    ruoli
      .map((ruolo) => RUOLO_AREA[ruolo])
      .filter((ruolo): ruolo is RuoloUtente => Boolean(ruolo))
      .sort((a, b) => PRIORITÀ_AREA[b] - PRIORITÀ_AREA[a])[0] ?? "utente"
  );
}

/** True se l'utente è marcato "test" (suite E2E/sviluppo) in user_roles. */
export function èUtenteTest(ruoli: string[]): boolean {
  return ruoli.includes("test");
}

/** Nome leggibile ricavato dall'email (usato quando manca il profilo). */
export function nomeDaEmail(email: string): string {
  const parteLocale = (email.split("@")[0] ?? "").trim();
  if (!parteLocale) return "Utente";
  return parteLocale
    .split(/[._\-+]/)
    .filter(Boolean)
    .map((pezzo) => pezzo.charAt(0).toUpperCase() + pezzo.slice(1))
    .join(" ");
}

/**
 * Elenco utenti reali della piattaforma (Auth Admin API + user_roles +
 * cliente_profili + conteggio negozi reali). In caso di errore (es. chiave
 * service role non configurata) ritorna [].
 */
export async function getUtentiReali(
  filtro: FiltroRuoloUtente = "tutti"
): Promise<Utente[]> {
  const db = getDb();
  if (!db) return [];

  // Q1 — utenti da Auth Admin API (auth.users, dal più recente).
  let utentiAuth: {
    id: string;
    email?: string | null;
    created_at?: string;
    last_sign_in_at?: string | null;
    banned_until?: string | null;
    deleted_at?: string | null;
  }[] = [];
  try {
    const { data, error } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (!error && data) {
      utentiAuth = data.users.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at ?? new Date().toISOString(),
        last_sign_in_at: u.last_sign_in_at ?? null,
        banned_until: u.banned_until ?? null,
        deleted_at: u.deleted_at ?? null,
      }));
    }
  } catch {
    utentiAuth = [];
  }

  if (utentiAuth.length === 0) return [];

  // Q2 — ruoli di tutti gli utenti (una sola query sulla tabella public).
  const { data: ruoli } = await db.from("user_roles").select("user_id, role");

  // Q3 — nomi dai profili cliente (dove presenti).
  const { data: profili } = await db
    .from("cliente_profili")
    .select("user_id, nome, cognome");

  // Q4 — negozi non eliminati per conteggio per proprietario.
  // I negozi demo vengono esclusi dal conteggio (mai nell'Area Admin).
  const { data: negozi } = await db
    .from("negozi")
    .select("owner_user_id, nome, slug")
    .is("deleted_at", null);

  const ruoliPerUtente = new Map<string, string[]>();
  for (const r of ruoli ?? []) {
    const key = String(r.user_id);
    const lista = ruoliPerUtente.get(key) ?? [];
    lista.push(String(r.role));
    ruoliPerUtente.set(key, lista);
  }

  const nomePerUtente = new Map<string, string>();
  for (const p of profili ?? []) {
    const nome = [String(p.nome ?? ""), String(p.cognome ?? "")]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
    if (nome) nomePerUtente.set(String(p.user_id), nome);
  }

  const negoziPerUtente = new Map<string, number>();
  for (const n of negozi ?? []) {
    if (!n.owner_user_id) continue;
    const proprietario = String(n.owner_user_id);
    if (
      eNegozioDaEscludere({
        nome: n.nome as string | null,
        slug: n.slug as string | null,
      })
    ) {
      continue;
    }
    negoziPerUtente.set(proprietario, (negoziPerUtente.get(proprietario) ?? 0) + 1);
  }

  const ora = Date.now();

  const utenti: Utente[] = utentiAuth
    // Gli account marcati "test" in user_roles (suite E2E e sviluppo)
    // non compaiono MAI nel pannello Amministratore.
    .filter((riga) => !èUtenteTest(ruoliPerUtente.get(riga.id) ?? []))
    .map((riga) => {
    const email = riga.email ?? "";
    const ruoliUtente = ruoliPerUtente.get(riga.id) ?? [];

    // Ruolo primario: priorità massima tra i ruoli posseduti.
    const ruoloArea = ruoloPrimario(ruoliUtente);

    const disattivato =
      Boolean(riga.deleted_at) ||
      (Boolean(riga.banned_until) &&
        new Date(String(riga.banned_until)).getTime() > ora);

    const utente: Utente = {
      id: riga.id,
      nome: nomePerUtente.get(riga.id) ?? nomeDaEmail(email),
      email,
      ruolo: ruoloArea,
      stato: disattivato ? "disattivato" : "attivo",
      ultimoAccesso: riga.last_sign_in_at ?? null,
      registratoIl: riga.created_at ?? new Date().toISOString(),
    };

    const negoziUtente = negoziPerUtente.get(riga.id);
    if (negoziUtente !== undefined) utente.negozi = negoziUtente;

    return utente;
  });

  if (filtro === "tutti") return utenti;
  return utenti.filter((u) => u.ruolo === filtro);
}
