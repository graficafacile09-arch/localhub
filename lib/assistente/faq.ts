/** FAQ pubbliche InCittà: contenuti allineati alla pagina /faq. */
export const FAQ_PINO = [] as const;

function normalizzaFaq(testo: string): string[] {
  return testo.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(/\\s+/).filter((t) => t.length > 2 && !new Set(["che","come","cosa","quale","quali","dove","quando","perche","posso","puoi","sono","della","delle","degli","dello","nella","nelle","sulla","sulle","con","per","una","uno","gli","the","how","what","where","when","can","does","are","is","you","your","for","and","the"]).has(t));
}

/** Recupera una risposta FAQ solo quando la domanda è sufficientemente specifica. */
export function trovaRispostaFaqPino(query: string): { domanda: string; risposta: string } | null {
  const token = normalizzaFaq(query);
  if (token.length < 2) return null;
  const querySet = new Set(token);
  let migliore: { domanda: string; risposta: string; score: number; copertura: number } | null = null;
  for (const faq of FAQ_PINO) {
    const domanda = normalizzaFaq(faq.domanda);
    const risposta = normalizzaFaq(faq.risposta);
    const parole = new Set([...domanda, ...risposta]);
    const comuni = token.filter((t) => parole.has(t));
    const comuniDomanda = token.filter((t) => domanda.includes(t));
    const score = comuniDomanda.length * 3 + comuni.length;
    const copertura = comuni.length / Math.max(1, querySet.size);
    if (!migliore || score > migliore.score) migliore = { ...faq, score, copertura };
  }
  if (!migliore || migliore.score < 6 || migliore.copertura < 0.5) return null;
  return { domanda: migliore.domanda, risposta: migliore.risposta };
}
