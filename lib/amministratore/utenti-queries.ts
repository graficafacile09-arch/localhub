import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/roles";
import { eNegozioDaEscludere } from "./negozi";
import type {
  BloccoUtente,
  FiltroRuoloUtente,
  NegozioUtente,
  RuoloUtente,
  StatoAccount,
  Utente,
} from "./types";

/**
 * Elenco utenti REALE della piattaforma per il modulo /amministratore/utenti.
 * Fonti:
 *   - auth.admin.listUsers() (Auth Admin API, service role: legge auth.users
 *     anche dove PostgREST non espone lo schema "auth");
 *   - user_roles (ruoli, tabella public);
 *   - nome di identità: user_metadata.full_name (registrazione + modifica
 *     admin), con fallback su cliente_profili (nome e cognome) ed email;
 *   - negozi (negozi per proprietario, demo esclusi);
 *   - user_account_stati (stato sospeso/bannato con motivo e durate; tabella
 *     aggiunta dalla migrazione 20260918 — se assente il modulo degrada a
 *     "bannato" dedotto da auth.users.banned_until).
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

type RigaStatoAccount = {
  user_id: string;
  stato: string;
  motivo: string | null;
  iniziato_il: string | null;
  fino_al: string | null;
};

/** mappa user_id → riga user_account_stati (best effort, tabella opzionale). */
async function leggeStatiAccount(
  db: NonNullable<ReturnType<typeof getDb>>
): Promise<Map<string, RigaStatoAccount>> {
  const mappa = new Map<string, RigaStatoAccount>();
  try {
    const { data, error } = await db.from("user_account_stati").select(
      "user_id, stato, motivo, iniziato_il, fino_al"
    );
    if (error) return mappa;
    for (const riga of data ?? []) {
      mappa.set(String(riga.user_id), riga as unknown as RigaStatoAccount);
    }
  } catch {
    // Tabella assente (migrazione non applicata): nessun dettaglio blocco.
  }
  return mappa;
}

/**
 * Stato account + blocco dedotti da banned_until (auth) e dalla riga
 * user_account_stati (semantica sospeso/bannato). La fonte AUTOREVOLE del
 * blocco resta banned_until: se scaduto l'account è di nuovo attivo anche
 * se la riga di dettaglio non è stata ripulita.
 */
function statoAccountDa(
  bannedUntil: string | null,
  rigaStato: RigaStatoAccount | undefined,
  ora: number
): { stato: StatoAccount; blocco: BloccoUtente | null } {
  const bannatoFinoA = bannedUntil ? new Date(bannedUntil).getTime() : null;
  const èBloccato = bannatoFinoA !== null && bannatoFinoA > ora;

  if (!èBloccato) {
    return { stato: "attivo", blocco: null };
  }

  // Sospensione = riga dedicata con stato "sospeso" e fine nel futuro.
  // Ogni blocco futuro senza riga (account precedenti alla migrazione)
  // viene classificato come ban permanente (stesso significato storico
  // del vecchio "disattivato").
  const èSospensione =
    rigaStato?.stato === "sospeso" &&
    (!rigaStato.fino_al ||
      new Date(rigaStato.fino_al).getTime() >= ora);

  if (èSospensione) {
    return {
      stato: "sospeso",
      blocco: {
        tipo: "sospeso",
        motivo: rigaStato.motivo ?? null,
        iniziatoIl: rigaStato.iniziato_il ?? null,
        finoAl: rigaStato.fino_al ?? bannedUntil,
      },
    };
  }

  return {
    stato: "bannato",
    blocco: {
      tipo: "bannato",
      motivo: rigaStato?.motivo ?? null,
      iniziatoIl: rigaStato?.iniziato_il ?? null,
      finoAl: rigaStato?.fino_al ?? bannedUntil,
    },
  };
}

/**
 * Elenco utenti reali della piattaforma (Auth Admin API + user_roles +
 * cliente_profili + negozi + stati account). In caso di errore (es. chiave
 * service role non configurata) ritorna [].
 * Il filtro per ruolo è sul ruolo PRIMARIO (comportamento storico).
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
    email_confirmed_at?: string | null;
    created_at?: string;
    last_sign_in_at?: string | null;
    banned_until?: string | null;
    deleted_at?: string | null;
    user_metadata?: Record<string, unknown> | null;
  }[] = [];
  try {
    // Auth Admin API restituisce al massimo 1000 utenti per pagina: carichiamo
    // tutte le pagine per non troncare la lista reale prima della paginazione UI.
    const perPage = 1000;
    let page = 1;
    while (true) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage });
      if (error || !data) break;
      utentiAuth.push(
        ...data.users.map((u) => ({
          id: u.id,
          email: u.email ?? null,
          email_confirmed_at: u.email_confirmed_at ?? null,
          created_at: u.created_at ?? new Date().toISOString(),
          last_sign_in_at: u.last_sign_in_at ?? null,
          banned_until: u.banned_until ?? null,
          deleted_at: u.deleted_at ?? null,
          user_metadata: u.user_metadata ?? null,
        }))
      );
      if (data.users.length < perPage) break;
      page += 1;
    }
  } catch {
    utentiAuth = [];
  }

  if (utentiAuth.length === 0) return [];

  // Q2 — ruoli di tutti gli utenti (una sola query sulla tabella public).
  const { data: ruoli } = await db.from("user_roles").select("user_id, role");

  // Q3 — nomi dai profili cliente (dove presenti). Il nome "di identità"
  // resta user_metadata.full_name (scritto alla registrazione e modificabile
  // dall'admin): qui si raccoglie solo il profilo cliente come fallback.
  const { data: profili } = await db
    .from("cliente_profili")
    .select("user_id, nome, cognome");

  // Q4 — negozi non eliminati (per la lista associata al venditore).
  // I negozi demo vengono esclusi (mai nell'Area Admin).
  const { data: negozi } = await db
    .from("negozi")
    .select("id, owner_user_id, nome, slug, attivo")
    .is("deleted_at", null);

  // Q5 — stati account (sospeso/bannato con motivo e durate), best effort.
  const statiAccount = await leggeStatiAccount(db);

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

  const negoziPerUtente = new Map<string, NegozioUtente[]>();
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
    const lista = negoziPerUtente.get(proprietario) ?? [];
    lista.push({
      id: String(n.id),
      nome: String(n.nome ?? "Negozio"),
      slug: (n.slug as string | null) ?? null,
      attivo: (n.attivo as boolean) ?? true,
    });
    negoziPerUtente.set(proprietario, lista);
  }

  const ora = Date.now();

  const utenti: Utente[] = utentiAuth
    // Gli account marcati "test" in user_roles (suite E2E e sviluppo)
    // non compaiono MAI nel pannello Amministratore.
    .filter((riga) => !èUtenteTest(ruoliPerUtente.get(riga.id) ?? []))
    .map((riga) => {
      const email = riga.email ?? "";
      const ruoliUtente = ruoliPerUtente.get(riga.id) ?? [];

      // Nome di identità: full_name (registrazione + modifica admin), poi il
      // profilo cliente (nome/cognome) e infine il nome derivato dall'email.
      const nomeMetadati = String(
        riga.user_metadata?.full_name ?? ""
      ).trim();

      // Ruolo primario: priorità massima tra i ruoli posseduti.
      const ruoloPrimarioArea = ruoloPrimario(ruoliUtente);

      const { stato, blocco } = statoAccountDa(
        riga.banned_until ?? null,
        statiAccount.get(riga.id),
        ora
      );

      const negoziUtente = negoziPerUtente.get(riga.id) ?? [];

      const utente: Utente = {
        id: riga.id,
        nome: nomeMetadati || (nomePerUtente.get(riga.id) ?? nomeDaEmail(email)),
        email,
        ruoli: ruoliUtente
          .map((ruolo) => RUOLO_AREA[ruolo])
          .filter((ruolo): ruolo is RuoloUtente => Boolean(ruolo)),
        ruolo: ruoloPrimarioArea,
        stato,
        emailVerificata: Boolean(riga.email_confirmed_at),
        ultimoAccesso: riga.last_sign_in_at ?? null,
        negozi: negoziUtente,
        numeroNegozi: negoziUtente.length,
        registratoIl: riga.created_at ?? new Date().toISOString(),
        blocco,
        protetto: isAdminEmail(email),
      };

      return utente;
    });

  if (filtro === "tutti") return utenti;
  return utenti.filter((u) => u.ruolo === filtro);
}

/**
 * Ritorna il record completo di un singolo utente (per aggiornare la UI dopo
 * una mutazione amministrativa). Usa la stessa lettura dell'elenco, così la
 * risposta dell'API coincide ESATTAMENTE con ciò che mostra la tabella.
 * Null se l'utente non esiste o è un account di test.
 */
export async function getUtenteAdminById(
  utenteId: string
): Promise<Utente | null> {
  const utenti = await getUtentiReali("tutti");
  return utenti.find((utente) => utente.id === utenteId) ?? null;
}
