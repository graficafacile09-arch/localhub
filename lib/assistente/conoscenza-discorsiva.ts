import { callGroqText } from "@/lib/ai/groq";
import type { RisultatoConoscenza } from "@/lib/conoscenza/cerca";
import {
  chiamataAIConBudgetPino,
  tempoRestanteAIPino,
  type BudgetPinoAI,
} from "./budget-ai";

/**
 * Modalità INFORMATIVA di Pino: i testi editoriali del sito sono la fonte e il
 * modello scrive la spiegazione. Vive fuori da `index.ts` perché è un secondo
 * sito di chiamata Groq: qui ha un contratto esplicito e un solo punto di
 * ingresso, senza schede di attività in uscita.
 */

/** Quante fonti editoriali entrano nel contesto della risposta discorsiva. */
export const MAX_FONTI_CONOSCENZA_PINO = 6;

/**
 * Impacchetta gli estratti come `<fonti>` numerate: il modello vede testo
 * integrale e percorso, non titoli troncati, e può citare il link giusto.
 */
export function elencoFontiConoscenzaPino(fonti: RisultatoConoscenza[]): string {
  return fonti
    .slice(0, MAX_FONTI_CONOSCENZA_PINO)
    .map((f, i) => `[${i + 1}] ${f.titolo} — ${f.url}\n${f.estratto}`)
    .join("\n\n");
}

export function messaggioConoscenzaNonTrovataPino(
  domanda: string,
  lingua: "it" | "en"
): string {
  if (lingua === "en") {
    return `I could not find an explanation of "${domanda}" in the site content. I can still search for shops, products or local businesses if you tell me what you need.`;
  }
  return `Nei contenuti del sito non trovo una spiegazione per «${domanda}». Se vuoi, posso cercare attività, negozi o prodotti del territorio: dimmi cosa ti interessa.`;
}

/**
 * Risposta discorsiva di riserva, quando il modello non è disponibile.
 * Usa gli estratti reali: niente schede, niente «non trovo risultati».
 */
export function componiRispostaConoscenzaDeterministicaPino(
  fonti: RisultatoConoscenza[],
  lingua: "it" | "en"
): string {
  const prime = fonti.slice(0, MAX_FONTI_CONOSCENZA_PINO);
  if (prime.length === 0) return "";

  if (prime.length === 1) {
    const fonte = prime[0];
    return lingua === "en"
      ? `${fonte.estratto}\n\nRead more: [${fonte.titolo}](${fonte.url})`
      : `${fonte.estratto}\n\nApprofondisci: [${fonte.titolo}](${fonte.url})`;
  }

  // In prosa non serve ripetere ogni scheda: le prime quattro tengono la
  // risposta leggibile, le altre restano raggiungibili dai link.
  const voci = prime.slice(0, 4).map((f) => {
    const estratto =
      f.estratto.length > 700 ? `${f.estratto.slice(0, 700).trimEnd()}…` : f.estratto;
    return `**${f.titolo}** — ${estratto} ([${f.titolo}](${f.url}))`;
  });

  return lingua === "en"
    ? `Here is what the site's content says:\n\n${voci.join("\n\n")}`
    : `Ecco cosa raccontano i contenuti del sito:\n\n${voci.join("\n\n")}`;
}

/**
 * Modalità INFORMATIVA: i testi editoriali del sito sono la fonte e il modello
 * scrive la spiegazione. Nessuna scheda di attività in uscita.
 */
export async function componiRispostaConoscenzaPino({
  domanda,
  fonti,
  lingua,
  budgetAI,
}: {
  domanda: string;
  fonti: RisultatoConoscenza[];
  lingua: "it" | "en";
  budgetAI: BudgetPinoAI | undefined;
}): Promise<string> {
  const sistema =
    lingua === "en"
      ? `You are Pino, the assistant of Radici Calabria, the portal of Calabrian shops and typical products.
Answer using ONLY the sources inside <fonti>.
Write 2-4 short paragraphs of natural prose, not a list of cards: explain what the topic is, the context and the data that appear in the sources, then close with the link to the most relevant page as a markdown link [title](/path).
Never invent data, numbers or names that are not in the sources; if the sources are not enough, say so.
Frame the agri-food supply chains as the agri-food supply chains of the Calabria Region, valued by Radici Calabria, never as "Radici Calabria's chains".
For a park or area, the sources also include its municipalities and their certified products (DOP, IGP, PAT): list the ones present in the sources.
Do not list shops, businesses or prices: this is not a product search.`
      : `Sei Pino, l'assistente di Radici Calabria, il portale dei negozi e dei prodotti tipici calabresi.
Rispondi usando SOLO le fonti dentro <fonti>.
Scrivi 2-4 paragrafi brevi di prosa naturale, non un elenco di schede: spiega che cosa è l'argomento, il contesto e i dati che compaiono nelle fonti, poi chiudi con il link alla pagina più pertinente come link markdown [titolo](/percorso).
Non inventare dati, numeri o nomi che non sono nelle fonti; se le fonti non bastano, dillo.
Inquadra le filiere come le filiere agroalimentari della Regione Calabria, valorizzate da Radici Calabria: mai come "filiere di Radici Calabria".
Per un parco o un'area, le fonti includono anche i suoi comuni e i prodotti certificati (DOP, IGP, PAT): elenca quelli presenti nelle fonti.
Non elencare negozi, attività commerciali o prezzi: non è una ricerca di prodotti.`;

  try {
    const testo = await chiamataAIConBudgetPino(budgetAI, () =>
      callGroqText({
        systemPrompt: sistema,
        userPrompt: `Domanda: ${domanda}\n\n<fonti>\n${elencoFontiConoscenzaPino(fonti)}\n</fonti>`,
        maxTokens: 600,
        temperature: 0.2,
        timeoutMs: Math.max(1_500, Math.min(6_000, tempoRestanteAIPino(budgetAI))),
      })
    );
    if (testo && testo.trim()) return testo.trim();
  } catch (error) {
    console.warn("[pino-conoscenza] risposta discorsiva non disponibile:", error);
  }
  return componiRispostaConoscenzaDeterministicaPino(fonti, lingua);
}
