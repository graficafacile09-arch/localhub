import type { VoceConoscenza } from "./tipi";
import { suddividiTesto } from "./testo";

/** Dati minimi di una pagina informativa; il chiamante fornisce i dati reali. */
export type PaginaInformativa = {
  sezione: VoceConoscenza["sezione"];
  percorso: string;
  titolo: string;
  testi: string[];
};

/**
 * Converte pagine informative in voci indicizzabili, suddividendo i testi
 * lunghi. Ogni voce mantiene il percorso canonico della pagina di origine.
 */
export function vociDaPagine(pagine: PaginaInformativa[]): VoceConoscenza[] {
  const voci: VoceConoscenza[] = [];
  for (const pagina of pagine) {
    const testo = pagina.testi.join(" ");
    const blocchi = suddividiTesto(testo);
    blocchi.forEach((blocco, indice) => {
      voci.push({
        chiave: `${pagina.sezione}:${pagina.percorso}#${indice}`,
        sezione: pagina.sezione,
        percorso: pagina.percorso,
        titolo: pagina.titolo,
        testo: blocco,
      });
    });
  }
  return voci;
}

/** Costruisce l'URL assoluto canonico su un dominio di base, senza slash finale. */
export function urlCanonico(base: string, percorso: string): string {
  return `${base.replace(/\/+$/, "")}${percorso.startsWith("/") ? percorso : `/${percorso}`}`;
}
