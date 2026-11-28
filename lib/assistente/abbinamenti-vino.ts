/**
 * Sommelier della filiera calabrese.
 *
 * Pino risponde alle domande di abbinamento cibo-vino restando dentro la
 * Calabria: per ogni prodotto tipico dichiara prima in che piatto o ricetta si
 * usa, poi i vitigni e i vini autoctoni più indicati, e infine cerca nel
 * catalogo le etichette e le cantine realmente presenti su Radici Calabria.
 *
 * La tabella è volutamente chiusa: i vini proposti sono SOLO calabresi, così
 * una domanda come «che vino bevo con la 'nduja?» non finisce su un Chianti.
 * La stessa tabella fornisce i termini di ricerca usati dal planner, così il
 * recupero delle etichette non dipende da come il modello formula la query.
 */

/** Categoria della filiera a cui appartiene il prodotto tipico. */
export type CategoriaProdottoVinoPino =
  | "ortaggi"
  | "salumi"
  | "formaggi"
  | "conserve"
  | "pesce"
  | "dolci";

export type AbbinamentoVinoPino = {
  /** Nome canonico del prodotto, come compare nel catalogo. */
  prodotto: string;
  categoria: CategoriaProdottoVinoPino;
  /** In che piatto o ricetta si usa il prodotto. */
  piatti: string[];
  /** Vini e vitigni autoctoni calabresi indicati. */
  vini: string[];
  /** Termini con cui cercare le etichette nel catalogo. */
  terminiCatalogo: string[];
};

/**
 * Vini e vitigni ammessi. Serve anche ai test: tutto ciò che Pino propone
 * deve stare in questa lista, che contiene solo denominazioni calabresi.
 */
export const VINI_CALABRESI_AMMESSI: readonly string[] = [
  "cirò bianco",
  "cirò rosato",
  "cirò rosso",
  "cirò classico",
  "cirò riserva",
  "gaglioppo",
  "magliocco",
  "magliocco dolce",
  "greco bianco",
  "greco nero",
  "greco di bianco",
  "mantonico",
  "savuto",
  "bivongi",
  "terre di cosenza",
  "terre di cosenza bianco",
  "terre di cosenza rosso",
  "verbicaro",
  "pollino",
];

type VoceAbbinamento = {
  prodotto: string;
  categoria: CategoriaProdottoVinoPino;
  /** Espressioni che identificano il prodotto nella domanda. */
  forme: RegExp;
  piatti: string[];
  vini: string[];
  terminiCatalogo: string[];
};

/**
 * Prodotti tipici calabresi con piatto e vitigni. Le forme sono regex sulla
 * domanda normalizzata (minuscolo, apostrofi resi dritti).
 */
const ABBINAMENTI: readonly VoceAbbinamento[] = [
  {
    prodotto: "Cipolla Rossa di Tropea IGP",
    categoria: "ortaggi",
    forme: /\bcipoll[ae]\b/,
    piatti: [
      "cruda in insalata con pomodorini e origano",
      "caramellata o in agrodolce su formaggi e carni",
      "nella frittata e nella pasta",
    ],
    vini: ["Cirò Bianco", "Cirò Rosato", "Greco Bianco"],
    terminiCatalogo: ["cirò bianco", "cirò rosato", "greco bianco"],
  },
  {
    prodotto: "'Nduja di Spilinga",
    categoria: "salumi",
    forme: /\b(?:nduja|n'duja|nduglia)\b/,
    piatti: [
      "spalmata sulla bruschetta",
      "sciolta nel sugo di pomodoro per la pasta",
      "sulle uova al tegamino o sulla pizza",
    ],
    vini: ["Magliocco", "Gaglioppo", "Cirò Rosso", "Terre di Cosenza Rosso"],
    terminiCatalogo: ["magliocco", "gaglioppo", "cirò rosso", "terre di cosenza"],
  },
  {
    prodotto: "Soppressata calabrese",
    categoria: "salumi",
    forme: /\b(?:soppressat[ae]|salame|salumi|capocollo|pancetta|guanciale)\b/,
    piatti: [
      "nel tagliere di salumi con pane e olive",
      "nel panino di strada",
      "come base di un sugo saporito",
    ],
    vini: ["Cirò Rosso", "Savuto", "Gaglioppo"],
    terminiCatalogo: ["cirò rosso", "savuto", "gaglioppo"],
  },
  {
    prodotto: "Caciocavallo Silano DOP",
    categoria: "formaggi",
    forme: /\b(?:caciocavall[oi]|caciocavallo silano)\b/,
    piatti: [
      "alla piastra o gratinato",
      "in tagliere con miele e confetture",
      "nella pasta al forno e nelle verdure ripiene",
    ],
    vini: ["Greco di Bianco", "Mantonico", "Cirò Bianco", "Magliocco"],
    terminiCatalogo: ["greco di bianco", "mantonico", "cirò bianco", "magliocco"],
  },
  {
    prodotto: "Pecorino Crotonese DOP",
    categoria: "formaggi",
    forme: /\b(?:pecorin[oi]|pecorino crotonese)\b/,
    piatti: [
      "stagionato in tagliere con fichi e mosto cotto",
      "grattugiato su pasta e minestre",
      "fresco con le verdure del territorio",
    ],
    vini: ["Cirò Rosso", "Magliocco", "Greco di Bianco"],
    terminiCatalogo: ["cirò rosso", "magliocco", "greco di bianco"],
  },
  {
    prodotto: "Conserve e sott'olio calabresi",
    categoria: "conserve",
    forme: /\b(?:conserve?|sott'?oli[oi]|sottaceti|marmellat[ae]|confettur[ae]|pomodor[ei])\b/,
    piatti: [
      "in antipasto con pane casereccio",
      "come condimento di bruschette e panini",
      "accanto a formaggi e salumi",
    ],
    vini: ["Cirò Bianco", "Greco Bianco", "Mantonico"],
    terminiCatalogo: ["cirò bianco", "greco bianco", "mantonico"],
  },
  {
    prodotto: "Pesce e prodotti ittici calabresi",
    categoria: "pesce",
    forme: /\b(?:pesce|pesce spada|tonno|alici|sarde|stoccafisso|baccalà|polpo)\b/,
    piatti: [
      "alla griglia con olio e limone",
      "in umido con pomodorini e capperi",
      "marinato o in insalata di mare",
    ],
    vini: ["Cirò Bianco", "Greco Bianco", "Cirò Rosato"],
    terminiCatalogo: ["cirò bianco", "greco bianco", "cirò rosato"],
  },
  {
    prodotto: "Dolci tipici calabresi",
    categoria: "dolci",
    forme: /\b(?:dolc[ei]|torrone|mostacciol[oi]|fichi|vino cotto|confetti|gelato)\b/,
    piatti: [
      "a fine pasto con il caffè",
      "con la frutta secca e i fichi",
      "nel tagliere dei dolci della tradizione",
    ],
    vini: ["Greco di Bianco", "Mantonico", "Magliocco Dolce"],
    terminiCatalogo: ["greco di bianco", "mantonico", "magliocco"],
  },
];

/** Vini citati spesso fuori dalla Calabria: non vanno mai proposti. */
export const VINI_NON_CALABRESI_PINO: readonly string[] = [
  "chianti",
  "barolo",
  "barbaresco",
  "brunello",
  "prosecco",
  "pinot grigio",
  "sangiovese",
  "nebbiolo",
  "primitivo di manduria",
  "nero d'avola",
  "aglianico del vulture",
  "verdicchio",
  "trebbiano",
  "soave",
  "fiano di avellino",
  "falanghina",
];

/** Normalizza la domanda per il confronto (minuscolo, apostrofi dritti). */
function normalizza(query: string): string {
  return String(query ?? "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const RE_VINO = /\bvin[oi]\b/;
const RE_MARCATORE_ABBINAMENTO =
  /\b(?:abbin\w*|sommelier|accoppia\w*|accompagn\w*|da bere|bere con|cosa bevo|cosa si beve|per accompagnare|in abbinamento)\b/;
const RE_CHIESTA_VINO =
  /\b(?:con che vino|con quale vino|che vino (?:bevo|bere|abbino|mi consigli|con|per|su)|quale vino (?:bevo|bere|abbino|mi consigli|con|per|su)|quali vini|vino (?:per|ideale|giusto|migliore)|un vino (?:per|da abbinare))\b/;
/** «abbinamento caciocavallo silano»: il vino è sottinteso dalla parola stessa. */
const RE_SOLO_ABBINAMENTO = /\b(?:abbinament\w*|sommelier)\b/;

/**
 * Vero quando l'utente chiede un abbinamento cibo-vino.
 *
 * Serve il vino con una formula di abbinamento (o la sola parola
 * «abbinamento»): «che vino rosso calabrese vendete?» resta una ricerca di
 * prodotti, non un abbinamento.
 */
export function richiestaAbbinamentoVinoPino(query: string): boolean {
  const testo = normalizza(query);
  if (RE_SOLO_ABBINAMENTO.test(testo)) return true;
  if (!RE_VINO.test(testo)) return false;
  if (RE_MARCATORE_ABBINAMENTO.test(testo) || RE_CHIESTA_VINO.test(testo)) return true;
  // «cipolla di Tropea e vino?»: il prodotto tipico rende implicito l'abbinamento.
  return ABBINAMENTI.some((voce) => voce.forme.test(testo));
}

/** Prodotto tipico riconosciuto nella domanda, o `null`. */
export function abbinamentoVinoPino(query: string): AbbinamentoVinoPino | null {
  const testo = normalizza(query);
  const voce = ABBINAMENTI.find((candidato) => candidato.forme.test(testo));
  if (!voce) return null;
  return {
    prodotto: voce.prodotto,
    categoria: voce.categoria,
    piatti: [...voce.piatti],
    vini: [...voce.vini],
    terminiCatalogo: [...voce.terminiCatalogo],
  };
}

/**
 * Termini con cui cercare le etichette nel catalogo. Con un prodotto
 * riconosciuto sono i suoi vitigni; senza prodotto si cercano i vitigni
 * autoctoni in generale, così la risposta ha comunque etichette reali.
 */
export function terminiRicercaViniPino(query: string): string[] {
  const abbinamento = abbinamentoVinoPino(query);
  if (abbinamento) return abbinamento.terminiCatalogo;
  return ["magliocco", "gaglioppo", "cirò", "greco di bianco"];
}

/** Etichetta restituita dal catalogo, nella forma minima che serve al testo. */
export type EtichettaVinoPino = {
  nome: string;
  slug: string | null;
  prezzo: number;
  negozio: string;
};

/** Minuscolo e senza accenti, per confrontare i nomi dei vini. */
function senzaAccenti(testo: string): string {
  return normalizza(testo)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Vero se il nome del prodotto sembra un vino calabrese del catalogo. */
export function vinoCalabreseCatalogoPino(nome: string): boolean {
  const testo = senzaAccenti(nome);
  if (/\bvin[oi]\b/.test(testo)) return true;
  return VINI_CALABRESI_AMMESSI.some((vino) =>
    testo.includes(senzaAccenti(vino))
  );
}

function prezzoItEuro(prezzo: number): string {
  const valore = Number.isFinite(prezzo) ? prezzo : 0;
  return `€${valore.toFixed(2).replace(".", ",")}`;
}

/**
 * Risposta deterministica del sommelier: piatto, vitigni calabresi e, se ci
 * sono, le etichette reali del catalogo.
 *
 * Il ramo conoscenza del sito risponde sui prodotti tipici citando le schede e
 * non propone mai un vino: questa funzione è la risposta dedicata a chi chiede
 * un abbinamento. Restituisce `null` quando la domanda non è un abbinamento.
 */
export function rispostaAbbinamentoVinoPino(
  query: string,
  etichette: readonly EtichettaVinoPino[] = [],
  lingua: "it" | "en" = "it"
): string | null {
  if (!richiestaAbbinamentoVinoPino(query)) return null;

  const abbinamento = abbinamentoVinoPino(query);
  const vini = etichette.filter((etichetta) =>
    vinoCalabreseCatalogoPino(etichetta.nome)
  );

  if (lingua === "en") {
    const righe: string[] = [];
    if (abbinamento) {
      righe.push(`**${abbinamento.prodotto}** — how it is served:`);
      for (const piatto of abbinamento.piatti) righe.push(`- ${piatto}`);
      righe.push("");
      righe.push(`**Calabrian wines to pair:** ${abbinamento.vini.join(", ")}.`);
    } else {
      righe.push(
        "Tell me which Calabrian speciality you are cooking and I will suggest a pairing. In the meantime, the native grapes that work best at the table are Gaglioppo, Magliocco and Greco di Bianco: all Calabrian."
      );
    }
    if (vini.length > 0) {
      righe.push("");
      righe.push("**Labels available on Radici Calabria:**");
      for (const etichetta of vini) {
        const link = etichetta.slug
          ? `[${etichetta.nome}](/prodotto/${encodeURIComponent(etichetta.slug)})`
          : `**${etichetta.nome}**`;
        righe.push(`- ${link} — €${etichetta.prezzo.toFixed(2)} (${etichetta.negozio})`);
      }
    } else {
      righe.push("");
      righe.push(
        "The labels of this wine are not in the catalogue yet: I can still suggest the grape and, if you like, look for the Calabrian wine shops on Radici Calabria."
      );
    }
    return righe.join("\n");
  }

  const righe: string[] = [];
  if (abbinamento) {
    righe.push(`**${abbinamento.prodotto}** — in cucina:`);
    for (const piatto of abbinamento.piatti) righe.push(`- ${piatto}`);
    righe.push("");
    righe.push(`**Vini calabresi indicati:** ${abbinamento.vini.join(", ")}.`);
  } else {
    righe.push(
      "Dimmi per quale prodotto tipico calabrese ti serve l'abbinamento e ti indico piatto e vino. Intanto, i vitigni autoctoni che funzionano meglio a tavola sono Gaglioppo, Magliocco e Greco di Bianco: tutti calabresi."
    );
  }
  if (vini.length > 0) {
    righe.push("");
    righe.push("**Etichette disponibili su Radici Calabria:**");
    for (const etichetta of vini) {
      const link = etichetta.slug
        ? `[${etichetta.nome}](/prodotto/${encodeURIComponent(etichetta.slug)})`
        : `**${etichetta.nome}**`;
      righe.push(`- ${link} — ${prezzoItEuro(etichetta.prezzo)} (${etichetta.negozio})`);
    }
  } else {
    righe.push("");
    righe.push(
      "Nel catalogo attuale le etichette di questo vino non sono ancora presenti: ti indico comunque il vitigno e, se vuoi, cerco le enoteche calabresi su Radici Calabria."
    );
  }
  return righe.join("\n");
}

/**
 * Blocco di istruzioni per la risposta finale. Elenca piatto e vitigni del
 * prodotto riconosciuto e impone tre cose: solo vini calabresi, solo etichette
 * del catalogo per i nomi reali, nessuna formula di mancato ritrovamento
 * (che accenderebbe lo stato TRISTE di Pino anche a risposta riuscita).
 */
export function bloccoAbbinamentoVinoPino(query: string): string {
  if (!richiestaAbbinamentoVinoPino(query)) return "";

  const abbinamento = abbinamentoVinoPino(query);
  const righe: string[] = [
    "ABBINAMENTO CIBO-VINO CALABRESE:",
    "- Rispondi come sommelier della filiera calabrese: proponi SOLO vini e vitigni autoctoni calabresi (Cirò, Gaglioppo, Magliocco, Greco, Mantonico, Savuto, Bivongi, Terre di Cosenza, Verbicaro). Non citare mai vini di altre regioni.",
    "- Struttura la risposta in due passaggi: prima in che piatto o ricetta si usa il prodotto, poi i vini indicati per quell'utilizzo.",
  ];

  if (abbinamento) {
    righe.push(`- Prodotto riconosciuto: ${abbinamento.prodotto}.`);
    righe.push(`- Piatti e ricette da citare: ${abbinamento.piatti.join("; ")}.`);
    righe.push(`- Vini e vitigni indicati: ${abbinamento.vini.join(", ")}.`);
  } else {
    righe.push(
      "- Se il prodotto tipico non è esplicito, proponi comunque due o tre vitigni calabresi adatti al tipo di portata, spiegando il perché sensoriale (tannino, acidità, sapidità, morbidezza, grassezza, piccantezza). Non chiudere con domande: la risposta deve essere completa."
    );
  }

  righe.push(
    `- Etichette e cantine: cita SOLO vini, cantine o attività vinicole presenti nei dati del catalogo, con il link markdown fornito. Termini utili per la ricerca: ${terminiRicercaViniPino(query).join(", ")}.`,
    "- Non chiudere con domande o rinvii (niente «vuoi sapere», «preferisci», «dimmi se»): la risposta deve essere completa e auto-sufficiente. Non usare formule come «non ho trovato», «non risultano» o «nessun risultato» per le etichette.",
    "- Se il catalogo non contiene un'etichetta del vino indicato, scrivi «Nel catalogo attuale le etichette di questo vino non sono ancora presenti» e indica comunque il vitigno."
  );
  return righe.join("\n");
}
