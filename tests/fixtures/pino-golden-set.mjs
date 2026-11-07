/**
 * Pino — Golden set live.
 *
 * Richieste reali con l'esito minimo atteso, da eseguire contro un ambiente
 * deployato (`npm run benchmark:pino:golden`). Non è in `prebuild`: parla con
 * la produzione e consuma quota, quindi si lancia a mano dopo un deploy.
 *
 * Ogni caso dichiara SOLO ciò che è verificabile dal catalogo reale:
 * - `mustNot`: testi che non devono mai comparire (vicoli ciechi, accuse false);
 * - `mustMatch`: testo atteso;
 * - `minNegozi` / `minProdotti`: quantità minima restituita.
 */
export const pinoGoldenCases = [
  // Bisogni
  { id: "fame", text: "ho fame", minNegozi: 1, mustNot: [/Non risultano attività con questi criteri/, /Non trovo risultati per questa richiesta/] },
  { id: "fame-en", text: "I'm hungry", minNegozi: 1, mustNot: [/No businesses matching these criteria/] },
  { id: "sete", text: "ho sete", mustNot: [/Non trovo risultati per questa richiesta/] },
  { id: "birra", text: "una birra", mustNot: [/Non trovo risultati per questa richiesta/] },
  // Attività e sinonimi
  { id: "panificio", text: "panificio", minNegozi: 1, mustNot: [/Non ho trovato esattamente/] },
  { id: "panetteria", text: "panetteria", minNegozi: 1, mustNot: [/Non risultano attività con questi criteri/] },
  { id: "alimentari", text: "alimentari", minNegozi: 1 },
  { id: "gastronomia", text: "gastronomia", mustNot: [/Non trovo risultati per questa richiesta/] },
  { id: "bar", text: "bar", mustNot: [/Non trovo risultati per questa richiesta/] },
  { id: "pizzeria", text: "pizzeria", mustNot: [/Prova con un'altra categoria e zona/] },
  // Prodotti
  { id: "pane", text: "pane", minProdotti: 1 },
  { id: "panino", text: "un panino", minProdotti: 1 },
  { id: "olio", text: "olio", minProdotti: 1 },
  { id: "pasta", text: "pasta", minProdotti: 1 },
  { id: "regalo", text: "un regalo", minProdotti: 1 },
  // Servizi e luoghi deterministici
  { id: "farmacia", text: "farmacia", mustMatch: [/farmaci/i] },
  { id: "meteo", text: "meteo domani", mustMatch: [/temperatura|Domani|°C/i] },
  { id: "attrazioni", text: "cosa vedere", mustMatch: [/Castello|guida Attrazioni/i] },
  // Conversazione
  { id: "saluto", text: "ciao", mustMatch: [/Ciao|posso aiutarti|Dimmi/i] },
  { id: "identita", text: "chi sei?", mustMatch: [/Pino/i] },
  // Refusi
  { id: "refuso-panificio", text: "paneficio", minNegozi: 1 },
  // Correzione (il golden set la esegue come turno singolo: deve comunque
  // rispondere senza il vicolo cieco generico)
  { id: "correzione", text: "no, intendevo un panino", mustNot: [/Non risultano attività con questi criteri/] },
];
