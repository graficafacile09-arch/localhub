/**
 * LocalHub — Assistente AI: Tool di retrieval
 *
 * Strato interno dell'assistente: recupera i dati pubblici di InCittà
 * RIUSANDO le funzioni di ricerca già esistenti (nessuna logica duplicata):
 *   - searchStores   → cercaNegozi() (keyword + sinonimi + ranking)
 *   - searchProducts → cercaProdotti() + filtro prezzo in memoria
 *   - searchOffers   → getOffertePubbliche() + nome negozio + filtro testo
 *   - searchEvents   → getEventiPubblici() + nome negozio + filtro testo
 *   - getCategories  → getCategorieConNegozi()
 *   - searchAll      → combinazione delle precedenti
 *
 * Nessuna scrittura: solo lettura sui dati pubblici, nessun tocco a DB/RLS.
 *
 * @module lib/assistente/tools
 */

import { cercaNegozi, getCategorieConNegozi, type SegnalazioneErroriDati } from "@/lib/negozi";
import { search as searchCatalogoPubblico } from "@/lib/search-service";
import { getOffertePubbliche } from "@/lib/offerte";
import { getEventiPubblici } from "@/lib/eventi";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getFarmacieTurnoCastrovillari, inTurnoFarmacia, type FarmaciaTurno } from "@/lib/farmacie-turno";

/** Prova del turno condivisa con la risposta deterministica di Pino. */
export { inTurnoFarmacia };
import type { NegozioRicerca, ProdottoRicerca } from "@/lib/ricerca-ai";
import { terminiSignificativi, similaritaLevenshtein } from "@/lib/search-tollerante";
import { analizzaRichiesta } from "@/lib/ricerca-intento";
import { espandiQueryConSinonimi, SINONIMI_DIRETTI_PRODOTTO } from "@/lib/ricerca-semantica";
import { estraiCitta } from "@/lib/localita";
import { normalizza, estraiToken, equivalenzaSigla, formaCompatta } from "@/lib/text-utils";
import {
  ATTRIBUTI_DESCRITTIVI_PINO,
  attributoCanonicoPino,
  estraiAttributiPino,
} from "@/lib/assistente/understanding";
import type { Orari } from "@/types/negozio";
import { apertoOra } from "./conversazione";
import {
  prodottoIdentificaCategoriaGenerica,
  prodottoIdentificatoDaSoggetto,
  prodottoIdentificaSoggetto,
  prodottoForseRefusoDiSoggetto,
  spiegaPertinenzaProdotto,
} from "./product-relevance";
// Soggetti generici e ponti concettuali: unica fonte in `lexicon.ts`, così non
// esistono due copie da tenere allineate.
import {
  ATTIVITA_CATALOGO_PINO,
  PONTI_CONCETTUALI_PINO,
  SOGGETTI_GENERICI_PINO,
  soggettoAlimentarePino,
} from "./lexicon.ts";
import { normalizzaQueryCatalogo } from "./understanding";
import { CONTRATTI_STRUMENTO } from "./function-calling";
import { eventoNelPeriodoPino, type PeriodoEventiPino } from "./eventi-periodo";

export { CONTRATTI_STRUMENTO } from "./function-calling";

// ─── M6-C1: segnalazione errori dati per Pino ───────────────────────────────
//
// I tool devono distinguere "ricerca riuscita senza risultati" da "errore
// tecnico". Le funzioni dati segnalano l'errore con la callback "onErrore",
// che qui lancia: l'eccezione attraversa il tool e M6-A la classifica come
// "errore" (non "vuoto", non "timeout"), senza cambiare i chiamanti del sito.

/** Errore tipizzato: i dati non sono leggibili per un guasto tecnico. */
export class ErroreDatiNonDisponibiliPino extends Error {
  /** Codice stabile (mai mostrato all'utente). */
  readonly code = "DATI_NON_DISPONIBILI";
  /** Codice tecnico PostgREST, quando disponibile: nessun testo del database. */
  readonly codice: string | null;

  constructor(codice: string | null = null) {
    super("I dati richiesti non sono temporaneamente disponibili.");
    this.name = "ErroreDatiNonDisponibiliPino";
    this.codice = codice;
  }
}

function codiceErroreDati(errore: unknown): string | null {
  if (!errore || typeof errore !== "object") return null;
  const codice = (errore as { code?: unknown }).code;
  return typeof codice === "string" && codice.trim() ? codice.trim() : null;
}

/** Callback Pino: converte la segnalazione in eccezione tipizzata. */
export function segnalaErroreDatiPino(errore: unknown): never {
  throw new ErroreDatiNonDisponibiliPino(codiceErroreDati(errore));
}

/** Segnalazione passata solo ai wrapper "searchProducts" e "searchStores". */
export const segnalazioneDatiPino: SegnalazioneErroriDati = {
  onErrore: segnalaErroreDatiPino,
};

/**
 * M6-C3 — Adapter delle farmacie: TIMEOUT resta uno stato timeout per M6-A
 * (non e' un guasto dati), HTTP/rete/risposta non valida diventano
 * DATI_NON_DISPONIBILI.
 */
export function segnalaErroreFarmaciePino(errore: unknown): never {
  const codice = codiceErroreDati(errore);
  if (codice === "TIMEOUT") {
    const timeout = new Error("La fonte delle farmacie non ha risposto in tempo.");
    timeout.name = "TimeoutError";
    throw timeout;
  }
  throw new ErroreDatiNonDisponibiliPino(codice);
}

export const segnalazioneFarmaciePino: SegnalazioneErroriDati = {
  onErrore: segnalaErroreFarmaciePino,
};

// ─── Tipi risultati dei tool ─────────────────────────────────────────────────

export type OffertaAssistente = {
  id: string;
  titolo: string;
  descrizione: string | null;
  prezzo_originale: number | null;
  prezzo_offerta: number | null;
  negozio_nome: string;
  data_fine: string | null;
};

export type EventoAssistente = {
  id: string;
  titolo: string;
  descrizione: string | null;
  luogo: string | null;
  data_inizio: string | null;
  negozio_nome: string;
};

export type MeteoAssistente = {
  citta: "Castrovillari";
  timezone: "Europe/Rome";
  aggiornato: string;
  temperatura: number;
  temperaturaPercepita: number;
  codice: number;
  descrizione: string;
  ventoKmh: number;
  precipitazioneMm: number;
  oggi: { minima: number; massima: number; probabilitaPioggia: number | null };
  domani: { data: string; minima: number; massima: number; probabilitaPioggia: number | null; descrizione: string };
};

export type FarmaciaAssistente = Pick<
  FarmaciaTurno,
  "id" | "nome" | "indirizzo" | "stato" | "apertura" | "turno" | "telefono" | "urlScheda"
>;

export type ToolParams = {
  query?: string;
  maxPrice?: number | null;
  minPrice?: number | null;
  /**
   * Budget VINCOLANTE: i limiti espliciti scartano i prodotti fuori fascia
   * (query Supabase + verifica finale) invece di ordinarli soltanto.
   * Lo imposta solo l'orchestratore dai limiti deterministici, mai il modello.
   */
  prezzoRigido?: boolean;
  limit?: number;
  /** Termini espliciti (da intent AI) — nessuna espansione automatica. */
  termini?: string[];
  /** Filtro categoria (es. "salute e benessere"). */
  categoria?: string;
  /** Filtro sottocategoria. */
  sottocategoria?: string;
  /** Filtro tipo attività / profilo (es. "medico"). */
  tipo?: string;
  /**
   * S4.4: servizio richiesto dell'attività ("taglio", "haircut"). Filtra i
   * risultati sui servizi strutturati attivi e sui tag `negozi.servizi`.
   */
  servizio?: string;
  /** Filtro città. */
  citta?: string;
  /** Stato farmacia per il tool locale: aperte, turno o tutte. */
  stato?: "aperte" | "turno" | "tutte";
  /** Esclusioni semantiche Pino: es. ["alcolica"] per "birra non alcolica". */
  esclusioni?: string[];
  /** S4.3: colori richiesti in forma canonica ("nero", "blu"). */
  colori?: string[];
  /** S4.3: materiali richiesti in forma canonica ("pelle", "legno"). */
  materiali?: string[];
  /** Nomi già mostrati da Pino: usato per "fammi vedere altro" e alternative. */
  escludiNomi?: string[];
  /** Vincolo reale sugli orari: solo attività aperte secondo gli orari registrati. */
  apertiOra?: boolean;
};

export type RisultatoRicercaCompleta = {
  negozi: NegozioRicerca[];
  prodotti: ProdottoRicerca[];
  offerte: OffertaAssistente[];
  eventi: EventoAssistente[];
  categorie: { nome: string; count: number }[];
  meteo: MeteoAssistente | null;
  farmacie: FarmaciaAssistente[];
};

// ─── Helper ──────────────────────────────────────────────────────────────────

function limita(n: number | undefined, fallback: number, max: number): number {
  const valore = Number.isFinite(n) ? Math.floor(Number(n)) : fallback;
  return Math.max(1, Math.min(valore, max));
}

// ─── S1: contratti degli strumenti (validazione, deduplica, classi) ────────
// Questo blocco NON cambia ciò che Pino mostra: valida i parametri ricevuti
// (dal modello o dal piano deterministico), elimina i duplicati e calcola la
// classe di corrispondenza di ogni risultato in una mappa interna (WeakMap).
// Le classi restano interne: non vengono ancora esposte nelle risposte.

/** Strumenti che accettano `ToolParams`. */
export type StrumentoPino =
  | "searchStores"
  | "searchProducts"
  | "searchOffers"
  | "searchEvents"
  | "searchAll"
  | "getCategories"
  | "getWeather"
  | "searchPharmacies"
  | "searchGiftCategories";

/** Classe di corrispondenza calcolata da Pino per un risultato. */
export type ClasseCorrispondenza = "exact" | "synonym" | "semantic" | "weak";

export type EsitoValidazioneParams = {
  params: ToolParams;
  /** Valori non validi scartati: nessun valore inventato, nessuna eccezione. */
  problemi: string[];
};

const LUNGHEZZA_MASSIMA_TESTO = 120;
const MASSIMO_ELEMENTI_LISTA = 5;
const PREZZO_MASSIMO_AMMESSO = 100_000;
const LIMITE_RISULTATI_MASSIMO = 20;

/**
 * S1-A — Contratto dei parametri per strumento.
 *
 * La definizione vive in `function-calling.ts` ed è condivisa con le
 * dichiarazioni native Gemini e con il menu del percorso JSON. Qui resta solo
 * l'import/export per compatibilità dei chiamanti esistenti.
 */

/** Chiavi note di `ToolParams`: tutto il resto è una chiave inventata. */
const CHIAVI_TOOL_PARAMS: ReadonlySet<string> = new Set<string>([
  "query", "maxPrice", "minPrice", "prezzoRigido", "limit", "termini", "categoria",
  "sottocategoria", "tipo", "servizio", "citta", "stato", "esclusioni",
  "colori", "materiali", "escludiNomi", "apertiOra",
]);

/**
 * Chiavi ammesse per lo strumento, oppure `null` se il nome non è nel
 * contratto (in quel caso la validazione resta permissiva, come prima).
 */
function chiaviAmmessePino(strumento: StrumentoPino): ReadonlySet<string> | null {
  const contratto = Object.prototype.hasOwnProperty.call(CONTRATTI_STRUMENTO, strumento)
    ? CONTRATTI_STRUMENTO[strumento]
    : undefined;
  return contratto ? new Set<string>(contratto) : null;
}

function testoParametro(valore: unknown): string | null {
  if (typeof valore !== "string") return null;
  const pulito = valore.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!pulito) return null;
  return pulito.slice(0, LUNGHEZZA_MASSIMA_TESTO);
}

function listaParametro(valore: unknown): string[] | undefined {
  if (!Array.isArray(valore)) return undefined;
  const visti = new Set<string>();
  const lista: string[] = [];
  for (const voce of valore) {
    const testo = testoParametro(voce);
    if (!testo) continue;
    const chiave = testo.toLowerCase();
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    lista.push(testo);
    if (lista.length >= MASSIMO_ELEMENTI_LISTA) break;
  }
  return lista.length > 0 ? lista : undefined;
}

function prezzoParametro(valore: unknown): number | undefined {
  if (valore === null) return undefined;
  const numero = Number(valore);
  // Lo zero è un tetto esplicito valido ("entro 0 euro"): non va scartato.
  if (!Number.isFinite(numero) || numero < 0 || numero > PREZZO_MASSIMO_AMMESSO) return undefined;
  return Math.round(numero * 100) / 100;
}

/**
 * Valida e normalizza i parametri di uno strumento.
 *
 * - conserva solo le chiavi note di `ToolParams` ammesse dallo strumento (le
 *   altre, incluse quelle inventate dal modello, vengono scartate e segnalate
 *   con `chiave_non_ammessa:<campo>`: nessuna di esse era letta dal tool);
 * - stringhe: trim, rimozione caratteri di controllo, limite di lunghezza;
 * - liste: max 5 voci, senza duplicati (case-insensitive), senza voci vuote;
 * - prezzi: numeri finiti >= 0 (lo zero è un tetto esplicito); una fascia incoerente (min > max) viene
 *   scartata per intero e segnalata;
 * - `limit`: intero 1..20, come `limita()` (nessuna modifica rispetto a oggi);
 * - `stato`: solo i valori dell'enum;
 * - `apertiOra`: solo booleani.
 *
 * Non lancia mai: gli strumenti restano tolleranti agli input del modello.
 */
export function validaToolParams(
  strumento: StrumentoPino,
  raw: unknown
): EsitoValidazioneParams {
  const params: ToolParams = {};
  const problemi: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    if (raw !== undefined && raw !== null) problemi.push("parametri_non_oggetto");
    return { params, problemi };
  }
  // S1-A — Contratto al confine: una chiave nota ma non prevista da questo
  // strumento viene scartata e segnalata, esattamente come una chiave
  // inesistente. Le chiavi scartate qui non erano lette da nessun ramo del
  // tool, quindi i risultati restano identici.
  const ammesse = chiaviAmmessePino(strumento);
  const grezza = raw as Record<string, unknown>;
  const sorgente: Record<string, unknown> = {};
  for (const chiave of Object.keys(grezza)) {
    if (!CHIAVI_TOOL_PARAMS.has(chiave) || (ammesse && !ammesse.has(chiave))) {
      problemi.push(`chiave_non_ammessa:${chiave}`);
      continue;
    }
    sorgente[chiave] = grezza[chiave];
  }

  if (sorgente.query !== undefined) {
    const testo = testoParametro(sorgente.query);
    if (testo) params.query = testo;
    else problemi.push("query_non_valida");
  }
  if (sorgente.categoria !== undefined) {
    const testo = testoParametro(sorgente.categoria);
    if (testo) params.categoria = testo;
    else problemi.push("categoria_non_valida");
  }
  if (sorgente.sottocategoria !== undefined) {
    const testo = testoParametro(sorgente.sottocategoria);
    if (testo) params.sottocategoria = testo;
    else problemi.push("sottocategoria_non_valida");
  }
  if (sorgente.tipo !== undefined) {
    const testo = testoParametro(sorgente.tipo);
    if (testo) params.tipo = testo;
    else problemi.push("tipo_non_valido");
  }
  if (sorgente.citta !== undefined) {
    const testo = testoParametro(sorgente.citta);
    if (testo) params.citta = testo;
    else problemi.push("citta_non_valida");
  }
  if (sorgente.servizio !== undefined) {
    const testo = testoParametro(sorgente.servizio);
    if (testo) params.servizio = testo;
    else problemi.push("servizio_non_valido");
  }

  for (const campo of ["termini", "esclusioni", "escludiNomi", "colori", "materiali"] as const) {
    if (sorgente[campo] === undefined) continue;
    const lista = listaParametro(sorgente[campo]);
    if (lista) params[campo] = lista;
    else problemi.push(`lista_non_valida:${campo}`);
  }

  // S6.1/P1: le esclusioni che sono colori o materiali arrivano nella forma
  // canonica del vocabolario ("nere" → "nero", "leather" → "pelle"). Così il
  // filtro dei prodotti esclude davvero ciò che l'utente ha negato; le altre
  // esclusioni ("glutine", "alcolica") restano invariate.
  if (params.esclusioni?.length) {
    params.esclusioni = listaParametro(
      params.esclusioni.map((voce) => attributoCanonicoPino(voce) ?? voce)
    );
  }

  if (sorgente.limit !== undefined) {
    const numero = Number(sorgente.limit);
    if (Number.isFinite(numero)) {
      params.limit = Math.max(1, Math.min(Math.floor(numero), LIMITE_RISULTATI_MASSIMO));
    } else {
      problemi.push("limit_non_valido");
    }
  }

  const minPrice = prezzoParametro(sorgente.minPrice);
  const maxPrice = prezzoParametro(sorgente.maxPrice);
  if (minPrice !== undefined) params.minPrice = minPrice;
  else if (sorgente.minPrice !== undefined && sorgente.minPrice !== null) {
    problemi.push("minPrice_non_valido");
  }
  if (maxPrice !== undefined) params.maxPrice = maxPrice;
  else if (sorgente.maxPrice !== undefined && sorgente.maxPrice !== null) {
    problemi.push("maxPrice_non_valido");
  }
  // Fascia invertita: si normalizza l'ordine. Cancellare entrambi i limiti
  // significava perdere in silenzio il vincolo economico dell'utente.
  if (
    params.minPrice != null &&
    params.maxPrice != null &&
    params.minPrice > params.maxPrice
  ) {
    const minimo = params.maxPrice;
    params.maxPrice = params.minPrice;
    params.minPrice = minimo;
    problemi.push("fascia_prezzo_normalizzata");
  }
  if (sorgente.prezzoRigido !== undefined) {
    if (typeof sorgente.prezzoRigido === "boolean") params.prezzoRigido = sorgente.prezzoRigido;
    else problemi.push("prezzoRigido_non_valido");
  }

  if (sorgente.stato !== undefined) {
    const stato = sorgente.stato;
    if (stato === "aperte" || stato === "turno" || stato === "tutte") params.stato = stato;
    else problemi.push("stato_non_valido");
  }
  if (sorgente.apertiOra !== undefined) {
    if (typeof sorgente.apertiOra === "boolean") params.apertiOra = sorgente.apertiOra;
    else problemi.push("apertiOra_non_valido");
  }

  return { params, problemi };
}

/** Elimina i duplicati per `id`, conservando il primo (ordine di ranking). */
export function deduplicaPerId<T extends { id?: unknown }>(elementi: T[]): T[] {
  const visti = new Set<string>();
  const unici: T[] = [];
  for (const elemento of elementi ?? []) {
    const id = String(elemento?.id ?? "").trim();
    if (id) {
      if (visti.has(id)) continue;
      visti.add(id);
    }
    unici.push(elemento);
  }
  return unici;
}

/** Classi calcolate nella stessa esecuzione: canale interno, non serializzato. */
const classiRisultati = new WeakMap<object, ClasseCorrispondenza>();

/** Classe calcolata per un risultato (per i test e per i livelli successivi). */
export function classeCorrispondenza(
  risultato: object | null | undefined
): ClasseCorrispondenza | null {
  if (!risultato || typeof risultato !== "object") return null;
  return classiRisultati.get(risultato) ?? null;
}

function registraClasse(risultato: object, classe: ClasseCorrispondenza | null): void {
  if (classe) classiRisultati.set(risultato, classe);
}

/** Motivi della classificazione: canale interno, non serializzato. */
const motiviRisultati = new WeakMap<object, string[]>();

function registraMotivi(risultato: object | null | undefined, motivi: string[]): void {
  if (!risultato || typeof risultato !== "object" || motivi.length === 0) return;
  motiviRisultati.set(risultato, [...motivi]);
}

/**
 * Motivi con cui un risultato è stato classificato (es. `soggetto_nel_nome`,
 * `famiglia_lessicale`, `refuso`, `nessuna_corrispondenza`). Servono a capire
 * perché un prodotto è stato ammesso o scartato, senza testo utente.
 */
export function motiviCorrispondenza(risultato: object | null | undefined): string[] {
  if (!risultato || typeof risultato !== "object") return [];
  return motiviRisultati.get(risultato) ?? [];
}

/**
 * Classe di corrispondenza di un prodotto rispetto al soggetto della richiesta.
 *
 * - `exact`: il soggetto compare nel nome del prodotto;
 * - `synonym`: equivalenza reale (categoria, famiglia lessicale, varianti);
 * - `semantic`: identificato da parola chiave/descrizione o ponte concettuale;
 * - `weak`: trovato solo dal recupero refusi sulla testa del nome.
 * Le descrizioni generiche non bastano: la verifica resta quella di D1.
 */
export function classificaProdottoPino(
  prodotto: ProdottoRicerca,
  soggetto: string | undefined
): ClasseCorrispondenza | null {
  const principale = soggettoPrincipalePino(soggetto ?? "");
  if (!principale || SOGGETTI_GENERICI_PINO.has(principale)) return null;

  const nome = normalizza(prodotto?.nome ?? "");
  const categoria = normalizza(prodotto?.categoria ?? "");
  const gruppo = SINONIMI_DIRETTI_PRODOTTO.find((voci) => voci.includes(principale)) ?? [];
  const forme = Array.from(new Set([principale, ...gruppo.map((voce) => normalizza(voce))]));

  if (forme.some((forma) => forma && nome.includes(forma))) {
    registraMotivi(prodotto, ["sinonimo_nel_nome"]);
    return "exact";
  }
  if (forme.some((forma) => forma && categoria.includes(forma))) {
    registraMotivi(prodotto, ["sinonimo_nella_categoria"]);
    return "synonym";
  }
  // Unico punto di verifica per il resto della catena: nome → categoria →
  // parola chiave/descrizione confermata → famiglia lessicale → ponte → refuso.
  // I gate non sono più funzioni parallele che possono contraddirsi, e il
  // motivo della classificazione resta disponibile (log/Shadow).
  const esito = spiegaPertinenzaProdotto(
    prodotto,
    principale,
    CONCETTI_SOGGETTO_PINO[principale] ?? []
  );
  registraMotivi(prodotto, esito.motivi);
  return esito.classe as ClasseCorrispondenza | null;
}

/**
 * Classe di corrispondenza di un negozio/attività rispetto alla richiesta.
 * Il nome è la prova più forte; la categoria un'equivalenza; la descrizione un
 * segnale semantico; il resto è solo recall (weak).
 */
export function classificaNegozioPino(
  negozio: NegozioRicerca,
  query: string | undefined
): ClasseCorrispondenza | null {
  const principale = soggettoPrincipalePino(query ?? "");
  if (!principale || SOGGETTI_GENERICI_PINO.has(principale)) return null;
  const nome = normalizza(negozio?.nome ?? "");
  if (nome.includes(principale)) return "exact";
  const categoria = normalizza(negozio?.categoria ?? "");
  if (categoria.includes(principale)) return "synonym";
  const descrizione = normalizza(negozio?.descrizione ?? "");
  if (descrizione.includes(principale)) return "semantic";
  return "weak";
}

function assegnaClassiProdotti(prodotti: ProdottoRicerca[], soggetto: string): void {
  for (const prodotto of prodotti) {
    registraClasse(prodotto, classificaProdottoPino(prodotto, soggetto));
  }
}

function assegnaClassiNegozi(negozi: NegozioRicerca[], query: string): void {
  for (const negozio of negozi) {
    registraClasse(negozio, classificaNegozioPino(negozio, query));
  }
}

function tronca(testo: string | null | undefined, max: number): string {
  const t = (testo ?? "").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function testoIncluso(testo: string | null | undefined, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (testo ?? "").toLowerCase().includes(q);
}

function campoContieneEsclusione(campo: string, esclusioni: string[]): boolean {
  const testo = normalizza(campo);
  const token = testo.split(/[^a-z0-9]+/).filter(Boolean);
  for (const esclusione of esclusioni) {
    const e = normalizza(esclusione).trim();
    if (!e) continue;
    const et = e.split(/[^a-z0-9]+/).filter(Boolean);
    if (et.length === 0) continue;
    for (let i = 0; i <= token.length - et.length; i++) {
      if (!et.every((v, j) => token[i + j] === v)) continue;
      const precedente = token[i - 1] ?? "";
      // "birra non alcolica" non deve essere scartata solo perché la descrizione
      // ripete "non alcolica": l'esclusione vale quando il prodotto contiene
      // davvero la caratteristica esclusa.
      if (precedente === "non" || precedente === "senza") continue;
      return true;
    }
  }
  return false;
}

function recordEscluso(campi: unknown[], esclusioni: string[] | undefined): boolean {
  if (!esclusioni?.length) return false;
  return campi.some((campo) => campoContieneEsclusione(String(campo ?? ""), esclusioni));
}

function prodottoSoddisfaEsclusioni(
  prodotto: ProdottoRicerca,
  esclusioni: string[] | undefined
): boolean {
  if (!esclusioni?.length) return true;
  // S6.1/P1: anche il colore e il materiale strutturati (S5.3) fanno parte del
  // testo dell'esclusione. Un prodotto che dichiara `colore: "nero"` deve essere
  // escluso da "scarpe non nere" come uno che lo scrive nella descrizione.
  const testo = normalizza(testoAttributiProdotto(prodotto));
  for (const esclusione of esclusioni) {
    const e = normalizza(esclusione);
    if (!e) continue;
    if (e === "alcolica" || e === "alcolico" || e === "alcol") {
      const analcolica =
        /\banalcolic[oa]\b/.test(testo) ||
        /\bsenza alcol\b/.test(testo) ||
        /\bzero alcol\b/.test(testo) ||
        /\b0[.,]?0(?:%| gradi)?\b/.test(testo) ||
        /\b0% alcol\b/.test(testo);
      if (!analcolica) return false;
      continue;
    }
    if (campoContieneEsclusione(testo, [e])) return false;
  }
  return true;
}


function descrizioneMeteo(codice: number): string {
  const map: Record<number, string> = {
    0: "Sereno",
    1: "Prevalentemente sereno",
    2: "Parzialmente nuvoloso",
    3: "Coperto",
    45: "Nebbia",
    48: "Nebbia",
    51: "Pioggerella",
    53: "Pioggerella",
    55: "Pioggerella intensa",
    61: "Pioggia",
    63: "Pioggia",
    65: "Pioggia intensa",
    71: "Neve",
    73: "Neve",
    75: "Neve intensa",
    80: "Rovesci",
    81: "Rovesci",
    82: "Rovesci intensi",
    95: "Temporale",
    96: "Temporale con grandine",
    99: "Temporale con grandine",
  };
  return map[codice] ?? "Condizioni variabili";
}

export async function getWeatherCastrovillari(): Promise<MeteoAssistente | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast" +
      "?latitude=39.817&longitude=16.202" +
      "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&forecast_days=2&timezone=Europe%2FRome";
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const d = (await response.json()) as {
      current?: {
        time?: string;
        temperature_2m?: number;
        apparent_temperature?: number;
        weather_code?: number;
        wind_speed_10m?: number;
        precipitation?: number;
      };
      daily?: {
        time?: string[];
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: Array<number | null>;
      };
    };
    const cur = d.current;
    const daily = d.daily;
    if (
      !cur?.time ||
      typeof cur.temperature_2m !== "number" ||
      typeof cur.apparent_temperature !== "number" ||
      typeof cur.weather_code !== "number" ||
      !daily?.time?.[0] ||
      !daily.time[1] ||
      !Array.isArray(daily.temperature_2m_min) ||
      !Array.isArray(daily.temperature_2m_max)
    ) return null;

    const min0 = daily.temperature_2m_min[0];
    const max0 = daily.temperature_2m_max[0];
    const min1 = daily.temperature_2m_min[1];
    const max1 = daily.temperature_2m_max[1];
    if (![min0, max0, min1, max1].every((n) => typeof n === "number")) return null;

    const wind = typeof cur.wind_speed_10m === "number" ? cur.wind_speed_10m : 0;
    const precipitation = typeof cur.precipitation === "number" ? cur.precipitation : 0;
    const code1 = typeof daily.weather_code?.[1] === "number" ? daily.weather_code[1] : 0;

    return {
      citta: "Castrovillari",
      timezone: "Europe/Rome",
      aggiornato: cur.time,
      temperatura: Math.round(cur.temperature_2m),
      temperaturaPercepita: Math.round(cur.apparent_temperature),
      codice: cur.weather_code,
      descrizione: descrizioneMeteo(cur.weather_code),
      ventoKmh: Math.round(wind),
      precipitazioneMm: Number(precipitation.toFixed(1)),
      oggi: {
        minima: Math.round(min0),
        massima: Math.round(max0),
        probabilitaPioggia:
          typeof daily.precipitation_probability_max?.[0] === "number"
            ? daily.precipitation_probability_max[0]
            : null,
      },
      domani: {
        data: daily.time[1],
        minima: Math.round(min1),
        massima: Math.round(max1),
        probabilitaPioggia:
          typeof daily.precipitation_probability_max?.[1] === "number"
            ? daily.precipitation_probability_max[1]
            : null,
        descrizione: descrizioneMeteo(code1),
      },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchPharmacies(
  stato: "aperte" | "turno" | "tutte",
  limit = 8,
  segnalazione: SegnalazioneErroriDati = segnalazioneFarmaciePino
): Promise<FarmaciaAssistente[]> {
  const farmacie = await getFarmacieTurnoCastrovillari(segnalazione);
  const filtrate =
    stato === "turno"
      ? farmacie.filter(inTurnoFarmacia)
      : stato === "aperte"
        ? (() => {
            const aperte = farmacie.filter((f) => f.stato === "aperta");
            if (aperte.length > 0) return aperte;
            // La fonte può dichiarare il turno senza uno stato "aperta": una
            // farmacia di turno è comunque a disposizione. La risposta la
            // etichetta come DI TURNO, mai come "aperta".
            const diTurno = farmacie.filter(inTurnoFarmacia);
            if (diTurno.length > 0) return diTurno;
            // Nessuno stato verificabile: avvertenza esplicita, non "aperte".
            return farmacie.filter((f) => f.stato === null).slice(0, 3);
          })()
        : farmacie;

  return filtrate.slice(0, limita(limit, 8, 8)).map((f) => ({
    id: f.id,
    nome: f.nome,
    indirizzo: f.indirizzo,
    stato: f.stato,
    apertura: f.apertura,
    turno: f.turno,
    telefono: f.telefono,
    urlScheda: f.urlScheda,
  }));
}

// ─── searchStores ────────────────────────────────────────────────────────────

// Gate di pertinenza dei NEGOZI (solo assistente).
// `cercaNegozi` è condivisa con la ricerca pubblica e allarga volutamente il
// recall (sinonimi di categoria/commercio, profili attività, fallback
// tollerante). Per il catalogo è corretto; per Pino no: una richiesta senza
// significato finiva per restituire negozi senza alcun rapporto con essa (es.
// "prodotto inesistente" → 5 negozi, perché "prodotto" attiva il profilo
// ecommerce e "prodotti" compare nelle parole chiave "prodotti tipici").
// Regole, applicate SOLO nel tool dell'assistente (nessuna modifica a
// /api/search, alla ricerca pubblica o al catalogo):
//   1) tutti i termini ORIGINALI della richiesta devono comparire nei campi
//      identitari del negozio (nome, descrizione, categoria, sottocategoria,
//      tipo attività, servizi, parole chiave);
//   2) un concetto d'INTENTO riconosciuto ("ho sete" → bar/caffetteria) può
//      comparire negli stessi campi: sono termini realmente cercabili;
//   3) un sinonimo ESPANSO vale solo nei campi di CLASSIFICAZIONE (categoria,
//      tipo attività): così "pizzeria" trova il panificio per categoria, ma
//      "prodotto" non trova più chi ha "prodotti tipici" tra le parole chiave.
// I termini originali sono ammessi anche con un refuso ragionevole (stessa
// soglia del fallback tollerante della ricerca): "panifcio" continua a trovare
// il Panificio, mentre "inesistente" non trova nulla.
// Un filtro esplicito categoria/tipo chiesto dal chiamante è già di per sé una
// prova di pertinenza e non viene mai scartato.
function testoNegozio(n: Record<string, unknown>): string {
  const data = (n.data ?? {}) as Record<string, unknown>;
  const lista = (v: unknown) =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string").join(" ") : "";
  return normalizza(
    [
      n.nome,
      n.descrizione,
      n.categoria,
      n.sottocategoria,
      data.tipo_attivita,
      lista(n.servizi),
      lista(n.parole_chiave),
    ]
      .filter(Boolean)
      .map(String)
      .join(" ")
  );
}

function classificazioneNegozio(n: Record<string, unknown>): string {
  const data = (n.data ?? {}) as Record<string, unknown>;
  return normalizza(
    [n.categoria, data.tipo_attivita]
      .filter(Boolean)
      .map(String)
      .join(" ")
  );
}

/**
 * Quando la richiesta nomina una professione ("dentista", "parrucchiere"),
 * l'attività deve dichiarare quella professione nell'identità. La categoria
 * generica «Salute e benessere» non basta: un otorino non è un dentista.
 * Il confronto usa la radice della parola ("parrucchier-" copre
 * parrucchiere/parrucchieri) e resta volutamente conservativo.
 */
export function negozioProfessioneCompatibilePino(
  negozio: Record<string, unknown>,
  professione: string
): boolean {
  const chiavi = normalizza(professione)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
  if (chiavi.length === 0) return true;
  const data = (negozio.data ?? {}) as Record<string, unknown>;
  const servizi = Array.isArray(data.servizi)
    ? data.servizi.filter((voce) => typeof voce === "string").join(" ")
    : "";
  const identita = normalizza(
    [
      negozio.nome,
      negozio.categoria,
      negozio.sottocategoria,
      data.tipo_attivita,
      servizi,
    ]
      .filter(Boolean)
      .map(String)
      .join(" ")
  );
  return chiavi.some((chiave) => {
    if (
      (chiave === "medico" || chiave === "dottore") &&
      /\b(?:dott|doctor|medic|salute|ambulator|otorino|dentist)/.test(identita)
    ) {
      return true;
    }
    const radice = chiave.replace(/(?:a|e|i|o)$/, "");
    return radice.length >= 4 && identita.includes(radice);
  });
}

/**
 * Quando la richiesta nomina un'ATTIVITÀ specifica ("pizzeria", "panificio",
 * "bar"), la vetrina deve essere davvero di quel tipo. Il solo match nella
 * descrizione non basta: un panificio che vende pizza non è una pizzeria.
 * L'identità è letta da nome/categoria/tipo, mai dalla descrizione.
 * Restituisce true per le query che non nominano un'attività.
 */
export function negozioAttivitaCompatibilePino(
  negozio: Record<string, unknown>,
  query: string
): boolean {
  const attivita = ATTIVITA_CATALOGO_PINO.find((voce) =>
    voce.pattern.test(normalizza(query))
  );
  if (!attivita) return true;
  const data = (negozio.data ?? {}) as Record<string, unknown>;
  const identita = normalizza(
    [negozio.nome, negozio.categoria, negozio.sottocategoria, data.tipo_attivita]
      .filter(Boolean)
      .map(String)
      .join(" ")
  );
  // `patternIdentita` include gli equivalenti reali (panetteria ↔ panificio):
  // senza, una richiesta «panetteria» restituiva zero su un catalogo che
  // pubblica «Panificio Zini». Il recall resta invece sul termine originale.
  return attivita.patternIdentita.test(identita);
}

/**
 * Recall dedicato ai nomi di attività: la RPC semantica può perdere un nome
 * corto come "bar" (lo confonde con "Barone") o restituire solo omonimi
 * parziali. Questa query diretta recupera le vetrine che hanno davvero il
 * termine nel nome/categoria; il gate di identità scarta comunque i falsi
 * positivi. È un fallback di Pino, non una modifica alla ricerca pubblica.
 */
async function righeNegoziPerAttivitaPino(
  termine: string
): Promise<Record<string, unknown>[]> {
  try {
    const db = createAdminSupabaseClient();
    const { data } = await db
      .from("negozi")
      .select("*")
      .eq("attivo", true)
      .is("deleted_at", null)
      .limit(100);
    return ((data ?? []) as Record<string, unknown>[]).filter((n) =>
      negozioAttivitaCompatibilePino(n, termine)
    );
  } catch {
    return [];
  }
}

/**
 * Conteggio reale delle vetrine di un'attività («quanti panifici ci sono?»).
 * Usa lo stesso gate di identità della ricerca: un negozio che vende pane non
 * è un panificio. «negozio» conta l'intero catalogo attivo.
 */
export async function contaAttivitaCatalogoPino(
  termine: string
): Promise<{ totale: number; nomi: string[] }> {
  try {
    const db = createAdminSupabaseClient();
    const { data } = await db
      .from("negozi")
      .select("*")
      .eq("attivo", true)
      .is("deleted_at", null)
      .limit(300);
    const righe = (data ?? []) as Record<string, unknown>[];
    const filtrate =
      termine === "negozio"
        ? righe
        : righe.filter((n) => negozioAttivitaCompatibilePino(n, termine));
    return {
      totale: filtrate.length,
      nomi: filtrate.map((n) => String(n.nome ?? "")).filter(Boolean),
    };
  } catch {
    return { totale: 0, nomi: [] };
  }
}

/**
 * Categorie realmente pubblicate, con il numero di vetrine attive.
 *
 * Serve al messaggio di vuoto: «Prova con un'altra categoria» è inutile se
 * l'utente non sa quali categorie esistono. Una sola query, e solo quando la
 * risposta sarebbe comunque vuota.
 */
export async function riepilogoCategorieCatalogoPino(): Promise<
  Array<{ categoria: string; negozi: number }>
> {
  try {
    const db = createAdminSupabaseClient();
    const { data } = await db
      .from("negozi")
      .select("categoria")
      .eq("attivo", true)
      .is("deleted_at", null)
      .limit(300);
    const conteggi = new Map<string, number>();
    for (const riga of (data ?? []) as Array<{ categoria?: string | null }>) {
      const categoria = String(riga.categoria ?? "").trim();
      if (!categoria) continue;
      conteggi.set(categoria, (conteggi.get(categoria) ?? 0) + 1);
    }
    return [...conteggi.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([categoria, negozi]) => ({ categoria, negozi }));
  } catch {
    return [];
  }
}

// Somiglianza con i termini richiesti: sottostringa oppure un token vicino per
// edit-distance (refuso/plurale). Soglia più alta sui termini corti, come nel
// fallback tollerante esistente.
function terminePresente(termine: string, testo: string, token: string[]): boolean {
  // Termini CORTI (< 4): devono essere parole INTERE. Con il solo
  // `includes`, "bar" matcherebbe "Barone" (e "barattolo" lato prodotti):
  // un negozio di gioielli non è un bar.
  if (termine.length < 4) return token.includes(termine);
  if (testo.includes(termine)) return true;
  const soglia = termine.length <= 6 ? 0.85 : 0.8;
  return token.some(
    (tok) => tok.length >= 4 && similaritaLevenshtein(tok, termine) >= soglia
  );
}

function negozioPertinente(
  n: Record<string, unknown>,
  termini: string[],
  concetti: string[],
  espansi: string[]
): boolean {
  const testo = testoNegozio(n);
  if (!testo) return false;
  // Nessun termine sostanziale nella richiesta → nessun vincolo da applicare.
  if (termini.length === 0) return true;
  // 1) Tutti i termini originali presenti (il match parziale non basta).
  const token = estraiToken(testo);
  if (termini.every((t) => terminePresente(t, testo, token))) return true;
  // Query di categorie specifiche come "pizzeria" non devono ereditare
  // l'intero gruppo ristorazione: altrimenti il sinonimo "panificio" può far
  // passare forni e panifici come risultati di una ricerca di pizzerie.
  // Il match diretto sopra resta valido; in questi casi non allarghiamo oltre.
  const categoriaSpecificata = termini.some((t) =>
    /\b(?:pizzer(?:ia|ie)|panific(?:io|i)|forn(?:o|i))\b/i.test(t)
  );
  if (categoriaSpecificata) return false;

  // 2) Concetto d'intento riconosciuto.
  if (concetti.some((c) => c.length >= 3 && testo.includes(c))) return true;
  // 3) Sinonimo espanso, solo su un campo di classificazione.
  const classificazione = classificazioneNegozio(n);
  return espansi.some((e) => e.length >= 4 && classificazione.includes(e));
}


// ─── S4.4: servizi delle attività ────────────────────────────────────────────

/** Servizio strutturato attivo, con prezzo/durata solo se realmente presenti. */
export type ServizioAttivoPino = {
  nome: string;
  prezzo: number | null;
  durataMin: number | null;
};

// Parole che non identificano un servizio: senza questo filtro "servizio di
// taglio" e "taglio" non sarebbero equivalenti.
const PAROLE_SERVIZIO_GENERICHE = new Set([
  "servizio", "servizi", "service", "services", "offerta", "offerto", "offerta",
  "disponibile", "professionale", "professional", "the", "and", "per", "con", "di",
  "da", "in", "su", "for", "with", "of",
]);

// Equivalenze curate di Pino per i servizi: poche voci, bidirezionali, solo per
// le formulazioni italiane e inglesi più diffuse. Non è un dizionario esaustivo
// e non sostituisce i sinonimi condivisi del catalogo.
const SINONIMI_SERVIZI_PINO: Record<string, string[]> = {
  taglio: ["tagli", "haircut", "haircutting", "cut", "trim"],
  haircut: ["taglio", "tagli", "cut", "trim"],
  capelli: ["hair"],
  hair: ["capelli"],
  barba: ["beard", "shave", "rasatura"],
  beard: ["barba", "rasatura"],
  rasatura: ["shave", "barba", "beard"],
  shave: ["rasatura", "barba"],
  colore: ["color", "tinta", "dye"],
  color: ["colore", "tinta", "dye"],
  manicure: ["unghie", "nails"],
  unghie: ["manicure", "nails"],
  massaggio: ["massage"],
  massage: ["massaggio"],
  pulizia: ["cleaning", "clean"],
  cleaning: ["pulizia"],
  riparazione: ["repair", "riparazioni"],
  repair: ["riparazione", "riparazioni"],
  installazione: ["installation", "install"],
  installation: ["installazione", "install"],
  visita: ["visit", "checkup"],
  visit: ["visita", "visite"],
  consulenza: ["consultation", "consulting"],
  consultation: ["consulenza"],
};

/** Richiesta di servizio riconosciuta: servizio canonico e attività cercata. */
export type RichiestaServizioPino = { servizio: string; attivita: string | null };

// Servizi riconoscibili nella richiesta dell'utente (non quelli del catalogo).
// "colore" è volutamente escluso: è anche un attributo di prodotto ("maglione di
// colore rosso"). Restano "tinta" e "dye" per la colorazione dei capelli.
const SERVIZI_RICONOSCIBILI_PINO: Array<{ servizio: string; termini: string[] }> = [
  // "trim"/"trimmed" restano fuori: "beard trimmed" è barba, non taglio.
  { servizio: "taglio", termini: ["taglio", "tagli", "haircut", "haircutting", "hair cut", "cut", "tagliare", "tagliarmi"] },
  { servizio: "piega", termini: ["piega", "messa in piega", "blowout", "blow dry", "styling"] },
  { servizio: "barba", termini: ["barba", "rasatura", "shave", "beard"] },
  { servizio: "tinta", termini: ["tinta", "tintura", "dye", "dyed", "tinteggiatura", "hair color", "hair colour"] },
  { servizio: "manicure", termini: ["manicure", "unghie", "nails"] },
  { servizio: "massaggio", termini: ["massaggio", "massaggi", "massage"] },
  { servizio: "pulizia", termini: ["pulizia", "cleaning"] },
  { servizio: "riparazione", termini: ["riparazione", "riparazioni", "repair"] },
  { servizio: "installazione", termini: ["installazione", "install"] },
  { servizio: "visita", termini: ["visita", "visite", "visit", "checkup"] },
  { servizio: "consulenza", termini: ["consulenza", "consultation", "consulting"] },
];

// Attività commerciali che offrono servizi: funzione di ancoraggio, non di filtro.
const ATTIVITA_SERVIZIO_PINO: Array<{ attivita: string; termini: string[] }> = [
  { attivita: "parrucchiere", termini: ["parrucchiere", "parrucchieri", "parrucchiera", "hairdresser", "hairdressers", "hair salon"] },
  { attivita: "barbiere", termini: ["barbiere", "barbieri", "barber", "barbers", "barber shop", "barbershop"] },
  { attivita: "centro estetico", termini: ["centro estetico", "centri estetici", "estetista", "estetiste", "beauty salon", "beauty center"] },
  { attivita: "idraulico", termini: ["idraulico", "idraulici", "plumber", "plumbers"] },
  { attivita: "elettricista", termini: ["elettricista", "elettricisti", "electrician", "electricians"] },
  { attivita: "medico", termini: ["medico", "medici", "dottore", "dottori", "doctor", "doctors"] },
  { attivita: "dentista", termini: ["dentista", "dentisti", "dentist", "dentists"] },
  { attivita: "officina", termini: ["officina", "officine", "mechanic", "garage"] },
  { attivita: "lavanderia", termini: ["lavanderia", "lavanderie", "laundry"] },
  { attivita: "sartoria", termini: ["sartoria", "sartorie", "tailor"] },
];

// Costruzioni che rendono esplicita la richiesta di un servizio.
const INDIZI_RICHIESTA_SERVIZIO = [
  /\bche\s+(?:mi\s+)?(?:faccia|fa|fanno|offra|offre|offrono|esegua|esegue)\b/,
  /\b(?:dove|a\s+chi)\s+posso\b/,
  /\bho\s+bisogno\s+di\b/,
  /\bserve(?:nt)?\b|\bservizio\b|\bservizi\b/,
  /\b(?:cerco|vorrei|voglio)\b.*\b(?:un|una|uno)\b/,
  /\bcerco\s+qualcuno\b|\bqualcuno\b/,
  /\bi\s+(?:need|want)\b/,
  /\bwhere\s+can\s+i\b|\blooking\s+for\b|\bwho\s+does\b/,
];

// Formulazioni INDIRETTE: non nominano il servizio, descrivono la prestazione
// personale ("sistemarmi i capelli", "someone to do my hair"). Restituiscono
// il dominio concreto su cui il catalogo può verificare i servizi dichiarati:
// "capelli" per l'hair care, "barba" per beard/shave. Non inventano un taglio
// quando il testo non lo dice.
const SERVIZI_INDIRETTI_PINO: Array<{ servizio: string; pattern: RegExp }> = [
  {
    servizio: "capelli",
    pattern:
      /\b(?:qualcuno|qualcuna|someone|anyone|parrucchier[ei]|barbier[ei]|estetista)\b[^.!?]{0,32}\b(?:capelli|hair)\b/,
  },
  {
    servizio: "capelli",
    pattern:
      /\b(?:sistem(?:are|armi|o|arsi|i|ino|a)|acconci(?:are|armi)|prendersi\s+cura)\b[^.!?]{0,24}\b(?:capelli|hair)\b/,
  },
  {
    servizio: "capelli",
    pattern:
      /\b(?:do|doing|done|style|styled|styling|fix|cut|trim)\s+my\s+hair\b|\bmy\s+hair\s+(?:done|cut|styled|trimmed)\b/,
  },
  {
    servizio: "barba",
    pattern:
      /\b(?:sistem(?:are|armi|o|arsi|i|ino|a)|trim|trimmed|shave|shaving)\b[^.!?]{0,24}\b(?:barba|beard)\b/,
  },
  {
    servizio: "barba",
    pattern: /\b(?:barba|beard)\b[^.!?]{0,20}\b(?:trimmed|trim|shave|shaved|shaving)\b/,
  },
];

// Parole che indicano un PRODOTTO: in loro presenza la richiesta resta di
// catalogo e non diventa un servizio, salvo una costruzione personale forte
// (vedi SERVIZI_INDIRETTI_PINO).
const CONTESTO_PRODOTTO_PINO =
  /\b(?:prodotto|prodotti|shampoo|balsamo|spazzola|spazzole|pettine|forbici|lametta|lamette|rasoio|rasoi|crema|creme|gel|lacca|siero|sieri|olio|oli|cera|kit|attrezzo|attrezzi|phon|asciugacapelli|piastra|piastre|macchina|macchine)\b/;

function contieneTermineServizio(testo: string, termine: string): boolean {
  const pulito = termine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${pulito}([^a-z0-9]|$)`).test(testo);
}

/**
 * Riconosce una richiesta di SERVIZIO (non di prodotto né di negozio generico).
 *
 * Serve un termine di servizio esplicito E un ancoraggio: un'attività che lo
 * offre ("parrucchiere") o una costruzione di richiesta ("che faccia",
 * "dove posso", "I need"). Così "un maglione di colore rosso" non diventa
 * una ricerca di servizi. Non inventa nulla: restituisce solo termini presenti
 * nel testo, nell'ordine in cui compaiono.
 */
export function rilevaRichiestaServizioPino(input: string): RichiestaServizioPino | null {
  const q = normalizza(String(input ?? ""));
  if (!q.trim()) return null;

  // Servizio nominato esplicitamente ("taglio", "haircut", "beard").
  const diretti = SERVIZI_RICONOSCIBILI_PINO.filter((gruppo) =>
    gruppo.termini.some((termine) => contieneTermineServizio(q, termine))
  ).map((gruppo) => gruppo.servizio);
  // Prestazione descritta in modo indiretto ("sistemarmi i capelli").
  const indiretti = SERVIZI_INDIRETTI_PINO.filter((gruppo) => gruppo.pattern.test(q)).map(
    (gruppo) => gruppo.servizio
  );

  // I termini espliciti hanno la precedenza: "taglio capelli" resta "taglio",
  // non "taglio capelli", e le equivalenze già verificate da S4.5 non cambiano.
  const servizi = diretti.length > 0 ? diretti : indiretti;
  if (servizi.length === 0) return null;

  const attivita =
    ATTIVITA_SERVIZIO_PINO.find((gruppo) =>
      gruppo.termini.some((termine) => contieneTermineServizio(q, termine))
    )?.attivita ?? null;

  // "Cerco un prodotto per la barba", "shampoo", "spazzola": restano ricerche
  // di prodotti. Solo una costruzione personale forte può ancora indicare un
  // servizio in presenza di un prodotto nominato.
  if (CONTESTO_PRODOTTO_PINO.test(q) && indiretti.length === 0) return null;

  const indizio = INDIZI_RICHIESTA_SERVIZIO.some((regex) => regex.test(q));
  if (!attivita && !indizio && indiretti.length === 0) return null;

  return {
    servizio: Array.from(new Set(servizi)).slice(0, 2).join(" "),
    attivita,
  };
}

function testoNormalizzatoServizio(valore: unknown): string {
  return typeof valore === "string" ? normalizza(valore).trim() : "";
}

function tokenServizioPino(testo: string): string[] {
  return Array.from(
    new Set(
      normalizza(testo)
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3 && !PAROLE_SERVIZIO_GENERICHE.has(token))
    )
  );
}

/**
 * Servizi strutturati ATTIVI dell'attività: legge `negozi.data.servizi_strutturati`
 * come restituito dalla RPC. Un servizio con `attivo: false` non è disponibile;
 * prezzo e durata restano `null` quando il dato manca (mai inventati).
 */
function servizioAttivoDaVoce(voce: Record<string, unknown>): ServizioAttivoPino | null {
  if (voce.attivo === false) return null;
  const nome = typeof voce.nome === "string" ? voce.nome.trim() : "";
  if (!nome) return null;
  const prezzo = Number(voce.prezzo);
  const durata = Number(voce.durata_min);
  return {
    nome,
    prezzo: Number.isFinite(prezzo) && prezzo > 0 ? prezzo : null,
    durataMin: Number.isFinite(durata) && durata > 0 ? Math.round(durata) : null,
  };
}

function vociServiziStrutturatiPino(
  record: Record<string, unknown> | null | undefined
): Record<string, unknown>[] {
  const data = record?.data as Record<string, unknown> | null | undefined;
  const grezzi = Array.isArray(data?.servizi_strutturati) ? data.servizi_strutturati : [];
  return grezzi.filter(
    (grezzo): grezzo is Record<string, unknown> =>
      Boolean(grezzo) && typeof grezzo === "object" && !Array.isArray(grezzo)
  );
}

export function serviziAttiviPino(
  record: Record<string, unknown> | null | undefined
): ServizioAttivoPino[] {
  const servizi: ServizioAttivoPino[] = [];
  for (const voce of vociServiziStrutturatiPino(record)) {
    const servizio = servizioAttivoDaVoce(voce);
    if (servizio) servizi.push(servizio);
  }
  return servizi;
}

/** Tag `negozi.servizi` (testo libero del venditore, separati dai servizi strutturati). */
function tagServiziPino(record: Record<string, unknown> | null | undefined): string[] {
  const tags = record?.servizi;
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((voce): voce is string => typeof voce === "string" && voce.trim().length > 0)
    .map((voce) => voce.trim());
}

/** Corpus dei token di un insieme di testi di servizio. */
function corpusTestiServizioPino(testi: string[]): Set<string> {
  const token = new Set<string>();
  for (const testo of testi) {
    for (const parte of normalizza(testo).split(/[^a-z0-9]+/)) if (parte) token.add(parte);
  }
  return token;
}

/**
 * True solo se TUTTI i termini significativi del servizio richiesto compaiono
 * nei testi dati, anche attraverso le equivalenze curate it/en. Un nome
 * generico o la sola descrizione del negozio non bastano.
 */
function testiDichiaranoServizioPino(testi: string[], servizio: string): boolean {
  const richiesta = tokenServizioPino(servizio);
  if (richiesta.length === 0) return false;
  const corpus = corpusTestiServizioPino(testi);
  return richiesta.every((token) => {
    if (corpus.has(token)) return true;
    const equivalenze = SINONIMI_SERVIZI_PINO[token] ?? [];
    return equivalenze.some((voce) => corpus.has(normalizza(voce)));
  });
}

/**
 * Servizi richiesti, uno per unità: "taglio barba" → ["taglio", "barba"].
 * Serve a verificare ogni prestazione separatamente, senza attribuire a un
 * servizio il prezzo o la durata di un altro.
 */
export function serviziRichiestiPino(servizio: string): string[] {
  return tokenServizioPino(servizio);
}

/** Voci strutturate (attive o no) il cui nome corrisponde a un singolo servizio. */
function vociStrutturateServizioPino(
  record: Record<string, unknown> | null | undefined,
  termine: string
): Record<string, unknown>[] {
  return vociServiziStrutturatiPino(record).filter((voce) => {
    const nome = typeof voce.nome === "string" ? voce.nome.trim() : "";
    return Boolean(nome) && testiDichiaranoServizioPino([nome], termine);
  });
}

/**
 * Un singolo servizio è dichiarato ATTIVO?
 *
 * S6.1/P3: se il catalogo contiene un record strutturato corrispondente con
 * `attivo: false`, prevale lo stato strutturato e un tag legacy rimasto in
 * `negozi.servizi` non può riattivarlo. Solo quando non esiste alcun record
 * strutturato corrispondente i tag continuano a dimostrare il servizio, senza
 * però dimostrarne prezzo o durata.
 */
function servizioAttivoDichiaratoPino(
  record: Record<string, unknown> | null | undefined,
  termine: string
): boolean {
  const voci = vociStrutturateServizioPino(record, termine);
  if (voci.length > 0) return voci.some((voce) => voce.attivo !== false);
  return testiDichiaranoServizioPino(tagServiziPino(record), termine);
}

/**
 * True solo se TUTTI i servizi richiesti sono dichiarati e attivi. Le richieste
 * con un solo servizio mantengono esattamente il comportamento precedente.
 * La descrizione del negozio non conta: è testo generico e non dimostra che il
 * servizio esista.
 */
export function negozioOffreServizioPino(
  record: Record<string, unknown> | null | undefined,
  servizio: string
): boolean {
  const richiesti = serviziRichiestiPino(servizio);
  if (richiesti.length === 0) return false;
  return richiesti.every((termine) => servizioAttivoDichiaratoPino(record, termine));
}

/**
 * Filtra i record grezzi della RPC sul servizio richiesto. Senza servizio
 * restituisce gli stessi record: le ricerche ordinarie di attività non cambiano.
 */
export function filtraNegoziPerServizioPino<T extends Record<string, unknown>>(
  record: T[],
  servizio: string
): T[] {
  const richiesta = String(servizio ?? "").trim();
  if (!richiesta) return record;
  return record.filter((voce) => negozioOffreServizioPino(voce, richiesta));
}

/**
 * Servizi strutturati attivi che corrispondono alla richiesta, con il proprio
 * prezzo e la propria durata (mai sommati, mai scambiati).
 *
 * S6.1/P2: con più servizi richiesti ("taglio e barba") il confronto avviene
 * per singolo servizio. Prima ogni record doveva contenere TUTTI i termini
 * richiesti, quindi due servizi dichiarati separatamente non producevano alcun
 * `serviziTrovati` e la risposta perdeva prezzi e durate.
 */
export function serviziCorrispondentiPino(
  record: Record<string, unknown> | null | undefined,
  servizio: string
): ServizioAttivoPino[] {
  const corrispondenti: ServizioAttivoPino[] = [];
  for (const termine of serviziRichiestiPino(servizio)) {
    for (const grezzo of vociStrutturateServizioPino(record, termine)) {
      const voce = servizioAttivoDaVoce(grezzo);
      if (!voce) continue;
      if (corrispondenti.some((esistente) => esistente.nome === voce.nome)) continue;
      corrispondenti.push(voce);
    }
  }
  return corrispondenti;
}

/**
 * Servizi richiesti che l'attività dichiara ma senza un record strutturato
 * corrispondente: prezzo e durata sono ignoti e la risposta deve dirlo solo per
 * questi servizi, senza inventare valori né attribuirli ad altri.
 */
export function serviziNonDichiaratiPino(
  record: Record<string, unknown> | null | undefined,
  servizio: string
): string[] {
  const trovati = serviziCorrispondentiPino(record, servizio);
  return serviziRichiestiPino(servizio).filter(
    (termine) => !trovati.some((voce) => testiDichiaranoServizioPino([voce.nome], termine))
  );
}

/**
 * Toglie la cornice conversazionale dalla query di catalogo: "Mi trovi il
 * Panificio Zini" e "Vorrei comprare olio" devono cercare il soggetto, non la
 * frase intera. La pulizia è volutamente conservativa: interviene solo
 * all'inizio della query e solo su forme di richiesta esplicite.
 */
export function pulisciCorniceRicercaPino(query: string): string {
  const originale = normalizzaQueryCatalogo(query);
  if (!originale) return "";
  return originale
    // La condizione personale non è un termine di catalogo: «sono ciliaco
    // trovami la pasta» deve cercare «pasta», mentre il filtro «senza glutine»
    // resta applicato a monte. «ciliaco» è un refuso frequente di «celiaco».
    .replace(
      /^(?:sono\s+(?:un[oa]?\s+)?(?:(?:celiac|ciliac)[oaie]|(?:celiachia|ciliachia))|sono\s+(?:allergic[oaie]|intollerante)\s+al\s+(?:glutine|lattosio)|ho\s+(?:un[oa]?\s*)?'?\s*(?:allergia|intolleranza)\s+al\s+(?:glutine|lattosio))[\s,.;:]*(?:e\s+)?/i,
      ""
    )
    .replace(
      /^(?:(?:mi|ti|ci)\s+)?(?:trovi|trova|trovami|cerchi|cerco|cerca|sto\s+cercando|vorrei|voglio|mi\s+serve|mi\s+servirebbe|mi\s+servono|ho\s+bisogno\s+di|avete|hai|mostrami|fammi\s+vedere|mi\s+fai\s+vedere|dove\s+(?:trovo|compro|posso\s+trovare|posso\s+comprare)|mi\s+consigli|mi\s+consiglieresti|consigliami|consigliatemi|puoi\s+consigliarmi|sapresti\s+consigliarmi)\s+/i,
      ""
    )
    .replace(/^(?:comprare|acquistare|ordinare|prendere)\s+/i, "")
    .replace(/^(?:il|lo|la|i|gli|le|un|uno|una|del|dello|della|dei|degli|delle)\s+/i, "")
    .trim() || originale;
}

export async function searchStores(
  query: string,
  opts: ToolParams = {}
): Promise<NegozioRicerca[]> {
  opts = validaToolParams("searchStores", opts).params;
  const q = pulisciCorniceRicercaPino(query);
  // S4.4 — Servizio richiesto: se è l'unico criterio disponibile, diventa la
  // query di recall (un servizio senza soggetto resta una ricerca di attività).
  const servizioRichiesto = opts?.servizio?.trim() ?? "";
  const richiestoServizio = servizioRichiesto.length > 0;
  if (!q && !(opts?.termini?.length) && !opts?.categoria && !opts?.tipo && !richiestoServizio) {
    return [];
  }

  // "bar" è un nome di attività di tre lettere: senza passarlo esplicitamente
  // al recall, la ricerca semantica lo scartava come token troppo corto e
  // restituiva zero attività pur essendoci bar attivi in catalogo.
  const attivitaRecall = ATTIVITA_CATALOGO_PINO.find(
    (voce) =>
      voce.pattern.test(normalizza(q)) ||
      (opts?.termini ?? []).some((t) => voce.pattern.test(normalizza(t)))
  )?.termine;
  const terminiRecall = opts?.termini?.length
    ? Array.from(new Set([...opts.termini, ...(attivitaRecall ? [attivitaRecall] : [])]))
    : attivitaRecall
      ? [attivitaRecall]
      : undefined;
  const righe = await cercaNegozi(q || servizioRichiesto, {
    limit: limita(opts?.limit, 6, 20),
    categoria: opts?.categoria,
    tipo: opts?.tipo,
    citta: opts?.citta,
    termini: terminiRecall,
  }, segnalazioneDatiPino);
  const righeAttivita = attivitaRecall
    ? await righeNegoziPerAttivitaPino(attivitaRecall)
    : [];
  const attivi = [...(righe ?? []), ...righeAttivita].filter(
    (n: Record<string, unknown>) => n.attivo !== false
  ).filter((n: Record<string, unknown>) =>
    !recordEscluso(
      [n.nome, n.descrizione, n.categoria, n.sottocategoria, (n.data as Record<string, unknown> | undefined)?.tipo_attivita],
      opts?.esclusioni
    )
  );

  // S4.4 — Il filtro del servizio avviene QUI, sui dati grezzi della RPC
  // (servizi_strutturati + tag `servizi`), prima del mapping che li perde.
  // Un servizio inesistente o inattivo non deve ripiegare sulla ricerca
  // generica di attività: la risposta resta vuota e Pino lo dice.
  const candidati = filtraNegoziPerServizioPino(attivi, servizioRichiesto);

  // Filtro esplicito categoria/tipo/servizio: la classificazione è già
  // garantita dal chiamante, quindi non applichiamo il gate sui termini.
  const filtroEsplicito = Boolean(
    opts?.categoria?.trim() || opts?.tipo?.trim() || richiestoServizio
  );
  let pertinenti = candidati;
  if (!filtroEsplicito) {
    const base = q || (opts?.termini ?? []).join(" ");
    // Se il planner ha ridotto "pizzeria" a "pizza", il gate deve comunque
    // usare il nome dell'attività: altrimenti un panificio che vende pizza
    // passa come pizzeria.
    const baseGate = attivitaRecall ?? base;
    const citta = opts?.citta?.trim() || estraiCitta(base) || "";
    const tokenCitta = citta ? normalizza(citta) : "";
    const terminiOriginali = terminiSignificativi(base, 10)
      .map(normalizza)
      .filter((t) => !tokenCitta || t !== tokenCitta);
    // Concetti d'intento come FRASI intere (es. "prodotti tipici"): spezzarli
    // in singole parole renderebbe "prodotti"/"tipici" una chiave capace di
    // pescare qualsiasi bottega con "prodotti da forno" tra i servizi.
    const concetti = analizzaRichiesta(base).concetti.map(normalizza);
    const espansi = espandiQueryConSinonimi(base)
      .split(/\s+/)
      .filter(Boolean)
      .map(normalizza);
    pertinenti = attivi.filter(
      (n) =>
        negozioPertinente(n, terminiOriginali, concetti, espansi) &&
        negozioAttivitaCompatibilePino(n, baseGate)
    );
  }

  if (opts?.escludiNomi?.length) {
    const esclusi = new Set(
      opts.escludiNomi
        .map((n) => String(n ?? "").trim().toLowerCase())
        .filter(Boolean)
    );
    pertinenti = pertinenti.filter(
      (n) => !esclusi.has(String(n.nome ?? "").trim().toLowerCase())
    );
  }

  if (opts?.apertiOra && pertinenti.length > 0) {
    const orari = await orariPerNegozi(pertinenti.map((n) => String(n.id)));
    pertinenti = pertinenti.filter((n) => apertoOra(orari.get(String(n.id))) === true);
  }

  const limitati = deduplicaPerId(pertinenti)
    .slice(0, limita(opts?.limit, 6, 20))
    .map((n: Record<string, unknown>) => {
      const base = {
        id: String(n.id),
        slug: (n.slug as string | null | undefined) ?? null,
        nome: String(n.nome ?? ""),
        descrizione: (n.descrizione as string | null | undefined) ?? null,
        categoria: (n.categoria as string | null | undefined) ?? null,
        indirizzo: (n.indirizzo as string | null | undefined) ?? null,
        telefono: (n.telefono as string | null | undefined) ?? null,
        logo_url: (n.logo_url as string | null | undefined) ?? null,
      };
      if (!richiestoServizio) return base;
      // Prezzo e durata arrivano solo se presenti nel servizio strutturato:
      // nessun valore inventato, nessun campo aggiunto alle ricerche ordinarie.
      return {
        ...base,
        serviziTrovati: serviziCorrispondentiPino(n, servizioRichiesto),
        serviziNonDichiarati: serviziNonDichiaratiPino(n, servizioRichiesto),
      };
    });
  // Classe calcolata internamente (non ancora mostrata all'utente).
  assegnaClassiNegozi(limitati, q || (opts?.termini ?? []).join(" "));
  return limitati;
}

// ─── searchProducts (con filtro prezzo) ──────────────────────────────────────

// Gate di pertinenza dei PRODOTTI (solo assistente).
// La ricerca prodotti condivisa con il catalogo espande la query con i sinonimi
// di categoria/commercio e, in ultima istanza, con una fase tollerante ai
// refusi: utile al recall, ma sui PRODOTTI genera falsi positivi reali
//   - "pane" attiva il gruppo "panificio" (che include "dolci") ⇒ Nutella
//     (categoria "Dolciumi") comparirebbe cercando "pane";
//   - per query senza riscontro la fase tollerante restituisce prodotti
//     casuali (es. "tartufo nero" ⇒ T-shirt/orologi).
// Pino deve mostrare SOLO prodotti che corrispondono alla richiesta reale:
// tutti i termini ORIGINALI della query devono comparire nei campi del
// prodotto; in alternativa basta un concetto d'INTENTO riconosciuto
// (es. "ho sete" ⇒ acqua/bevande). Il match PARZIALE non è una corrispondenza:
// per "tartufo nero" la parola "nero" nella descrizione di una T-shirt non
// rende la T-shirt pertinente. I campi del NEGOZIO non contano: la pertinenza
// del negozio non deve propagarsi ai suoi prodotti.
// Se la query non ha termini sostanziali, non applichiamo il vincolo.
// Formati con cui il catalogo pubblica la pasta: il prodotto può identificare
// la categoria senza ripetere la parola «pasta» nel nome. Il confronto avviene
// solo sui metadati identitari (nome, categoria), mai sulla descrizione:
// «Biscotti» e «Taralli» non diventano pasta perché la descrizione cita il
// pastificio «Mani in Pasta».
export const FORMATI_PASTA_PINO = [
  "tagliatelle", "tagliatelli", "tagliolini", "fettuccine", "pappardelle",
  "lasagne", "lasagna", "maccheroni", "maccheroncini", "fileja",
  "spaghetti", "penne", "rigatoni", "fusilli", "orecchiette", "trofie",
  "cavatelli", "strascinati", "bucatini", "linguine", "farfalle",
  "conchiglie", "vermicelli", "ziti", "capellini",
] as const;

const RE_FORMATO_PASTA_PINO = new RegExp(`\\b(?:${FORMATI_PASTA_PINO.join("|")})\\b`);

/** Formato di pasta riconosciuto sui metadati identitari del prodotto. */
function identificaFormatoPastaPino(prodotto: ProdottoRicerca): boolean {
  const identita = normalizza(
    [prodotto.nome, prodotto.categoria].filter(Boolean).join(" ")
  );
  return RE_FORMATO_PASTA_PINO.test(identita);
}

export function prodottoPertinente(
  prodotto: ProdottoRicerca,
  termini: string[],
  concetti: string[]
): boolean {
  const campi = normalizza(
    [prodotto.nome, prodotto.descrizione, prodotto.categoria]
      .filter(Boolean)
      .join(" ")
  );
  if (!campi) return false;
  if (termini.length === 0) return true;
  // "Pasta all'uovo" è una richiesta di categoria + lavorazione: il prodotto
  // può essere catalogato con il nome specifico ("tagliatelle all'uovo") senza
  // riportare la parola generica "pasta". Manteniamo obbligatorio il qualificatore
  // "uovo" e limitiamo l'equivalenza a formati di pasta riconoscibili, evitando
  // di trasformare la ricerca in un match permissivo su una sola parola.
  const richiedePastaAllUovo =
    termini.includes("pasta") &&
    termini.some((t) => t === "uovo" || t === "uova" || t === "all'uovo");
  if (
    richiedePastaAllUovo &&
    /\b(?:tagliatell[ei]|fettuccin[ei]|pappardell[ei]|lasagn[ae])\b/.test(campi) &&
    /\buov[oa]\b/.test(campi)
  ) return true;
  // La pasta è una categoria, non una parola: i formati (Tagliatelle, Fileja,
  // Maccheroni) sono pasta anche quando il nome non contiene «pasta». Il match
  // resta sui metadati identitari, quindi non basta una descrizione che cita
  // il pastificio o un condimento. La scorciatoia vale solo per il soggetto
  // nudo: un qualificatore esplicito («pasta all'uovo») resta obbligatorio e
  // passa dalle regole già esistenti.
  if (
    termini.length === 1 &&
    termini[0] === "pasta" &&
    identificaFormatoPastaPino(prodotto)
  ) return true;
  // Il primo termine deve identificare il prodotto tramite nome/categoria.
  // La sola presenza nella descrizione (es. "conservati sott'olio") non basta.
  const identificaDirettamente = prodottoIdentificatoDaSoggetto(prodotto, termini[0], concetti);
  // Categoria GENERICA richiesta e sottotipo reale nel catalogo ("formaggio" →
  // "Pecorino"): il termine generico non compare nel prodotto, ma il prodotto
  // appartiene alla categoria. Il controllo usa solo i metadati identitari.
  const identificaCategoria =
    !identificaDirettamente && prodottoIdentificaCategoriaGenerica(prodotto, termini[0]);
  if (!identificaDirettamente && !identificaCategoria) return false;
  // Anche qui i termini CORTI devono essere parole intere: altrimenti "bar"
  // matcherebbe "barattolo" nella descrizione di un prodotto qualsiasi.
  // Quando l'identità arriva dalla categoria generica, il termine generico è
  // già dimostrato: restano da verificare gli eventuali altri termini.
  const terminiDaVerificare = identificaDirettamente ? termini : termini.slice(1);
  const token = estraiToken(campi);
  // Per le sigle («olio evo») la verifica guarda i metadati identitari, come il
  // resto dei gate: «evo» ≡ «Extra Vergine di Oliva» senza dizionari dedicati.
  const identitaSigla = normalizza(
    [prodotto.nome, prodotto.categoria].filter(Boolean).join(" ")
  );
  if (
    terminiDaVerificare.every((t) =>
      t.length < 4
        ? token.includes(t) || equivalenzaSigla(t, identitaSigla)
        : campi.includes(t) || tokenCompatibile(t, token) || equivalenzaSigla(t, identitaSigla)
    )
  ) {
    return true;
  }
  return identificaCategoria || concetti.some((c) => campi.includes(c));
}

// Un termine è compatibile con il prodotto anche quando differisce solo per la
// vocale finale (singolare/plurale): "accessorio" trova la categoria
// "Accessori", "orologio" trova "Orologi". Non è uno stemmer: si applica solo a
// termini ≥ 4 caratteri, quindi non indebolisce la regola dei termini corti.
function tokenCompatibile(termine: string, token: string[]): boolean {
  if (termine.length < 4) return false;
  const radiceTermine = termine.replace(/[aeiou]+$/i, "");
  if (radiceTermine.length < 4) return false;
  return token.some(
    (t) => t.length >= 4 && t.replace(/[aeiou]+$/i, "") === radiceTermine
  );
}

function punteggioProdottoPino(
  prodotto: ProdottoRicerca,
  query: string,
  termini: string[]
): number {
  const nome = normalizza(prodotto.nome ?? "");
  const descrizione = normalizza(prodotto.descrizione ?? "");
  const categoria = normalizza(prodotto.categoria ?? "");
  const q = normalizza(query).trim();
  const tokenNome = estraiToken(nome);
  let score = 0;

  if (q && nome === q) score += 120;
  else if (q && nome.includes(q)) score += 90;

  for (const termine of termini) {
    const t = normalizza(termine).trim();
    if (!t) continue;
    if (tokenNome.includes(t)) score += 45;
    else if (nome.includes(t)) score += 30;
    else if (categoria.includes(t)) score += 18;
    else if (descrizione.includes(t)) score += 8;
  }

  // Se più termini della richiesta compaiono nel nome, il prodotto è più
  // specifico rispetto a uno che li cita solo nella descrizione.
  if (termini.length > 0 && termini.every((t) => nome.includes(normalizza(t)))) {
    score += 35;
  }

  score -= Math.min(nome.length, 160) / 160;
  return score;
}

/**
 * Applica ai prodotti i vincoli che appartengono al NEGOZIO proprietario.
 * La città e lo stato "aperto ora" sono proprietà del negozio, non del prodotto.
 * In caso di verifica esplicita non disponibile, il prodotto non viene promosso.
 */
export function filtraRisultatiPerVincoliNegozi(
  prodotti: ProdottoRicerca[],
  negoziAmmessi?: Set<string> | null,
  negoziAperti?: Set<string> | null,
): ProdottoRicerca[] {
  return prodotti.filter((p) => {
    if (negoziAmmessi && !negoziAmmessi.has(String(p.negozio_id))) return false;
    if (negoziAperti && !negoziAperti.has(String(p.negozio_id))) return false;
    return true;
  });
}

async function filtraProdottiPerVincoliNegozio(
  prodotti: ProdottoRicerca[],
  opts: ToolParams,
): Promise<ProdottoRicerca[]> {
  if (prodotti.length === 0 || (!opts?.citta?.trim() && !opts?.apertiOra)) return prodotti;

  let filtrati = prodotti;
  const ids = Array.from(new Set(filtrati.map((p) => String(p.negozio_id)).filter(Boolean)));
  if (ids.length === 0) return [];

  if (opts?.citta?.trim()) {
    let db;
    try {
      db = createAdminSupabaseClient();
    } catch {
      return [];
    }
    const target = normalizza(opts.citta).trim();
    const targetToken = target.split(/\s+/).filter(Boolean);
    const localitaCorrisponde = (valore: string): boolean => {
      const testo = normalizza(valore).trim();
      if (!testo || !target) return false;
      if (testo === target) return true;
      if (targetToken.length === 1) {
        return testo.split(/[^a-z0-9]+/).includes(targetToken[0]);
      }
      return testo.includes(target);
    };
    const { data, error } = await db
      .from("negozi")
      .select("id, citta, indirizzo")
      .in("id", ids)
      .is("deleted_at", null);
    if (error) return [];

    const ammessi = new Set(
      (data ?? [])
        .filter((n) => {
          const citta = normalizza(String(n.citta ?? ""));
          const indirizzo = normalizza(String(n.indirizzo ?? ""));
          return target.length > 0 && (localitaCorrisponde(citta) || localitaCorrisponde(indirizzo));
        })
        .map((n) => String(n.id))
    );
    filtrati = filtraRisultatiPerVincoliNegozi(filtrati, ammessi, null);
  }

  if (opts?.apertiOra && filtrati.length > 0) {
    const orari = await orariPerNegozi(filtrati.map((p) => String(p.negozio_id)));
    const aperti = new Set<string>();
    for (const [id, dati] of orari) {
      if (apertoOra(dati) === true) aperti.add(String(id));
    }
    filtrati = filtraRisultatiPerVincoliNegozi(filtrati, null, aperti);
  }

  return filtrati;
}

/**
 * Converte un prezzo in numero. Accetta numeri e stringhe, anche con valuta o
 * virgola decimale ("29,90"): i dati arrivano dal DB e non si assume un unico
 * formato. Restituisce null quando il prezzo non è un numero reale.
 */
export function prezzoNumerico(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const pulito = value.trim().replace(/€/g, "").replace(/\s+/g, "").replace(",", ".");
    if (!pulito) return null;
    const numero = Number(pulito);
    return Number.isFinite(numero) ? numero : null;
  }
  return null;
}

// ─── S5.3: disponibilità netta ──────────────────────────────────────────────

export type EsitoDisponibilitaProdottiPino = {
  /** Prodotti con quantità netta positiva o disponibilità non verificata. */
  disponibili: ProdottoRicerca[];
  /** Prodotti con quantità netta <= 0: esistono ma non sono acquistabili. */
  nonDisponibili: ProdottoRicerca[];
  /** Prodotti senza dati sufficienti: non vengono dichiarati esauriti. */
  nonVerificati: ProdottoRicerca[];
  totale: number;
};

/**
 * Disponibilità netta con la stessa regola del checkout:
 * `quantita_disponibile - quantita_riservata`.
 *
 * Restituisce null quando uno dei due dati manca o non è numerico: in quel caso
 * la disponibilità è sconosciuta, non zero.
 */
export function disponibilitaNettaPino(
  prodotto: Pick<ProdottoRicerca, "quantita_disponibile" | "quantita_riservata">
): number | null {
  const disponibile = prodotto?.quantita_disponibile;
  const riservata = prodotto?.quantita_riservata;
  if (disponibile == null || riservata == null) return null;
  const d = Number(disponibile);
  const r = Number(riservata);
  if (!Number.isFinite(d) || !Number.isFinite(r)) return null;
  return d - r;
}

/** Separa i prodotti acquistabili dagli esauriti, senza modificare il catalogo. */
export function filtraProdottiPerDisponibilitaPino(
  prodotti: ProdottoRicerca[]
): EsitoDisponibilitaProdottiPino {
  const esito: EsitoDisponibilitaProdottiPino = {
    disponibili: [],
    nonDisponibili: [],
    nonVerificati: [],
    totale: prodotti?.length ?? 0,
  };
  for (const prodotto of prodotti ?? []) {
    const netta = disponibilitaNettaPino(prodotto);
    if (netta == null) {
      esito.disponibili.push(prodotto);
      esito.nonVerificati.push(prodotto);
    } else if (netta > 0) {
      esito.disponibili.push(prodotto);
    } else {
      esito.nonDisponibili.push(prodotto);
    }
  }
  return esito;
}

/**
 * Nota deterministica per gli esauriti. Distingue "trovati ma non disponibili"
 * da "nessun prodotto trovato" e non afferma nulla sull'assenza in città.
 */
export function notaDisponibilitaProdottiPino(
  esito: EsitoDisponibilitaProdottiPino,
  lingua: "it" | "en" = "it"
): string | null {
  const n = esito.nonDisponibili.length;
  if (n === 0) return null;
  const inglese = lingua === "en";
  if (esito.disponibili.length === 0) {
    return inglese
      ? `I found ${n} relevant ${n === 1 ? "product" : "products"} in the InCittà catalogue, but none has positive net stock right now. I won't present them as purchasable.`
      : `Ho trovato ${n} ${n === 1 ? "prodotto pertinente" : "prodotti pertinenti"} nel catalogo InCittà, ma nessuno ha disponibilità netta positiva in questo momento. Non te li propongo come acquistabili.`;
  }
  if (inglese) {
    return n === 1
      ? "1 more relevant product has no positive net stock and is not included in the results."
      : `${n} more relevant products have no positive net stock and are not included in the results.`;
  }
  return n === 1
    ? "Un altro prodotto pertinente non ha disponibilità netta positiva e non è incluso nei risultati."
    : `Altri ${n} prodotti pertinenti non hanno disponibilità netta positiva e non sono inclusi nei risultati.`;
}

/** Prezzo valido per il catalogo: gestisce anche stringhe italiane come "99,00". */
export function prodottoHaPrezzoReale(value: unknown): boolean {
  const prezzo = prezzoNumerico(value);
  return prezzo != null && prezzo > 0;
}

/**
 * Ordina i prodotti secondo la PREFERENZA di prezzo. Non elimina nulla: il
 * budget non è un filtro. Prima i prodotti realmente entro la fascia richiesta
 * (dal più economico al più caro), poi le alternative fuori fascia (sempre dal
 * più economico al più caro); i prodotti senza prezzo valido restano in coda.
 */
export function ordinaProdottiPerBudget(
  prodotti: ProdottoRicerca[],
  opts: { maxPrice?: number | null; minPrice?: number | null } = {},
  confrontoSecondario?: (a: ProdottoRicerca, b: ProdottoRicerca) => number
): ProdottoRicerca[] {
  const maxPrice =
    opts.maxPrice != null && Number.isFinite(Number(opts.maxPrice))
      ? Number(opts.maxPrice)
      : null;
  const minPrice =
    opts.minPrice != null && Number.isFinite(Number(opts.minPrice))
      ? Number(opts.minPrice)
      : null;

  const dentroFascia = (p: ProdottoRicerca): boolean => {
    const prezzo = prezzoNumerico(p.prezzo);
    if (prezzo == null || prezzo <= 0) return false;
    if (maxPrice != null && prezzo > maxPrice) return false;
    if (minPrice != null && prezzo < minPrice) return false;
    return true;
  };
  const prezzoOrdinabile = (p: ProdottoRicerca): number | null => {
    const prezzo = prezzoNumerico(p.prezzo);
    return prezzo != null && prezzo > 0 ? prezzo : null;
  };

  // Con un vincolo economico esplicito la fascia viene prima di tutto: un
  // prodotto fuori budget non deve superare un'alternativa compatibile solo
  // perché più pertinente. Senza budget, invece, la pertinenza è primaria e
  // il prezzo resta un criterio secondario.
  const haVincoloEconomico = maxPrice != null || minPrice != null;

  return [...prodotti].sort((a, b) => {
    const dentroA = dentroFascia(a);
    const dentroB = dentroFascia(b);
    if (dentroA !== dentroB) return dentroA ? -1 : 1;

    if (!haVincoloEconomico) {
      const rilevanza = confrontoSecondario ? confrontoSecondario(a, b) : 0;
      if (rilevanza !== 0) return rilevanza;
    }

    const prezzoA = prezzoOrdinabile(a);
    const prezzoB = prezzoOrdinabile(b);
    // I prodotti senza prezzo valido non appartengono a nessuna fascia: in coda.
    if (prezzoA == null && prezzoB == null)
      return confrontoSecondario ? confrontoSecondario(a, b) : 0;
    if (prezzoA == null) return 1;
    if (prezzoB == null) return -1;
    if (prezzoA !== prezzoB) return prezzoA - prezzoB;

    return confrontoSecondario ? confrontoSecondario(a, b) : 0;
  });
}

// ─── S2: budget indicativo (D-1, opzione B) ─────────────────────────────────
// Il budget esplicito dell'utente è una PREFERENZA, non un filtro: serve a
// ordinare (prima ciò che rientra nella cifra, poi le alternative) e a dirlo in
// modo trasparente. Questa funzione riconosce la cifra dalla frase in italiano e
// in inglese; non inventa nulla quando la frase esprime un minimo.

const RE_BUDGET_MASSIMO =
  /(?:budget(?:\s+(?:di|of))?|al\s+massimo|massimo|fino\s+a|entro|sotto(?:\s+i)?|non\s+oltre|under|below|up\s+to|less\s+than|not\s+over|at\s+most|max)\s*(?:di\s*|of\s*|€\s*)?(\d+(?:[.,]\d+)?)/i;
const RE_IMPORTO_CON_VALUTA =
  /(?:€\s*(\d+(?:[.,]\d+)?))|(?:(\d+(?:[.,]\d+)?)\s*(?:euro|euros|eur)\b)/i;
// "sopra 50 euro" / "over 50" sono una soglia MINIMA: non diventano un tetto.
const RE_SEGNALE_MINIMO =
  /\b(?:sopra|minimo|oltre|almeno|a\s+partire\s+da|over|above|more\s+than|at\s+least|starting\s+from)\b/i;
// Un numero seguito da un'unità di tempo non è un budget: "entro 2 giorni",
// "sotto i 3 giorni", "fino a 5 ore" descrivono una durata, non una cifra.
const RE_UNITA_TEMPORALE =
  /^\s*(?:giorn[oi]|giornat[ae]|or[ae]|settiman[ae]|mes[ei]|ann[oi]|minut[oi]|second[oi]|h|hrs?|days?|hours?|weeks?|months?|years?|minutes?|seconds?)\b/i;

function importoBudget(raw: string | undefined): number | null {
  if (!raw) return null;
  const numero = Number(raw.replace(",", "."));
  if (!Number.isFinite(numero) || numero <= 0 || numero > PREZZO_MASSIMO_AMMESSO) return null;
  return Math.round(numero * 100) / 100;
}

/**
 * Estrae il budget massimo INDICATIVO da una frase ("entro 50 euro", "under 50
 * euros", "€50", "budget di 50"). Restituisce `null` quando la frase esprime un
 * minimo ("sopra 50 euro") o non contiene cifre. Non lancia mai.
 */
export function rilevaBudgetIndicativoPino(testo: string | null | undefined): number | null {
  const t = String(testo ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  // Le formule di tetto hanno la precedenza: "non oltre 50" contiene "oltre".
  // Le occorrenze seguite da un'unità di tempo vengono saltate, così "entro 2
  // giorni" non diventa un budget mentre "entro 2 giorni, sotto 50 euro" sì.
  const reTetto = new RegExp(RE_BUDGET_MASSIMO.source, "gi");
  for (let tetto = reTetto.exec(t); tetto; tetto = reTetto.exec(t)) {
    const dopo = t.slice(tetto.index + tetto[0].length);
    if (RE_UNITA_TEMPORALE.test(dopo)) continue;
    return importoBudget(tetto[1]);
  }
  const conValuta = t.match(RE_IMPORTO_CON_VALUTA);
  if (conValuta && !RE_SEGNALE_MINIMO.test(t)) {
    return importoBudget(conValuta[1] ?? conValuta[2]);
  }
  return null;
}

// Parole accessorie che non sono il soggetto della ricerca: articoli,
// preposizioni, formule di richiesta, quantificatori ("un paio di scarpe").
const STOPWORD_SOGGETTO_PINO = new Set([
  "il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "di", "da", "in",
  "con", "su", "per", "tra", "fra", "del", "della", "delle", "dei", "degli",
  "dello", "al", "alla", "alle", "allo", "agli", "ai", "e", "ed", "o", "che",
  "cerco", "cerca", "cercando", "vorrei", "voglio", "serve", "mi", "ho",
  "bisogno", "comprare", "compro", "acquistare", "trova", "trovami", "dammi",
  "paio", "coppia", "set", "kit", "confezione", "pezzo", "pezzi", "pacco",
  "the", "a", "an", "and", "or", "of", "for", "with", "to", "on", "some",
  "please", "looking", "want", "need", "show", "find", "me", "i", "buy",
  "purchase", "get", "my", "taglia", "taglie", "size", "sizes", "tg",
]);

// Attributi descrittivi (colori, materiali, destinatari, taglie, genere):
// descrivono il prodotto ma non lo identificano: "scarpe nere" resta una
// ricerca di scarpe. La fonte unica è `understanding.ts`, dove il vocabolario
// è usato anche da `estraiAttributiPino`; qui non si mantiene una copia.

// Soggetti generici e ponti concettuali vivono in `lexicon.ts`: il gate non
// mantiene più una copia propria di ciò che un altro strato già conosce.
const CONCETTI_SOGGETTO_PINO = PONTI_CONCETTUALI_PINO;

/**
 * Soggetto principale di una richiesta: primo termine di contenuto che non sia
 * una parola accessoria né un attributo descrittivo. Restituisce "" quando
 * non c'è nulla di concreto su cui applicare un controllo di pertinenza.
 */
export function soggettoPrincipalePino(query: string): string {
  const contenuto = String(query ?? "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORD_SOGGETTO_PINO.has(t));
  if (contenuto.length === 0) return "";
  return contenuto.find((t) => !ATTRIBUTI_DESCRITTIVI_PINO.has(t)) ?? contenuto[0];
}

function contieneSequenzaToken(token: string[], frase: string[]): boolean {
  if (
    token.some((_, indice) =>
      frase.every((voce, offset) => token[indice + offset] === voce)
    )
  ) {
    return true;
  }
  // Stessa sequenza scritta in forma compatta: «extra vergine» ≡ «extravergine»,
  // «olio extra-vergine» ≡ «olio extra vergine». Solo sequenze di almeno due
  // parole: una parola singola ha già il confronto esatto.
  if (frase.length < 2) return false;
  const compatta = formaCompatta(frase.join(" "));
  if (compatta.length < 4) return false;
  return formaCompatta(token.join(" ")).includes(compatta);
}

// ─── P1.3.5: quantità e unità di misura ──────────────────────────────────────

type DimensioneQuantita = "volume" | "peso" | "lunghezza";

type QuantitaNormalizzata = {
  dimensione: DimensioneQuantita;
  /** Valore nella unità base: ml, g oppure cm. */
  valore: number;
};

const UNITA_MISURA: Record<
  string,
  { dimensione: DimensioneQuantita; fattore: number }
> = {
  // Volume, base millilitri.
  l: { dimensione: "volume", fattore: 1000 },
  litro: { dimensione: "volume", fattore: 1000 },
  litri: { dimensione: "volume", fattore: 1000 },
  ml: { dimensione: "volume", fattore: 1 },
  millilitro: { dimensione: "volume", fattore: 1 },
  millilitri: { dimensione: "volume", fattore: 1 },
  cl: { dimensione: "volume", fattore: 10 },
  centilitro: { dimensione: "volume", fattore: 10 },
  centilitri: { dimensione: "volume", fattore: 10 },
  dl: { dimensione: "volume", fattore: 100 },
  decilitro: { dimensione: "volume", fattore: 100 },
  decilitri: { dimensione: "volume", fattore: 100 },
  // Peso, base grammi.
  kg: { dimensione: "peso", fattore: 1000 },
  chilogrammo: { dimensione: "peso", fattore: 1000 },
  chilogrammi: { dimensione: "peso", fattore: 1000 },
  chilo: { dimensione: "peso", fattore: 1000 },
  chili: { dimensione: "peso", fattore: 1000 },
  g: { dimensione: "peso", fattore: 1 },
  grammo: { dimensione: "peso", fattore: 1 },
  grammi: { dimensione: "peso", fattore: 1 },
  etto: { dimensione: "peso", fattore: 100 },
  etti: { dimensione: "peso", fattore: 100 },
  ettogrammo: { dimensione: "peso", fattore: 100 },
  ettogrammi: { dimensione: "peso", fattore: 100 },
  // Lunghezza, base centimetri.
  m: { dimensione: "lunghezza", fattore: 100 },
  metro: { dimensione: "lunghezza", fattore: 100 },
  metri: { dimensione: "lunghezza", fattore: 100 },
  cm: { dimensione: "lunghezza", fattore: 1 },
  centimetro: { dimensione: "lunghezza", fattore: 1 },
  centimetri: { dimensione: "lunghezza", fattore: 1 },
  mm: { dimensione: "lunghezza", fattore: 0.1 },
  millimetro: { dimensione: "lunghezza", fattore: 0.1 },
  millimetri: { dimensione: "lunghezza", fattore: 0.1 },
};

const RE_QUANTITA_NUMERICA = /\b(\d+(?:[.,]\d+)?)\s*(millilitri|millilitro|centilitri|centilitro|decilitri|decilitro|chilogrammi|chilogrammo|ettogrammi|ettogrammo|millimetri|millimetro|centimetri|centimetro|grammi|grammo|litri|litro|metri|metro|chili|chilo|etti|etto|kg|ml|cl|dl|cm|mm|m|l|g)\b/g;
const RE_QUANTITA_PAROLE = /\b(un|uno|una|mezzo|mezza)\s+(millilitri|millilitro|centilitri|centilitro|decilitri|decilitro|chilogrammi|chilogrammo|ettogrammi|ettogrammo|millimetri|millimetro|centimetri|centimetro|grammi|grammo|litri|litro|metri|metro|chili|chilo|etti|etto|kg|ml|cl|dl|cm|mm|m|l|g)\b/g;
const RE_QUANTITA_AMBIGUA = /\b\d+(?:[.,]\d+)?\s*(?:-|–|a|e|ed)\s*\d+(?:[.,]\d+)?\s*(?:millilitri|millilitro|centilitri|centilitro|decilitri|decilitro|chilogrammi|chilogrammo|ettogrammi|ettogrammo|millimetri|millimetro|centimetri|centimetro|grammi|grammo|litri|litro|metri|metro|chili|chilo|etti|etto|kg|ml|cl|dl|cm|mm|m|l|g)\b/;
const RE_FRAZIONE_QUANTITA = /\b\d+\s*\/\s*\d+\s*(?:millilitri|millilitro|centilitri|centilitro|decilitri|decilitro|chilogrammi|chilogrammo|ettogrammi|ettogrammo|millimetri|millimetro|centimetri|centimetro|grammi|grammo|litri|litro|metri|metro|chili|chilo|etti|etto|kg|ml|cl|dl|cm|mm|m|l|g)\b/;

function valoreNumericoQuantita(testo: string): number {
  return Number(testo.replace(",", "."));
}

function unitaQuantita(testo: string): { dimensione: DimensioneQuantita; fattore: number } | null {
  return UNITA_MISURA[normalizza(testo).trim()] ?? null;
}

/**
 * Estrae solo quantità esplicite e non ambigue. Le unità sono convertite nella
 * dimensione e nell'unità base, così 1 l, 100 cl e 1000 ml diventano lo stesso
 * valore. Le frazioni e gli intervalli non vengono interpretati come certezza.
 */
function quantitaAmbigua(testo: string): boolean {
  const pulito = normalizza(String(testo ?? ""));
  return Boolean(
    pulito && (RE_FRAZIONE_QUANTITA.test(pulito) || RE_QUANTITA_AMBIGUA.test(pulito))
  );
}

function estraiQuantita(testo: string): QuantitaNormalizzata[] {
  const pulito = normalizza(String(testo ?? ""));
  if (!pulito || quantitaAmbigua(pulito)) return [];

  const risultato: QuantitaNormalizzata[] = [];
  const visti = new Set<string>();
  const aggiungi = (dimensione: DimensioneQuantita, valore: number) => {
    const normalizzato = Number(valore.toFixed(6));
    const chiave = dimensione + ":" + normalizzato;
    if (visti.has(chiave)) return;
    visti.add(chiave);
    risultato.push({ dimensione, valore: normalizzato });
  };

  for (const match of pulito.matchAll(RE_QUANTITA_NUMERICA)) {
    const unita = unitaQuantita(match[2]);
    if (!unita) continue;
    let valore = valoreNumericoQuantita(match[1]) * unita.fattore;
    const dopo = pulito.slice((match.index ?? 0) + match[0].length);
    if (/^\s*(?:e|ed)\s+mezzo\b/.test(dopo)) valore += 0.5 * unita.fattore;
    aggiungi(unita.dimensione, valore);
  }

  for (const match of pulito.matchAll(RE_QUANTITA_PAROLE)) {
    const unita = unitaQuantita(match[2]);
    if (!unita) continue;
    const base = match[1] === "mezzo" || match[1] === "mezza" ? 0.5 : 1;
    let valore = base * unita.fattore;
    const dopo = pulito.slice((match.index ?? 0) + match[0].length);
    if (/^\s*(?:e|ed)\s+mezzo\b/.test(dopo)) valore += 0.5 * unita.fattore;
    aggiungi(unita.dimensione, valore);
  }

  return risultato;
}

function prodottoSoddisfaQuantita(
  prodotto: ProdottoRicerca,
  richieste: QuantitaNormalizzata[]
): boolean {
  if (richieste.length === 0) return true;
  const disponibili = estraiQuantita(evidenzaMetadatiProdotto(prodotto));
  return richieste.every((richiesta) =>
    disponibili.some(
      (disponibile) =>
        disponibile.dimensione === richiesta.dimensione &&
        Math.abs(disponibile.valore - richiesta.valore) < 0.000001
    )
  );
}

/**
 * Evidenza testuale del prodotto per una caratteristica già riconosciuta.
 * Include tutti i metadati disponibili, non solo `caratteristiche`: un campo
 * vuoto non deve far scartare un prodotto se la stessa informazione è presente
 * in descrizione, SEO, alt text, parole chiave o nome. Il nome del negozio non
 * fa parte dei metadati del prodotto e non viene inserito nell'evidenza.
 */
function evidenzaMetadatiProdotto(prodotto: ProdottoRicerca): string {
  return normalizza(
    [
      prodotto.nome,
      prodotto.categoria,
      prodotto.sottocategoria,
      prodotto.marca,
      ...(prodotto.parole_chiave ?? []),
      ...(prodotto.caratteristiche ?? []),
      prodotto.descrizione,
      prodotto.descrizione_completa,
      prodotto.seo_title,
      prodotto.seo_description,
      prodotto.alt_text_immagine,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

// ─── P1.3.5: qualificazioni documentate ──────────────────────────────────────

const PAROLE_BUDGET_QUALIFICAZIONE = new Set([
  "sotto", "entro", "fino", "massimo", "minimo", "oltre", "sopra",
  "tra", "fra", "euro", "€",
  // Stessi confini in inglese: senza questi, "pasta under 5 euros" produceva
  // una nota di qualifica inesistente («pasta under 5 euros»).
  "under", "below", "up", "less", "than", "over", "above", "more",
  "least", "most", "budget", "of", "dollars", "dollar", "usd",
]);

const PAROLE_NON_QUALIFICANTI = new Set([
  "un", "uno", "una", "il", "lo", "la", "i", "gli", "le",
  "di", "del", "dello", "della", "dei", "degli", "delle",
  "da", "dal", "dallo", "dalla", "dai", "dagli", "dalle",
  "in", "nel", "nello", "nella", "nei", "negli", "nelle",
  "con", "col", "coi", "su", "sul", "sullo", "sulla", "sui",
  "sugli", "sulle", "per", "a", "al", "allo", "alla", "ai",
  "agli", "alle", "e", "ed", "che", "piu", "meno", "circa",
  "tipo", "come",
]);

const PAROLE_CORTESIA = new Set(["per", "favore", "grazie", "please"]);

/**
 * Estrae la parte qualificante della query dopo il soggetto, fermandosi prima
 * del budget. Non inventa parole: usa solo i token già presenti nella query.
 */
function segmentoQualificazione(query: string, soggetto: string): string[] {
  const tokenQuery = estraiToken(query);
  const soggettoToken = estraiToken(soggetto)[0] ?? normalizza(soggetto).trim();
  if (!soggettoToken) return [];
  const indice = tokenQuery.indexOf(soggettoToken);
  if (indice < 0) return [];
  let segmento = tokenQuery.slice(indice);

  const taglioBudget = segmento.findIndex((token) =>
    PAROLE_BUDGET_QUALIFICAZIONE.has(token)
  );
  if (taglioBudget >= 0) segmento = segmento.slice(0, taglioBudget);

  while (segmento.length > 0 && PAROLE_CORTESIA.has(segmento[segmento.length - 1])) {
    segmento.pop();
  }
  while (
    segmento.length > 1 &&
    (PAROLE_NON_QUALIFICANTI.has(segmento[segmento.length - 1]) ||
      /^\d+(?:[.,]\d+)?$/.test(segmento[segmento.length - 1]))
  ) {
    segmento.pop();
  }
  return segmento.length >= 2 ? segmento : [];
}

function fraseQualificanteSignificativa(token: string[]): boolean {
  if (token.length < 2) return false;
  if (PAROLE_NON_QUALIFICANTI.has(token[0])) return false;
  if (PAROLE_NON_QUALIFICANTI.has(token[token.length - 1])) return false;
  return token.some(
    (voce) => voce.length >= 3 && !PAROLE_NON_QUALIFICANTI.has(voce)
  );
}

/**
 * Cerca una qualificazione documentata dai metadati del prodotto. La frase
 * più lunga e meglio documentata vince; se nessun prodotto la documenta, viene
 * restituita la frase della query (e il filtro restituirà zero risultati,
 * invece di ricadere sulla ricerca generica).
 */
/**
 * Vero se `token` è una forma alternativa (sigla o compatta) dell'identità di
 * almeno un prodotto: «evo» ≡ «Extra Vergine di Oliva». In quel caso il token
 * non è una qualificazione da pretendere nei metadati, ma lo stesso soggetto
 * scritto diversamente.
 */
function qualificatoreEIdentitaPino(prodotti: ProdottoRicerca[], token: string): boolean {
  return prodotti.some((prodotto) => {
    const identita = normalizza(
      [prodotto.nome, prodotto.categoria].filter(Boolean).join(" ")
    );
    if (!identita) return false;
    return (
      equivalenzaSigla(token, identita) ||
      formaCompatta(identita).includes(formaCompatta(token))
    );
  });
}

function scopriQualificazioneRichieste(
  prodotti: ProdottoRicerca[],
  query: string,
  soggetto: string
): string | null {
  // Una quantità esplicita è gestita dal filtro numerico: non va confusa con
  // una qualificazione testuale (es. "1 litro" non è una sottocategoria).
  if (estraiQuantita(query).length > 0) return null;

  const segmento = segmentoQualificazione(query, soggetto);
  if (segmento.length < 2) return null;

  const evidenze = prodotti.map((prodotto) =>
    estraiToken(evidenzaMetadatiProdotto(prodotto))
  );
  const candidati: Array<{
    frase: string;
    lunghezza: number;
    occorrenze: number;
    posizione: number;
  }> = [];

  for (let lunghezza = Math.min(4, segmento.length); lunghezza >= 2; lunghezza--) {
    for (let inizio = 0; inizio + lunghezza <= segmento.length; inizio++) {
      const fraseToken = segmento.slice(inizio, inizio + lunghezza);
      if (!fraseQualificanteSignificativa(fraseToken)) continue;
      const occorrenze = evidenze.filter((evidenza) =>
        contieneSequenzaToken(evidenza, fraseToken)
      ).length;
      if (occorrenze > 0) {
        candidati.push({
          frase: fraseToken.join(" "),
          lunghezza,
          occorrenze,
          posizione: inizio,
        });
      }
    }
  }

  if (candidati.length > 0) {
    candidati.sort(
      (a, b) =>
        b.occorrenze - a.occorrenze ||
        b.lunghezza - a.lunghezza ||
        a.posizione - b.posizione
    );
    return candidati[0].frase;
  }

  // Fallback storico: la frase non documentata resta un vincolo (zero risultati
  // invece della ricerca generica). Non vale però quando la parte oltre il
  // soggetto è solo un MODO DIVERSO DI SCRIVERE l'identità del prodotto:«olio
  // evo» non è «olio + qualificazione evo», è «olio extra vergine» e non deve
  // azzerare i risultati.
  const soggettoToken =
    estraiToken(soggetto)[0] ?? normalizza(soggetto).trim();
  const qualificatori = segmento.filter((token) => token !== soggettoToken);
  if (
    qualificatori.length > 0 &&
    qualificatori.every((token) => qualificatoreEIdentitaPino(prodotti, token))
  ) {
    return null;
  }

  return fraseQualificanteSignificativa(segmento) ? segmento.join(" ") : null;
}

function filtraProdottiPerQualificazioneDocumentata(
  prodotti: ProdottoRicerca[],
  query: string,
  soggetto: string
): ProdottoRicerca[] {
  const frase = scopriQualificazioneRichieste(prodotti, query, soggetto);
  if (!frase) return prodotti;
  const tokenFrase = estraiToken(frase);
  if (tokenFrase.length === 0) return prodotti;
  return prodotti.filter((prodotto) =>
    contieneSequenzaToken(
      estraiToken(evidenzaMetadatiProdotto(prodotto)),
      tokenFrase
    )
  );
}

/**
 * Scopre una caratteristica richiesta usando la stessa evidenza completa dei
 * metadati usata per la verifica. A differenza della qualificazione delle
 * sottocategorie, questa ricerca non viene disattivata quando la query contiene
 * una quantità: "pasta lavorata a mano da 1 kg" deve verificare sia la
 * caratteristica sia il formato.
 */
function scopriCaratteristicaDocumentata(
  prodotti: ProdottoRicerca[],
  query: string,
  soggetto?: string
): string | null {
  const tokenQuery = estraiToken(query);
  const soggettoToken =
    estraiToken(soggetto ?? soggettoPrincipalePino(query))[0] ?? "";
  if (!soggettoToken || tokenQuery.length < 2) return null;

  const evidenze = prodotti.map((prodotto) =>
    estraiToken(evidenzaMetadatiProdotto(prodotto))
  );
  const candidati: Array<{
    frase: string;
    lunghezza: number;
    occorrenze: number;
    posizione: number;
  }> = [];

  for (let lunghezza = Math.min(6, tokenQuery.length); lunghezza >= 2; lunghezza--) {
    for (let inizio = 0; inizio + lunghezza <= tokenQuery.length; inizio++) {
      const fraseToken = tokenQuery.slice(inizio, inizio + lunghezza);
      // Il soggetto identifica già il prodotto: la caratteristica è la parte
      // restante della frase, non il nome del prodotto stesso.
      if (fraseToken.includes(soggettoToken)) continue;
      if (!fraseQualificanteSignificativa(fraseToken)) continue;
      if (fraseToken.some((token) => PAROLE_BUDGET_QUALIFICAZIONE.has(token))) {
        continue;
      }
      if (estraiQuantita(fraseToken.join(" ")).length > 0) continue;
      const occorrenze = evidenze.filter((evidenza) =>
        contieneSequenzaToken(evidenza, fraseToken)
      ).length;
      if (occorrenze > 0) {
        candidati.push({
          frase: fraseToken.join(" "),
          lunghezza,
          occorrenze,
          posizione: inizio,
        });
      }
    }
  }

  if (candidati.length === 0) return null;
  candidati.sort(
    (a, b) =>
      b.lunghezza - a.lunghezza ||
      b.occorrenze - a.occorrenze ||
      a.posizione - b.posizione
  );
  return candidati[0].frase;
}

/**
 * Caratteristiche esplicite richieste dalla query, ricavate dai metadati del
 * prodotto. Solo le caratteristiche presenti come frase completa nella query
 * contano: "fatta a mano" sì, la parola "mano" da sola no. Il filtro non crea
 * corrispondenze: restringe i prodotti già ammessi dal gate del soggetto.
 *
 * La scoperta e la verifica usano tutti i metadati disponibili: se
 * `caratteristiche` è vuoto ma la descrizione dichiara la stessa
 * caratteristica, il prodotto resta ammesso. Anche una quantità con unità
 * esplicita è un vincolo verificabile: "2 litri" non può essere soddisfatto da
 * un prodotto che documenta solo "1 litro".
 */
function filtraProdottiPerCaratteristicheRichieste(
  prodotti: ProdottoRicerca[],
  query: string,
  soggetto?: string,
  soggettoScoperta?: string
): ProdottoRicerca[] {
  if (quantitaAmbigua(query)) return [];
  const caratteristica = scopriCaratteristicaDocumentata(
    prodotti,
    query,
    soggettoScoperta ?? soggetto
  );
  const richieste = new Set<string>(caratteristica ? [caratteristica] : []);
  const richiesteQuantita = estraiQuantita(query);

  // Vincoli RIGIDI: caratteristica documentata e quantità esplicita. Se non
  // sono soddisfatti la richiesta non ha risposta nel catalogo e non va
  // inventata ("olio in bottiglia da 2 litri" resta vuoto).
  const conCaratteristica = prodotti.filter((prodotto) => {
    const evidenza = estraiToken(evidenzaMetadatiProdotto(prodotto));
    return (
      [...richieste].every((richiesta) =>
        contieneSequenzaToken(evidenza, estraiToken(richiesta))
      ) && prodottoSoddisfaQuantita(prodotto, richiesteQuantita)
    );
  });

  if (!soggetto) return conCaratteristica;

  const qualificati = filtraProdottiPerQualificazioneDocumentata(
    conCaratteristica,
    query,
    soggetto
  );
  // Vincolo MORBIDO: una qualifica non documentata («pasta fresca», «olio
  // dop») non cancella i prodotti del soggetto. Si tengono quelli del solo
  // soggetto e la risposta dichiara che la qualifica non è confermata
  // (`notaQualificazioneRilassataPino`): meglio «ecco l'olio, non è DOP» che
  // «non ho trovato nulla». Quando invece la qualifica è documentata, il
  // filtro resta stretto.
  return qualificati.length > 0 ? qualificati : conCaratteristica;
}

/**
 * Una sottocategoria esplicita nella query ("pasta tipica", "olio e condimenti")
 * restringe i prodotti già ammessi dal soggetto. Si attiva solo quando la frase
 * compare davvero nei metadati di un candidato: una categoria generica come
 * "pasta" non attiva il filtro. La corrispondenza può usare la sottocategoria
 * o una parola chiave dichiarata; il nome del negozio non viene considerato.
 */
function filtraProdottiPerSottocategoriaRichiesta(
  prodotti: ProdottoRicerca[],
  query: string,
  soggetto?: string
): ProdottoRicerca[] {
  if (!soggetto) return prodotti;
  return filtraProdottiPerQualificazioneDocumentata(prodotti, query, soggetto);
}

/**
 * La parte qualificante della query ("dop" in "olio dop", "fresca" in
 * "pasta fresca"), oppure `null` se non c'è nulla da qualificare.
 *
 * Non è un dizionario: usa solo le parole già scritte dall'utente, la stessa
 * segmentazione del filtro. Una quantità esplicita è un vincolo numerico, non
 * una qualifica testuale, e non produce nota.
 */
export function fraseQualificazionePino(
  query: string,
  soggetto: string | null
): string | null {
  if (!soggetto) return null;
  if (estraiQuantita(query).length > 0) return null;
  // La città è un vincolo di luogo, non una qualifica del prodotto: senza
  // questo filtro «pasta a Roma» diventava «pasta con qualifica a roma».
  const citta = estraiCitta(query);
  const tokenCitta = new Set(
    citta ? normalizza(citta).split(/[^a-z0-9]+/).filter(Boolean) : []
  );
  const segmento = segmentoQualificazione(query, soggetto).filter(
    (token) => !tokenCitta.has(token)
  );
  while (
    segmento.length > 1 &&
    PAROLE_NON_QUALIFICANTI.has(segmento[segmento.length - 1])
  ) {
    segmento.pop();
  }
  if (!fraseQualificanteSignificativa(segmento)) return null;
  const soggettoToken =
    estraiToken(soggetto)[0] ?? normalizza(soggetto).trim();
  const qualificatori = segmento.filter((token) => token !== soggettoToken);
  if (qualificatori.length === 0) return null;
  return segmento.join(" ");
}

/**
 * Vero se la qualifica richiesta è davvero documentata dai prodotti restituiti.
 * Le equivalenze di identità («evo» ≡ «Extra Vergine di Oliva») non sono
 * qualifiche mancanti e valgono come confermate.
 */
export function qualificazioneDocumentataPino(
  prodotti: ProdottoRicerca[],
  soggetto: string | null,
  frase: string
): boolean {
  const tokenFrase = estraiToken(frase);
  if (tokenFrase.length === 0) return true;
  const soggettoToken = estraiToken(soggetto ?? "")[0] ?? "";
  const qualificatori = tokenFrase.filter((token) => token !== soggettoToken);
  if (
    qualificatori.length > 0 &&
    qualificatori.every((token) => qualificatoreEIdentitaPino(prodotti, token))
  ) {
    return true;
  }
  return prodotti.some((prodotto) =>
    contieneSequenzaToken(
      estraiToken(evidenzaMetadatiProdotto(prodotto)),
      tokenFrase
    )
  );
}

/**
 * Gate alimentare completo: prima identifica il soggetto, poi applica le
 * qualificazioni esplicite disponibili nei metadati. Il budget resta fuori da
 * questo filtro e viene applicato dal percorso esistente.
 */
/**
 * "Dolce" usato come sostantivo indica un dessert, non qualunque alimento
 * descritto come dolce. Se la query nomina esplicitamente un altro prodotto
 * (vino, peperone, cipolla, miele), resta invece una ricerca di quell'alimento
 * con il relativo attributo.
 */
function richiestaDolceComeDessert(query: string, soggettoAlimentare: string): boolean {
  const soggetto = normalizza(soggettoAlimentare).trim();
  if (soggetto !== "dolce" && soggetto !== "dolci") return false;
  const testo = normalizza(query);
  return !/\b(?:vino|vini|wine|peperone|peperoni|pepper|peppers|cipolla|cipolle|onion|onions|miele|honey)\b/.test(testo);
}

/**
 * Classificazione positiva e conservativa dei dessert. Si basa su categoria/
 * sottocategoria o su nomi riconoscibili di dolci: la parola "dolce" in una
 * descrizione (es. peperone dolce, miele dolce) non è prova sufficiente.
 */
/**
 * Barriera riutilizzabile sull'intera risposta: va applicata anche dopo il
 * recupero semantico, che può aggiungere candidati non passati dal primo gate.
 * La query è quella originale dell'utente, non la query riscritta dal planner.
 */
export function filtraDessertRichiestoPino(
  prodotti: ProdottoRicerca[],
  queryOriginale: string
): ProdottoRicerca[] {
  const query = normalizza(queryOriginale);
  if (!/\bdolc[ei]\b/.test(query)) return prodotti;
  if (!richiestaDolceComeDessert(queryOriginale, "dolce")) return prodotti;
  return (prodotti ?? []).filter(prodottoEUnDessert);
}

function prodottoEUnDessert(prodotto: ProdottoRicerca): boolean {
  const nome = normalizza(prodotto.nome ?? "");
  const classificazione = normalizza(
    [prodotto.categoria, prodotto.sottocategoria].filter(Boolean).join(" ")
  );
  if (/\b(?:dolciumi|pasticceria|dessert|desserts|confectionery)\b/.test(classificazione)) {
    return true;
  }
  if (/\b(?:biscott[oi]|torrone|piparell[ae]|mostacciol[oi]|cannol[oi]|ciotaredd[ae]|crostata|tort[ae]|panettone|colomba|zeppol[ae]|pasticcin[oi]|gelato|brownie|cupcake|cake|cookies)\b/.test(nome)) {
    return true;
  }
  // Ciotaredda è un dolce locale: la classificazione è confermata dalla
  // descrizione tradizionale, non dalla semplice presenza dell'aggettivo.
  const dettagli = normalizza(
    [prodotto.descrizione, prodotto.descrizione_completa].filter(Boolean).join(" ")
  );
  return /\bciotaredd[ae]\b/.test(nome) &&
    /\b(?:dolcetto tradizionale|simile ai mostaccioli)\b/.test(dettagli);
}

/**
 * Restrizioni alimentari che non possono essere trattate come qualifiche
 * "morbide": mostrare pasta normale per «senza glutine» non è un'alternativa,
 * è un rischio. Restituisce l'etichetta canonica solo quando la richiesta la
 * contiene esplicitamente.
 */
export function restrizioneAlimentareRigidaPino(query: string): string | null {
  const q = normalizza(query);
  // La restrizione può essere espressa come qualifica del prodotto
  // («senza glutine») oppure come condizione della persona («sono celiaco»,
  // «ho un'allergia al lattosio»). Entrambe devono attivare lo stesso filtro:
  // una condizione dichiarata non è una preferenza morbida.
  if (
    /\bsenza\s+glutine\b|\bgluten\s*free\b|\b(?:celiac|ciliac)[oaie]\b|\b(?:celiachia|ciliachia)\b|\bintolleran(?:te|za)\s+al\s+glutine\b|\ballergi(?:a|co|ca)\s+al\s+glutine\b|\bsensibil[ei]\s+al\s+glutine\b/.test(q)
  ) {
    return "senza glutine";
  }
  if (
    /\bsenza\s+lattosio\b|\blactose\s*free\b|\bintolleran(?:te|za)\s+al\s+lattosio\b|\ballergi(?:a|co|ca)\s+al\s+lattosio\b/.test(q)
  ) {
    return "senza lattosio";
  }
  return null;
}

/**
 * Allergeni alimentari che il catalogo non sa verificare. Non basta il nome
 * dell'alimento: serve una condizione dichiarata («sono allergico», «ho
 * un'allergia», «sono intollerante»). Così «cerco noci» resta una ricerca
 * normale, mentre «sono allergico alle noci» non produce consigli non sicuri.
 */
const ALLERGENI_ALIMENTARI_PINO: ReadonlyArray<{ etichetta: string; re: RegExp }> = [
  { etichetta: "arachidi", re: /\barachid[ie]\b/ },
  {
    etichetta: "frutta a guscio",
    re: /\b(?:noci|noce|nocciole|nocciola|mandorle|mandorla|pistacchi|pistacchio|anacardi|anacardo|pecan|macadamia|frutta\s+a\s+guscio)\b/,
  },
  { etichetta: "uova", re: /\buov[oaie]\b/ },
  { etichetta: "soia", re: /\bsoia\b/ },
  { etichetta: "pesce", re: /\bpesce\b/ },
  { etichetta: "crostacei", re: /\bcrostace[oi]\b/ },
  { etichetta: "molluschi", re: /\bmollusch[oi]\b/ },
  { etichetta: "sesamo", re: /\bsesamo\b/ },
  { etichetta: "sedano", re: /\bsedano\b/ },
  { etichetta: "senape", re: /\bsenape\b/ },
  { etichetta: "solfiti", re: /\bsolfit[oi]\b/ },
  { etichetta: "lupini", re: /\blupin[oi]\b/ },
  {
    etichetta: "latte e latticini",
    re: /\b(?:latte|latticini|formaggi[oi]?|yogurt|burro|panna)\b/,
  },
];

const RE_CONDIZIONE_ALIMENTARE_PINO =
  /\b(?:allergic[oaie]|allergia|intolleran(?:te|za)|sensibil[ei])\b/;

/** Allergene alimentare esplicitamente associato a una condizione dichiarata. */
export function allergeneAlimentarePino(query: string): string | null {
  const q = normalizza(query);
  if (!RE_CONDIZIONE_ALIMENTARE_PINO.test(q)) return null;
  return ALLERGENI_ALIMENTARI_PINO.find(({ re }) => re.test(q))?.etichetta ?? null;
}

/**
 * Condizione alimentare dichiarata, in forma leggibile. `celiachia` e
 * `intolleranza al lattosio` hanno un filtro canonico; le altre allergie non
 * hanno un dato verificabile nel catalogo e vanno gestite senza consigli.
 */
export function condizioneAlimentarePino(query: string): string | null {
  const q = normalizza(query);
  if (
    /\b(?:celiac|ciliac)[oaie]\b|\b(?:celiachia|ciliachia)\b|\bintolleran(?:te|za)\s+al\s+glutine\b|\ballergi(?:a|co|ca)\s+al\s+glutine\b|\bsensibil[ei]\s+al\s+glutine\b/.test(q)
  ) {
    return "celiachia";
  }
  if (/\bintolleran(?:te|za)\s+al\s+lattosio\b|\ballergi(?:a|co|ca)\s+al\s+lattosio\b/.test(q)) {
    return "intolleranza al lattosio";
  }
  const allergene = allergeneAlimentarePino(q);
  return allergene ? `allergia a ${allergene}` : null;
}

export function prodottoDocumentaRestrizionePino(
  prodotto: ProdottoRicerca,
  restrizione: string
): boolean {
  const evidenza = normalizza(evidenzaMetadatiProdotto(prodotto));
  if (restrizione === "senza glutine") {
    return /\bsenza\s+glutine\b|\bgluten\s*free\b/.test(evidenza);
  }
  return /\bsenza\s+lattosio\b|\blactose\s*free\b/.test(evidenza);
}

export function filtraProdottiAlimentariPino(
  prodotti: ProdottoRicerca[],
  query: string,
  soggettoAlimentare: string
): ProdottoRicerca[] {
  const restrizione = restrizioneAlimentareRigidaPino(query);
  if (restrizione) {
    return prodotti.filter((prodotto) =>
      prodottoDocumentaRestrizionePino(prodotto, restrizione)
    );
  }
  const dessertRichiesto = richiestaDolceComeDessert(query, soggettoAlimentare);
  const pertinenti = prodotti.filter((prodotto) =>
    dessertRichiesto
      ? prodottoEUnDessert(prodotto)
      : prodottoPertinente(prodotto, [soggettoAlimentare], [])
  );
  const filtrati = filtraProdottiPerCaratteristicheRichieste(
    pertinenti,
    query,
    soggettoAlimentare
  );
  const conSottocategoria = filtraProdottiPerSottocategoriaRichiesta(
    filtrati,
    query,
    soggettoAlimentare
  );
  // Stessa degradazione morbida: la sottocategoria restringe quando è
  // documentata, altrimenti non azzera i prodotti già ammessi dal soggetto.
  return conSottocategoria.length > 0 ? conSottocategoria : filtrati;
}

/**
 * Gate di pertinenza per le richieste con un unico soggetto concreto.
 *
 * La ricerca pubblica tollera i refusi con wildcard ilike e per questo può
 * restituire parole diverse dal soggetto ("cane" → "pane"). Qui il prodotto è
 * ammesso solo se identifica davvero il soggetto, tramite le equivalenze già
 * note al motore condiviso (sinonimi diretti di prodotto, varianti
 * singolare/plurale, stessa famiglia lessicale). Il recupero del refuso
 * ("telefno" → "Telefono") scatta soltanto quando nessun prodotto identifica
 * il soggetto, così i risultati esatti hanno sempre la precedenza. Le
 * descrizioni generiche non contano: sarebbero proprio i falsi positivi da
 * evitare.
 */
export function filtraProdottiPerSoggettoUnico(
  prodotti: ProdottoRicerca[],
  soggettoUnico: string,
  queryCompleta: string = soggettoUnico
): ProdottoRicerca[] {
  // Il soggetto è il primo termine di contenuto: gli attributi ("nera", "in
  // legno") restano fuori dal controllo, quindi non c'è un AND sui termini e
  // una descrizione diversa nel catalogo non esclude un prodotto pertinente.
  const principale = soggettoPrincipalePino(soggettoUnico);
  if (!principale || SOGGETTI_GENERICI_PINO.has(principale)) return prodotti;
  const gruppo = SINONIMI_DIRETTI_PRODOTTO.find((voci) => voci.includes(principale));
  const soggetti = [principale, ...(gruppo ?? []).filter((voce) => voce !== principale)];
  const pertinenti = prodotti.filter((p) =>
    soggetti.some((soggetto) => prodottoIdentificaSoggetto(p, soggetto))
  );
  if (pertinenti.length > 0) {
    return filtraProdottiPerCaratteristicheRichieste(
      pertinenti,
      queryCompleta,
      undefined,
      principale
    );
  }

  // Seconda verifica controllata: il soggetto non compare nel prodotto, ma un
  // ponte concettuale curato sì ("luce" → "Lampada"). Non basta un attributo
  // generico ("esterno", "nero", "legno"): il concetto deve identificare i
  // metadati del prodotto, non la sua descrizione accessoria.
  const concetti = CONCETTI_SOGGETTO_PINO[principale] ?? [];
  if (concetti.length > 0) {
    const coerenti = prodotti.filter((p) =>
      concetti.some((concetto) => prodottoIdentificaSoggetto(p, concetto))
    );
    if (coerenti.length > 0) {
      return filtraProdottiPerCaratteristicheRichieste(
        coerenti,
        queryCompleta,
        undefined,
        principale
      );
    }
  }

  // Nessun prodotto identifica il soggetto: unico caso in cui proviamo il
  // refuso (sulla testa del nome prodotto), senza mai sostituire la parola
  // scritta dall'utente.
  return filtraProdottiPerCaratteristicheRichieste(
    prodotti.filter((p) => prodottoForseRefusoDiSoggetto(p, principale)),
    queryCompleta,
    undefined,
    principale
  );
}

// ─── S4.3: colore e materiale ────────────────────────────────────────────────

/**
 * Attributi descrittivi che Pino applica davvero ai prodotti (S4.3).
 *
 * Non sono un filtro rigido sul prezzo né sulla categoria: il soggetto della
 * richiesta resta il criterio principale. Qui si scarta solo ciò che
 * **contraddice** un attributo esplicito. Se il catalogo non dichiara il dato,
 * il prodotto resta ma Pino non afferma che possiede quell'attributo.
 */
export type AttributiProdottoPino = { colori?: string[]; materiali?: string[] };

export type EsitoAttributiProdottiPino = {
  prodotti: ProdottoRicerca[];
  /** Prodotti scartati perché contraddicono un attributo richiesto. */
  esclusi: number;
  /** Risultati conservati che non dichiarano il colore richiesto. */
  senzaColore: number;
  /** Risultati conservati che non dichiarano il materiale richiesto. */
  senzaMateriale: number;
  /** Colori richiesti effettivamente riscontrati su almeno un risultato. */
  coloriRiscontrati: string[];
  /** Materiali richiesti effettivamente riscontrati su almeno un risultato. */
  materialiRiscontrati: string[];
};

function testoAttributiProdotto(prodotto: ProdottoRicerca): string {
  // S5.3: il colore e il materiale strutturati sono la fonte primaria; il testo
  // libero resta il fallback per i prodotti che non li compilano. Includendo
  // entrambi, i sinonimi già gestiti (pelle/cuoio, nero/black) valgono in tutti
  // e due i casi senza introdurre un secondo vocabolario.
  return [
    prodotto?.colore,
    prodotto?.materiale,
    prodotto?.nome,
    prodotto?.descrizione,
    prodotto?.categoria,
  ]
    .filter((valore): valore is string => typeof valore === "string" && valore.trim().length > 0)
    .join(" ");
}

/**
 * Normalizza i valori richiesti nella forma canonica del vocabolario Pino:
 * "leather" → "pelle", "black" → "nero". Un valore sconosciuto al
 * vocabolario resta così com'è e viene confrontato alla lettera.
 */
function canoniciRichiesti(valori: string[] | undefined, dimensione: "colori" | "materiali"): string[] {
  const canonici = new Set<string>();
  for (const voce of valori ?? []) {
    const testo = String(voce ?? "").trim().toLowerCase();
    if (!testo) continue;
    const attributi = estraiAttributiPino(testo);
    const rilevati = attributi[dimensione];
    if (rilevati.length > 0) rilevati.forEach((v) => canonici.add(v));
    else canonici.add(testo);
  }
  return Array.from(canonici);
}

/**
 * Applica colore e materiale ai prodotti di un retrieval già avvenuto.
 *
 * Regola: un prodotto con colore/materiale **dichiarato e diverso** viene
 * scartato; un prodotto che non dichiara il dato viene conservato, perché
 * assenza di informazione non è contraddizione. Il confronto è case-insensitive
 * e passa dal vocabolario canonico ("cuoio" ≡ "pelle").
 */
export function filtraProdottiPerAttributiPino(
  prodotti: ProdottoRicerca[],
  attributi: AttributiProdottoPino = {}
): EsitoAttributiProdottiPino {
  const colori = canoniciRichiesti(attributi.colori, "colori");
  const materiali = canoniciRichiesti(attributi.materiali, "materiali");
  const esito: EsitoAttributiProdottiPino = {
    prodotti: prodotti ?? [],
    esclusi: 0,
    senzaColore: 0,
    senzaMateriale: 0,
    coloriRiscontrati: [],
    materialiRiscontrati: [],
  };
  if (colori.length === 0 && materiali.length === 0) return esito;

  const coloriTrovati = new Set<string>();
  const materialiTrovati = new Set<string>();
  const tenuti: ProdottoRicerca[] = [];

  for (const prodotto of prodotti ?? []) {
    const testo = testoAttributiProdotto(prodotto);
    const parole = new Set(normalizza(testo).split(/[^a-z0-9]+/).filter(Boolean));
    const rilevati = testo
      ? estraiAttributiPino(testo)
      : { colori: [] as string[], materiali: [] as string[] };
    const dichiaraColore =
      rilevati.colori.length > 0 || colori.some((colore) => parole.has(colore));
    const dichiaraMateriale =
      rilevati.materiali.length > 0 || materiali.some((materiale) => parole.has(materiale));
    const coloreCompatibile =
      colori.length === 0 ||
      !dichiaraColore ||
      colori.some((colore) => rilevati.colori.includes(colore) || parole.has(colore));
    const materialeCompatibile =
      materiali.length === 0 ||
      !dichiaraMateriale ||
      materiali.some(
        (materiale) => rilevati.materiali.includes(materiale) || parole.has(materiale)
      );

    if (!coloreCompatibile || !materialeCompatibile) {
      esito.esclusi += 1;
      continue;
    }

    tenuti.push(prodotto);
    if (colori.length > 0 && !dichiaraColore) esito.senzaColore += 1;
    if (materiali.length > 0 && !dichiaraMateriale) esito.senzaMateriale += 1;
    for (const colore of colori) {
      if (rilevati.colori.includes(colore) || parole.has(colore)) coloriTrovati.add(colore);
    }
    for (const materiale of materiali) {
      if (rilevati.materiali.includes(materiale) || parole.has(materiale)) {
        materialiTrovati.add(materiale);
      }
    }
  }

  esito.prodotti = tenuti;
  esito.coloriRiscontrati = colori.filter((colore) => coloriTrovati.has(colore));
  esito.materialiRiscontrati = materiali.filter((materiale) => materialiTrovati.has(materiale));
  return esito;
}

/**
 * Un prodotto rispetta una fascia VINCOLANTE solo con un prezzo reale dentro i
 * limiti: prezzo assente, zero o negativo non è mai "conforme al budget".
 */
export function prodottoRispettaBudgetPino(
  prodotto: ProdottoRicerca,
  limiti: { maxPrice?: number | null; minPrice?: number | null } = {}
): boolean {
  const prezzo = prezzoNumerico(prodotto?.prezzo);
  if (prezzo == null || prezzo <= 0) return false;
  if (limiti.maxPrice != null && prezzo > Number(limiti.maxPrice)) return false;
  if (limiti.minPrice != null && prezzo < Number(limiti.minPrice)) return false;
  return true;
}

export async function searchProducts(
  query: string,
  opts: ToolParams = {}
): Promise<ProdottoRicerca[]> {
  opts = validaToolParams("searchProducts", opts).params;
  const q = pulisciCorniceRicercaPino(query);
  if (!q) return [];

  // Budget vincolante solo quando il chiamante lo dichiara (limiti espliciti).
  const budgetRigido = opts.prezzoRigido === true && (opts.minPrice != null || opts.maxPrice != null);

  // Tetto esplicito pari a zero: nessun prodotto del catalogo ha prezzo <= 0,
  // quindi il vincolo rigido non può ammettere risultati. Si evita la query
  // senza trasformare lo zero in «budget assente».
  if (budgetRigido && opts.maxPrice != null && Number(opts.maxPrice) <= 0) return [];

  const opzioniRicerca = budgetRigido
    ? {
        prezzoMin: opts.minPrice ?? undefined,
        prezzoMax: opts.maxPrice ?? undefined,
        onErrore: segnalaErroreDatiPino,
      }
    : { onErrore: segnalaErroreDatiPino };
  const opzioniMorbide = { onErrore: segnalaErroreDatiPino };
  let opzioniRecupero = opzioniRicerca;

  // Per le ricerche di alimenti il negozio non deve contribuire alla
  // pertinenza: "pasta" non deve restituire taralli solo perché il venditore
  // si chiama "Mani in Pasta". Il soggetto deve identificare il prodotto
  // stesso (nome/categoria), non il nome dell'attività.
  // Il riconoscimento del soggetto alimentare è nella fonte unica del lessico
  // (`lexicon.ts`): qui non esiste una seconda lista da tenere allineata.
  const soggettoAlimentare = soggettoAlimentarePino(q);

  // FONTE UNICA DI VERITÀ: Pino interroga lo stesso Search Service della
  // ricerca pubblica. Il retrieval NON viene riscritto qui: dopo la ricerca
  // pubblica interviene solo un controllo di pertinenza Pino, limitato alle
  // richieste con un unico soggetto concreto (vedi sotto), per non mostrare
  // prodotti che il motore tollerante ha trovato solo per somiglianza.
  // I limiti arrivano alla query Supabase (gte/lte sul prezzo) solo in modalità
  // vincolante; senza budget il percorso resta identico a prima.
  let canonici = await searchCatalogoPubblico(q, opzioniRecupero);

  // D-1: il budget è una preferenza. Se il tetto rigido non restituisce nulla
  // (vino a €14,90 per «sotto 10 euro»), una seconda ricerca senza prezzo
  // permette di mostrare le alternative più vicine, etichettate come fuori
  // budget. Senza questa rete il vuoto del catalogo diventava un vuoto di
  // risposta, pur esistendo il prodotto.
  if (budgetRigido && (canonici.prodotti ?? []).length === 0) {
    opzioniRecupero = opzioniMorbide;
    canonici = await searchCatalogoPubblico(q, opzioniRecupero);
    console.info(
      "[pino-budget-morbido-retrieval]",
      JSON.stringify({
        maxPrice: opts.maxPrice ?? null,
        minPrice: opts.minPrice ?? null,
        alternative: (canonici.prodotti ?? []).length,
      })
    );
  }

  // La pasta è una categoria con molti nomi di formato: la query «pasta» non
  // recupera le Tagliatelle, il cui nome non contiene la parola. Una seconda
  // ricerca SOLO con i formati (stessi filtri di budget) completa il recupero;
  // la pertinenza resta decisa dal gate qui sotto. Per le altre categorie il
  // percorso resta identico.
  const perFormatoPasta =
    soggettoAlimentare === "pasta"
      ? await searchCatalogoPubblico(FORMATI_PASTA_PINO.slice(0, 10).join(" "), opzioniRecupero)
      : null;

  let filtrate = [
    ...(canonici.prodotti ?? []),
    ...(perFormatoPasta?.prodotti ?? []),
  ].filter((p) => prodottoSoddisfaEsclusioni(p, opts?.esclusioni));

  if (soggettoAlimentare) {
    filtrate = filtraProdottiAlimentariPino(
      filtrate,
      q,
      soggettoAlimentare
    );
  }

  // La ricerca pubblica tollera i refusi con wildcard ilike: "cane" produce
  // anche "%_ane%", che nel catalogo trova "pane". Per una richiesta con un
  // unico soggetto concreto applichiamo quindi il gate di pertinenza di Pino,
  // che accetta le equivalenze reali e rifiuta le somiglianze casuali. Le
  // frasi complesse restano gestite dal planner semantico e non vengono
  // ristrette qui, per non perdere recall utile.
  if (!soggettoAlimentare) {
    filtrate = filtraProdottiPerSoggettoUnico(filtrate, normalizzaQueryCatalogo(q), q);
  }

  // I filtri espliciti si applicano solo dopo il retrieval canonico.
  if (opts?.categoria?.trim()) {
    const categoria = normalizza(opts.categoria);
    filtrate = filtrate.filter((p) => normalizza(p.categoria ?? "").includes(categoria));
  }

  filtrate = await filtraProdottiPerVincoliNegozio(filtrate, opts);

  // S4.3: colore e materiale espliciti. Il filtro scarta solo ciò che li
  // contraddice; i prodotti che non dichiarano il dato restano (assenza di
  // informazione non è incompatibilità) e Pino non ne afferma la presenza.
  if (opts.colori?.length || opts.materiali?.length) {
    const esitoAttributi = filtraProdottiPerAttributiPino(filtrate, {
      colori: opts.colori,
      materiali: opts.materiali,
    });
    filtrate = esitoAttributi.prodotti;
  }

  if (opts?.escludiNomi?.length) {
    const esclusi = new Set(
      opts.escludiNomi
        .map((n) => String(n ?? "").trim().toLowerCase())
        .filter(Boolean)
    );
    filtrate = filtrate.filter(
      (p) => !esclusi.has(String(p.nome ?? "").trim().toLowerCase())
    );
  }

  // Prezzo come preferenza di ordinamento, mai come motivo per azzerare
  // la ricerca. Manteniamo anche i prodotti senza prezzo come nel motore
  // pubblico: non devono sparire solo perché il dato prezzo manca.
  const maxPrice = opts.maxPrice != null ? Number(opts.maxPrice) : null;
  const minPrice = opts.minPrice != null ? Number(opts.minPrice) : null;
  if (maxPrice !== null || minPrice !== null) {
    filtrate = ordinaProdottiPerBudget(filtrate, { maxPrice, minPrice });
    // Rete di sicurezza dopo i filtri di pertinenza/città/orari: nessun prodotto
    // fuori fascia (o senza prezzo) può sopravvivere a un vincolo esplicito.
    if (budgetRigido) {
      const conformi = filtrate.filter((p) =>
        prodottoRispettaBudgetPino(p, { maxPrice, minPrice })
      );
      // D-1: il budget è una preferenza, non un filtro assoluto. Se il vincolo
      // rigido azzera tutto (vino a €14,90 per «sotto 10 euro»), le alternative
      // ordinate per prezzo sono più utili di un vuoto: l'introduzione le
      // etichetta come fuori budget. Lo zero esplicito resta un vuoto.
      if (conformi.length > 0) {
        filtrate = conformi;
      } else {
        console.info(
          "[pino-budget-morbido]",
          JSON.stringify({ maxPrice, minPrice, alternative: filtrate.length })
        );
      }
    }
  }

  const deduplicate = deduplicaPerId(filtrate);
  // Classe calcolata internamente (non ancora mostrata all'utente).
  assegnaClassiProdotti(deduplicate, q);
  return deduplicate.slice(0, limita(opts.limit, 8, 20));
}

// ─── searchOffers ────────────────────────────────────────────────────────────

async function nomiNegozi(ids: string[]): Promise<Map<string, string>> {
  const unici = Array.from(new Set(ids.filter(Boolean)));
  if (unici.length === 0) return new Map();

  let db;
  try {
    db = createAdminSupabaseClient();
  } catch {
    return new Map();
  }

  const { data } = await db
    .from("negozi")
    .select("id, nome")
    .in("id", unici)
    .is("deleted_at", null);

  return new Map((data ?? []).map((n) => [String(n.id), String(n.nome ?? "")]));
}

/**
 * S1-A — Normalizza la query di offerte ed eventi con la stessa regola degli
 * altri parametri testuali (trim, caratteri di controllo, 120 caratteri).
 * Una query assente resta assente; una query valida resta identica.
 */
export function normalizzaQueryOfferteEventiPino(query: unknown): string {
  return (testoParametro(query) ?? "").toLowerCase();
}

export async function searchOffers(
  query?: string,
  limit = 8,
  segnalazione: SegnalazioneErroriDati = segnalazioneDatiPino
): Promise<OffertaAssistente[]> {
  const q = normalizzaQueryOfferteEventiPino(query);
  const offerte = await getOffertePubbliche(segnalazione);

  const filtrate = q
    ? offerte.filter(
        (o) =>
          (o.titolo ?? "").toLowerCase().includes(q) ||
          (o.descrizione ?? "").toLowerCase().includes(q)
      )
    : offerte;

  const nomi = await nomiNegozi(filtrate.map((o) => o.negozio_id));

  return filtrate.slice(0, limita(limit, 8, 8)).map((o) => ({
    id: String(o.id),
    titolo: o.titolo,
    descrizione: tronca(o.descrizione, 180),
    prezzo_originale: o.prezzo_originale,
    prezzo_offerta: o.prezzo_offerta,
    negozio_nome: nomi.get(String(o.negozio_id)) ?? "",
    data_fine: o.data_fine,
  }));
}

// ─── searchEvents ────────────────────────────────────────────────────────────

export async function searchEvents(
  query?: string,
  limit = 8,
  segnalazione: SegnalazioneErroriDati = segnalazioneDatiPino,
  periodo: PeriodoEventiPino | null = null
): Promise<EventoAssistente[]> {
  const q = normalizzaQueryOfferteEventiPino(query);
  const eventi = await getEventiPubblici(segnalazione);

  // Il periodo è un filtro reale sulle date dell'evento, non una keyword. Un
  // evento senza data non può essere confermato in un intervallo esplicito.
  const nelPeriodo = periodo
    ? eventi.filter((evento) => eventoNelPeriodoPino(evento, periodo))
    : eventi;

  const filtrati = q
    ? nelPeriodo.filter(
        (e) =>
          (e.titolo ?? "").toLowerCase().includes(q) ||
          (e.descrizione ?? "").toLowerCase().includes(q) ||
          (e.luogo ?? "").toLowerCase().includes(q)
      )
    : nelPeriodo;

  const nomi = await nomiNegozi(filtrati.map((e) => e.negozio_id));

  return filtrati.slice(0, limita(limit, 8, 8)).map((e) => ({
    id: String(e.id),
    titolo: e.titolo,
    descrizione: tronca(e.descrizione, 180),
    luogo: e.luogo,
    data_inizio: e.data_inizio,
    negozio_nome: nomi.get(String(e.negozio_id)) ?? "",
  }));
}

// ─── getCategories ───────────────────────────────────────────────────────────

/**
 * M6-C2 — elenco categorie con i conteggi reali.
 *
 * La segnalazione e' opzionale: assente = comportamento storico (nessuna
 * eccezione, conteggi eventualmente a zero). Il tool getCategories usa
 * l'adapter Pino, cosi' un guasto delle query non diventa "ogni categoria ha
 * zero negozi"; il fallback di searchAll resta tollerante per non
 * trasformare un guasto in un errore di route.
 */
async function elencoCategorie(
  segnalazione?: SegnalazioneErroriDati,
  dbIniettato?: Parameters<typeof getCategorieConNegozi>[1]
): Promise<{ nome: string; count: number }[]> {
  const categorie = await getCategorieConNegozi(segnalazione, dbIniettato);
  return categorie
    .map((c) => ({ nome: String(c.categoria?.nome ?? ""), count: c.count }))
    .filter((c) => c.nome)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

/**
 * Tool getCategories: con l'adapter Pino un errore dati diventa
 * ErroreDatiNonDisponibiliPino e M6-A lo classifica come "errore".
 * Il parametro opzionale esiste solo per i test (client iniettato).
 */
export async function getCategoriesList(
  dbIniettato?: Parameters<typeof getCategorieConNegozi>[1]
): Promise<{ nome: string; count: number }[]> {
  return elencoCategorie(segnalazioneDatiPino, dbIniettato);
}

// ─── searchAll ───────────────────────────────────────────────────────────────

// ─── Orari (solo lettura) per il follow-up "aperti ora" ──────────────────────
// Gli orari non sono parte di NegozioRicerca (condiviso con la ricerca pubblica):
// li leggiamo a parte, solo per gli id già pertinenti, e solo nel flusso di Pino.
// In caso di errore NON inventiamo nulla: la mappa resta vuota e lo stato
// risulterà non verificabile.
export async function orariPerNegozi(
  ids: string[]
): Promise<Map<string, Orari | null>> {
  const mappa = new Map<string, Orari | null>();
  const unici = Array.from(new Set(ids.filter(Boolean)));
  if (unici.length === 0) return mappa;
  try {
    const db = createAdminSupabaseClient();
    const { data, error } = await db.from("negozi").select("id,orari").in("id", unici);
    if (error) throw error;
    for (const r of (data ?? []) as { id: string; orari: Orari | null }[]) {
      mappa.set(String(r.id), r.orari ?? null);
    }
  } catch (err) {
    console.warn(
      "[assistente] orari non disponibili:",
      (err as { message?: string })?.message ?? err
    );
  }
  return mappa;
}

export async function searchAll(
  query: string,
  opts: ToolParams = {}
): Promise<RisultatoRicercaCompleta> {
  opts = validaToolParams("searchAll", opts).params;
  const q = pulisciCorniceRicercaPino(query);
  if (!q) {
    return { negozi: [], prodotti: [], offerte: [], eventi: [], categorie: [], meteo: null, farmacie: [] };
  }

  const [negozi, prodotti, offerte, eventi, categorie] = await Promise.all([
    // I vincoli compatibili (città, esclusioni, orari) valgono anche per i
    // negozi: il percorso di fallback non deve aggirare i filtri del piano.
    searchStores(q, { ...opts, limit: 6 }),
    searchProducts(q, { ...opts, limit: 8 }),
    // M6-C3: il fallback di ricerca completa resta tollerante (segnalazione
    // vuota), per non trasformare un guasto dati in un errore di route.
    searchOffers(q, 5, {}),
    searchEvents(q, 5, {}),
    elencoCategorie(),
  ]);

  return { negozi, prodotti, offerte, eventi, categorie, meteo: null, farmacie: [] };
}
