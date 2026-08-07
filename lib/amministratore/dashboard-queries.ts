import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { eNegozioDaEscludere } from "./negozi";
import {
  èUtenteTest,
  nomeDaEmail,
  ruoloPrimario,
} from "./utenti-queries";
import type { RuoloUtente } from "./types";

/**
 * Dati REALI per la Dashboard Amministratore.
 * Tutti i valori provengono dal database; negozi demo e utenti di test
 * sono sempre esclusi. Nessun numero inventato, nessun placeholder.
 */

const PAGE_SIZE = 1000;
const CODICI_SCHEMA = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

type QueryError = {
  code?: string;
  message?: string;
};

type EsitoQuery<T> = {
  data: T[];
  error: QueryError | null;
  warning?: string;
};

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

export type DashboardNegozioBreve = {
  id: string;
  nome: string;
  slug: string | null;
  categoria: string | null;
  attivo: boolean;
  created_at: string;
};

export type DashboardUtenteBreve = {
  id: string;
  nome: string;
  email: string;
  ruolo: RuoloUtente;
  registratoIl: string;
};

export type DashboardAttivitaVoce = {
  id: string;
  tipo: "negozio" | "prodotto" | "scansione";
  titolo: string;
  descrizione: string;
  data: string;
  href: string | null;
};

export type DatiDashboard = {
  kpi: {
    utenti: number;
    commercianti: number;
    clienti: number;
    negoziAttivi: number;
    negoziSospesi: number;
    negoziCestino: number;
    prodotti: number;
    offerteAttive: number;
    eventi: number;
    scansioniOggi: number;
  };
  grafici: {
    negoziPerCategoria: { categoria: string; count: number }[];
    utentiPerRuolo: { ruolo: RuoloUtente; count: number }[];
    scansioniSettimana: { data: string; etichetta: string; count: number }[];
  };
  ultimiNegozi: DashboardNegozioBreve[];
  ultimiUtenti: DashboardUtenteBreve[];
  ultimeAttivita: DashboardAttivitaVoce[];
  statoPiattaforma: {
    database: boolean;
    filtroDemo: boolean;
    aiConfigurato: boolean;
    cacheVisione: number;
    rateLimitMin: number;
    ultimaScansione: string | null;
  };
  /** Errori non bloccanti delle fonti opzionali, mostrati in dashboard. */
  avvisi: string[];
};

type NegozioRiga = {
  id: string;
  nome: string | null;
  slug: string | null;
  categoria: string | null;
  attivo: boolean;
  in_evidenza: boolean | null;
  created_at: string;
  deleted_at: string | null;
  is_demo?: boolean | null;
  data?: Record<string, unknown> | null;
};

type UtenteAuth = {
  id: string;
  email: string;
  created_at: string;
};

/** Filtro locale definitivo, incluso il fallback per DB non ancora migrati. */
function negozioDemoDashboard(
  negozio: Pick<NegozioRiga, "nome" | "slug" | "is_demo">
): boolean {
  return (
    eNegozioDaEscludere(negozio) ||
    Boolean(negozio.slug && /^test-store-vision-/i.test(negozio.slug))
  );
}

function strutturaVuota(avvisi: string[] = []): DatiDashboard {
  return {
    kpi: {
      utenti: 0,
      commercianti: 0,
      clienti: 0,
      negoziAttivi: 0,
      negoziSospesi: 0,
      negoziCestino: 0,
      prodotti: 0,
      offerteAttive: 0,
      eventi: 0,
      scansioniOggi: 0,
    },
    grafici: {
      negoziPerCategoria: [],
      utentiPerRuolo: [],
      scansioniSettimana: [],
    },
    ultimiNegozi: [],
    ultimiUtenti: [],
    ultimeAttivita: [],
    statoPiattaforma: {
      database: false,
      filtroDemo: false,
      aiConfigurato: Boolean(process.env.GEMINI_API_KEY),
      cacheVisione: 0,
      rateLimitMin: Number(process.env.NEXT_PUBLIC_RATE_LIMIT_MIN ?? 60),
      ultimaScansione: null,
    },
    avvisi,
  };
}

/** Legge tutti gli utenti Auth a pagine, senza il limite implicito di 1000. */
async function listaUtentiAuth(
  db: NonNullable<ReturnType<typeof getDb>>
): Promise<EsitoQuery<UtenteAuth>> {
  const utenti: UtenteAuth[] = [];

  for (let pagina = 1; ; pagina++) {
    try {
      const { data, error } = await db.auth.admin.listUsers({
        page: pagina,
        perPage: PAGE_SIZE,
      });
      if (error) {
        return { data: utenti, error: { message: error.message } };
      }

      const righe = (data?.users ?? []).map((u) => ({
        id: u.id,
        email: u.email ?? "",
        created_at: u.created_at ?? new Date(0).toISOString(),
      }));
      utenti.push(...righe);

      if (righe.length < PAGE_SIZE) break;
    } catch (error) {
      return {
        data: utenti,
        error: {
          message: error instanceof Error ? error.message : "Impossibile leggere gli utenti.",
        },
      };
    }
  }

  return { data: utenti, error: null };
}

/**
 * Legge tutti i negozi a pagine. Se la migrazione `is_demo` non è ancora
 * presente, ripiega sul filtro esistente per nome/slug senza perdere i dati.
 * Il campo `data` è opzionale per mantenere disponibili i KPI principali
 * anche su schemi precedenti.
 */
async function listaNegozi(
  db: NonNullable<ReturnType<typeof getDb>>
): Promise<EsitoQuery<NegozioRiga>> {
  const negozi: NegozioRiga[] = [];
  let usaColonnaDemo = true;
  let usaColonnaData = true;
  let warning: string | undefined;

  for (let pagina = 0; ; pagina++) {
    const da = pagina * PAGE_SIZE;
    const a = da + PAGE_SIZE - 1;
    const campiBase =
      "id, nome, slug, categoria, attivo, in_evidenza, created_at, deleted_at";

    const risultato =
      usaColonnaDemo && usaColonnaData
        ? await db
            .from("negozi")
            .select(`${campiBase}, is_demo, data`)
            .order("created_at", { ascending: false })
            .range(da, a)
        : usaColonnaDemo
          ? await db
              .from("negozi")
              .select(`${campiBase}, is_demo`)
              .order("created_at", { ascending: false })
              .range(da, a)
          : usaColonnaData
            ? await db
                .from("negozi")
                .select(`${campiBase}, data`)
                .order("created_at", { ascending: false })
                .range(da, a)
            : await db
                .from("negozi")
                .select(campiBase)
                .order("created_at", { ascending: false })
                .range(da, a);

    const { data, error } = risultato;
    if (error) {
      if (CODICI_SCHEMA.has(error.code ?? "")) {
        if (usaColonnaDemo) {
          usaColonnaDemo = false;
          continue;
        }
        if (usaColonnaData) {
          usaColonnaData = false;
          warning = "La colonna dati negozio non è disponibile: offerte ed eventi non sono conteggiabili.";
          continue;
        }
      }
      return { data: negozi, error: { code: error.code, message: error.message } };
    }

    const righe = (data ?? []) as NegozioRiga[];
    negozi.push(...righe);
    if (righe.length < PAGE_SIZE) break;
  }

  return { data: negozi, error: null, warning };
}

/** Legge tutte le scansioni recenti a pagine per evitare troncamenti del feed. */
async function listaScansioni(
  db: NonNullable<ReturnType<typeof getDb>>,
  dal: string
): Promise<EsitoQuery<{ id: string; provider: string; status: string; created_at: string }>> {
  const scansioni: { id: string; provider: string; status: string; created_at: string }[] = [];

  for (let pagina = 0; ; pagina++) {
    const { data, error } = await db
      .from("scan_log")
      .select("id, provider, status, created_at")
      .gte("created_at", dal)
      .order("created_at", { ascending: true })
      .range(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE - 1);

    if (error) {
      return { data: scansioni, error: { code: error.code, message: error.message } };
    }

    const righe = (data ?? []) as typeof scansioni;
    scansioni.push(...righe);
    if (righe.length < PAGE_SIZE) break;
  }

  return { data: scansioni, error: null };
}

/** Legge tutti i prodotti attivi a pagine per conteggi e feed recenti corretti. */
async function listaProdotti(
  db: NonNullable<ReturnType<typeof getDb>>
): Promise<EsitoQuery<{ id: string | number; negozio_id: string | number | null; nome: string | null; created_at: string | null }>> {
  const prodotti: { id: string | number; negozio_id: string | number | null; nome: string | null; created_at: string | null }[] = [];

  for (let pagina = 0; ; pagina++) {
    const { data, error } = await db
      .from("prodotti")
      .select("id, negozio_id, nome, created_at")
      .eq("attivo", true)
      .order("created_at", { ascending: false })
      .range(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE - 1);

    if (error) {
      return { data: prodotti, error: { code: error.code, message: error.message } };
    }

    const righe = (data ?? []) as typeof prodotti;
    prodotti.push(...righe);
    if (righe.length < PAGE_SIZE) break;
  }

  return { data: prodotti, error: null };
}

export async function getDatiDashboard(): Promise<DatiDashboard> {
  const db = getDb();
  if (!db) return strutturaVuota(["Database non configurato: i KPI non sono disponibili."]);

  const dati = strutturaVuota();
  dati.statoPiattaforma.database = true;
  dati.statoPiattaforma.filtroDemo = true;

  const now = new Date();
  const inizioOggi = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).toISOString();
  const setteGiorniFa = new Date(
    now.getTime() - 7 * 24 * 3_600_000
  ).toISOString();

  const [utentiAuth, negoziEsito, prodottiEsito] = await Promise.all([
    listaUtentiAuth(db),
    listaNegozi(db),
    listaProdotti(db),
  ]);

  if (utentiAuth.error) dati.avvisi.push(`Utenti: ${utentiAuth.error.message ?? "fonte non disponibile"}.`);
  if (negoziEsito.error) dati.avvisi.push(`Negozi: ${negoziEsito.error.message ?? "fonte non disponibile"}.`);
  if (prodottiEsito.error) dati.avvisi.push(`Prodotti: ${prodottiEsito.error.message ?? "fonte non disponibile"}.`);
  if (negoziEsito.warning) dati.avvisi.push(negoziEsito.warning);

  const [scansioniSettimanaResult, scansioniOggiResult, cacheVisioneResult] = await Promise.all([
    listaScansioni(db, setteGiorniFa),
    db
      .from("scan_log")
      .select("id", { head: true, count: "exact" })
      .gte("created_at", inizioOggi),
    db
      .from("product_vision_cache")
      .select("id", { head: true, count: "exact" }),
  ]);

  if (scansioniSettimanaResult.error) {
    dati.avvisi.push(`Scansioni AI: ${scansioniSettimanaResult.error.message}.`);
  }
  if (scansioniOggiResult.error && !scansioniSettimanaResult.error) {
    dati.avvisi.push(`Conteggio scansioni odierne: ${scansioniOggiResult.error.message}.`);
  }
  if (cacheVisioneResult.error) {
    dati.avvisi.push(`Cache visione: ${cacheVisioneResult.error.message}.`);
  }

  // ── Utenti (Auth Admin API), account di test esclusi ─────────────────
  const { data: ruoli, error: erroreRuoli } = await db
    .from("user_roles")
    .select("user_id, role");
  if (erroreRuoli) {
    dati.avvisi.push(`Ruoli utenti: ${erroreRuoli.message}. KPI per ruolo non disponibili.`);
  }

  const ruoliPerUtente = new Map<string, string[]>();
  for (const r of ruoli ?? []) {
    const key = String(r.user_id);
    const lista = ruoliPerUtente.get(key) ?? [];
    lista.push(String(r.role));
    ruoliPerUtente.set(key, lista);
  }

  // Senza user_roles non è possibile distinguere in modo affidabile account
  // reali e account test: non esponiamo quindi un totale utenti potenzialmente
  // falso. L'avviso rende esplicita la fonte non disponibile.
  const utentiReali = erroreRuoli
    ? []
    : utentiAuth.data.filter(
        (u) => !èUtenteTest(ruoliPerUtente.get(u.id) ?? [])
      );

  dati.kpi.utenti = utentiReali.length;
  if (!erroreRuoli) {
    for (const u of utentiReali) {
      const ruolo = ruoloPrimario(ruoliPerUtente.get(u.id) ?? []);
      if (ruolo === "commerciante") dati.kpi.commercianti++;
      if (ruolo === "utente") dati.kpi.clienti++;
    }

    const conteggioRuoli = new Map<RuoloUtente, number>();
    for (const u of utentiReali) {
      const ruolo = ruoloPrimario(ruoliPerUtente.get(u.id) ?? []);
      conteggioRuoli.set(ruolo, (conteggioRuoli.get(ruolo) ?? 0) + 1);
    }
    dati.grafici.utentiPerRuolo = (["amministratore", "commerciante", "utente"] as RuoloUtente[])
      .map((ruolo) => ({ ruolo, count: conteggioRuoli.get(ruolo) ?? 0 }))
      .filter((r) => r.count > 0);

    dati.ultimiUtenti = utentiReali
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
      .map((u) => ({
        id: u.id,
        nome: nomeDaEmail(u.email),
        email: u.email,
        ruolo: ruoloPrimario(ruoliPerUtente.get(u.id) ?? []),
        registratoIl: u.created_at,
      }));
  }

  // ── Negozi, con esclusione autorevole dei demo ────────────────────────
  const negozi = negoziEsito.data;
  const negoziReali = negozi.filter((n) => !negozioDemoDashboard(n));
  const negoziAttivi = negoziReali.filter((n) => n.attivo && !n.deleted_at);
  const negoziSospesi = negoziReali.filter((n) => !n.attivo && !n.deleted_at);
  const negoziCestino = negoziReali.filter((n) => Boolean(n.deleted_at));

  dati.kpi.negoziAttivi = negoziAttivi.length;
  dati.kpi.negoziSospesi = negoziSospesi.length;
  dati.kpi.negoziCestino = negoziCestino.length;

  const oggi = new Date();
  const oggiLocale = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}-${String(oggi.getDate()).padStart(2, "0")}`;
  const elementoPubblicato = (elemento: unknown): elemento is Record<string, unknown> =>
    Boolean(
      elemento &&
        typeof elemento === "object" &&
        typeof (elemento as Record<string, unknown>).titolo === "string" &&
        String((elemento as Record<string, unknown>).titolo).trim()
    );
  const offertaAttiva = (elemento: Record<string, unknown>) => {
    const dal = typeof elemento.valido_dal === "string" ? elemento.valido_dal : "";
    const al = typeof elemento.valido_al === "string" ? elemento.valido_al : "";
    return (!dal || dal <= oggiLocale) && (!al || al >= oggiLocale);
  };
  const contaElementi = (
    chiave: "offerte" | "eventi",
    filtro: (elemento: Record<string, unknown>) => boolean = () => true
  ) =>
    negoziAttivi.reduce((totale, negozio) => {
      const elementi = negozio.data?.[chiave];
      if (!Array.isArray(elementi)) return totale;
      return totale + elementi.filter(elementoPubblicato).filter(filtro).length;
    }, 0);
  dati.kpi.offerteAttive = contaElementi("offerte", offertaAttiva);
  dati.kpi.eventi = contaElementi("eventi");

  const perCategoria = new Map<string, number>();
  for (const n of [...negoziAttivi, ...negoziSospesi]) {
    const categoria = n.categoria?.trim() || "Senza categoria";
    perCategoria.set(categoria, (perCategoria.get(categoria) ?? 0) + 1);
  }
  dati.grafici.negoziPerCategoria = Array.from(perCategoria.entries())
    .map(([categoria, count]) => ({ categoria, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  dati.ultimiNegozi = negoziAttivi.slice(0, 5).map((n) => ({
    id: n.id,
    nome: n.nome ?? "Negozio senza nome",
    slug: n.slug,
    categoria: n.categoria,
    attivo: n.attivo,
    created_at: n.created_at,
  }));

  // ── Prodotti attivi dei negozi reali ──────────────────────────────────
  const idDemo = new Set(
    negozi
      .filter((n) => negozioDemoDashboard(n))
      .map((n) => n.id)
  );
  const idNegoziConteggiabili = new Set(
    negoziReali
      .filter((n) => !n.deleted_at)
      .map((n) => n.id)
  );
  const prodottiReali = prodottiEsito.data.filter(
    (p) =>
      !idDemo.has(String(p.negozio_id)) &&
      idNegoziConteggiabili.has(String(p.negozio_id))
  );
  dati.kpi.prodotti = prodottiReali.length;

  // ── Scansioni AI ──────────────────────────────────────────────────────
  const scansioniSettimana = scansioniSettimanaResult.data;
  dati.kpi.scansioniOggi = scansioniOggiResult.count ?? 0;

  const chiaveLocale = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const perGiorno = new Map<string, { etichetta: string; count: number }>();
  for (let i = 6; i >= 0; i--) {
    const giorno = new Date(now.getTime() - i * 24 * 3_600_000);
    perGiorno.set(chiaveLocale(giorno), {
      etichetta: `${giorno.getDate().toString().padStart(2, "0")}/${(giorno.getMonth() + 1).toString().padStart(2, "0")}`,
      count: 0,
    });
  }
  for (const s of scansioniSettimana) {
    const riga = perGiorno.get(chiaveLocale(new Date(String(s.created_at))));
    if (riga) riga.count++;
  }
  dati.grafici.scansioniSettimana = Array.from(perGiorno.entries()).map(
    ([data, { etichetta, count }]) => ({ data, etichetta, count })
  );

  const { data: ultimeScansioni, error: erroreUltimaScansione } = await db
    .from("scan_log")
    .select("id, provider, status, created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  if (erroreUltimaScansione && !scansioniSettimanaResult.error) {
    dati.avvisi.push(`Ultima scansione: ${erroreUltimaScansione.message}.`);
  }
  dati.statoPiattaforma.ultimaScansione =
    (ultimeScansioni?.[0]?.created_at as string | undefined) ?? null;
  dati.statoPiattaforma.cacheVisione = cacheVisioneResult.count ?? 0;

  // ── Ultime attività, feed misto reale ─────────────────────────────────
  const attivita: DashboardAttivitaVoce[] = [];
  for (const n of negoziAttivi.slice(0, 4)) {
    attivita.push({
      id: `negozio-${n.id}`,
      tipo: "negozio",
      titolo: n.nome ?? "Negozio",
      descrizione: "Nuovo negozio creato",
      data: n.created_at,
      href: n.slug ? `/negozio/${n.slug}` : null,
    });
  }
  for (const p of prodottiReali.slice(0, 4)) {
    attivita.push({
      id: `prodotto-${String(p.id)}`,
      tipo: "prodotto",
      titolo: String(p.nome ?? "Prodotto"),
      descrizione: "Prodotto pubblicato",
      data: String(p.created_at ?? ""),
      href: null,
    });
  }
  for (const s of scansioniSettimana.slice(-4)) {
    attivita.push({
      id: `scansione-${String(s.id)}`,
      tipo: "scansione",
      titolo: `Scansione ${String(s.provider)}`,
      descrizione: s.status === "success" ? "Riconoscimento riuscito" : "Esito non riuscito",
      data: String(s.created_at),
      href: "/amministratore/scansioni",
    });
  }
  dati.ultimeAttivita = attivita
    .filter((a) => a.data)
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    .slice(0, 8);

  return dati;
}
