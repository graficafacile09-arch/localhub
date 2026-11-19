import type {
  EsitoAnalisi,
  Livello,
  RiconoscimentoAi,
  VerificaDocumentale,
} from "./tipi";
import { AVVERTENZA_BASE } from "./tipi";
import { CODICI_ERRORE, ErroreRadiciScan } from "./errori";

/**
 * RadiciScan — classificazione finale.
 *
 * Invarianti garantite da questo modulo (e ridondate dai vincoli della
 * migration 20261118):
 * - `verificato` implica una fonte e una denominazione verificata;
 * - `verificato` non convive con possibili incongruenze segnalate;
 * - ogni livello diverso da `verificato` ha `denominazioneVerificata` null;
 * - un'esecuzione senza fonte non può mai diventare `verificato`, nemmeno se
 *   il modello è molto sicuro di sé.
 */

/** Il modello può solo abbassare la fiducia, mai alzarla. */
export function livelloFinale(
  verifica: VerificaDocumentale,
  riconoscimento: RiconoscimentoAi
): { livello: Livello; motivazione: string } {
  const segnalazioni = riconoscimento.incongruenzeRilevate.length;

  if (segnalazioni > 0 && verifica.livello !== "non_verificato") {
    return {
      livello: "incongruenza_possibile",
      motivazione:
        `${verifica.motivazione} Il modello ha segnalato ${segnalazioni} possibile/i incongruenza/e: ` +
        "l'esito resta da controllare e non viene presentato come verificato.",
    };
  }

  return { livello: verifica.livello, motivazione: verifica.motivazione };
}

export function componiEsito(input: {
  riconoscimento: RiconoscimentoAi;
  verifica: VerificaDocumentale;
  versionePrompt: string;
}): EsitoAnalisi {
  const { riconoscimento, verifica, versionePrompt } = input;
  const { livello, motivazione } = livelloFinale(verifica, riconoscimento);

  const verificato = livello === "verificato";
  const fonteId = verifica.fonte?.id ?? null;
  const denominazioneVerificata = verificato
    ? (verifica.denominazioneVerificata ?? null)
    : null;

  // Invariante: il VERIFICATO non può esistere senza fonte e snapshot.
  if (verificato && (!fonteId || !denominazioneVerificata)) {
    throw new ErroreRadiciScan(
      CODICI_ERRORE.SCHEMA_NON_VALIDO,
      "Invariante violata: livello verificato senza fonte o denominazione."
    );
  }

  return {
    livello,
    riconoscimento,
    // UUID della riga `radiscan_fonti`: la 2C lo scrive identico in
    // `fonte_id` e in `esito->>'fonteId'`, come richiede la migration.
    fonteId,
    denominazioneVerificata,
    verifica: { ...verifica, livello, motivazione },
    avvertenza: AVVERTENZA_BASE,
    versionePrompt,
  };
}
