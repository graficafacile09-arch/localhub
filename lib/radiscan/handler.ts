import { randomBytes, randomUUID } from "node:crypto";
import { analizzaProdotto } from "./analisi";
import {
  cacheVerificataAncoraValida,
  creaChiaveCache,
  creaRigaCache,
  selezionaEsitoInCache,
  type ChiaveCache,
  type RigaCache,
} from "./cache";
import { CODICI_ERRORE, ErroreRadiciScan } from "./errori";
import type { FonteUfficiale } from "./fonti";
import { ipAttendibile } from "./identita";
import type { ImmagineValida } from "./immagine";
import type { MotoreOcr } from "./ocr";
import {
  serializzaEvento,
  TIPO_CONTENUTO_PROGRESSIVO,
  vuoleProgressivo,
  type EventoProgressivo,
} from "./progressivo";
import {
  creaChiaveQuotaAnonima,
  creaChiaveQuotaAutenticata,
  descriviEccezioneQuota,
  type EsitoQuota,
  type ModalitaQuota,
} from "./quote";
import { VERSIONE_PROMPT } from "./prompt";
import { estraiImmagine } from "./richiesta";
import type { RepositoryRadiciScan, RigaAnalisi } from "./repository";
import type {
  EsitoAnalisi,
  MetaAnalisi,
  ProviderRadiciScan,
  ProviderRicercaDocumentale,
  SchedaProdottoBarcode,
} from "./tipi";
import type { ProviderRicercaWeb } from "./web";

/**
 * RadiciScan — handler della route `POST /api/radiscan/analisi`.
 *
 * Ordine obbligatorio:
 *   identità → immagine → QUOTA → cache → registro → AI → registrazione.
 *
 * Regole non negoziabili:
 * - nessuna analisi senza una risposta positiva della RPC delle quote;
 * - qualunque anomalia di quota, identificazione o database => 503;
 * - nessun dettaglio interno, nessun segreto, nessuna immagine nelle risposte;
 * - la cache viene consultata solo dopo aver consumato la quota;
 * - un verificato in cache si restituisce solo se la fonte è ancora valida;
 * - senza `RADISCAN_CACHE_SECRET` la cache è disattivata, non l'analisi.
 */

/** Deve restare sotto il `maxDuration` della route (30 s): un timeout interno
 * più lungo verrebbe ucciso dalla piattaforma senza risposta JSON. */
const TIMEOUT_ANALISI_MS = 18_000;
/** Budget circoscritto alla sola registrazione: 18 s + 4 s resta sotto il
 * `maxDuration` di 30 s, così un database lento non porta via l'esito. */
const TIMEOUT_REGISTRAZIONE_MS = 4_000;
const SALE_MINIMO = 16;
/** Sale di ripiego per processo, generato solo se `RADISCAN_QUOTA_SALT` manca. */
let saleQuotaDiProcesso: string | null = null;

/** `true` solo se il lavoro si chiude entro il budget; `false` su errore o
 * timeout. La promessa originale non viene annullata: chi chiama ha già
 * tutto ciò che serve per rispondere. */
async function entroBudget(lavoro: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      lavoro,
      new Promise<never>((_, rifiuta) => {
        timer = setTimeout(() => rifiuta(new Error("timeout")), ms);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface DipendenzeHandler {
  utenteCorrente: () => Promise<{ id: string } | null>;
  creaRepository: () => RepositoryRadiciScan | Promise<RepositoryRadiciScan>;
  creaProvider: () => ProviderRadiciScan;
  /** Provider documentale; la route passa eAmbrosia. */
  creaRicerca?: () => ProviderRicercaDocumentale;
  /** Motore OCR delle etichette; assente => OCR dichiarato non eseguito. */
  creaOcr?: () => MotoreOcr;
  /** Ricerca web multifonte. */
  creaWeb?: () => ProviderRicercaWeb;
  /** Interrogazione della banca dati prodotti per codice a barre. */
  creaBarcode?: (codice: string) => Promise<SchedaProdottoBarcode>;
  saleQuota: string | null;
  /** Segreto HMAC della cache: assente => nessun riuso della cache. */
  segretoCache?: string | null;
  /** Hash SHA-256 del cookie anonimo, calcolato esclusivamente dal server. */
  sessioneAnonimaHash?: () => string | null;
  adesso?: () => Date;
}

interface RispostaJson {
  success: boolean;
  [chiave: string]: unknown;
}

function json(
  corpo: RispostaJson,
  stato: number,
  intestazioni: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(corpo), {
    status: stato,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...intestazioni,
    },
  });
}

function errore(
  stato: number,
  codice: string,
  messaggio: string,
  debugCode?: string
): Response {
  return json(
    {
      success: false,
      errore: {
        codice,
        messaggio,
        ...(debugCode ? { dettaglio: debugCode } : {}),
      },
    },
    stato
  );
}

/** Codici tecnici stabili: mai chiavi, URL o contenuto dell'immagine. */
export const DEBUG_CODICI = {
  MISSING_KEYS: "MISSING_KEYS",
  QUOTA_ERR: "QUOTA_ERR",
  REGISTRO_ERR: "REGISTRO_ERR",
  VISION_ERR: "VISION_ERR",
  VISION_TIMEOUT: "VISION_TIMEOUT",
  VISION_QUOTA: "VISION_QUOTA",
  SCHEMA_ERR: "SCHEMA_ERR",
  CONFIG_ERR: "CONFIG_ERR",
} as const;

interface DettaglioErrore {
  stato: number;
  codice: string;
  messaggio: string;
  debugCode?: string;
}

/** Messaggi pubblici: nessun dettaglio di provider, database o configurazione. */
function dettaglioErrore(causa: unknown): DettaglioErrore {
  if (!(causa instanceof ErroreRadiciScan)) {
    return {
      stato: 500,
      codice: "ERRORE_INTERNO",
      messaggio: "Errore interno. Riprova più tardi.",
      debugCode: nomeSicuro(causa),
    };
  }

  switch (causa.codice) {
    case CODICI_ERRORE.INPUT_NON_VALIDO:
      return { stato: 400, codice: "RICHIESTA_NON_VALIDA", messaggio: causa.message };
    case CODICI_ERRORE.IMMAGINE_TROPPO_GRANDE:
      return {
        stato: 413,
        codice: "IMMAGINE_TROPPO_GRANDE",
        messaggio: "L'immagine supera il limite consentito.",
      };
    case CODICI_ERRORE.MIME_NON_SUPPORTATO:
      return {
        stato: 415,
        codice: "FORMATO_NON_SUPPORTATO",
        messaggio: "Formato dell'immagine non supportato.",
      };
    case CODICI_ERRORE.SESSIONE_NON_VALIDA:
      return { stato: 401, codice: "SESSIONE_NON_VALIDA", messaggio: "Sessione non valida." };
    case CODICI_ERRORE.SCHEMA_NON_VALIDO:
      return {
        stato: 502,
        codice: "RISPOSTA_AI_NON_VALIDA",
        messaggio: "Il servizio di analisi ha restituito un esito non valido.",
        debugCode: DEBUG_CODICI.SCHEMA_ERR,
      };
    case CODICI_ERRORE.PROVIDER_TIMEOUT:
      return {
        stato: 504,
        codice: "ANALISI_SCADUTA",
        messaggio: "L'analisi ha impiegato troppo tempo. Riprova.",
        debugCode: DEBUG_CODICI.VISION_TIMEOUT,
      };
    case CODICI_ERRORE.PROVIDER_QUOTA:
      return {
        stato: 503,
        codice: "ANALISI_NON_DISPONIBILE",
        messaggio: "Servizio di analisi non disponibile. Riprova più tardi.",
        debugCode: DEBUG_CODICI.VISION_QUOTA,
      };
    case CODICI_ERRORE.PROVIDER_RETE:
    case CODICI_ERRORE.PROVIDER_RISPOSTA:
      return {
        stato: 502,
        codice: "ANALISI_NON_RIUSCITA",
        messaggio: "Il servizio di analisi non ha risposto correttamente.",
        debugCode: DEBUG_CODICI.VISION_ERR,
      };
    case CODICI_ERRORE.PROVIDER_MODELLO:
      return {
        stato: 503,
        codice: "MODELLO_NON_DISPONIBILE",
        messaggio: "Il modello di riconoscimento non è disponibile. Riprova più tardi.",
        debugCode: DEBUG_CODICI.VISION_ERR,
      };
    case CODICI_ERRORE.PROVIDER_CONFIGURAZIONE:
      return {
        stato: 503,
        codice: "CONFIGURAZIONE_NON_DISPONIBILE",
        messaggio: "Il servizio di riconoscimento non è configurato correttamente.",
        debugCode: DEBUG_CODICI.MISSING_KEYS,
      };
    case CODICI_ERRORE.QUOTA_NON_DISPONIBILE:
    case CODICI_ERRORE.QUOTA_CONFIGURAZIONE:
      return {
        stato: 503,
        codice: "QUOTA_NON_DISPONIBILE",
        messaggio: "Non riesco a verificare la quota. Riprova tra poco.",
      };
    default:
      return {
        stato: 500,
        codice: "ERRORE_INTERNO",
        messaggio: "Errore interno. Riprova più tardi.",
        debugCode: nomeSicuro(causa),
      };
  }
}

/** `name: message` troncato, senza stack: serve a diagnosticare un ERRORE_INTERNO. */
function nomeSicuro(causa: unknown): string {
  if (causa instanceof Error) {
    return `${causa.name}: ${causa.message.slice(0, 120)}`;
  }
  return "UNKNOWN";
}

function rispostaErrore(causa: unknown): Response {
  const dettaglio = dettaglioErrore(causa);
  return errore(dettaglio.stato, dettaglio.codice, dettaglio.messaggio, dettaglio.debugCode);
}

/**
 * Costruisce la riga di `radiscan_analisi` e verifica gli invarianti della 2A:
 * verificato => fonte UUID + snapshot; non verificato => nessuno snapshot;
 * `fonteId` sempre identico alla fonte dell'esito.
 */
export function rigaDaEsito(input: {
  esito: EsitoAnalisi;
  meta: MetaAnalisi;
  modalita: ModalitaQuota;
  utenteId: string | null;
  impronta: string | null;
  richiestaId: string;
  sessioneAnonimaHash?: string | null;
}): RigaAnalisi {
  const { esito, meta, modalita, utenteId, impronta, richiestaId, sessioneAnonimaHash } = input;
  const verificato = esito.livello === "verificato";

  if (verificato && (!esito.fonteId || !esito.denominazioneVerificata)) {
    throw new ErroreRadiciScan(
      CODICI_ERRORE.SCHEMA_NON_VALIDO,
      "Invariante violata: verificato senza fonte o snapshot."
    );
  }
  if (!verificato && esito.denominazioneVerificata !== null) {
    throw new ErroreRadiciScan(
      CODICI_ERRORE.SCHEMA_NON_VALIDO,
      "Invariante violata: snapshot senza livello verificato."
    );
  }
  if (esito.fonteId && esito.verifica.fonte?.id !== esito.fonteId) {
    throw new ErroreRadiciScan(
      CODICI_ERRORE.SCHEMA_NON_VALIDO,
      "Invariante violata: fonte_id diverso da esito.fonteId."
    );
  }

  return {
    richiestaId,
    modalita,
    utenteId,
    improntaImmagine: impronta,
    livello: esito.livello,
    esito,
    fonteId: esito.fonteId,
    denominazioneVerificata: esito.denominazioneVerificata,
    provider: meta.provider,
    modello: meta.modello,
    durataMs: meta.durataMs,
    esitoTecnico: "ok",
    codiceErrore: null,
    sessioneAnonimaHash: modalita === "anonimo" ? sessioneAnonimaHash ?? null : null,
  };
}

interface ContestoAnalisi {
  repository: RepositoryRadiciScan;
  utenteId: string | null;
  modalita: ModalitaQuota;
  immagine: ImmagineValida;
  chiaveCache: ChiaveCache | null;
  istante: Date;
  daCache: EsitoAnalisi | null;
  registro: FonteUfficiale[] | null;
  provider: ProviderRadiciScan | null;
}

type EsecuzioneAnalisi =
  | { tipo: "ok"; esito: EsitoAnalisi; meta: MetaAnalisi; cache: boolean }
  | {
      tipo: "errore";
      statoHttp: number;
      codice: string;
      messaggio: string;
      debugCode?: string;
    };

export function creaHandlerAnalisi(dipendenze: DipendenzeHandler) {
  /**
   * Esecuzione dell'analisi già autorizzata: quota consumata, cache valutata,
   * registro e provider pronti. Registra l'analisi e scrive la cache una sola
   * volta, qualunque sia il trasporto (JSON o NDJSON).
   */
  async function eseguiAnalisi(
    contesto: ContestoAnalisi,
    signal: AbortSignal | undefined,
    onEvento?: (evento: EventoProgressivo) => void
  ): Promise<EsecuzioneAnalisi> {
    let lavoro: { esito: EsitoAnalisi; meta: MetaAnalisi; cache: boolean };

    if (contesto.daCache) {
      lavoro = {
        esito: contesto.daCache,
        cache: true,
        meta: {
          provider: "cache",
          modello: VERSIONE_PROMPT,
          durataMs: 0,
          versionePrompt: VERSIONE_PROMPT,
        },
      };
    } else {
      const { provider, registro } = contesto;
      if (!provider || !registro) {
        return {
          tipo: "errore",
          statoHttp: 503,
          codice: "ANALISI_NON_DISPONIBILE",
          messaggio: "Servizio di analisi non disponibile.",
          debugCode: DEBUG_CODICI.MISSING_KEYS,
        };
      }

      // Il timeout resta quello della Production (18 s). Il segnale esterno
      // (chiusura della connessione o annullamento dello stream) interrompe
      // provider, eAmbrosia e ricerca web in corso.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_ANALISI_MS);
      const annulla = () => controller.abort();
      if (signal?.aborted) {
        controller.abort();
      } else {
        signal?.addEventListener("abort", annulla, { once: true });
      }

      try {
        const risultato = await analizzaProdotto(
          {
            immagineBase64: contesto.immagine.base64,
            mimeType: contesto.immagine.mime,
            improntaImmagine: contesto.immagine.impronta ?? undefined,
            codiceBarre: contesto.immagine.codiceBarre ?? null,
          },
          {
            provider,
            ricerca: dipendenze.creaRicerca?.(),
            ocr: dipendenze.creaOcr?.(),
            web: dipendenze.creaWeb?.(),
            cercaBarcode: dipendenze.creaBarcode,
            registro,
            signal: controller.signal,
            onEvento,
          }
        );
        lavoro = { esito: risultato.esito, meta: risultato.meta, cache: false };
      } catch (causa) {
        const dettaglio = dettaglioErrore(causa);
        return {
          tipo: "errore",
          statoHttp: dettaglio.stato,
          codice: dettaglio.codice,
          messaggio: dettaglio.messaggio,
          debugCode: dettaglio.debugCode,
        };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", annulla);
      }
    }

    const { esito, meta, cache } = lavoro;

    // ── Rigenerazione della riga di archivio (una sola volta) ────────────
    let riga: RigaAnalisi;
    try {
      riga = rigaDaEsito({
        esito,
        meta,
        modalita: contesto.modalita,
        utenteId: contesto.utenteId,
        impronta: contesto.immagine.impronta,
        richiestaId: randomUUID(),
        sessioneAnonimaHash: dipendenze.sessioneAnonimaHash?.() ?? null,
      });
    } catch (causa) {
      return {
        tipo: "errore",
        statoHttp: 500,
        codice: "ERRORE_INTERNO",
        messaggio: "Errore interno. Riprova più tardi.",
        debugCode: nomeSicuro(causa),
      };
    }

    // ── Registrazione dell'esito (best-effort, una sola volta) ───────────
    // La persistenza è distinta dal giudizio: se la scrittura fallisce o
    // resta appesa oltre il budget, l'esito già composto e validato viene
    // comunque consegnato, con un'indicazione neutra, e la cache non viene
    // scritta (nessun riuso di un esito non registrato).
    const registrata = await entroBudget(
      contesto.repository.registraAnalisi(riga),
      TIMEOUT_REGISTRAZIONE_MS
    );

    if (!registrata) {
      return {
        tipo: "ok",
        cache: false,
        meta,
        esito: {
          ...esito,
          persistenza: {
            salvata: false,
            motivo: "Registrazione non confermata entro il tempo previsto. Il giudizio è disponibile; lo stato del salvataggio non è verificato.",
          },
        },
      };
    }

    // La scrittura in cache è best-effort: non fa fallire un'analisi già
    // registrata e non introduce dati sensibili. Senza chiave HMAC non si
    // scrive nulla. Un errore della ricerca documentale non viene cachato:
    // altrimenti un timeout di eAmbrosia diventerebbe un'assenza di prove
    // per trenta giorni.
    const ricercaNonRiuscita = esito.verifica.ricerca?.stato === "non_disponibile";
    if (!cache && contesto.chiaveCache && !ricercaNonRiuscita) {
      try {
        await contesto.repository.scriviCache(
          creaRigaCache(contesto.chiaveCache, esito, contesto.istante)
        );
      } catch {
        // nessuna azione: la prossima richiesta rifarà l'analisi
      }
    }

    return { tipo: "ok", esito, meta, cache };
  }

  /**
   * Trasporto NDJSON: un evento per riga, emesso quando il dato è reale.
   * Lo status HTTP è già 200, quindi gli errori successivi viaggiano come
   * evento `errore` con lo stato che la variante JSON avrebbe usato.
   */
  function rispostaProgressiva(contesto: ContestoAnalisi, request: Request): Response {
    const codifica = new TextEncoder();
    const controller = new AbortController();
    let chiuso = false;

    const suAnnullaRichiesta = () => controller.abort();
    if (request.signal.aborted) {
      controller.abort();
    } else {
      request.signal.addEventListener("abort", suAnnullaRichiesta, { once: true });
    }

    const corpo = new ReadableStream<Uint8Array>({
      async start(stream) {
        const invia = (evento: EventoProgressivo) => {
          if (chiuso) return;
          try {
            stream.enqueue(codifica.encode(serializzaEvento(evento)));
          } catch {
            // Stream già chiuso dal client: si interrompe il lavoro residuo.
            chiuso = true;
            controller.abort();
          }
        };

        try {
          const risultato = await eseguiAnalisi(contesto, controller.signal, invia);
          if (risultato.tipo === "errore") {
            invia({
              evento: "errore",
              errore: { codice: risultato.codice, messaggio: risultato.messaggio },
              stato: risultato.statoHttp,
            });
            return;
          }
          // Esito definitivo: emesso solo dopo la registrazione e la cache.
          invia({
            evento: "esito",
            preliminare: false,
            esito: risultato.esito,
            meta: risultato.meta,
            cache: risultato.cache,
          });
        } finally {
          request.signal.removeEventListener("abort", suAnnullaRichiesta);
          if (!chiuso) {
            chiuso = true;
            try {
              stream.close();
            } catch {
              // stream già chiuso dal client
            }
          }
        }
      },
      cancel() {
        // Il client ha abbandonato la lettura: si annullano provider, ricerca
        // documentale e ricerca web ancora in corso.
        chiuso = true;
        controller.abort();
        request.signal.removeEventListener("abort", suAnnullaRichiesta);
      },
    });

    return new Response(corpo, {
      status: 200,
      headers: {
        "Content-Type": TIPO_CONTENUTO_PROGRESSIVO,
        "Cache-Control": "no-store",
        // Evita che un proxy accumuli gli eventi prima di consegnarli.
        "X-Accel-Buffering": "no",
      },
    });
  }

  return async function POST(request: Request): Promise<Response> {
    const adesso = dipendenze.adesso ?? (() => new Date());
    const progressivo = vuoleProgressivo(request);

    // ── Repository (service-role) ──────────────────────────────────────────
    let repository: RepositoryRadiciScan;
    try {
      repository = await dipendenze.creaRepository();
    } catch (causa) {
      console.error("[radiscan][repository]", {
        fase: "creazione",
        ...descriviEccezioneQuota(causa),
      });
      return errore(
        503,
        "SERVIZIO_NON_DISPONIBILE",
        "Servizio non disponibile. Riprova più tardi.",
        DEBUG_CODICI.CONFIG_ERR
      );
    }

    // ── Identità: sessione verificata oppure IP attendibile + sale ─────────
    let utenteId: string | null = null;
    let modalita: ModalitaQuota = "anonimo";
    let chiaveQuota: string;

    try {
      const utente = await dipendenze.utenteCorrente();
      if (utente) {
        utenteId = utente.id;
        modalita = "autenticato";
        chiaveQuota = creaChiaveQuotaAutenticata(utente.id);
      } else {
        const ip = ipAttendibile(request);
        if (!ip) {
          return errore(
            503,
            "IDENTIFICAZIONE_NON_DISPONIBILE",
            "Non riesco a verificare la quota. Riprova più tardi.",
            DEBUG_CODICI.CONFIG_ERR
          );
        }
        // Senza `RADISCAN_QUOTA_SALT` si usa un sale casuale di processo: la
        // quota anonima resta pseudonimizzata e non blocca la scansione. Il
        // contatore si azzera al riavvio del processo, quindi va configurato.
        let sale = (dipendenze.saleQuota ?? "").trim();
        if (sale.length < SALE_MINIMO) {
          if (!saleQuotaDiProcesso) {
            saleQuotaDiProcesso = randomBytes(32).toString("hex");
            console.warn("[radiscan][config]", {
              debugCode: "CONFIG_ERR",
              chiave: "RADISCAN_QUOTA_SALT",
              esito: "sale di processo casuale",
            });
          }
          sale = saleQuotaDiProcesso;
        }
        chiaveQuota = creaChiaveQuotaAnonima(ip, sale);
      }
    } catch (causa) {
      if (causa instanceof ErroreRadiciScan && causa.codice === CODICI_ERRORE.SESSIONE_NON_VALIDA) {
        return rispostaErrore(causa);
      }
      return errore(
        503,
        "IDENTIFICAZIONE_NON_DISPONIBILE",
        "Non riesco a verificare la quota.",
        DEBUG_CODICI.CONFIG_ERR
      );
    }

    // ── Immagine: validata prima di consumare quota ────────────────────────
    let immagine: ImmagineValida;
    try {
      immagine = await estraiImmagine(request, dipendenze.segretoCache ?? null);
    } catch (causa) {
      return rispostaErrore(causa);
    }

    // ── Quota: best-effort ─────────────────────────────────────────────────
    // Un errore della RPC o una tabella mancante non devono impedire la
    // scansione: si prosegue senza quota verificata. Il superamento dei
    // limiti resta comunque bloccante quando il database risponde.
    let quota: EsitoQuota | null = null;
    try {
      quota = await repository.consumaQuota(chiaveQuota, modalita);
    } catch (causa) {
      console.error("[radiscan][quota]", {
        fase: "handler_quota_catch",
        modalita,
        debugCode: "QUOTA_ERR",
        ...descriviEccezioneQuota(causa),
      });
    }

    if (quota && !quota.consentita) {
      return json(
        {
          success: false,
          errore: { codice: "QUOTA_SUPERATA", messaggio: quota.motivo },
          quota: {
            usatiOggi: quota.usatiOggi,
            limiteGiorno: quota.limiteGiorno,
            limiteMinuto: quota.limiteMinuto,
          },
        },
        429,
        {
          "Retry-After": String(quota.riprovaTraSecondi),
          "X-RadiciScan-Limite-Giorno": String(quota.limiteGiorno),
          "X-RadiciScan-Limite-Minuto": String(quota.limiteMinuto),
        }
      );
    }

    // ── Cache: solo dopo la quota, mai per esiti di prompt precedenti ──────
    const istante = adesso();
    // Senza segreto HMAC non esiste una chiave sicura: nessun riuso.
    const chiaveCache: ChiaveCache | null = immagine.impronta
      ? creaChiaveCache(immagine.impronta, VERSIONE_PROMPT)
      : null;

    let daCache: EsitoAnalisi | null = null;
    if (chiaveCache) {
      try {
        const riga: RigaCache | null = await repository.leggiCache(chiaveCache, istante);
        daCache = riga ? selezionaEsitoInCache([riga], chiaveCache, istante) : null;
      } catch {
        daCache = null; // cache non disponibile: si prosegue con l'analisi
      }
    }

    // Un verificato in cache vale solo con la fonte ancora valida e identica.
    let registroPrecaricato: FonteUfficiale[] | null = null;
    if (daCache && daCache.livello === "verificato") {
      try {
        registroPrecaricato = await repository.leggiRegistro();
      } catch (causa) {
        // Senza registro non si può rivalidare la cache: si ignora la cache
        // verificata e si rifà l'analisi, invece di bloccare l'utente.
        console.error("[radiscan][registro]", {
          fase: "cache_verificata",
          debugCode: "REGISTRO_ERR",
          ...descriviEccezioneQuota(causa),
        });
        daCache = null;
      }
      if (daCache && !cacheVerificataAncoraValida(daCache, registroPrecaricato ?? [])) {
        daCache = null;
      }
    }

    // ── Registro ufficiale (solo server) ────────────────────────────────
    // Serve negli stessi due casi di prima: una cache verificata va
    // rivaldata, un'analisi nuova lo richiede. Un esito non verificato in
    // cache non lo carica, come nella versione JSON.
    let registro: FonteUfficiale[] | null = registroPrecaricato;
    if ((!daCache || daCache.livello === "verificato") && !registro) {
      try {
        registro = await repository.leggiRegistro();
      } catch (causa) {
        // Il registro serve alla verifica documentale, non al riconoscimento:
        // se non è leggibile si prosegue con un registro vuoto e l'esito
        // resta non verificato, invece di restituire 503.
        console.error("[radiscan][registro]", {
          fase: "analisi",
          debugCode: "REGISTRO_ERR",
          ...descriviEccezioneQuota(causa),
        });
        registro = [];
      }
    }

    // Il provider si crea solo per un'analisi reale, mai per una cache hit.
    let provider: ProviderRadiciScan | null = null;
    if (!daCache) {
      try {
        provider = dipendenze.creaProvider();
      } catch (causa) {
        console.error("[radiscan][provider]", {
          fase: "creazione",
          debugCode: "MISSING_KEYS",
          ...descriviEccezioneQuota(causa),
        });
        return errore(
          503,
          "ANALISI_NON_DISPONIBILE",
          "Servizio di analisi non disponibile.",
          DEBUG_CODICI.MISSING_KEYS
        );
      }
    }

    const contesto: ContestoAnalisi = {
      repository,
      utenteId,
      modalita,
      immagine,
      chiaveCache,
      istante,
      daCache,
      registro,
      provider,
    };

    // Senza `Accept: application/x-ndjson` la risposta resta identica a prima.
    if (!progressivo) {
      const risultato = await eseguiAnalisi(contesto, request.signal);
      if (risultato.tipo === "errore") {
        return errore(risultato.statoHttp, risultato.codice, risultato.messaggio);
      }
      return json(
        { success: true, esito: risultato.esito, meta: risultato.meta, cache: risultato.cache },
        200,
        { "Cache-Control": "no-store" }
      );
    }

    return rispostaProgressiva(contesto, request);
  };
}
