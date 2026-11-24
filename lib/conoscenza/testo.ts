import { createHash } from "node:crypto";

/** Rimuove markup HTML/Markdown elementare e normalizza gli spazi. */
export function pulisciTesto(valore: string): string {
  return valore
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_`#>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Divide un testo lungo in blocchi di al più `massimo` caratteri, spezzando
 * preferibilmente sul confine di frase, così ogni blocco resta leggibile.
 */
export function suddividiTesto(valore: string, massimo = 900): string[] {
  const testo = pulisciTesto(valore);
  if (!testo) return [];
  if (testo.length <= massimo) return [testo];

  const frasi = testo.split(/(?<=[.!?])\s+/);
  const blocchi: string[] = [];
  let corrente = "";
  for (const frase of frasi) {
    if (frase.length > massimo) {
      if (corrente) {
        blocchi.push(corrente);
        corrente = "";
      }
      for (let i = 0; i < frase.length; i += massimo) {
        blocchi.push(frase.slice(i, i + massimo));
      }
      continue;
    }
    const prova = corrente ? `${corrente} ${frase}` : frase;
    if (prova.length > massimo) {
      blocchi.push(corrente);
      corrente = frase;
    } else {
      corrente = prova;
    }
  }
  if (corrente) blocchi.push(corrente);
  return blocchi;
}

/** Hash stabile del contenuto testuale, usato per capire se una voce è cambiata. */
export function hashTesto(valore: string): string {
  return createHash("sha256").update(valore, "utf8").digest("hex");
}
