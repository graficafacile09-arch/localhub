/** Budget condiviso delle chiamate AI di una singola richiesta Pino. */
export const MASSIMO_CHIAMATE_AI_PINO = 2;

export type BudgetPinoAI = {
  limite: number;
  usate: number;
};

export class ErroreBudgetPinoAI extends Error {
  readonly code = "BUDGET_AI_ESAURITO";
  constructor(limite: number) {
    super(`Budget AI esaurito (${limite} chiamate per richiesta).`);
    this.name = "ErroreBudgetPinoAI";
  }
}

export function creaBudgetAIPino(
  limite: number = MASSIMO_CHIAMATE_AI_PINO
): BudgetPinoAI {
  const massimo =
    Number.isFinite(limite) && limite > 0
      ? Math.floor(limite)
      : MASSIMO_CHIAMATE_AI_PINO;
  return { limite: massimo, usate: 0 };
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
