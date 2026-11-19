import { randomUUID } from "node:crypto";
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
import {
  creaChiaveQuotaAnonima,
  creaChiaveQuotaAutenticata,
  type EsitoQuota,
  type ModalitaQuota,
} from "./quote";
import { VERSIONE_PROMPT } from "./prompt";
import { estraiImmagine } from "./richiesta";
import type { RepositoryRadiciScan, RigaAnalisi } from "./repository";
import type { EsitoAnalisi, MetaAnalisi, ProviderRadiciScan } from "./tipi";

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

const TIMEOUT_ANALISI_MS = 30_000;
const SALE_MINIMO = 16;

export interface DipendenzeHandler {
  utenteCorrente: () => Promise<{ id: string } | null>;
  creaRepository: () => RepositoryRadiciScan | Promise<RepositoryRadiciScan>;
  creaProvider: () => ProviderRadiciScan;
  saleQuota: string | null;
  /** Segreto HMAC della cache: assente => nessun riuso della cache. */
  segretoCache?: string | null;
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

function errore(stato: number, codice: string, messaggio: string): Response {
  return json({ success: false, errore: { codice, messaggio } }, stato);
}

/** Messaggi pubblici: nessun dettaglio di provider, database o configurazione. */
function rispostaErrore(causa: unknown): Response {
  if (!(causa instanceof ErroreRadiciScan)) {
    return errore(500, "ERRORE_INTERNO", "Errore interno. Riprova più tardi.");
  }

  switch (causa.codice) {
    case CODICI_ERRORE.INPUT_NON_VALIDO:
      return errore(400, "RICHIESTA_NON_VALIDA", causa.message);
    case CODICI_ERRORE.IMMAGINE_TROPPO_GRANDE:
      return errore(413, "IMMAGINE_TROPPO_GRANDE", "L'immagine supera il limite consentito.");
    case CODICI_ERRORE.MIME_NON_SUPPORTATO:
      return errore(415, "FORMATO_NON_SUPPORTATO", "Formato dell'immagine non supportato.");
    case CODICI_ERRORE.SESSIONE_NON_VALIDA:
      return errore(401, "SESSIONE_NON_VALIDA", "Sessione non valida.");
    case CODICI_ERRORE.SCHEMA_NON_VALIDO:
      return errore(502, "RISPOSTA_AI_NON_VALIDA", "Il servizio di analisi ha restituito un esito non valido.");
    case CODICI_ERRORE.PROVIDER_TIMEOUT:
      return errore(504, "ANALISI_SCADUTA", "L'analisi ha impiegato troppo tempo. Riprova.");
    case CODICI_ERRORE.PROVIDER_QUOTA:
      return errore(503, "ANALISI_NON_DISPONIBILE", "Servizio di analisi non disponibile. Riprova più tardi.");
    case CODICI_ERRORE.PROVIDER_RETE:
    case CODICI_ERRORE.PROVIDER_RISPOSTA:
      return errore(502, "ANALISI_NON_RIUSCITA", "Il servizio di analisi non ha risposto correttamente.");
    case CODICI_ERRORE.PROVIDER_CONFIGURAZIONE:
      return errore(503, "ANALISI_NON_DISPONIBILE", "Servizio di analisi non disponibile.");
    case CODICI_ERRORE.QUOTA_NON_DISPONIBILE:
    case CODICI_ERRORE.QUOTA_CONFIGURAZIONE:
      return errore(503, "QUOTA_NON_DISPONIBILE", "Non riesco a verificare la quota. Riprova tra poco.");
    default:
      return errore(500, "ERRORE_INTERNO", "Errore interno. Riprova più tardi.");
  }
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
}): RigaAnalisi {
  const { esito, meta, modalita, utenteId, impronta, richiestaId } = input;
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
  };
}

export function creaHandlerAnalisi(dipendenze: DipendenzeHandler) {
  return async function POST(request: Request): Promise<Response> {
    const adesso = dipendenze.adesso ?? (() => new Date());

    // ── Repository (service-role) ──────────────────────────────────────────
    let repository: RepositoryRadiciScan;
    try {
      repository = await dipendenze.creaRepository();
    } catch {
      return errore(503, "SERVIZIO_NON_DISPONIBILE", "Servizio non disponibile. Riprova più tardi.");
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
        const sale = (dipendenze.saleQuota ?? "").trim();
        if (!ip || sale.length < SALE_MINIMO) {
          return errore(
            503,
            "IDENTIFICAZIONE_NON_DISPONIBILE",
            "Non riesco a verificare la quota. Riprova più tardi."
          );
        }
        chiaveQuota = creaChiaveQuotaAnonima(ip, sale);
      }
    } catch (causa) {
      if (causa instanceof ErroreRadiciScan && causa.codice === CODICI_ERRORE.SESSIONE_NON_VALIDA) {
        return rispostaErrore(causa);
      }
      return errore(503, "IDENTIFICAZIONE_NON_DISPONIBILE", "Non riesco a verificare la quota.");
    }

    // ── Immagine: validata prima di consumare quota ────────────────────────
    let immagine: ImmagineValida;
    try {
      immagine = await estraiImmagine(request, dipendenze.segretoCache ?? null);
    } catch (causa) {
      return rispostaErrore(causa);
    }

    // ── Quota: obbligatoria, fail-closed ──────────────────────────────────
    let quota: EsitoQuota;
    try {
      quota = await repository.consumaQuota(chiaveQuota, modalita);
    } catch {
      return errore(503, "QUOTA_NON_DISPONIBILE", "Non riesco a verificare la quota. Riprova tra poco.");
    }

    if (!quota.consentita) {
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
      } catch {
        return errore(503, "REGISTRO_NON_DISPONIBILE", "Servizio non disponibile. Riprova più tardi.");
      }
      if (!cacheVerificataAncoraValida(daCache, registroPrecaricato)) {
        daCache = null;
      }
    }

    let esito: EsitoAnalisi;
    let meta: MetaAnalisi;
    let cache = false;

    if (daCache) {
      esito = daCache;
      cache = true;
      meta = {
        provider: "cache",
        modello: VERSIONE_PROMPT,
        durataMs: 0,
        versionePrompt: VERSIONE_PROMPT,
      };
    } else {
      // ── Registro ufficiale (solo server) ────────────────────────────────
      let registro: FonteUfficiale[];
      if (registroPrecaricato) {
        registro = registroPrecaricato;
      } else {
        try {
          registro = await repository.leggiRegistro();
        } catch {
          return errore(503, "REGISTRO_NON_DISPONIBILE", "Servizio non disponibile. Riprova più tardi.");
        }
      }

      let provider: ProviderRadiciScan;
      try {
        provider = dipendenze.creaProvider();
      } catch {
        return errore(503, "ANALISI_NON_DISPONIBILE", "Servizio di analisi non disponibile.");
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_ANALISI_MS);

      try {
        const risultato = await analizzaProdotto(
          {
            immagineBase64: immagine.base64,
            mimeType: immagine.mime,
            improntaImmagine: immagine.impronta ?? undefined,
          },
          { provider, registro, signal: controller.signal }
        );
        esito = risultato.esito;
        meta = risultato.meta;
      } catch (causa) {
        return rispostaErrore(causa);
      } finally {
        clearTimeout(timer);
      }
    }

    // ── Registrazione dell'esito (obbligatoria) ────────────────────────────
    let riga: RigaAnalisi;
    try {
      riga = rigaDaEsito({
        esito,
        meta,
        modalita,
        utenteId,
        impronta: immagine.impronta,
        richiestaId: randomUUID(),
      });
    } catch {
      return errore(500, "ERRORE_INTERNO", "Errore interno. Riprova più tardi.");
    }

    try {
      await repository.registraAnalisi(riga);
    } catch {
      return errore(503, "REGISTRAZIONE_NON_DISPONIBILE", "Servizio non disponibile. Riprova più tardi.");
    }

    // La scrittura in cache è best-effort: non fa fallire un'analisi già
    // registrata e non introduce dati sensibili. Senza chiave HMAC non si
    // scrive nulla.
    if (!cache && chiaveCache) {
      try {
        await repository.scriviCache(creaRigaCache(chiaveCache, esito, istante));
      } catch {
        // nessuna azione: la prossima richiesta rifarà l'analisi
      }
    }

    return json({ success: true, esito, meta, cache }, 200, {
      "Cache-Control": "no-store",
    });
  };
}
