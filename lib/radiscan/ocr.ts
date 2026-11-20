import type { OcrRisultato } from "./tipi";

/**
 * RadiciScan — OCR reale delle etichette.
 *
 * Motore: tesseract.js (open source, nessuna chiave API, nessun servizio a
 * pagamento). Il riconoscimento avviene sul server; l'immagine non viene
 * scritta su disco. Il preprocessamento con sharp (rotazione, scala di grigi,
 * normalizzazione, ingrandimento) serve per testi piccoli o a basso contrasto.
 *
 * Regole:
 * - il motore è iniettabile: i test usano un finto e non scaricano modelli;
 * - un errore o un timeout NON fa fallire l'analisi: diventa
 *   `non_disponibile` con un motivo pubblico, e il resto della pipeline
 *   continua;
 * - nessun testo OCR viene presentato come verità: è una lettura, distinta
 *   dalle ipotesi del modello visivo;
 * - nessun log, nessun frammento di immagine, nessun segreto.
 */

export const LIMITI_OCR = {
  // Su Vercel la prima chiamata scarica i modelli linguistici in /tmp: 18 s
  // non bastavano (misurato 18,0 s di timeout in Preview). 38 s lasciano
  // margine restando sotto il budget di 55 s della route.
  timeoutMs: 38_000,
  maxCaratteri: 16_000,
  lingue: ["ita", "eng"],
  larghezzaPreprocessamento: 2000,
} as const;

export interface MotoreOcr {
  riconosci(
    immagine: Buffer,
    opzioni: { lingue: readonly string[]; signal?: AbortSignal }
  ): Promise<{ testo: string; confidenza: number; parole: number }>;
}

export interface OpzioniOcr {
  motore?: MotoreOcr;
  timeoutMs?: number;
  maxCaratteri?: number;
  lingue?: readonly string[];
  signal?: AbortSignal;
  adesso?: () => number;
}

function pulisciTesto(valore: string): string {
  return valore
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

function paroleDi(testo: string): number {
  return testo.split(/\s+/).filter((parola) => parola.length > 1).length;
}

function leggiabilita(confidenza: number): "buona" | "parziale" | "scarsa" {
  if (confidenza >= 75) return "buona";
  if (confidenza >= 45) return "parziale";
  return "scarsa";
}

type WorkerTesseract = Awaited<
  ReturnType<typeof import("tesseract.js").createWorker>
>;

// Un'istanza serverless calda riutilizza il worker e i dati linguistici già
// caricati. Le scansioni sullo stesso processo sono serializzate: Tesseract
// non viene usato contemporaneamente da due richieste.
let workerCondiviso: WorkerTesseract | null = null;
let workerInCreazione: Promise<WorkerTesseract> | null = null;
let chiaveLingueWorker: string | null = null;
let codaWorker: Promise<void> = Promise.resolve();

async function ottieniWorker(
  modulo: typeof import("tesseract.js"),
  lingue: readonly string[]
): Promise<WorkerTesseract> {
  const chiaveLingue = lingue.join("+");
  if (workerCondiviso && chiaveLingueWorker === chiaveLingue) {
    return workerCondiviso;
  }
  if (workerInCreazione) return workerInCreazione;

  workerInCreazione = (async () => {
    if (workerCondiviso) {
      await workerCondiviso.terminate().catch(() => undefined);
      workerCondiviso = null;
      chiaveLingueWorker = null;
    }

    const radice = process.cwd().replace(/\\/g, "/");
    const worker = await modulo.createWorker([...lingue], 1, {
      cachePath: "/tmp/radiscan-ocr",
      workerPath: `${radice}/node_modules/tesseract.js/src/worker-script/node/index.js`,
      corePath: `${radice}/node_modules/tesseract.js-core`,
      logger: () => {},
      errorHandler: () => {},
    });
    await worker.setParameters({
      tessedit_pageseg_mode: "11",
      preserve_interword_spaces: "1",
    });
    workerCondiviso = worker;
    chiaveLingueWorker = chiaveLingue;
    return worker;
  })().catch((errore) => {
    workerInCreazione = null;
    throw errore;
  }).finally(() => {
    workerInCreazione = null;
  });

  return workerInCreazione;
}

/**
 * Motore predefinito. Il worker resta caldo per la vita dell'istanza
 * serverless: le richieste successive evitano di ricrearlo e ricaricare i
 * dati linguistici. Un timeout o un abort distrugge il worker per sicurezza.
 */
export function creaMotoreOcrTesseract(): MotoreOcr {
  return {
    async riconosci(immagine, { lingue, signal }) {
      let rilasciaCoda!: () => void;
      const precedente = codaWorker;
      codaWorker = new Promise<void>((resolve) => {
        rilasciaCoda = resolve;
      });
      await precedente;

      let worker: WorkerTesseract | null = null;
      let annulla: (() => void) | null = null;
      try {
        if (signal?.aborted) {
          const errore = new Error("OCR interrotto");
          errore.name = "AbortError";
          throw errore;
        }

        let preparata = immagine;
        try {
          const sharpModule = await import("sharp");
          const sharp = sharpModule.default ?? sharpModule;
          preparata = await sharp(immagine)
            .rotate()
            .grayscale()
            .normalize()
            .resize({
              width: LIMITI_OCR.larghezzaPreprocessamento,
              fit: "inside",
              withoutEnlargement: false,
            })
            .sharpen({ sigma: 1 })
            .png()
            .toBuffer();
        } catch {
          // Il preprocessamento è un miglioramento, non un requisito.
        }

        const modulo = await import("tesseract.js");
        worker = await ottieniWorker(modulo, lingue);

        annulla = () => {
          if (workerCondiviso === worker) {
            workerCondiviso = null;
            chiaveLingueWorker = null;
            workerInCreazione = null;
          }
          void worker?.terminate().catch(() => undefined);
        };
        signal?.addEventListener("abort", annulla, { once: true });
        if (signal?.aborted) {
          annulla();
          const errore = new Error("OCR interrotto");
          errore.name = "AbortError";
          throw errore;
        }

        const esito = await worker.recognize(preparata);
        const dati = esito?.data ?? {};
        const testo = typeof dati.text === "string" ? dati.text : "";
        const confidenza =
          typeof dati.confidence === "number" && Number.isFinite(dati.confidence)
            ? Math.max(0, Math.min(100, Math.round(dati.confidence)))
            : 0;
        const parole = Array.isArray(dati.words)
          ? dati.words.length
          : paroleDi(testo);

        return { testo, confidenza, parole };
      } catch (errore) {
        if (signal?.aborted && worker && !annulla) {
          if (workerCondiviso === worker) {
            workerCondiviso = null;
            chiaveLingueWorker = null;
            workerInCreazione = null;
          }
          await worker.terminate().catch(() => undefined);
        }
        throw errore;
      } finally {
        if (annulla) signal?.removeEventListener("abort", annulla);
        rilasciaCoda();
      }
    },
  };
}

/**
 * Legge l'etichetta. Non lancia mai: ogni errore è un esito dichiarato.
 */
export async function leggiEtichettaOcr(
  immagine: Buffer,
  opzioni: OpzioniOcr = {}
): Promise<OcrRisultato> {
  const avvio = (opzioni.adesso ?? Date.now)();
  const lingue = opzioni.lingue ?? LIMITI_OCR.lingue;
  const timeoutMs = opzioni.timeoutMs ?? LIMITI_OCR.timeoutMs;

  if (!immagine || immagine.byteLength === 0) {
    return {
      stato: "non_disponibile",
      testo: "",
      confidenza: 0,
      paroleLette: 0,
      caratteri: 0,
      lingue: [...lingue],
      durataMs: 0,
      motivo: "Nessun contenuto immagine da leggere con OCR.",
      avvisi: [],
    };
  }

  const motore = opzioni.motore ?? creaMotoreOcrTesseract();
  const controller = new AbortController();
  const annullaEsterno = () => controller.abort();
  opzioni.signal?.addEventListener("abort", annullaEsterno, { once: true });
  if (opzioni.signal?.aborted) controller.abort();

  let timer: ReturnType<typeof setTimeout> | null = null;
  const scadenza = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, timeoutMs);
  });

  try {
    const esito = await Promise.race([
      motore.riconosci(immagine, { lingue, signal: controller.signal }),
      scadenza,
    ]);
    const testo = pulisciTesto(esito.testo ?? "").slice(
      0,
      opzioni.maxCaratteri ?? LIMITI_OCR.maxCaratteri
    );
    const confidenza = Math.max(0, Math.min(100, Math.round(esito.confidenza)));
    const avvisi: string[] = [];

    if (testo.length === 0) {
      avvisi.push(
        "Il motore OCR non ha estratto testo: l'etichetta può essere illeggibile, ruotata o troppo piccola."
      );
    }
    if (confidenza > 0 && confidenza < 45) {
      avvisi.push(
        "Confidenza OCR bassa: il testo è riportato come lettura incerta, non come dato certo."
      );
    }

    return {
      stato: "ok",
      testo,
      confidenza,
      paroleLette: esito.parole ?? paroleDi(testo),
      caratteri: testo.length,
      lingue: [...lingue],
      durataMs: (opzioni.adesso ?? Date.now)() - avvio,
      motivo: null,
      avvisi,
    };
  } catch (causa) {
    const timeout = causa instanceof Error && causa.message === "timeout";
    // Solo il nome dell'errore: nessun messaggio interno, nessun path, nessun
    // dato dell'immagine. Serve a distinguere un motore assente da un modello
    // non scaricabile senza esporre dettagli di configurazione.
    const nome =
      causa instanceof Error && /^[A-Za-z][A-Za-z0-9_.-]{0,40}$/.test(causa.name)
        ? causa.name
        : null;
    return {
      stato: "non_disponibile",
      testo: "",
      confidenza: 0,
      paroleLette: 0,
      caratteri: 0,
      lingue: [...lingue],
      durataMs: (opzioni.adesso ?? Date.now)() - avvio,
      motivo: timeout
        ? "OCR non completato entro il tempo previsto: nessun testo è stato letto."
        : `OCR non disponibile in questo ambiente${nome ? ` (${nome})` : ""}: nessun testo è stato letto.`,
      avvisi: [],
    };
  } finally {
    if (timer) clearTimeout(timer);
    opzioni.signal?.removeEventListener("abort", annullaEsterno);
  }
}

export { leggiabilita };
