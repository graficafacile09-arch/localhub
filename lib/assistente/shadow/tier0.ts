/**
 * Pino — Shadow Adapter Tier 0 (osservatore post-risposta).
 *
 * È collegato al runtime tramite `shadow/integrazione` e `after()`; osserva una
 * richiesta già servita dal Pino di produzione senza toccarne la
 * risposta: usa il planner deterministico Core V2, confronta i limiti di
 * prezzo con quelli di produzione e verifica i prodotti REALMENTE restituiti.
 *
 * Confini di sicurezza:
 * - nessun import di `ai-request-planner`, `callGeminiText`, Supabase o `fetch`;
 * - nessun I/O, nessuna promise, nessun timer: l'intera valutazione è sincrona;
 * - nessuna regex di prezzo duplicata: estrazione e verifica sono INIETTATE
 *   dalle funzioni di produzione (`estraiPrezzoEsplicitoPino`,
 *   `prodottoRispettaBudgetPino`, `prezzoNumerico`);
 * - nessun uso di `eligible` / `withinBudget` del ranker come garanzia;
 * - nessun testo utente nel report: solo conteggi, booleani, limiti numerici,
 *   id pubblici e un identificativo casuale di richiesta;
 * - il budget di 20 ms è OSSERVATO: non interrompe il planner già in
 *   esecuzione, ma ferma la valutazione dei prodotti (N1);
 * - le eccezioni del planner o delle dipendenze NON sono intercettate qui:
 *   il wrapper di integrazione deve racchiudere chiamata e serializzazione in
 *   `try/catch`, così un errore della Shadow non degrada la risposta (B2).
 *
 * @module lib/assistente/shadow/tier0
 */
import { planPinoCoreRequest, type PinoCorePlan } from "../core-v2/request-planner.ts";

/**
 * Budget di lavoro OSSERVATO dalla Shadow (N1).
 *
 * Non è un timeout: la valutazione è sincrona, quindi un planner già in
 * esecuzione non può essere interrotto. Il tempo viene misurato dopo il
 * planner e prima di ogni prodotto; oltre il budget si smette di valutare e si
 * registra `skip: "tempo_massimo"`, senza retry né continuazione.
 */
export const MAX_MS_TIER0 = 20;

/** Numero massimo di prodotti esaminati (il runtime ne restituisce al più 10). */
const MAX_PRODOTTI_VALUTATI = 50;

/**
 * Kill switch di codice. Anche se l'ambiente dice `on`, con questo a `false`
 * la Shadow resta spenta. Il default operativo è comunque OFF: senza
 * `PINO_SHADOW_MODE=on` non viene eseguito nulla.
 */
export const SHADOW_TIER0_ABILITATO = true;

export type LimitiPrezzo = { minPrice: number | null; maxPrice: number | null };

/** Prodotto minimo osservabile: nessun campo testuale viene copiato nel report. */
export type ProdottoTier0 = { id?: unknown; prezzo?: unknown };

export type DipendenzeTier0 = {
  /**
   * Funzione di produzione per i limiti espliciti (nessuna regex locale).
   * Usata solo quando `limitiProduzione` è `undefined`: un `null` esplicito
   * significa "la produzione non aveva limiti" e non viene interpretato.
   */
  estraiPrezzo: (testo: string) => LimitiPrezzo;
  /** Predicato di produzione: prezzo reale > 0 e dentro i limiti. */
  rispettaBudget: (
    prodotto: ProdottoTier0,
    limiti: { minPrice?: number | null; maxPrice?: number | null }
  ) => boolean;
  /** Normalizzatore di produzione del prezzo (numeri e stringhe del catalogo). */
  prezzoNumerico: (valore: unknown) => number | null;
  /** Iniettabile per i test; in produzione è il planner Core V2. */
  pianifica?: (testo: string) => PinoCorePlan;
  /** Iniettabile per i test del tetto temporale; default `Date.now`. */
  ora?: () => number;
};

export type InputTier0 = {
  /** Ultimo messaggio utente: usato per il piano, MAI serializzato. */
  messaggio: string;
  prodotti?: ProdottoTier0[];
  negoziRestituiti?: number;
  /**
   * Limiti effettivi del Pino di produzione.
   * - assente (`undefined`): si interroga `dipendenze.estraiPrezzo(messaggio)`;
   * - `null`: la produzione non aveva limiti (esito dichiarato, non ignorato);
   * - valori: usati così come forniti dal chiamante.
   */
  limitiProduzione?: LimitiPrezzo | null;
  /** Provenienza dichiarata dei limiti di produzione. */
  origineLimitiProduzione?: "traccia" | "testo" | "assente";
  motivoUscita?: string | null;
  invocazioni?: unknown[];
  richiestaId?: string;
};

export type ConfrontoTier0 = {
  route: { piano: string; produzione: string; divergente: boolean };
  surface: { piano: string; produzione: string; divergente: boolean };
  risultati: {
    stato: "uscita" | "zero_risultati" | "risultati";
    prodottiRestituiti: number;
    negoziRestituiti: number;
  };
  tipi: string[];
};

export type EsitoProdottoTier0 =
  | "conforme"
  | "fuori_budget"
  | "senza_prezzo"
  | "prezzo_non_positivo"
  | "non_verificabile";

export type ReportTier0 = {
  v: 1;
  richiestaId: string;
  timestamp: string;
  durataMs: number;
  eseguito: boolean;
  skip: "tempo_massimo" | null;
  piano: {
    route: string;
    surface: string;
    confidence: string;
    needsClarification: boolean;
    openNow: boolean;
    haSoggetto: boolean;
    nEsclusioni: number;
    nAttributi: number;
    limitiNativi: LimitiPrezzo;
  };
  produzione: {
    limiti: LimitiPrezzo | null;
    origine: "traccia" | "testo" | "assente" | "non_dichiarata";
  };
  divergenza: {
    presente: boolean;
    tipi: string[];
    nativi: LimitiPrezzo;
    produzione: LimitiPrezzo | null;
  };
  uscita: {
    motivo: string | null;
    invocazioni: string[];
    prodottiRestituiti: number;
    negoziRestituiti: number;
  };
  /** Confronto diagnostico route/surface/risultati (additivo, sola lettura). */
  confronto: ConfrontoTier0;
  budget: {
    applicabile: boolean;
    prodottiValutati: number;
    conformi: number;
    fuoriBudget: number;
    senzaPrezzo: number;
    prezzoNonPositivo: number;
    nonVerificabili: number;
    idFuoriBudget: string[];
    idSenzaPrezzo: string[];
  };
};

const LIMITI_VUOTI: LimitiPrezzo = { minPrice: null, maxPrice: null };

function numeroValido(valore: unknown): number | null {
  // 0 è un limite esplicito valido ("entro 0 euro"): non va confuso con
  // l'assenza di budget, che resta `null`.
  if (typeof valore !== "number" || !Number.isFinite(valore) || valore < 0) return null;
  return valore;
}

/** Limite "osservato": conserva 0 (la divergenza zero/assente va registrata). */
function limiteNumerico(valore: unknown): number | null {
  if (typeof valore !== "number" || !Number.isFinite(valore) || Math.abs(valore) > 1_000_000) {
    return null;
  }
  return valore;
}

const ORIGINI_LIMITI = ["traccia", "testo", "assente", "non_dichiarata"] as const;

type OrigineLimitiPrezzo = (typeof ORIGINI_LIMITI)[number];

/** N3 — valida l'origine già alla costruzione del report, non solo al log. */
function origineSicura(valore: unknown): OrigineLimitiPrezzo | null {
  return typeof valore === "string" && (ORIGINI_LIMITI as readonly string[]).includes(valore)
    ? (valore as OrigineLimitiPrezzo)
    : null;
}

/** N2 — etichette brevi e prevedibili: nessun testo libero nel log. */
function etichettaSicura(valore: unknown, fallback: string): string {
  const testo = typeof valore === "string" ? valore.trim() : "";
  return /^[a-z][a-z0-9_]{0,23}$/.test(testo) ? testo : fallback;
}

function normalizzaLimiti(
  limiti: { minPrice?: unknown; maxPrice?: unknown } | null | undefined
): LimitiPrezzo | null {
  if (!limiti) return null;
  const minPrice = numeroValido(limiti.minPrice);
  const maxPrice = numeroValido(limiti.maxPrice);
  return minPrice == null && maxPrice == null ? null : { minPrice, maxPrice };
}

/** Surface prodotta dalle invocazioni già registrate (nessun nuovo dato). */
function surfaceDaInvocazioni(invocazioni: string[]): string {
  const prodotti = invocazioni.some((voce) => /^searchProduct/i.test(voce));
  const negozi = invocazioni.some((voce) => /^searchNegozi/i.test(voce));
  if (prodotti && negozi) return "both";
  if (prodotti) return "products";
  if (negozi) return "stores";
  return "none";
}

/**
 * Route e surface EFFETTIVE della produzione, derivate dai motivi di uscita e
 * dalle invocazioni già registrate. Stima dichiarata: non viene copiata dalla
 * risposta servita e non introduce nuove informazioni nel percorso utente.
 */
function routeProduzione(
  motivo: string | null,
  invocazioni: string[],
  prodottiRestituiti: number,
  negoziRestituiti: number
): {
  route: string;
  surface: string;
  stato: ConfrontoTier0["risultati"]["stato"];
} {
  const surface = surfaceDaInvocazioni(invocazioni);
  const stato: ConfrontoTier0["risultati"]["stato"] =
    prodottiRestituiti + negoziRestituiti > 0 ? "risultati" : "zero_risultati";

  if (
    motivo === "conversazione" ||
    motivo === "preferenza_lingua" ||
    motivo === "saluto" ||
    motivo === "risposta_diretta"
  ) {
    return { route: "conversation", surface: "none", stato: "uscita" };
  }
  if (motivo === "cinema" || motivo === "attrazioni" || motivo === "attrazioni_assenti") {
    return { route: "attractions", surface: "none", stato: "uscita" };
  }
  if (motivo === "meteo") return { route: "weather", surface: "none", stato: "uscita" };
  if (motivo === "farmacie") return { route: "pharmacies", surface: "stores", stato: "uscita" };
  if (motivo === "fonti_non_disponibili") {
    return { route: "unknown", surface: "none", stato: "uscita" };
  }
  if (motivo === "aggregata") {
    return { route: "catalog", surface: "products", stato };
  }
  if (
    motivo === "selezione_vuota" ||
    motivo === "follow_up" ||
    motivo === "finale"
  ) {
    return { route: "catalog", surface, stato };
  }
  // Motivo sconosciuto o assente: la route resta "unknown" solo se nessuna
  // invocazione è stata registrata, così il confronto è onesto.
  return {
    route: invocazioni.length > 0 ? "catalog" : "unknown",
    surface,
    stato,
  };
}

function confrontaRouteSurface(
  piano: { route: string; surface: string },
  produzione: { route: string; surface: string; stato: ConfrontoTier0["risultati"]["stato"] },
  prodottiRestituiti: number,
  negoziRestituiti: number,
  limitiDivergenti: boolean
): ConfrontoTier0 {
  const route = {
    piano: piano.route,
    produzione: produzione.route,
    divergente: piano.route !== produzione.route,
  };
  const surface = {
    piano: piano.surface,
    produzione: produzione.surface,
    divergente: piano.surface !== produzione.surface,
  };
  const tipi: string[] = [];
  if (route.divergente) tipi.push("route_diversa");
  if (surface.divergente) tipi.push("surface_diversa");
  if (limitiDivergenti) tipi.push("limiti_diversi");
  if (
    produzione.stato === "zero_risultati" &&
    (produzione.surface === "products" || produzione.surface === "both")
  ) {
    tipi.push("zero_risultati_prodotti");
  }
  if (produzione.surface === "none" && piano.surface !== "none") {
    tipi.push("surface_produzione_assente");
  }
  return {
    route,
    surface,
    risultati: { stato: produzione.stato, prodottiRestituiti, negoziRestituiti },
    tipi,
  };
}

function confrontaLimiti(nativi: LimitiPrezzo, produzione: LimitiPrezzo | null) {
  const tipi: string[] = [];
  if (nativi.minPrice === 0 || nativi.maxPrice === 0) tipi.push("zero_nativo");
  if (produzione == null) {
    if (nativi.minPrice != null || nativi.maxPrice != null) tipi.push("solo_core_v2");
  } else {
    if (nativi.minPrice == null && nativi.maxPrice == null) tipi.push("solo_produzione");
    if (nativi.minPrice !== produzione.minPrice) tipi.push("min_diverso");
    if (nativi.maxPrice !== produzione.maxPrice) tipi.push("max_diverso");
  }
  return {
    presente: tipi.length > 0,
    tipi: Array.from(new Set(tipi)),
    nativi,
    produzione,
  };
}

function idSicuro(valore: unknown): string | null {
  const id = String(valore ?? "").trim();
  // N4 — id pubblici con `.`, `:`, `-` e `_` restano diagnostici.
  return /^[A-Za-z0-9._:-]{1,64}$/.test(id) ? id : null;
}

function motivoSicuro(valore: unknown): string | null {
  const motivo = String(valore ?? "").trim();
  return /^[a-z][a-z0-9_]{0,39}$/.test(motivo) ? motivo : null;
}

function statoRicercaSicuro(
  valore: unknown
): "uscita" | "zero_risultati" | "risultati" | "non_dichiarato" {
  return valore === "uscita" || valore === "zero_risultati" || valore === "risultati"
    ? valore
    : "non_dichiarato";
}

function invocazioniSicure(valore: unknown): string[] {
  if (!Array.isArray(valore)) return [];
  return Array.from(
    new Set(
      valore
        .filter((voce): voce is string => typeof voce === "string")
        .filter((voce) => /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(voce))
    )
  ).slice(0, 6);
}

function idRichiesta(valore: unknown): string {
  const id = String(valore ?? "").trim();
  return /^[A-Za-z0-9_-]{6,40}$/.test(id) ? id : "anon";
}

function nuovoIdRichiesta(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (typeof uuid === "string") return uuid.replace(/-/g, "").slice(0, 12);
  return Math.random().toString(16).slice(2, 14);
}

/**
 * Kill switch: OFF per default. Serve sia `PINO_SHADOW_MODE === "on"` sia che
 * l'interruttore di codice resti abilitato.
 */
export function shadowTier0Attivo(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): boolean {
  return SHADOW_TIER0_ABILITATO === true && env.PINO_SHADOW_MODE === "on";
}

/**
 * Punto d'ingresso gated. Con la Shadow spenta restituisce `null` PRIMA di
 * costruire il report o chiamare il planner: nessuna struttura di tracciamento.
 *
 * B2 — questa funzione NON intercetta le eccezioni del planner o delle
 * dipendenze: il wrapper di integrazione (Fase 2) deve racchiudere chiamata e
 * serializzazione in `try/catch`, perché un errore della Shadow non può
 * propagarsi alla risposta servita. La protezione non è simulata qui.
 */
export function eseguiTier0Shadow(
  input: InputTier0,
  dipendenze: DipendenzeTier0,
  env?: Record<string, string | undefined>
): ReportTier0 | null {
  if (!shadowTier0Attivo(env)) return null;
  return valutaTier0Shadow(input, dipendenze);
}

/**
 * Valutazione pura, sincrona e senza I/O. Non modifica mai il piano ricevuto:
 * i limiti nativi e quelli di produzione restano registrati separatamente.
 */
export function valutaTier0Shadow(
  input: InputTier0,
  dipendenze: DipendenzeTier0
): ReportTier0 {
  const ora = dipendenze.ora ?? Date.now;
  const pianifica = dipendenze.pianifica ?? planPinoCoreRequest;
  const messaggio = typeof input.messaggio === "string" ? input.messaggio : "";

  // N7 — un clock non finito o fuori range non deve far lanciare il report.
  const leggiOra = (): number | null => {
    const valore = ora();
    return Number.isFinite(valore) ? valore : null;
  };
  const inizioGrezzo = leggiOra();
  const inizio =
    inizioGrezzo != null && Math.abs(inizioGrezzo) <= 8_640_000_000_000_000
      ? inizioGrezzo
      : Date.now();
  const oltreBudget = (): boolean => {
    const adesso = leggiOra();
    return adesso != null && adesso - inizio > MAX_MS_TIER0;
  };

  const piano = pianifica(messaggio);
  const limitiNativi: LimitiPrezzo = {
    minPrice: limiteNumerico(piano.minPrice),
    maxPrice: limiteNumerico(piano.maxPrice),
  };

  // B1 — `undefined` significa "limiti non forniti": si usa l'estrattore di
  // produzione. `null` esplicito resta "la produzione non aveva limiti".
  const daTesto = input.limitiProduzione === undefined;
  const limitiProduzione = normalizzaLimiti(
    daTesto ? dipendenze.estraiPrezzo(messaggio) : input.limitiProduzione
  );
  const divergenza = confrontaLimiti(limitiNativi, limitiProduzione);

  const prodotti = Array.isArray(input.prodotti)
    ? input.prodotti.slice(0, MAX_PRODOTTI_VALUTATI)
    : [];
  const applicabile =
    limitiProduzione != null &&
    (limitiProduzione.minPrice != null || limitiProduzione.maxPrice != null);

  const budget: ReportTier0["budget"] = {
    applicabile,
    prodottiValutati: 0,
    conformi: 0,
    fuoriBudget: 0,
    senzaPrezzo: 0,
    prezzoNonPositivo: 0,
    nonVerificabili: 0,
    idFuoriBudget: [],
    idSenzaPrezzo: [],
  };

  let skip: ReportTier0["skip"] = null;

  // Budget osservato (N1): non interrompe il planner, ferma i prodotti.
  // Nessun retry, nessuna continuazione dopo lo scadere.
  if (oltreBudget()) {
    skip = "tempo_massimo";
  } else {
    for (const prodotto of prodotti) {
      if (oltreBudget()) {
        skip = "tempo_massimo";
        break;
      }

      const id = idSicuro(prodotto?.id);
      const prezzo = dipendenze.prezzoNumerico(prodotto?.prezzo);

      let esito: EsitoProdottoTier0;
      if (prezzo == null) {
        esito = "senza_prezzo";
      } else if (!(prezzo > 0)) {
        esito = "prezzo_non_positivo";
      } else if (!applicabile) {
        esito = "non_verificabile";
      } else {
        esito = dipendenze.rispettaBudget(prodotto, limitiProduzione!)
          ? "conforme"
          : "fuori_budget";
      }

      budget.prodottiValutati += 1;
      if (esito === "conforme") budget.conformi += 1;
      if (esito === "fuori_budget") {
        budget.fuoriBudget += 1;
        if (id && budget.idFuoriBudget.length < 10) budget.idFuoriBudget.push(id);
      }
      if (esito === "senza_prezzo") {
        budget.senzaPrezzo += 1;
        if (id && budget.idSenzaPrezzo.length < 10) budget.idSenzaPrezzo.push(id);
      }
      if (esito === "prezzo_non_positivo") budget.prezzoNonPositivo += 1;
      if (esito === "non_verificabile") budget.nonVerificabili += 1;
    }
  }

  const fineGrezzo = leggiOra();
  const fine =
    fineGrezzo != null && Math.abs(fineGrezzo) <= 8_640_000_000_000_000
      ? fineGrezzo
      : inizio;
  const negozi = Number(input.negoziRestituiti);
  const negoziRestituiti = Number.isFinite(negozi)
    ? Math.max(0, Math.min(1000, Math.round(negozi)))
    : 0;
  const routePiano = etichettaSicura(piano.route, "unknown");
  const surfacePiano = etichettaSicura(piano.surface, "none");
  const motivo = motivoSicuro(input.motivoUscita);
  const invocazioni = invocazioniSicure(input.invocazioni);
  const confronto = confrontaRouteSurface(
    { route: routePiano, surface: surfacePiano },
    routeProduzione(motivo, invocazioni, prodotti.length, negoziRestituiti),
    prodotti.length,
    negoziRestituiti,
    divergenza.presente
  );

  return {
    v: 1,
    richiestaId: idRichiesta(input.richiestaId ?? nuovoIdRichiesta()),
    timestamp: new Date(inizio).toISOString(),
    durataMs: Math.max(0, Math.round(fine - inizio)),
    eseguito: true,
    skip,
    piano: {
      route: routePiano,
      surface: surfacePiano,
      confidence: etichettaSicura(piano.confidence, "low"),
      needsClarification: piano.needsClarification === true,
      openNow: piano.openNow === true,
      haSoggetto: typeof piano.subject === "string" && piano.subject.trim().length > 0,
      nEsclusioni: Array.isArray(piano.exclusions) ? piano.exclusions.length : 0,
      nAttributi: Array.isArray(piano.attributes) ? piano.attributes.length : 0,
      limitiNativi,
    },
    produzione: {
      limiti: limitiProduzione,
      origine:
        origineSicura(input.origineLimitiProduzione) ??
        (limitiProduzione == null ? "assente" : daTesto ? "testo" : "non_dichiarata"),
    },
    divergenza,
    uscita: {
      motivo,
      invocazioni,
      prodottiRestituiti: prodotti.length,
      negoziRestituiti,
    },
    confronto,
    budget,
  };
}

/**
 * Confine di serializzazione: ricostruisce il report per allowlist, così nessun
 * campo aggiunto altrove (testo utente, risposta, header, IP, cookie, sessionId)
 * può finire nel log. `original`, `query`, `subject`, `attributes` ed
 * `exclusions` del piano non vengono mai copiati.
 */
export function serializzaReportTier0(report: ReportTier0): string {
  const limiti = (valore: LimitiPrezzo | null) =>
    valore == null
      ? null
      : {
          minPrice: limiteNumerico(valore.minPrice),
          maxPrice: limiteNumerico(valore.maxPrice),
        };

  const origineAmmessa = origineSicura(report?.produzione?.origine) ?? "non_dichiarata";

  const serializzato = {
    v: 1,
    richiestaId: idRichiesta(report?.richiestaId),
    timestamp:
      typeof report?.timestamp === "string" && !Number.isNaN(Date.parse(report.timestamp))
        ? report.timestamp
        : new Date(0).toISOString(),
    durataMs:
      typeof report?.durataMs === "number" && Number.isFinite(report.durataMs)
        ? Math.max(0, Math.round(report.durataMs))
        : 0,
    eseguito: report?.eseguito === true,
    skip: report?.skip === "tempo_massimo" ? "tempo_massimo" : null,
    piano: {
      route: etichettaSicura(report?.piano?.route, "unknown"),
      surface: etichettaSicura(report?.piano?.surface, "none"),
      confidence: etichettaSicura(report?.piano?.confidence, "low"),
      needsClarification: report?.piano?.needsClarification === true,
      openNow: report?.piano?.openNow === true,
      haSoggetto: report?.piano?.haSoggetto === true,
      nEsclusioni: Math.max(0, Math.round(Number(report?.piano?.nEsclusioni) || 0)),
      nAttributi: Math.max(0, Math.round(Number(report?.piano?.nAttributi) || 0)),
      limitiNativi: limiti(report?.piano?.limitiNativi ?? LIMITI_VUOTI),
    },
    produzione: {
      limiti: limiti(report?.produzione?.limiti ?? null),
      origine: origineAmmessa,
    },
    divergenza: {
      presente: report?.divergenza?.presente === true,
      tipi: Array.isArray(report?.divergenza?.tipi)
        ? report.divergenza.tipi.filter((tipo) => /^[a-z_]{1,32}$/.test(String(tipo))).slice(0, 8)
        : [],
      nativi: limiti(report?.divergenza?.nativi ?? LIMITI_VUOTI),
      produzione: limiti(report?.divergenza?.produzione ?? null),
    },
    uscita: {
      motivo: motivoSicuro(report?.uscita?.motivo),
      invocazioni: invocazioniSicure(report?.uscita?.invocazioni),
      prodottiRestituiti: Math.max(0, Math.round(Number(report?.uscita?.prodottiRestituiti) || 0)),
      negoziRestituiti: Math.max(0, Math.round(Number(report?.uscita?.negoziRestituiti) || 0)),
    },
    confronto: {
      route: {
        piano: etichettaSicura(report?.confronto?.route?.piano, "unknown"),
        produzione: etichettaSicura(report?.confronto?.route?.produzione, "unknown"),
        divergente: report?.confronto?.route?.divergente === true,
      },
      surface: {
        piano: etichettaSicura(report?.confronto?.surface?.piano, "none"),
        produzione: etichettaSicura(report?.confronto?.surface?.produzione, "none"),
        divergente: report?.confronto?.surface?.divergente === true,
      },
      risultati: {
        stato: statoRicercaSicuro(report?.confronto?.risultati?.stato),
        prodottiRestituiti: Math.max(0, Math.round(Number(report?.confronto?.risultati?.prodottiRestituiti) || 0)),
        negoziRestituiti: Math.max(0, Math.round(Number(report?.confronto?.risultati?.negoziRestituiti) || 0)),
      },
      tipi: Array.isArray(report?.confronto?.tipi)
        ? report.confronto.tipi.filter((tipo) => /^[a-z_]{1,32}$/.test(String(tipo))).slice(0, 8)
        : [],
    },
    budget: {
      applicabile: report?.budget?.applicabile === true,
      prodottiValutati: Math.max(0, Math.round(Number(report?.budget?.prodottiValutati) || 0)),
      conformi: Math.max(0, Math.round(Number(report?.budget?.conformi) || 0)),
      fuoriBudget: Math.max(0, Math.round(Number(report?.budget?.fuoriBudget) || 0)),
      senzaPrezzo: Math.max(0, Math.round(Number(report?.budget?.senzaPrezzo) || 0)),
      prezzoNonPositivo: Math.max(0, Math.round(Number(report?.budget?.prezzoNonPositivo) || 0)),
      nonVerificabili: Math.max(0, Math.round(Number(report?.budget?.nonVerificabili) || 0)),
      idFuoriBudget: Array.isArray(report?.budget?.idFuoriBudget)
        ? report.budget.idFuoriBudget
            .map((id) => idSicuro(id))
            .filter((id): id is string => id != null)
            .slice(0, 10)
        : [],
      idSenzaPrezzo: Array.isArray(report?.budget?.idSenzaPrezzo)
        ? report.budget.idSenzaPrezzo
            .map((id) => idSicuro(id))
            .filter((id): id is string => id != null)
            .slice(0, 10)
        : [],
    },
  };

  return JSON.stringify(serializzato);
}
