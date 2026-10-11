import { FAQ_CATEGORIES } from "@/lib/faq-data";
import { normalizzaRichiesta } from "./local-intents";

type Voce = { titolo: string; risposta: string; url: string; alias: string[] };

const PAGINE: Voce[] = [
 { titolo: "Aprire un negozio", risposta: "Per aprire un negozio, entra nell'area Venditore e segui il percorso di registrazione e attivazione. L'accesso alle funzioni operative può dipendere dalle informazioni e dalle verifiche richieste.", url: "/venditori", alias: ["aprire negozio", "creare negozio", "vendere su incitta", "diventare venditore", "area venditore"] },
 { titolo: "Ordini e checkout", risposta: "Per effettuare un ordine, seleziona il prodotto o servizio, aggiungilo al carrello quando previsto, controlla il riepilogo e inserisci i dati richiesti. Prima dell'invio verifica articoli, quantità, importi, consegna o ritiro e metodo di pagamento.", url: "/faq", alias: ["fare ordine", "effettuare ordine", "checkout", "carrello", "acquistare"] },
 { titolo: "Metodi di pagamento", risposta: "I metodi disponibili dipendono dal negozio, dall'importo e dalla configurazione del checkout. Possono essere proposti carta, Klarna, Scalapay, PayPal, SEPA Direct Debit o altri metodi supportati; fa fede ciò che viene mostrato nel checkout del singolo ordine.", url: "/faq", alias: ["pagare", "pagamento", "carta", "paypal", "klarna", "scalapay", "sepa", "bonifico", "metodi di pagamento"] },
 { titolo: "Consegna e ritiro", risposta: "La modalità di consegna, ritiro o esecuzione del servizio dipende dalla specifica offerta e dal Venditore. Il Venditore gestisce l'esecuzione della vendita secondo le condizioni applicabili.", url: "/regolamento-consegne", alias: ["spedizione", "consegna", "consegne", "ritiro", "chi consegna", "corriere", "costo consegna"] },
 { titolo: "Regolamento Consegne", risposta: "InCittà fornisce strumenti tecnologici per facilitare il contatto tra Venditori e soggetti terzi: non effettua né organizza materialmente le consegne e non ne assume il controllo operativo. Leggi il regolamento completo per le condizioni applicabili.", url: "/regolamento-consegne", alias: ["regolamento consegne", "regole corrieri", "incitta fa le consegne", "incitta gestisce consegne", "responsabilità corriere"] },
 { titolo: "Privacy", risposta: "L'Informativa Privacy descrive i dati trattati, le finalità, la conservazione e i diritti dell'interessato. Consulta il documento completo per i dettagli pubblicati sul sito.", url: "/privacy", alias: ["privacy", "dati personali", "trattamento dati", "gdpr"] },
 { titolo: "Cookie Policy", risposta: "La Cookie Policy descrive le tecnologie utilizzate e le modalità di gestione delle preferenze. Consulta il documento completo per le informazioni pubblicate sul sito.", url: "/cookie", alias: ["cookie", "cookies", "cookie policy", "consenso cookie"] },
 { titolo: "Termini e condizioni", risposta: "I Termini e condizioni descrivono le regole generali di utilizzo della piattaforma. Per un acquisto consulta anche le Condizioni di vendita e i Termini per gli Acquirenti.", url: "/termini", alias: ["termini", "termini e condizioni", "condizioni sito", "regole sito"] },
 { titolo: "Attrazioni ed eventi", risposta: "La sezione Attrazioni raccoglie luoghi da visitare, monumenti, borghi, cultura, sapori ed eventi nei dintorni di Castrovillari.", url: "/attrazioni", alias: ["attrazioni", "cosa vedere", "luoghi da visitare", "monumenti", "borghi"] },
 { titolo: "Prodotti tipici", risposta: "La sezione Eccellenze Calabresi raccoglie i prodotti tipici del territorio effettivamente pubblicati dai negozi. La disponibilità cambia in base al catalogo.", url: "/prodotti-tipici", alias: ["prodotti tipici", "eccellenze calabresi", "sapori locali", "prodotti del pollino"] },
];

const STOP = new Set(["come","cosa","dove","quale","quali","che","per","una","uno","gli","della","delle","dello","degli","del","dei","nel","nella","nelle","sul","sulla","con","sono","posso","vorrei","fare","incitta","citta"]);
function tokens(s: string): string[] {
 return normalizzaRichiesta(s).replace(/[^a-z0-9\\s]/g," ").split(/\\s+/).filter(t => t.length >= 3 && !STOP.has(t));
}
function score(q: string, titolo: string, alias: string[], risposta = ""): number {
 const qn = normalizzaRichiesta(q);
 const qTokens = tokens(q);
 const titoloTokens = tokens(titolo);
 const aliasTokens = alias.flatMap(tokens);
 const rispostaTokens = tokens(risposta);
 let n = titolo.includes(qn) || alias.some(a => normalizzaRichiesta(a).includes(qn) || qn.includes(normalizzaRichiesta(a))) ? 12 : 0;
 for (const t of qTokens) {
  if (titoloTokens.includes(t)) n += 5;
  else if (aliasTokens.includes(t)) n += 4;
  else if (rispostaTokens.includes(t)) n += 1;
 }
 return n;
}
export function cercaConoscenzaPino(query: string): { titolo: string; risposta: string; url: string } | null {
 const q = normalizzaRichiesta(query ?? "").trim();
 if (!q) return null;
 const items = [
  ...PAGINE.map(v => ({ ...v, score: score(q,v.titolo,v.alias,v.risposta) + 1 })),
  ...FAQ_CATEGORIES.flatMap(c => c.domande.map(f => ({ titolo:f.domanda, risposta:f.risposta, url:"/faq", alias:[c.titolo], score:score(q,f.domanda,[c.titolo],f.risposta) })))
 ].sort((a,b) => b.score-a.score);
 const first = items[0];
 if (!first || first.score < (tokens(q).length <= 1 ? 10 : 9)) return null;
 return { titolo:first.titolo, risposta:first.risposta + "\n\nApprofondisci: [" + first.titolo + "](" + first.url + ").", url:first.url };
}
