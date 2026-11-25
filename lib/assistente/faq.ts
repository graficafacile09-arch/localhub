/** FAQ pubbliche Radici Calabria: contenuti allineati alla pagina /faq. */
export const FAQ_PINO = [
  {
    "domanda": "Che cos'è Radici Calabria?",
    "risposta": "Radici Calabria è una piattaforma informativa e di connessione territoriale dedicata alle filiere agroalimentari e ai territori della Calabria. Presenta produttori, imprese, prodotti, stagionalità e iniziative del territorio."
  },
  {
    "domanda": "Radici Calabria vende i prodotti dei produttori?",
    "risposta": "No. Radici Calabria non è parte di vendite o accordi tra utenti e produttori. Ogni rapporto diretto è concluso esclusivamente tra le parti."
  },
  {
    "domanda": "Come posso segnalare un contenuto inesatto?",
    "risposta": "Puoi scrivere tramite la pagina Contatti indicando il contenuto e il motivo della segnalazione. Esaminiamo le segnalazioni e, se necessario, modifichiamo o rimuoviamo il contenuto."
  },
  {
    "domanda": "Cos'è Pino?",
    "risposta": "Pino è un sistema di intelligenza artificiale generativa basato su modelli linguistici (LLM) eseguiti tramite Groq. Risponde a partire dai contenuti del portale."
  },
  {
    "domanda": "Le risposte di Pino sono consulenza professionale?",
    "risposta": "No. Le risposte di Pino non sostituiscono una consulenza professionale, medica, legale, fiscale o di sicurezza alimentare, e Pino non è un operatore umano. Verifica le informazioni presso i produttori o le fonti ufficiali."
  },
  {
    "domanda": "Le certificazioni DOP, IGP, PAT, De.Co. e Biologico sono verificate?",
    "risposta": "Gli operatori aderenti garantiscono la veridicità delle certificazioni dichiarate sulle proprie schede. Radici Calabria non le certifica autonomamente, ma interviene quando riceve una segnalazione di non conformità."
  },
  {
    "domanda": "Come posso far inserire la mia impresa?",
    "risposta": "Puoi contattarci tramite la pagina Contatti. Le regole per produttori e operatori sono descritte nella pagina Produttori e Filiere."
  },
  {
    "domanda": "Come posso creare un account?",
    "risposta": "Puoi registrarti con email e password oppure, quando disponibile, con Google o Apple."
  },
  {
    "domanda": "Come vengono trattati i miei dati?",
    "risposta": "I dati sono trattati secondo l'Informativa Privacy, che descrive dati trattati, finalità, fornitori, conservazione e diritti. I cookie e lo storage locale sono descritti nella Cookie Policy."
  },
  {
    "domanda": "Quali metodi di pagamento posso utilizzare?",
    "risposta": "I pagamenti disponibili dipendono dal Venditore e dal checkout mostrato per quello specifico ordine. Il metodo effettivamente utilizzabile è quello indicato nel checkout."
  },
  {
    "domanda": "Come funzionano resi, rimborsi e recesso?",
    "risposta": "Le regole applicabili dipendono dal tipo di acquisto, dal Venditore e dalla normativa vigente. Le richieste relative alla vendita, compresi recesso, resi, rimborsi e garanzia, devono essere gestite con il Venditore, fatti salvi i diritti inderogabili previsti dalla legge."
  },
  {
    "domanda": "Chi gestisce la consegna o il ritiro?",
    "risposta": "Le modalità di consegna, ritiro o esecuzione del servizio dipendono dalla specifica offerta e dal Venditore. Il Venditore gestisce l'esecuzione della vendita o della prestazione."
  },
  {
    "domanda": "Come posso aprire un negozio su Radici Calabria?",
    "risposta": "Dalla piattaforma puoi accedere all'area Venditore e seguire il percorso di registrazione e attivazione previsto. L'accesso alle funzioni operative può dipendere dal completamento delle informazioni e delle verifiche richieste."
  },
  {
    "domanda": "Chi è responsabile dei prodotti e dei servizi pubblicati?",
    "risposta": "Il Venditore è responsabile delle proprie offerte, dei dati identificativi, dei prezzi, della disponibilità, delle caratteristiche e degli obblighi commerciali relativi a ciò che propone, secondo la normativa applicabile."
  }
] as const;

const STOP = new Set(["che","come","cosa","quale","quali","dove","quando","perche","posso","puoi","sono","della","delle","degli","dello","nella","nelle","sulla","sulle","con","per","una","uno","gli","the","how","what","where","when","can","does","are","is","you","your","for","and"]);
function rispostaFaqNota(domanda: string): { domanda: string; risposta: string } | null {
  const faq = FAQ_PINO.find((voce) => voce.domanda === domanda);
  return faq ? { domanda: faq.domanda, risposta: faq.risposta } : null;
}

function tokenFaq(testo: string): string[] {
  const base = testo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(t=>t.length>2&&!STOP.has(t));
  const sinonimi: Record<string, string[]> = {
    funziona: ["piattaforma", "utilizzare"],
    comprare: ["acquisto", "ordine"],
    acquistare: ["acquisto", "ordine"],
    ordinare: ["ordine", "checkout"],
    pagare: ["pagamento"],
    pagamenti: ["pagamento"],
    venditore: ["venditori"],
    registrazione: ["registrarmi", "account"],
    account: ["registrazione"],
    reso: ["resi", "rimborso"],
    rimborsare: ["rimborso"],
  };
  return Array.from(new Set(base.flatMap(t => [t, ...(sinonimi[t] ?? [])])));
}
/** Risponde solo a domande con corrispondenza sufficientemente specifica nelle FAQ pubblicate. */
export function trovaRispostaFaqPino(query: string): { domanda: string; risposta: string } | null {
  const testo = String(query ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  // Domande naturali su resi e consegna: il token scoring le perdeva perché
  // la FAQ usa il plurale ("resi", "rimborsi") o il sinonimo "consegna"
  // invece di "spedizione". La risposta resta quella pubblicata in /faq.
  // Aprire un negozio ha una risposta pubblicata; l'annullamento no, e
  // non viene dirottato su una FAQ generica.
  if (
    /\b(?:aprire|apro|apri|apriamo|avviare|creare|registrare)\b[\s\S]{0,40}\b(?:negozio|attivita|venditore)\b/.test(testo)
  ) {
    const faq = rispostaFaqNota("Come posso aprire un negozio su Radici Calabria?");
    if (faq) return faq;
  }
  // L'annullamento non ha una FAQ pubblicata dedicata: il ramo capacità di
  // Pino gestisce l'azione e indica il Venditore, senza inventare policy.
  if (
    /\b(?:annull\w*|disdic\w*|cancell\w*)\b[\s\S]{0,40}\b(?:ordine|acquisto|prenotazione|appuntamento)\b/.test(testo)
  ) {
    return null;
  }
  if (/\b(?:reso|resi|rimbors\w*|recesso|garanzia)\b/.test(testo)) {
    const faq = rispostaFaqNota("Come funzionano resi, rimborsi e recesso?");
    if (faq) return faq;
  }
  if (
    /\b(?:spedizion\w*|consegn\w*|ritiro)\b/.test(testo) &&
    !/\b(?:pagament\w*|pagare|metodo|metodi)\b/.test(testo)
  ) {
    const faq = rispostaFaqNota("Chi gestisce la consegna o il ritiro?");
    if (faq) return faq;
  }
  const token=tokenFaq(query); if(token.length<2) return null;
  let best: {domanda:string;risposta:string;score:number;coverage:number}|null=null;
  for(const faq of FAQ_PINO){
    const q=tokenFaq(faq.domanda), all=new Set([...q,...tokenFaq(faq.risposta)]);
    const matched=token.filter(t=>all.has(t)), matchedQ=token.filter(t=>q.includes(t));
    const score=matchedQ.length*3+matched.length, coverage=matched.length/token.length;
    if(!best||score>best.score) best={domanda:faq.domanda,risposta:faq.risposta,score,coverage};
  }
  return best&&best.score>=5&&best.coverage>=0.5?{domanda:best.domanda,risposta:best.risposta}:null;
}
