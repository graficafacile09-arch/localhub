import { estraiTestoPdf } from "./pdf";
import type { AllegatoEAmbrosia, DocumentoLetto, LetturaDocumentale } from "./tipi";

/**
 * RadiciScan — lettura degli allegati ufficiali eAmbrosia.
 *
 * Contratto verificato sulle risposte reali dell'API (novembre 2026):
 * - `singleDocument` e `summarySheets` sono oggetti `{ text, uri }` in cui
 *   `text` è il nome del file e `uri` è l'IDENTIFICATIVO dell'allegato,
 *   non un URL;
 * - l'unico endpoint documentale pubblicato è
 *   `GET /eambrosia-api/api/v1/attachments/{attachmentId}`, che risponde
 *   `application/pdf` anche con stato 202;
 * - non esiste un endpoint `/documents`.
 *
 * Regole:
 * - si scarica solo da quell'host e con quell'identificativo numerico;
 * - ogni documento ha un tetto di byte e di pagine e un budget di tempo
 *   complessivo, perché la route ha 55 s e Gemini può usarne 35;
 * - "letto" significa che TUTTE le pagine estratte sono state conservate;
 *   altrimenti lo stato è `parziale` e le pagine mancanti sono dichiarate;
 * - un PDF senza testo (scansione) non è "letto": è `non_estraibile`;
 * - nessun OCR: non esiste una dipendenza OCR nel progetto e introdurla
 *   avrebbe costi non autorizzati.
 */

const HOST_ALLEGATI = "webgate.ec.europa.eu";
const PERCORSO_ALLEGATI = "/eambrosia-api/api/v1/attachments/";
const RE_ALLEGATO = /^[0-9]{1,12}$/;

export const LIMITI_LETTURA = {
  timeoutTotaleMs: 5_000,
  timeoutDocumentoMs: 4_000,
  maxDocumenti: 2,
  maxPagine: 10,
  maxBytes: 4_000_000,
  maxCaratteriSezione: 4_000,
} as const;

export const NOTA_PAGINE =
  "Le pagine sono numerate secondo gli oggetti pagina del PDF quando l'associazione è leggibile; " +
  "altrimenti i testi sono sezioni numerate e non vengono presentati come pagine. " +
  "L'estrazione non è un OCR e non interpreta immagini o mappe.";

export interface OpzioniLettura {
  fetchImpl?: typeof fetch;
  timeoutTotaleMs?: number;
  timeoutDocumentoMs?: number;
  maxDocumenti?: number;
  maxPagine?: number;
  maxBytes?: number;
  maxCaratteriSezione?: number;
  adesso?: () => Date;
  signal?: AbortSignal;
}

/** URL ufficiale di un allegato, oppure null se l'identificativo non è valido. */
export function urlAllegatoEAmbrosia(identificativo: string): string | null {
  if (!RE_ALLEGATO.test(identificativo)) return null;
  return `https://${HOST_ALLEGATI}${PERCORSO_ALLEGATI}${identificativo}`;
}

/** True solo per l'endpoint ufficiale degli allegati eAmbrosia. */
export function isUrlAllegatoEAmbrosia(valore: string | null | undefined): boolean {
  if (typeof valore !== "string" || valore.trim() === "") return false;

  let url: URL;
  try {
    url = new URL(valore.trim());
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  if (url.port !== "" || url.hash !== "" || url.search !== "") return false;
  if (url.hostname !== HOST_ALLEGATI) return false;
  if (!url.pathname.startsWith(PERCORSO_ALLEGATI)) return false;
  return RE_ALLEGATO.test(url.pathname.slice(PERCORSO_ALLEGATI.length));
}

export function letturaNonTentata(
  messaggio = "La scheda ufficiale non pubblica allegati documentali scaricabili: nessun documento è stato letto.",
  consultataIl: string
): LetturaDocumentale {
  return {
    stato: "non_tentata",
    documenti: [],
    pagineLette: 0,
    pagineTotali: null,
    consultataIl,
    messaggio,
    notaPagine: null,
  };
}

function documentoNonLetto(
  allegato: AllegatoEAmbrosia,
  stato: DocumentoLetto["stato"],
  motivo: string
): DocumentoLetto {
  return {
    id: allegato.id,
    titolo: allegato.titolo,
    url: allegato.url,
    tipo: allegato.tipo,
    stato,
    associazionePagine: "pagine",
    pagineTotali: null,
    pagineLette: 0,
    pagineNonLette: 0,
    motivo,
    sezioni: [],
    troncato: false,
  };
}

/**
 * Legge il corpo fermandosi appena supera il limite.
 *
 * Il solo `Content-Length` non basta: può mancare o essere falso, e
 * `arrayBuffer()` bufferizzerebbe l'intero corpo. Il tetto va applicato
 * mentre i byte arrivano, non dopo.
 */
async function leggiBytesLimitati(
  risposta: Response,
  maxBytes: number
): Promise<Uint8Array | null> {
  if (!risposta.body) {
    const bytes = new Uint8Array(await risposta.arrayBuffer());
    return bytes.byteLength > maxBytes ? null : bytes;
  }

  const lettore = risposta.body.getReader();
  const parti: Uint8Array[] = [];
  let totale = 0;

  try {
    for (;;) {
      const { done, value } = await lettore.read();
      if (done) break;
      if (!value) continue;
      totale += value.byteLength;
      if (totale > maxBytes) {
        await lettore.cancel();
        return null;
      }
      parti.push(value);
    }
  } finally {
    lettore.releaseLock();
  }

  const bytes = new Uint8Array(totale);
  let posizione = 0;
  for (const parte of parti) {
    bytes.set(parte, posizione);
    posizione += parte.byteLength;
  }
  return bytes;
}

async function leggiUnDocumento(
  allegato: AllegatoEAmbrosia,
  opzioni: Required<Omit<OpzioniLettura, "signal" | "adesso" | "fetchImpl">> & {
    fetchImpl: typeof fetch;
    signal?: AbortSignal;
    scadenza: number;
  }
): Promise<DocumentoLetto> {
  if (!isUrlAllegatoEAmbrosia(allegato.url)) {
    return documentoNonLetto(
      allegato,
      "non_disponibile",
      "Allegato con URL fuori dall'endpoint ufficiale eAmbrosia: non scaricato."
    );
  }

  const restante = opzioni.scadenza - Date.now();
  if (restante < 250) {
    return documentoNonLetto(
      allegato,
      "non_disponibile",
      "Tempo della route esaurito prima del download: documento non letto."
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.min(opzioni.timeoutDocumentoMs, restante)
  );
  const annulla = () => controller.abort();
  opzioni.signal?.addEventListener("abort", annulla, { once: true });
  if (opzioni.signal?.aborted) controller.abort();

  try {
    const risposta = await opzioni.fetchImpl(allegato.url, {
      method: "GET",
      // L'endpoint dichiara `application/octet-stream` e risponde 406 a un
      // Accept ristretto a `application/pdf`: si accetta il PDF e il fallback.
      headers: { Accept: "application/pdf, application/octet-stream;q=0.9, */*;q=0.8" },
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });

    if (!risposta.ok) {
      return documentoNonLetto(
        allegato,
        "non_disponibile",
        `Allegato non raggiungibile (HTTP ${risposta.status}).`
      );
    }

    const dichiarata = Number(risposta.headers.get("content-length") ?? "");
    if (Number.isFinite(dichiarata) && dichiarata > opzioni.maxBytes) {
      return documentoNonLetto(
        allegato,
        "non_disponibile",
        `Allegato oltre il limite di ${Math.round(opzioni.maxBytes / 1_000_000)} MB: non scaricato.`
      );
    }

    const bytes = await leggiBytesLimitati(risposta, opzioni.maxBytes);
    if (bytes === null) {
      return documentoNonLetto(
        allegato,
        "non_disponibile",
        `Allegato oltre il limite di ${Math.round(opzioni.maxBytes / 1_000_000)} MB: download interrotto.`
      );
    }
    if (bytes.byteLength === 0) {
      return documentoNonLetto(allegato, "non_disponibile", "Allegato scaricato ma vuoto.");
    }

    const tipo = risposta.headers.get("content-type") ?? "";
    const estrazione = estraiTestoPdf(bytes);

    if (estrazione.pagine.length === 0) {
      return documentoNonLetto(
        allegato,
        "non_estraibile",
        estrazione.note[0] ??
          "Il documento è stato scaricato ma non contiene testo estraibile."
      );
    }

    const associazionePagine = estrazione.associazione;
    const sezioni = estrazione.pagine
      .slice(0, opzioni.maxPagine)
      .map((pagina) => ({
        pagina: pagina.numero,
        testo: pagina.testo.slice(0, opzioni.maxCaratteriSezione),
      }));

    // Il numero di pagine si dichiara solo se l'associazione è verificata:
    // in ripiego si parla di sezioni, per non dire "7 pagine lette di 2".
    const pagineTotali =
      associazionePagine === "pagine"
        ? estrazione.pagineTotali ?? estrazione.pagine.length
        : null;
    const pagineNonLette =
      associazionePagine === "pagine"
        ? Math.max(0, (pagineTotali ?? 0) - sezioni.length)
        : 0;
    const troncato =
      sezioni.length < estrazione.pagine.length ||
      estrazione.pagine.some(
        (pagina) => pagina.testo.length > opzioni.maxCaratteriSezione
      );

    const avvisi = [...estrazione.note];
    if (associazionePagine === "ordine_flussi") {
      avvisi.push(
        `Associazione pagina→testo non disponibile: estratte ${sezioni.length} sezioni di testo, non ${sezioni.length} pagine verificate.`
      );
    }
    if (estrazione.pagineSenzaTesto.length > 0) {
      avvisi.push(
        `Pagine senza testo estraibile: ${estrazione.pagineSenzaTesto.join(", ")}.`
      );
    }
    if (pagineNonLette > 0) {
      avvisi.push(
        `Lette ${sezioni.length} pagine su ${pagineTotali}: limite di ${opzioni.maxPagine} pagine per restare nel budget della route.`
      );
    }
    if (troncato && sezioni.length === estrazione.pagine.length) {
      avvisi.push(
        `Testo troncato a ${opzioni.maxCaratteriSezione} caratteri per pagina.`
      );
    }
    if (tipo && !tipo.toLowerCase().includes("pdf")) {
      avvisi.push(`Content-Type dichiarato: ${tipo}.`);
    }

    const completo =
      associazionePagine === "pagine" && pagineNonLette === 0 && !troncato;

    return {
      id: allegato.id,
      titolo: allegato.titolo,
      url: allegato.url,
      tipo: allegato.tipo,
      stato: completo ? "letto" : "parziale",
      associazionePagine,
      pagineTotali,
      pagineLette: sezioni.length,
      pagineNonLette,
      motivo: avvisi.length > 0 ? avvisi.join(" ") : null,
      sezioni,
      troncato,
    };
  } catch {
    return documentoNonLetto(
      allegato,
      "non_disponibile",
      "Download interrotto, scaduto o non riuscito: documento non letto."
    );
  } finally {
    clearTimeout(timer);
    opzioni.signal?.removeEventListener("abort", annulla);
  }
}

function messaggioLettura(documenti: readonly DocumentoLetto[], pagineLette: number): string {
  const letti = documenti.filter((documento) => documento.stato === "letto").length;
  const parziali = documenti.filter((documento) => documento.stato === "parziale").length;
  const nonDisponibili = documenti.filter(
    (documento) => documento.stato === "non_disponibile"
  ).length;
  const nonEstraibili = documenti.filter(
    (documento) => documento.stato === "non_estraibile"
  ).length;

  const usaSezioni = documenti.some(
    (documento) => documento.associazionePagine === "ordine_flussi"
  );
  const unita = usaSezioni
    ? "sezioni di testo lette"
    : pagineLette === 1
      ? "pagina letta"
      : "pagine lette";
  const parti = [
    `${pagineLette} ${unita} in ${letti + parziali} ${
      letti + parziali === 1 ? "documento" : "documenti"
    } su ${documenti.length} allegati.`,
  ];
  if (parziali > 0) parti.push(`${parziali} documento/i letto/i solo in parte.`);
  if (nonDisponibili > 0) parti.push(`${nonDisponibili} allegato/i non scaricato/i.`);
  if (nonEstraibili > 0) {
    parti.push(`${nonEstraibili} allegato/i scaricato/i senza testo estraibile (nessun OCR).`);
  }
  return parti.join(" ");
}

/**
 * Scarica e legge gli allegati indicati dalla scheda, entro il budget.
 *
 * Non lancia mai: un errore di rete diventa `non_disponibile` con il motivo,
 * così l'esito non può essere scambiato per "nessun documento esiste".
 */
export async function leggiAllegati(
  allegati: readonly AllegatoEAmbrosia[],
  opzioni: OpzioniLettura = {}
): Promise<LetturaDocumentale> {
  const fetchImpl = opzioni.fetchImpl ?? fetch;
  const adesso = opzioni.adesso ?? (() => new Date());
  const consultataIl = adesso().toISOString().slice(0, 10);
  const limiti = {
    timeoutTotaleMs: opzioni.timeoutTotaleMs ?? LIMITI_LETTURA.timeoutTotaleMs,
    timeoutDocumentoMs: opzioni.timeoutDocumentoMs ?? LIMITI_LETTURA.timeoutDocumentoMs,
    maxDocumenti: opzioni.maxDocumenti ?? LIMITI_LETTURA.maxDocumenti,
    maxPagine: opzioni.maxPagine ?? LIMITI_LETTURA.maxPagine,
    maxBytes: opzioni.maxBytes ?? LIMITI_LETTURA.maxBytes,
    maxCaratteriSezione:
      opzioni.maxCaratteriSezione ?? LIMITI_LETTURA.maxCaratteriSezione,
  };

  const visti = new Set<string>();
  const scelti: AllegatoEAmbrosia[] = [];
  const ordinati = [...allegati].sort((a, b) => {
    if (a.tipo === b.tipo) return 0;
    return a.tipo === "disciplinare" ? -1 : 1;
  });
  for (const allegato of ordinati) {
    if (visti.has(allegato.id)) continue;
    visti.add(allegato.id);
    scelti.push(allegato);
    if (scelti.length >= limiti.maxDocumenti) break;
  }

  if (scelti.length === 0) {
    return letturaNonTentata(undefined, consultataIl);
  }

  const scadenza = Date.now() + limiti.timeoutTotaleMs;
  const documenti: DocumentoLetto[] = [];
  for (const allegato of scelti) {
    documenti.push(
      await leggiUnDocumento(allegato, {
        ...limiti,
        fetchImpl,
        signal: opzioni.signal,
        scadenza,
      })
    );
  }

  const pagineLette = documenti.reduce(
    (totale, documento) => totale + documento.pagineLette,
    0
  );
  const totaliNoti = documenti.every((documento) => documento.pagineTotali !== null);
  const pagineTotali = totaliNoti
    ? documenti.reduce((totale, documento) => totale + (documento.pagineTotali ?? 0), 0)
    : null;

  const letti = documenti.filter((documento) => documento.stato === "letto").length;
  const parziali = documenti.filter((documento) => documento.stato === "parziale").length;

  let stato: LetturaDocumentale["stato"];
  if (letti + parziali === 0) {
    stato = "non_disponibile";
  } else if (letti === documenti.length && parziali === 0) {
    stato = "completa";
  } else {
    stato = "parziale";
  }

  return {
    stato,
    documenti,
    pagineLette,
    pagineTotali,
    consultataIl,
    messaggio: messaggioLettura(documenti, pagineLette),
    notaPagine: NOTA_PAGINE,
  };
}
