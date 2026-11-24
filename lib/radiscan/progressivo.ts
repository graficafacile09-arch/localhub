import type {
  EsitoAnalisi,
  EsitoRicercaDocumentale,
  MetaAnalisi,
  RicercaWeb,
  RiconoscimentoAi,
} from "./tipi";

/**
 * RadiciScan — eventi progressivi.
 *
 * Un evento per riga (NDJSON). Ogni evento corrisponde a un risultato
 * realmente disponibile: nessun avanzamento simulato, nessuna percentuale.
 *
 * `preliminare: true` significa che il dato non ha ancora attraversato tutte
 * le verifiche: il client lo mostra come provvisorio e non come verificato.
 * Solo l'evento `esito` porta il livello definitivo, ed è emesso dopo la
 * registrazione dell'analisi.
 */

export const TIPO_CONTENUTO_PROGRESSIVO = "application/x-ndjson; charset=utf-8";

export interface QuotaPubblica {
  usatiOggi: number;
  limiteGiorno: number;
  limiteMinuto: number;
}

export type EventoProgressivo =
  | {
      evento: "riconoscimento";
      preliminare: true;
      riconoscimento: RiconoscimentoAi;
      provider: string;
      modello: string;
      durataMs: number;
    }
  | {
      evento: "documentale";
      preliminare: true;
      ricerca: EsitoRicercaDocumentale;
      durataMs: number;
    }
  | {
      evento: "web";
      preliminare: true;
      web: RicercaWeb;
    }
  | {
      evento: "esito";
      preliminare: false;
      esito: EsitoAnalisi;
      meta: MetaAnalisi;
      cache: boolean;
    }
  | {
      evento: "errore";
      errore: { codice: string; messaggio: string };
      /** Stato HTTP che la variante JSON avrebbe restituito. */
      stato: number;
      quota?: QuotaPubblica;
    };

/** Il client chiede esplicitamente gli eventi; senza header resta il JSON. */
export function vuoleProgressivo(request: Request): boolean {
  const accetta = (request.headers.get("accept") ?? "").toLowerCase();
  return accetta.includes("application/x-ndjson");
}

export function serializzaEvento(evento: EventoProgressivo): string {
  return `${JSON.stringify(evento)}\n`;
}
