/**
 * RadiciScan — elaborazione immagine (dettaglio e preprocessing).
 *
 * Questo è l'unico modulo, insieme a `ocr.ts`, autorizzato a importare Sharp:
 * il test di isolamento verifica che nessun altro file lo faccia.
 *
 * Due responsabilità:
 * 1. `preparaImmagineVisione`: preprocessing del percorso visivo, con gli
 *    stessi parametri di Aggiungi prodotti (lato massimo 1024 px, JPEG 80) e
 *    auto-orientamento EXIF. È il formato che il modello riconosce bene.
 * 2. `creaDettaglioEtichetta`: ritaglio ingrandito storico. Non è più usato
 *    dalla pipeline (raddoppiava il payload senza un guadagno dimostrato),
 *    resta disponibile e testato come supporto facoltativo.
 *
 * Nessuna delle due funzioni è un requisito: qualunque errore restituisce
 * l'originale o `null` e l'analisi prosegue.
 */

import type { MimeAmmesso } from "./tipi";

// ─── Preprocessing condiviso con Aggiungi prodotti ────────────────────────

export const VISION_MAX_DIM = 1024;
export const VISION_JPEG_QUALITY = 80;

export interface DimensioniVisione {
  larghezza: number;
  altezza: number;
}

/** Dimensioni dopo il ridimensionamento "inside": non ingrandisce mai. */
export function dimensioniVisione(
  larghezza: number,
  altezza: number,
  maxDim: number = VISION_MAX_DIM
): DimensioniVisione {
  if (
    !Number.isFinite(larghezza) ||
    !Number.isFinite(altezza) ||
    larghezza <= 0 ||
    altezza <= 0
  ) {
    return { larghezza: 0, altezza: 0 };
  }

  const lato = Math.max(larghezza, altezza);
  if (lato <= maxDim) {
    return { larghezza: Math.round(larghezza), altezza: Math.round(altezza) };
  }

  const fattore = maxDim / lato;
  return {
    larghezza: Math.max(1, Math.round(larghezza * fattore)),
    altezza: Math.max(1, Math.round(altezza * fattore)),
  };
}

export interface PipelineVisione {
  rotate(): PipelineVisione;
  resize(opzioni: {
    width: number;
    height: number;
    fit: "inside";
    withoutEnlargement: boolean;
  }): PipelineVisione;
  jpeg(opzioni: { quality: number }): PipelineVisione;
  toBuffer(opzioni: { resolveWithObject: true }): Promise<{
    data: Buffer;
    info: { width?: number; height?: number };
  }>;
}

export type FabbricaVisione = (input: Buffer) => PipelineVisione;

export interface ImmagineVisione {
  base64: string;
  mime: MimeAmmesso;
  larghezza: number | null;
  altezza: number | null;
  /** `true` solo quando Sharp ha davvero ricodificato l'immagine. */
  ridimensionata: boolean;
  byte: number;
}

export interface OpzioniVisione {
  sharpImpl?: FabbricaVisione;
  maxDim?: number;
  quality?: number;
}

export async function preparaImmagineVisione(
  base64: string,
  mime: MimeAmmesso,
  opzioni: OpzioniVisione = {}
): Promise<ImmagineVisione> {
  const buffer = Buffer.from(base64, "base64");
  const originale: ImmagineVisione = {
    base64,
    mime,
    larghezza: null,
    altezza: null,
    ridimensionata: false,
    byte: buffer.length,
  };

  if (buffer.length === 0) return originale;

  try {
    let fabbrica = opzioni.sharpImpl;
    if (!fabbrica) {
      const modulo = (await import("sharp")) as unknown as {
        default?: FabbricaVisione;
      } & FabbricaVisione;
      fabbrica = modulo.default ?? modulo;
    }
    if (typeof fabbrica !== "function") return originale;

    const maxDim = opzioni.maxDim ?? VISION_MAX_DIM;
    const quality = opzioni.quality ?? VISION_JPEG_QUALITY;

    const risultato = await fabbrica(buffer)
      .rotate()
      .resize({
        width: maxDim,
        height: maxDim,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality })
      .toBuffer({ resolveWithObject: true });

    if (!risultato?.data?.length) return originale;

    return {
      base64: risultato.data.toString("base64"),
      mime: "image/jpeg",
      larghezza: risultato.info.width ?? null,
      altezza: risultato.info.height ?? null,
      ridimensionata: true,
      byte: risultato.data.length,
    };
  } catch {
    return originale;
  }
}

// ─── Dettaglio ingrandito (supporto facoltativo, fuori pipeline) ──────────

export interface PipelineDettaglio {
  metadata(): Promise<{ width?: number; height?: number }>;
  rotate(): PipelineDettaglio;
  extract(opzioni: {
    left: number;
    top: number;
    width: number;
    height: number;
  }): PipelineDettaglio;
  resize(opzioni: {
    width: number;
    fit: "inside";
    withoutEnlargement: boolean;
  }): PipelineDettaglio;
  jpeg(opzioni: { quality: number }): PipelineDettaglio;
  toBuffer(): Promise<Buffer>;
}

export type FabbricaDettaglio = (input: Buffer) => PipelineDettaglio;

export async function creaDettaglioEtichetta(
  base64: string,
  opzioni: { sharpImpl?: FabbricaDettaglio } = {}
): Promise<string | null> {
  try {
    let fabbrica = opzioni.sharpImpl;
    if (!fabbrica) {
      const modulo = (await import("sharp")) as unknown as {
        default?: FabbricaDettaglio;
      } & FabbricaDettaglio;
      fabbrica = modulo.default ?? modulo;
    }
    if (typeof fabbrica !== "function") return null;

    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0) return null;

    const metadata = await fabbrica(buffer).metadata();
    const larghezza = metadata.width ?? 0;
    const altezza = metadata.height ?? 0;
    if (larghezza < 240 || altezza < 180) return null;

    const left = Math.floor(larghezza * 0.2);
    const top = Math.floor(altezza * 0.04);
    const width = Math.max(1, Math.min(larghezza - left, Math.floor(larghezza * 0.78)));
    const height = Math.max(1, Math.min(altezza - top, Math.floor(altezza * 0.92)));

    const dettaglio = await fabbrica(buffer)
      .rotate()
      .extract({ left, top, width, height })
      .resize({ width: 1500, fit: "inside", withoutEnlargement: false })
      .jpeg({ quality: 90 })
      .toBuffer();

    return dettaglio.toString("base64");
  } catch {
    return null;
  }
}
