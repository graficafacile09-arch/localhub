/**
 * RadiciScan — dettaglio ingrandito dell'etichetta.
 *
 * I bollini DOP/IGP sono spesso piccoli nella foto completa. Il ritaglio è un
 * supporto al modello visivo, mai un requisito: qualunque errore (Sharp
 * assente, immagine non decodificabile, dimensioni insufficienti) restituisce
 * `null` e l'analisi prosegue con l'immagine originale.
 */

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
