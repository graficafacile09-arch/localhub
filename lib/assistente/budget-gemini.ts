/**
 * M6-B1 — Budget condiviso delle chiamate Gemini di una richiesta Pino.
 *
 * Il limite è per RICHIESTA, non per modulo: la comprensione semantica e la
 * selezione dei tool attingono allo stesso contatore, quindi un percorso che
 * aggiungesse una terza chiamata non può superare il tetto. La prenotazione
 * avviene PRIMA della chiamata: una chiamata fallita, rifiutata o scaduta
 * resta conteggiata e non libera budget.
 *
 * Nessun retry viene introdotto qui: il modulo decide solo se la chiamata può
 * partire. Quando il budget è esaurito il chiamante usa il comportamento
 * deterministico che già possiede (piano locale, `searchAll`).
 */

/** Massimo di chiamate Gemini per singola richiesta Pino. */
export const MASSIMO_CHIAMATE_GEMINI_PINO = 2;

export type BudgetGeminiPino = {
  /** Tetto della richiesta. */
  limite: number;
  /** Chiamate prenotate (riuscite o no). */
  usate: number;
};

/** Errore interno: il budget è esaurito, nessuna chiamata è partita. */
export class ErroreBudgetGeminiPino extends Error {
  readonly code = "BUDGET_GEMINI_ESHAURITO";

  constructor(limite: number) {
    super(`Budget Gemini esaurito (${limite} chiamate per richiesta).`);
    this.name = "ErroreBudgetGeminiPino";
  }
}

/** Crea il budget della richiesta. Valori non validi ricadono sul tetto. */
export function creaBudgetGeminiPino(
  limite: number = MASSIMO_CHIAMATE_GEMINI_PINO
): BudgetGeminiPino {
  const massimo =
    Number.isFinite(limite) && limite > 0
      ? Math.floor(limite)
      : MASSIMO_CHIAMATE_GEMINI_PINO;
  return { limite: massimo, usate: 0 };
}

/**
 * Prenota una chiamata. La lettura e l'incremento sono sincroni, quindi due
 * chiamate concorrenti non possono superare il tetto. Senza budget (chiamanti
 * fuori da Pino) non c'è limite: il comportamento resta quello preesistente.
 */
export function prelevaChiamataGeminiPino(budget: BudgetGeminiPino | undefined): boolean {
  if (!budget) return true;
  if (budget.usate >= budget.limite) return false;
  budget.usate += 1;
  return true;
}

/**
 * Esegue la chiamata solo se il budget condiviso lo consente. La prenotazione
 * è fatta prima: i fallimenti restano contati. Con budget esaurito lancia
 * `ErroreBudgetGeminiPino`, che i chiamanti Pino trattano come assenza della
 * funzione AI (fallback deterministico), mai come errore mostrato all'utente.
 */
export async function chiamataGeminiConBudgetPino<T = string>(
  budget: BudgetGeminiPino | undefined,
  chiamata: () => Promise<T>
): Promise<T> {
  if (!prelevaChiamataGeminiPino(budget)) {
    throw new ErroreBudgetGeminiPino(budget?.limite ?? MASSIMO_CHIAMATE_GEMINI_PINO);
  }
  return chiamata();
}
