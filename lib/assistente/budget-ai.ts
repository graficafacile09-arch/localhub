/** Budget condiviso delle chiamate AI di una singola richiesta Pino. */
export const MASSIMO_CHIAMATE_AI_PINO = 3;

/** Budget totale del flusso AI di una richiesta (sotto il limite Vercel Hobby). */
export const BUDGET_TEMPO_AI_MS = 8_500;

export type BudgetPinoAI = {
  limite: number;
  usate: number;
  /** Scadenza assoluta (epoch ms) condivisa da tutte le chiamate AI della richiesta. */
  scadenzaMs?: number;
};

export class ErroreBudgetPinoAI extends Error {
  readonly code = "BUDGET_AI_ESAURITO";
  constructor(limite: number) {
    super(`Budget AI esaurito (${limite} chiamate per richiesta).`);
    this.name = "ErroreBudgetPinoAI";
  }
}

export function creaBudgetAIPino(
  limite: number = MASSIMO_CHIAMATE_AI_PINO,
  tempoMs: number = BUDGET_TEMPO_AI_MS
): BudgetPinoAI {
  const massimo =
    Number.isFinite(limite) && limite > 0
      ? Math.floor(limite)
      : MASSIMO_CHIAMATE_AI_PINO;
  return { limite: massimo, usate: 0, scadenzaMs: Date.now() + tempoMs };
}

/** Tempo residuo del budget AI (Infinity se il budget non ha scadenza). */
export function tempoRestanteAIPino(budget: BudgetPinoAI | undefined): number {
  if (!budget || budget.scadenzaMs === undefined) return Infinity;
  return Math.max(0, budget.scadenzaMs - Date.now());
}

export function prelevaChiamataAIPino(budget: BudgetPinoAI | undefined): boolean {
  if (!budget) return true;
  if (budget.usate >= budget.limite) return false;
  budget.usate += 1;
  return true;
}

/** Prenota prima della chiamata: anche timeout ed errori consumano budget. */
export async function chiamataAIConBudgetPino<T = string>(
  budget: BudgetPinoAI | undefined,
  chiamata: () => Promise<T>
): Promise<T> {
  if (!prelevaChiamataAIPino(budget)) {
    throw new ErroreBudgetPinoAI(budget?.limite ?? MASSIMO_CHIAMATE_AI_PINO);
  }
  return chiamata();
}
