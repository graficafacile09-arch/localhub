/**
 * Che cosa è il prodotto di cui si parla.
 *
 * Pino incontra tre famiglie molto diverse e non può trattarle allo stesso modo:
 *   - VINO / BEVANDA: si consiglia un piatto calabrese da abbinare;
 *   - DOLCE / PRODOTTO FINITO PRONTO AL CONSUMO (Piparelle, Torrone di Bagnara,
 *     Bocconotti, Pitta 'mpigliata, Ciotaredda, Cannaritoli, miele, confetture,
 *     liquori): non si cucina e non si trasforma in ricette, si abbina soltanto;
 *   - ALIMENTO DA CUCINARE (ortaggi, legumi, paste, formaggi, salumi): ricetta
 *     completa con dosi per 4 e abbinamento da sommelier.
 *
 * Le tre famiglie sono riconosciute dal nome e dalla categoria del prodotto con
 * parole chiave esplicite: così la domanda automatica della scheda prodotto e
 * le istruzioni del prompt restano coerenti tra loro.
 */

/** Famiglia del prodotto, nell'ordine in cui va verificata. */
export type CategoriaProdottoPino = "dolce" | "vino" | "alimento";

/** Normalizza nome e categoria per il confronto (minuscolo, apostrofi dritti). */
function normalizza(testo: string): string {
  return String(testo ?? "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Dolci e prodotti finiti pronti al consumo: non si cucinano. `liquor` e
 * `amaro` stanno qui (e non tra le bevande) perché per Pino sono chiusure da
 * abbinare a un dolce o a un passito, non piatti da consigliare.
 */
const RE_DOLCE_FINITO =
  /\b(?:piparell\w*|torron\w*|bocconott\w*|pitta\s*'?\s*mpigliata|ciotare[dt]d[ae]|cannarit[oi]l[oi]|mostacciol\w*|biscott\w*|dolc\w*|miele|confettur\w*|marmellat\w*|liquor\w*|amar[oi])\b/;

/**
 * Vino o bevanda: in questi casi si chiede il piatto da abbinare. Niente
 * «rosso», «bianco» o «rosato» da soli: sono anche i colori di una cipolla o
 * di una melanzana, e «Cipolla bianca di Castrovillari» deve restare un
 * alimento da cucinare.
 */
const RE_BEVANDA =
  /\b(vin[oi]|vitign[oi]|cirò|ciro|gaglioppo|magliocco|mantonico|greco|aglianico|savuto|bivongi|verbicaro|pecorello|moscato|grappa|distillat|birra|spumante|passito)\b/;

/** Vero per un dolce o un prodotto finito pronto al consumo. */
export function eProdottoFinitoPino(nome: string): boolean {
  return RE_DOLCE_FINITO.test(normalizza(nome));
}

/** Vero per un vino o una bevanda. */
export function eBevandaProdottoPino(nome: string): boolean {
  return RE_BEVANDA.test(normalizza(nome));
}

/**
 * Ortaggi e legumi restano sempre alimenti da cucinare: senza questo controllo
 * «Cipolla bianca di Castrovillari» rischiava di finire tra i vini per via di
 * «bianca» (e «cipolla dolce» tra i dolci per via di «dolce»).
 */
const RE_ORTOGGI_LEGUMI =
  /\b(cipoll\w*|patat\w*|melanzan\w*|pomodor\w*|peperon\w*|fagiol\w*|ceci|lenticchi\w*|zucchin\w*|zucc\w*|cavol\w*|carciof\w*|asparag\w*|broccol\w*|spinac\w*|bietol\w*|cicori\w*|radicchi\w*|finocchi[oi])\b/;

/** Preparati a base di ortaggi (liquori, confetture) che non sono da cucinare. */
const RE_PREPARATO_ORTOGGIO = /\b(liquor\w*|amar[oi]|confettur\w*|marmellat\w*)\b/;

/**
 * Famiglia del prodotto. Ortaggi e legumi vengono riconosciuti per primi, poi
 * il dolce: «liquore al bergamotto» e «amaro calabrese» sono chiusure da
 * abbinare, non piatti.
 */
export function categoriaProdottoPino(
  nome: string,
  categoria = ""
): CategoriaProdottoPino {
  const testo = `${nome} ${categoria}`;
  const nomeNormalizzato = normalizza(nome);
  if (
    RE_ORTOGGI_LEGUMI.test(nomeNormalizzato) &&
    !RE_PREPARATO_ORTOGGIO.test(normalizza(testo))
  ) {
    return "alimento";
  }
  if (eProdottoFinitoPino(testo)) return "dolce";
  if (eBevandaProdottoPino(testo)) return "vino";
  return "alimento";
}

/**
 * Domanda precompilata della scheda prodotto. Per i dolci e i prodotti finiti
 * chiede SOLO l'abbinamento enologico: niente ricette, nemmeno come spunto.
 */
export function domandaProdottoPino(nome: string, categoria = ""): string {
  switch (categoriaProdottoPino(nome, categoria)) {
    case "dolce":
      return `Consigliami l'abbinamento enologico calabrese perfetto (vino passito, dolce o liquore artigianale) per gustare al meglio «${nome}», senza proporre ricette di cucina`;
    case "vino":
      return `Consigliami un piatto tradizionale calabrese da cucinare e quali prodotti tipici abbinare a «${nome}»`;
    default:
      return `Dammi una ricetta tradizionale calabrese con «${nome}» e consigliami il vino calabrese ideale da abbinare`;
  }
}

type AbbinamentoDolcePino = {
  /** Espressioni che identificano il dolce nella domanda normalizzata. */
  forme: RegExp;
  /** Vini passiti e liquori calabresi indicati. */
  vini: string[];
  /** Perché l'abbinamento funziona, in una riga. */
  nota: string;
};

/**
 * Abbinamenti da sommelier per i dolci calabresi. La tabella è chiusa e
 * contiene solo vini passiti, dolci e liquori della regione.
 */
const ABBINAMENTI_DOLCI: readonly AbbinamentoDolcePino[] = [
  {
    forme: /\bpiparell\w*/,
    vini: ["Moscato al Governo di Saracena", "Greco di Bianco DOC"],
    nota: "mandorla tostata e spezie chiedono la dolcezza aromatica del Moscato, con l'acidità del Greco a pulire il palato",
  },
  {
    forme: /\btorron\w*/,
    vini: ["Greco di Bianco DOC", "Moscato al Governo di Saracena"],
    nota: "la tostatura di mandorle e miele trova equilibrio nell'acidità e negli aromi di zagara del passito",
  },
  {
    forme: /\bbocconott\w*/,
    vini: ["Moscato al Governo di Saracena", "Magliocco Dolce"],
    nota: "il ripieno di mandorle, cacao e mosto cotto si sposa con il Moscato, mentre il Magliocco Dolce regge il cacao",
  },
  {
    forme: /\bpitta\s*'?\s*mpigliata/,
    vini: ["Greco di Bianco DOC", "Moscato al Governo di Saracena"],
    nota: "miele, noci e uvetta vogliono un passito aromatico con acidità viva, non un vino stucchevole",
  },
  {
    forme: /\bciotare[dt]d[ae]/,
    vini: ["Moscato al Governo di Saracena", "Mantonico"],
    nota: "la sfoglia croccante e il ripieno di mosto cotto si alleggeriscono con la freschezza del Mantonico",
  },
  {
    forme: /\bcannarit[oi]l[oi]/,
    vini: ["Greco di Bianco DOC", "Mantonico"],
    nota: "la frittura e il miele richiedono acidità e profumo, che il Greco di Bianco porta naturalmente in tavola",
  },
  {
    forme: /\bmostacciol\w*/,
    vini: ["Magliocco Dolce", "Greco di Bianco DOC"],
    nota: "le spezie e il cacao del mostacciolo trovano nel Magliocco Dolce un abbinamento per concordanza",
  },
  {
    forme: /\b(?:biscott\w*|dolc\w*)/,
    vini: ["Moscato al Governo di Saracena", "Greco di Bianco DOC", "Magliocco Dolce"],
    nota: "dolcezza e aromi del passito accompagnano la pasta biscottata senza coprirla",
  },
  {
    forme: /\bmiele\b/,
    vini: ["Moscato al Governo di Saracena", "Greco di Bianco DOC"],
    nota: "il miele chiama un passito aromatico: stessa dolcezza, ma con acidità e profumo che evitano l'effetto piatto",
  },
  {
    forme: /\b(?:confettur\w*|marmellat\w*)/,
    vini: ["Greco di Bianco DOC", "Mantonico"],
    nota: "l'acidità della frutta vuole un passito fresco, non troppo alcolico, per restare equilibrato",
  },
  {
    forme: /\b(?:liquor\w*|amar[oi])\b/,
    vini: ["liquori artigianali calabresi (amaro al bergamotto, liquore alla liquirizia)", "Moscato al Governo di Saracena"],
    nota: "il liquore si serve a fine pasto, freddo, accanto a un passito o a un dolce secco per chiudere senza coprire gli aromi",
  },
];

/** Abbinamenti indicati per il dolce riconosciuto nella domanda. */
export function abbinamentiDolcePino(query: string): AbbinamentoDolcePino | null {
  const testo = normalizza(query);
  return ABBINAMENTI_DOLCI.find((voce) => voce.forme.test(testo)) ?? null;
}

/** Vini passiti e liquori calabresi da citare per il dolce. */
export function viniDolcePino(query: string): string[] {
  const abbinamento = abbinamentiDolcePino(query);
  if (abbinamento) return [...abbinamento.vini];
  return ["Moscato al Governo di Saracena", "Greco di Bianco DOC", "Magliocco Dolce"];
}

/** Termini con cui cercare nel catalogo passiti e liquori calabresi. */
export function terminiRicercaDolcePino(query: string): string[] {
  const abbinamento = abbinamentiDolcePino(query);
  if (abbinamento) {
    return abbinamento.vini
      .map((vino) => normalizza(vino).replace(/\(.*?\)/g, "").trim())
      .filter(Boolean)
      .map((vino) => (vino.includes("moscato") ? "moscato" : vino));
  }
  return ["moscato", "greco di bianco", "passito", "liquore"];
}

/**
 * Blocco di istruzioni per dolci e prodotti finiti: tutta la risposta è
 * abbinamento da sommelier, con il divieto esplicito di ricette e cotture.
 * Restituisce una stringa vuota quando la domanda non riguarda un dolce.
 */
export function bloccoDolceFinitoPino(query: string): string {
  if (!eProdottoFinitoPino(query)) return "";

  const abbinamento = abbinamentiDolcePino(query);
  const vini = viniDolcePino(query);

  return [
    "DOLCE O PRODOTTO FINITO PRONTO AL CONSUMO — SOLO ABBINAMENTO, NIENTE RICETTE:",
    "- Questo prodotto è già pronto e si mangia così com'è: NON spiegare come cucinarlo, NON proporre ricette, impasti, cotture, farciture o trasformazioni in altri piatti, nemmeno se l'utente le chiede.",
    "- Non descrivere il prodotto con una scheda organolettica generica: dedica tutta la risposta all'abbinamento da sommelier.",
    `- Abbinamenti calabresi indicati: ${vini.join(", ")}.`,
    abbinamento
      ? `- Perché funziona: ${abbinamento.nota}.`
      : "- Spiega l'equilibrio tra dolcezza, spezie, mandorle e tostatura, acidità e aromaticità: il passito deve accompagnare il dolce, non coprirlo.",
    "- Indica la temperatura di servizio (passito e vino dolce 10-12 °C, liquore freddo) e il perché tecnico dell'abbinamento, dicendo se è concordanza o contrapposizione.",
    "- Cita le bottiglie reali presenti in <suggerimenti_catalogo> con il link /prodotto/[slug] copiato da quel blocco, con prezzo; se il catalogo non ha l'etichetta, indica comunque il vino o il liquore senza inventare schede.",
    "- Non chiudere con domande o rinvii: la risposta è completa e auto-sufficiente.",
  ].join("\n");
}

/**
 * Blocco di istruzioni per gli alimenti da cucinare: una ricetta completa e un
 * vino concreto, mai una descrizione organolettica o un consiglio soft.
 */
export function bloccoAlimentoDaCucinarePino(query: string): string {
  if (eProdottoFinitoPino(query)) return "";

  return [
    "ALIMENTO DA CUCINARE — RISPOSTA IN DUE SEZIONI, NIENTE DESCRIZIONI GENERICHE:",
    "- È vietato limitarsi a una descrizione organolettica del prodotto o a consigli soft e generici («si può usare in insalata o nei soffritti», «ottimo con i formaggi»).",
    "- Struttura la risposta in due sezioni nette, senza premesse:",
    "  1. **La Ricetta Calabrese**: titolo del piatto della tradizione in cui il prodotto è protagonista, ingredienti con dosi per 4 persone e procedimento pratico passo-passo.",
    "  2. **L'Abbinamento del Sommelier**: un vino calabrese specifico con denominazione e vitigno, temperatura di servizio e spiegazione tecnica dell'abbinamento (tannino, acidità, sapidità, morbidezza, grassezza, piccantezza).",
    "- Se il catalogo non ha una ricetta specifica del prodotto, NON dire «non ho trovato ricette»: scegli subito una ricetta tradizionale calabrese collaudata, per esempio Frittata calabrese con Cipolla bianca di Castrovillari e Pecorino del Pollino, Cipolle bianche di Castrovillari ripiene al forno oppure Spaghetti con cipolla bianca stufata e guanciale.",
    "- L'abbinamento vino è obbligatorio in ogni risposta: indica una bottiglia calabrese reale (es. Terre di Cosenza DOC Pollino Rosato o Montonico IGP) e linkala se è presente in <suggerimenti_catalogo>.",
    "- Linka il vino reale con /prodotto/[slug] se è presente in <suggerimenti_catalogo>; non inventare slug, prezzi o etichette.",
    "- Non chiudere con domande o rinvii: la risposta è completa e auto-sufficiente.",
  ].join("\n");
}
