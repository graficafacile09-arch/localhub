import { CODICI_ERRORE, ErroreRadiciScan, erroreInput } from "./errori";
import {
  decodificaBase64Strict,
  MAX_IMAGE_BYTES,
  MAX_REQUEST_BYTES,
  validaImmagine,
  type ImmagineValida,
} from "./immagine";

/**
 * RadiciScan — estrazione dell'immagine dalla richiesta.
 *
 * Due soli ingressi ammessi:
 *  - `multipart/form-data` con il file nel campo `immagine` (percorso previsto
 *    per l'interfaccia);
 *  - `application/json` con `{ immagineBase64, mimeType }`.
 *
 * In nessun caso si accetta un URL da scaricare: RadiciScan non fa richieste
 * verso indirizzi forniti dal client.
 *
 * Il body viene letto a chunk con un tetto esplicito e la lettura viene
 * interrotta appena lo supera: il parsing (potenzialmente costoso) avviene
 * solo su un buffer già validato. `Content-Length` è usato come precontrollo,
 * mai come garanzia: è un header controllato dal client.
 */

function erroreTroppoGrande(): ErroreRadiciScan {
  return new ErroreRadiciScan(
    CODICI_ERRORE.IMMAGINE_TROPPO_GRANDE,
    `Richiesta troppo grande: massimo ${MAX_IMAGE_BYTES} byte di immagine.`
  );
}

/**
 * Legge il body con un limite massimo in byte. Superato il limite interrompe
 * il flusso e solleva l'errore 413. Verifica inoltre che un eventuale
 * `Content-Length` dichiarato corrisponda ai byte ricevuti: un body troncato
 * non è una richiesta valida.
 */
async function leggiBodyConLimite(request: Request, limite: number): Promise<Buffer> {
  const dichiarata = Number(request.headers.get("content-length") ?? "");
  const lunghezzaDichiarata =
    Number.isFinite(dichiarata) && dichiarata > 0 ? dichiarata : null;

  // Precontrollo: evita di leggere un body che si dichiara già enorme.
  if (lunghezzaDichiarata !== null && lunghezzaDichiarata > limite) {
    throw erroreTroppoGrande();
  }

  const corpo = request.body;
  if (!corpo) return Buffer.alloc(0);

  const lettore = corpo.getReader();
  const pezzi: Uint8Array[] = [];
  let totale = 0;

  try {
    for (;;) {
      const { done, value } = await lettore.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      totale += value.byteLength;
      if (totale > limite) {
        await lettore.cancel().catch(() => undefined);
        throw erroreTroppoGrande();
      }
      pezzi.push(value);
    }
  } finally {
    lettore.releaseLock();
  }

  if (lunghezzaDichiarata !== null && totale !== lunghezzaDichiarata) {
    throw erroreInput("Richiesta troncata o incompleta.");
  }

  return Buffer.concat(pezzi, totale);
}

async function daMultipart(
  buffer: Buffer,
  contentType: string,
  segretoCache: string | null
): Promise<ImmagineValida> {
  let form: FormData;
  try {
    form = await new Request("https://radiscan.invalid/estrazione", {
      method: "POST",
      headers: { "content-type": contentType },
      // Node/undici accettano Buffer come body; il tipo BodyInit del DOM non
      // lo prevede, quindi il cast resta confinato a questa ricostruzione.
      body: buffer as unknown as BodyInit,
    }).formData();
  } catch {
    throw erroreInput("Richiesta non valida.");
  }

  const file = form.get("immagine") ?? form.get("image");
  if (!(file instanceof Blob)) {
    throw erroreInput("Immagine mancante.");
  }
  if (file.size === 0) {
    throw erroreInput("Immagine vuota.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ErroreRadiciScan(
      CODICI_ERRORE.IMMAGINE_TROPPO_GRANDE,
      `Immagine troppo grande: massimo ${MAX_IMAGE_BYTES} byte.`
    );
  }

  const contenuto = Buffer.from(await file.arrayBuffer());
  return validaImmagine(contenuto, file.type, segretoCache);
}

function daJson(buffer: Buffer, segretoCache: string | null): ImmagineValida {
  let body: unknown;
  try {
    body = JSON.parse(buffer.toString("utf8"));
  } catch {
    throw erroreInput("Richiesta non valida.");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw erroreInput("Richiesta non valida.");
  }

  const record = body as Record<string, unknown>;
  const base64 = typeof record.immagineBase64 === "string" ? record.immagineBase64 : "";
  const mime = typeof record.mimeType === "string" ? record.mimeType : "";

  const contenuto = decodificaBase64Strict(base64);
  return validaImmagine(contenuto, mime, segretoCache);
}

export async function estraiImmagine(
  request: Request,
  segretoCache: string | null = null
): Promise<ImmagineValida> {
  // L'header originale va conservato: il boundary multipart è case-sensitive.
  // La copia minuscola serve solo per i confronti non sensibili alle maiuscole.
  const contentTypeOriginale = request.headers.get("content-type") ?? "";
  const contentType = contentTypeOriginale.toLowerCase();
  const multipart = contentType.startsWith("multipart/form-data");
  const json = contentType.startsWith("application/json");

  if (!multipart && !json) {
    throw new ErroreRadiciScan(
      CODICI_ERRORE.MIME_NON_SUPPORTATO,
      "Formato di richiesta non supportato."
    );
  }

  const buffer = await leggiBodyConLimite(request, MAX_REQUEST_BYTES);
  if (multipart) return daMultipart(buffer, contentTypeOriginale, segretoCache);
  return daJson(buffer, segretoCache);
}
