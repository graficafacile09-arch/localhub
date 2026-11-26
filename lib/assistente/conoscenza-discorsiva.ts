import { callGroqText } from "@/lib/ai/groq";
import type { RisultatoConoscenza } from "@/lib/conoscenza/cerca";
import { INDICE_GENERATO } from "@/lib/conoscenza/indice-generato";
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
  const sezioni = sezioniAttivePino().map((s) => s.titolo).slice(0, 8);
  const elenco = sezioni.length > 0 ? ` Le sezioni del sito che posso spiegarti sono: ${sezioni.join(", ")}.` : "";
  if (lingua === "en") {
    return `I could not find an explanation of "${domanda}" in the site content.${elenco} I can also search for shops, products or local businesses.`;
  }
  return `Nei contenuti del sito non trovo una spiegazione per «${domanda}».${elenco} Posso anche cercare attività, negozi o prodotti del territorio.`;
}

/**
 * Risposta onesta per le richieste di luoghi da visitare che non trovano un
 * riscontro nei testi del sito: il sito non ha (più) una guida alle attrazioni,
 * i luoghi sono raccontati nelle schede Territorio. Niente elenchi inventati.
 */
export function messaggioLuoghiNonDisponibiliPino(lingua: "it" | "en"): string {
  if (lingua === "en") {
    return "The site no longer has a guide to places to visit. Parks, territorial areas and towns are described in the Territorio section (/territorio): tell me which one you are interested in and I will explain it.";
  }
  return "Il sito non ha più una guida ai luoghi da visitare. Parchi, aree territoriali e comuni sono raccontati nella sezione Territorio (/territorio): dimmi quale ti interessa e te lo racconto.";
}

/**
 * Sezioni pubbliche attualmente attive sul sito, lette dall'indice generato in
 * build (`lib/conoscenza/indice-generato.ts`). Se l'indice manca, nessuna
 * sezione viene inventata: l'elenco resta vuoto.
 */
export function sezioniAttivePino(): { percorso: string; titolo: string }[] {
  return INDICE_GENERATO.pagine.map((p) => ({ percorso: p.percorso, titolo: p.titolo }));
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
 * Nessuna fonte trovata: il modello spiega con naturalezza che non ci sono
 * corrispondenze esatte e propone alternative tra filiere e territori. Se il
 * modello non risponde, resta il messaggio fisso come riserva.
 */
export async function componiRispostaSenzaFontiPino({
  domanda,
  lingua,
  budgetAI,
  richiestaLuoghi,
}: {
  domanda: string;
  lingua: "it" | "en";
  budgetAI: BudgetPinoAI | undefined;
  richiestaLuoghi: boolean;
}): Promise<string> {
  const sezioni = sezioniAttivePino().map((s) => `${s.titolo} (${s.percorso})`).slice(0, 12);
  const sistema =
    lingua === "en"
      ? `You are Pino, the assistant of Radici Calabria. The site search found no exact match for the user's question.
Say so naturally in 2-3 short sentences, without inventing places, prices, hours or names.
Then suggest coherent alternatives from these site sections: ${sezioni.join("; ")}.${richiestaLuoghi ? " Parks, territorial areas and towns are described in the Territorio section (/territorio); the site has no guide to places to visit." : ""}
Close with a markdown link to the most relevant section.`
      : `Sei Pino, l'assistente di Radici Calabria. La ricerca nel sito non ha trovato corrispondenze esatte per la domanda dell'utente.
Dillo con naturalezza in 2-3 frasi brevi, senza inventare luoghi, prezzi, orari o nomi.
Poi proponi alternative coerenti tra queste sezioni del sito: ${sezioni.join("; ")}.${richiestaLuoghi ? " Parchi, aree territoriali e comuni sono nella sezione Territorio (/territorio): il sito non ha una guida ai luoghi da visitare." : ""}
Chiudi con un link markdown alla sezione più pertinente.`;

  try {
    const testo = await chiamataAIConBudgetPino(budgetAI, () =>
      callGroqText({
        systemPrompt: sistema,
        userPrompt: `Domanda: ${domanda}`,
        maxTokens: 400,
        temperature: 0.2,
        timeoutMs: Math.max(1_500, Math.min(6_000, tempoRestanteAIPino(budgetAI))),
      })
    );
    if (testo && testo.trim()) return testo.trim();
  } catch (error) {
    console.warn("[pino-conoscenza] risposta senza fonti non disponibile:", error);
  }
  return richiestaLuoghi
    ? messaggioLuoghiNonDisponibiliPino(lingua)
    : messaggioConoscenzaNonTrovataPino(domanda, lingua);
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
