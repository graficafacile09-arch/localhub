import { createHmac } from "node:crypto";
import { CODICI_ERRORE, ErroreRadiciScan, erroreInput } from "./errori";
import { MIME_AMMESSI, type MimeAmmesso } from "./tipi";

/**
 * RadiciScan — validazione dell'immagine.
 *
 * L'immagine non viene mai conservata: viene controllata, convertita in
 * base64 per la sola chiamata al provider e ridotta a un'impronta esadecimale
 * di 16 caratteri, che è l'unica cosa che entra in cache e nel log.
 *
 * L'impronta è un HMAC-SHA256 del contenuto binario, con un segreto
 * esclusivamente server (`RADISCAN_CACHE_SECRET`). Non è un average hash né
 * un hash percettivo: non riconosce la stessa scena ricompressa o ritagliata,
 * e quindi la cache resta conservativa (solo byte identici). Il segreto rende
 * impraticabile la ricerca offline di collisioni sulla parte troncata.
 *
 * Rotazione del segreto: cambia tutte le impronte e quindi invalida le cache
 * precedenti. È un effetto voluto e va documentato in fase di deploy.
 */

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
/**
 * Tetto complessivo della richiesta: 4,25 MiB, inferiore al limite di 4,5 MB
 * delle Vercel Functions anche considerando l'involucro multipart o il
 * gonfiaggio base64 (3 MiB → 4 MiB di testo).
 */
export const MAX_REQUEST_BYTES = 4 * 1024 * 1024 + 256 * 1024;

/** Lunghezza minima del segreto HMAC della cache. */
export const SEGRETO_CACHE_MINIMO = 32;

const MAGIC_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function segretoCacheValido(segreto: unknown): segreto is string {
  return typeof segreto === "string" && segreto.trim().length >= SEGRETO_CACHE_MINIMO;
}

/**
 * Impronta HMAC-SHA256 troncata a 16 esadecimali (vincolo della migration 2A).
 * Restituisce `null` se il segreto non è configurato: in quel caso il chiamante
 * deve disabilitare il riuso della cache, senza bloccare l'analisi.
 */
export function improntaContenuto(
  buffer: Buffer,
  segreto: string | null | undefined
): string | null {
  if (!segretoCacheValido(segreto)) return null;
  return createHmac("sha256", segreto.trim())
    .update(buffer)
    .digest("hex")
    .slice(0, 16);
}

function mimeDaContenuto(buffer: Buffer): MimeAmmesso | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(MAGIC_PNG)) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export interface ImmagineValida {
  mime: MimeAmmesso;
  base64: string;
  /** `null` quando `RADISCAN_CACHE_SECRET` non è configurato. */
  impronta: string | null;
  byte: number;
}

/**
 * Verifica dimensione, MIME dichiarato e contenuto reale (magic bytes).
 * Un tipo dichiarato diverso dal contenuto è un errore: nessuna fiducia
 * nell'header del browser.
 */
export function validaImmagine(
  buffer: Buffer,
  mimeDichiarato: string,
  segretoCache: string | null = null
): ImmagineValida {
  if (buffer.length === 0) {
    throw erroreInput("Immagine assente.");
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ErroreRadiciScan(
      CODICI_ERRORE.IMMAGINE_TROPPO_GRANDE,
      `Immagine troppo grande: massimo ${MAX_IMAGE_BYTES} byte.`
    );
  }

  const dichiarato = mimeDichiarato.trim().toLowerCase();
  if (!(MIME_AMMESSI as readonly string[]).includes(dichiarato)) {
    throw new ErroreRadiciScan(
      CODICI_ERRORE.MIME_NON_SUPPORTATO,
      "Formato immagine non supportato."
    );
  }

  const reale = mimeDaContenuto(buffer);
  if (!reale) {
    throw erroreInput("Contenuto dell'immagine non riconosciuto.");
  }
  if (reale !== dichiarato) {
    throw erroreInput("Il tipo dichiarato non corrisponde al contenuto dell'immagine.");
  }

  return {
    mime: reale,
    base64: buffer.toString("base64"),
    impronta: improntaContenuto(buffer, segretoCache),
    byte: buffer.length,
  };
}

/** Base64 rigoroso: niente data URL, niente caratteri estranei, padding coerente. */
export function decodificaBase64Strict(valore: string): Buffer {
  const pulito = valore.replace(/\s+/g, "");
  if (!pulito || pulito.startsWith("data:")) {
    throw erroreInput("Codifica base64 non valida.");
  }
  if (pulito.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(pulito)) {
    throw erroreInput("Codifica base64 non valida.");
  }

  const buffer = Buffer.from(pulito, "base64");
  if (buffer.length === 0 || buffer.toString("base64") !== pulito) {
    throw erroreInput("Codifica base64 non valida.");
  }
  return buffer;
}
