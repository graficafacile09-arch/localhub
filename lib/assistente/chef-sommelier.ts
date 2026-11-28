/**
 * Pino chef e sommelier della cucina calabrese.
 *
 * Le domande su ricette, cottura e uso in cucina dei prodotti tipici non sono
 * ricerche di catalogo: senza un percorso dedicato finivano nel vuoto («non ho
 * trovato») e Pino diventava TRISTE. Qui c'è la risposta completa: da chef le
 * ricette tradizionali e un consiglio pratico di cottura, da sommelier i vini
 * calabresi indicati (ripresi da `abbinamenti-vino.ts`), dal catalogo le schede
 * reali dei prodotti con prezzo e link.
 *
 * Come per gli abbinamenti, la tabella è chiusa: le ricette e i vini proposti
 * sono solo calabresi. Per un prodotto fuori elenco la risposta non è un vuoto,
 * ma una proposta di cucina calabrese con l'invito a precisare il prodotto.
 */

import {
  abbinamentoVinoPino,
  vinoCalabreseCatalogoPino,
  type EtichettaVinoPino,
} from "./abbinamenti-vino";
import { eProdottoFinitoPino } from "./prodotti-pino";

/** Ricetta tradizionale calabrese con il suo procedimento in una riga. */
export type RicettaCucinaPino = {
  nome: string;
  preparazione: string;
};

/** Scheda di cucina di un prodotto tipico calabrese. */
export type SchedaCucinaPino = {
  /** Nome canonico del prodotto, come compare nel catalogo. */
  prodotto: string;
  /** 2-3 ricette o modi tradizionali di cucinarlo. */
  ricette: RicettaCucinaPino[];
  /** Consiglio pratico di cottura. */
  consiglio: string;
  /** Vini e vitigni calabresi indicati per questi piatti. */
  vini: string[];
  /** Termini con cui cercare le etichette nel catalogo. */
  terminiVino: string[];
  /** Termini con cui cercare il prodotto nel catalogo. */
  terminiProdotto: string[];
};

type VoceCucina = SchedaCucinaPino & {
  /** Espressioni che identificano il prodotto nella domanda normalizzata. */
  forme: RegExp;
};

/** Prodotto del catalogo nella forma minima che serve al testo. */
export type ProdottoCatalogoCucinaPino = {
  nome: string;
  slug: string | null;
  prezzo: number;
  negozio: string;
};

/** Normalizza la domanda per il confronto (minuscolo, apostrofi dritti). */
function normalizza(query: string): string {
  return String(query ?? "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function prezzoItEuro(prezzo: number): string {
  const valore = Number.isFinite(prezzo) ? prezzo : 0;
  return `€${valore.toFixed(2).replace(".", ",")}`;
}

/**
 * Prodotti della filiera calabrese con ricette, consiglio di cottura e vini.
 * Le `forme` sono regex sulla domanda normalizzata.
 */
const CUCINA: readonly VoceCucina[] = [
  {
    prodotto: "'Nduja di Spilinga",
    forme: /(?:^|[^a-z])(?:'?nduja|nduglia|n'duja)/,
    ricette: [
      {
        nome: "Fileja con la 'nduja",
        preparazione:
          "sciogli un cucchiaio di 'nduja in olio caldo con la passata di pomodoro, poi manteca la pasta e finisci con pecorino",
      },
      {
        nome: "Bruschette con 'nduja e ricotta",
        preparazione:
          "spalma la 'nduja sul pane abbrustolito e completa con ricotta fresca e un filo d'olio",
      },
      {
        nome: "Uova al tegamino con la 'nduja",
        preparazione:
          "fai sciogliere la 'nduja nel padellino, rompi le uova e cuoci con il coperchio finché l'albume è rappreso",
      },
    ],
    consiglio:
      "scioglierla sempre a fuoco dolce, con un cucchiaio d'olio o di passata: se la friggi a fuoco vivo il peperoncino si brucia e diventa amara",
    vini: ["Magliocco", "Cirò Rosso", "Gaglioppo"],
    terminiVino: ["magliocco", "cirò rosso", "gaglioppo"],
    terminiProdotto: ["nduja"],
  },
  {
    prodotto: "Cipolla Rossa di Tropea IGP",
    forme: /\bcipoll[ae]\b/,
    ricette: [
      {
        nome: "Insalata di cipolla di Tropea",
        preparazione:
          "affetta la cipolla sottile, condiscila con olio, origano, pomodorini e un pizzico di sale",
      },
      {
        nome: "Cipolla in agrodolce",
        preparazione:
          "stufala con olio e un cucchiaio d'acqua, poi sfuma con aceto e zucchero e lasciala caramellare",
      },
      {
        nome: "Frittata di cipolle",
        preparazione:
          "fai appassire le cipolle a fuoco basso, unisci le uova sbattute e cuoci la frittata per 5 minuti per lato",
      },
    ],
    consiglio:
      "per l'uso crudo tagliala finissima e lasciala dieci minuti in acqua e ghiaccio: perde l'aggressività e resta croccante",
    vini: ["Cirò Bianco", "Cirò Rosato", "Greco Bianco"],
    terminiVino: ["cirò bianco", "cirò rosato", "greco bianco"],
    terminiProdotto: ["cipolla tropea", "cipolla rossa"],
  },
  {
    prodotto: "Caciocavallo Silano DOP",
    forme: /\bcaciocavall[oi]\b/,
    ricette: [
      {
        nome: "Caciocavallo alla piastra",
        preparazione:
          "taglia fette spesse un dito e scaldale sulla piastra ben calda un minuto per lato, finché fila",
      },
      {
        nome: "Pasta al forno con caciocavallo",
        preparazione:
          "alterna pasta, ragù e fette di caciocavallo, poi gratina in forno a 200 °C per venti minuti",
      },
      {
        nome: "Caciocavallo impiccato",
        preparazione:
          "appendi le forme a una corda davanti al fuoco e lasciale ammorbidire, raccogliendo il formaggio fuso sul pane",
      },
    ],
    consiglio:
      "cuocilo a calore moderato e per pochi minuti: il caciocavallo stagionato fila bene ma, se lo scaldi troppo, rilascia il grasso e diventa gommoso",
    vini: ["Magliocco", "Cirò Rosso", "Greco di Bianco"],
    terminiVino: ["magliocco", "cirò rosso", "greco di bianco"],
    terminiProdotto: ["caciocavallo"],
  },
  {
    prodotto: "Soppressata e capocollo calabresi",
    forme: /\b(?:soppressat[ae]|capocollo|salame|salumi)\b/,
    ricette: [
      {
        nome: "Tagliere di salumi calabresi",
        preparazione:
          "affetta sottile soppressata e capocollo e servili con pane casereccio, olive e pecorino",
      },
      {
        nome: "Sugo con la soppressata",
        preparazione:
          "rosola la soppressata a cubetti con la cipolla, unisci la passata e lascia restringere per venti minuti",
      },
      {
        nome: "Panino di strada",
        preparazione:
          "farcisci la pitta con capocollo, cipolla di Tropea e un filo d'olio, poi scaldala sul testo",
      },
    ],
    consiglio:
      "servi i salumi a temperatura ambiente e tagliati sottili: il grasso si ammorbidisce e il profumo si sente tutto",
    vini: ["Cirò Rosso", "Savuto", "Gaglioppo"],
    terminiVino: ["cirò rosso", "savuto", "gaglioppo"],
    terminiProdotto: ["soppressata", "capocollo"],
  },
  {
    prodotto: "Sardella e rosamarina",
    forme: /\b(?:sardella|rosamarina|sardelle|alici)\b/,
    ricette: [
      {
        nome: "Bruschetta con la sardella",
        preparazione:
          "spalma la sardella sul pane caldo e finisci con olio, origano e una grattata di peperoncino",
      },
      {
        nome: "Patate con la sardella",
        preparazione:
          "lessa le patate, schiacciale con la sardella e condisci con olio e pepe",
      },
      {
        nome: "Rosamarina sul pane",
        preparazione:
          "usa la rosamarina come condimento a crudo su pane abbrustolito o su crostini di polenta",
      },
    ],
    consiglio:
      "la sardella è già pronta: va usata a crudo o appena intiepidita, mai bollita, altrimenti perde il profumo di pesce di mare",
    vini: ["Cirò Rosato", "Greco Bianco", "Cirò Bianco"],
    terminiVino: ["cirò rosato", "greco bianco", "cirò bianco"],
    terminiProdotto: ["sardella", "rosamarina"],
  },
  {
    prodotto: "Peperoni cruschi",
    forme: /\b(?:peperon[ei] crusch[oi]|crusch[oi]|peperoni secchi)\b|\bcruschi\b/,
    ricette: [
      {
        nome: "Pasta con i cruschi e mollica",
        preparazione:
          "friggi i cruschi pochi secondi, tostali con la mollica di pane e condisci la pasta con olio e pecorino",
      },
      {
        nome: "Patate e peperoni cruschi",
        preparazione:
          "lessa le patate, schiacciale e unisci i cruschi sbriciolati con un filo d'olio",
      },
      {
        nome: "Cruschi come contorno",
        preparazione:
          "friggili interi in olio caldo per pochi secondi e salali solo dopo averli scolati",
      },
    ],
    consiglio:
      "friggili in olio caldo ma non fumante per quindici-venti secondi: appena si gonfiano vanno scolati, e il sale si aggiunge solo alla fine",
    vini: ["Cirò Bianco", "Greco Bianco", "Cirò Rosato"],
    terminiVino: ["cirò bianco", "greco bianco", "cirò rosato"],
    terminiProdotto: ["peperoni cruschi", "cruschi"],
  },
  {
    prodotto: "Stocco di Mammola",
    forme: /\b(?:stocco|stoccafisso|baccalà)\b/,
    ricette: [
      {
        nome: "Stocco in umido con le patate",
        preparazione:
          "rosola lo stocco con cipolla e pomodoro, unisci le patate a pezzi e cuoci piano per un'ora",
      },
      {
        nome: "Stocco gratinato",
        preparazione:
          "sbollenta lo stocco, condiscilo con olio, pangrattato e prezzemolo e gratinalo in forno",
      },
      {
        nome: "Stocco con i fagioli",
        preparazione:
          "cuoci lo stocco con i fagioli cannellini già ammollati e lascia restringere il brodo",
      },
    ],
    consiglio:
      "lo stocco va ammollato almeno ventiquattro ore cambiando l'acqua più volte, poi va cotto a fuoco lento: se bolle forte si sfibra",
    vini: ["Cirò Bianco", "Greco Bianco", "Cirò Rosato"],
    terminiVino: ["cirò bianco", "greco bianco", "cirò rosato"],
    terminiProdotto: ["stocco"],
  },
  {
    prodotto: "Pecorino Crotonese DOP",
    forme: /\bpecorin[oi]\b/,
    ricette: [
      {
        nome: "Tagliere con pecorino e fichi",
        preparazione:
          "servi il pecorino stagionato a scaglie con fichi secchi, miele e mosto cotto",
      },
      {
        nome: "Pecorino grattugiato su pasta e minestre",
        preparazione:
          "grattugialo al momento sulla pasta con i cruschi o sulla minestra di ceci",
      },
      {
        nome: "Pecorino alla piastra",
        preparazione:
          "scalda fette spesse di pecorino fresco sulla piastra e servile con le verdure del territorio",
      },
    ],
    consiglio:
      "se è molto stagionato grattugialo solo all'ultimo: scaldato troppo fila e perde la grana; quello fresco va invece servito tiepido",
    vini: ["Cirò Rosso", "Magliocco", "Greco di Bianco"],
    terminiVino: ["cirò rosso", "magliocco", "greco di bianco"],
    terminiProdotto: ["pecorino"],
  },
  {
    prodotto: "Bergamotto di Reggio Calabria",
    forme: /\bbergamott[oi]\b/,
    ricette: [
      {
        nome: "Marmellata di bergamotto",
        preparazione:
          "cuoci le scorze con lo zucchero e il succo a fuoco basso per un'ora, finché la marmellata vela il cucchiaio",
      },
      {
        nome: "Liquore al bergamotto",
        preparazione:
          "lascia macerare le scorze in alcool per dieci giorni, poi unisci lo sciroppo di acqua e zucchero",
      },
      {
        nome: "Crema al bergamotto",
        preparazione:
          "profuma la crema pasticcera con le scorze mentre scalda, poi toglile prima di servire",
      },
    ],
    consiglio:
      "usa solo la parte gialla della scorza, senza la parte bianca: è quella che dà il profumo senza l'amaro",
    vini: ["Greco di Bianco", "Mantonico"],
    terminiVino: ["greco di bianco", "mantonico"],
    terminiProdotto: ["bergamotto"],
  },
  {
    prodotto: "Liquirizia di Rossano",
    forme: /\bliquirizia\b/,
    ricette: [
      {
        nome: "Gelato alla liquirizia",
        preparazione:
          "sciogli la liquirizia in polvere nella crema calda, poi manteca e lascia riposare in freezer",
      },
      {
        nome: "Dolci alla liquirizia",
        preparazione:
          "inserisci la liquirizia nell'impasto di biscotti e torrone, dove sostituisce lo zucchero in parte",
      },
      {
        nome: "Liquore alla liquirizia",
        preparazione:
          "fai macerare la radice in alcool per due settimane, poi unisci lo sciroppo e lascia riposare un mese",
      },
    ],
    consiglio:
      "la liquirizia in polvere si scioglie meglio in un liquido caldo e va aggiunta fuori dal fuoco: bollendo diventa amara",
    vini: ["Magliocco Dolce", "Greco di Bianco", "Mantonico"],
    terminiVino: ["magliocco", "greco di bianco", "mantonico"],
    terminiProdotto: ["liquirizia"],
  },
  {
    prodotto: "Tartufo del Pollino",
    forme: /\btartuf[oi]\b/,
    ricette: [
      {
        nome: "Tagliolini al tartufo del Pollino",
        preparazione:
          "manteca i tagliolini con burro e pecorino e aggiungi il tartufo a scaglie fuori dal fuoco",
      },
      {
        nome: "Uova al tartufo",
        preparazione:
          "cuoci le uova al tegamino con burro e completa con lamelle di tartufo prima di portare in tavola",
      },
      {
        nome: "Carne alla piastra con tartufo",
        preparazione:
          "griglia la carne, lasciala riposare e coprila con scaglie di tartufo e olio crudo",
      },
    ],
    consiglio:
      "il tartufo non si cuoce: si grattugia a crudo sul piatto tiepido, altrimenti il calore porta via tutto il profumo",
    vini: ["Magliocco", "Terre di Cosenza Rosso", "Cirò Rosso"],
    terminiVino: ["magliocco", "terre di cosenza", "cirò rosso"],
    terminiProdotto: ["tartufo"],
  },
  {
    prodotto: "Fichi di Cosenza DOP",
    forme: /\bfich[oi]\b/,
    ricette: [
      {
        nome: "Fichi secchi ripieni",
        preparazione:
          "apri i fichi secchi, farciscili con mandorle e scorza d'arancia e passali al forno a 160 °C",
      },
      {
        nome: "Crostata di fichi",
        preparazione:
          "stendi la frolla, copri con la confettura di fichi e cuoci a 180 °C per mezz'ora",
      },
      {
        nome: "Fichi con pecorino e salumi",
        preparazione:
          "servi i fichi freschi accanto a pecorino crotonese e capocollo, con un filo di miele",
      },
    ],
    consiglio:
      "per i fichi secchi un passaggio breve in forno a 160 °C li ammorbidisce e tira fuori lo zucchero, senza seccarli ancora",
    vini: ["Greco di Bianco", "Mantonico", "Magliocco Dolce"],
    terminiVino: ["greco di bianco", "mantonico", "magliocco"],
    terminiProdotto: ["fichi"],
  },
  {
    prodotto: "Funghi della Sila",
    forme: /\bfungh[oi]\b/,
    ricette: [
      {
        nome: "Funghi della Sila trifolati",
        preparazione:
          "saltali in padella con aglio, olio e prezzemolo a fuoco vivo per dieci minuti",
      },
      {
        nome: "Pasta con i funghi della Sila",
        preparazione:
          "rosola i funghi con la salsiccia, unisci la panna o la passata e manteca la pasta",
      },
      {
        nome: "Funghi sott'olio",
        preparazione:
          "sbollenta i funghi in acqua e aceto, asciugali bene e conservali in olio con aglio e alloro",
      },
    ],
    consiglio:
      "puliscili con un panno umido e non con l'acqua: se si bagnano troppo assorbono liquido e in padella lessano invece di rosolare",
    vini: ["Magliocco", "Terre di Cosenza Rosso", "Cirò Rosso"],
    terminiVino: ["magliocco", "terre di cosenza", "cirò rosso"],
    terminiProdotto: ["funghi"],
  },
];

const RE_CUCINA =
  /\b(?:come (?:si )?cucin\w*|come cucinare|come cuocer\w*|come si cuoce|cottura|come usare|come si usa|come utilizzare|come preparare|come si prepara|come condire|come valorizzare|ricett[ae]|cosa (?:posso )?preparare|cosa cucinare|cosa fare con|piatt[oi] con|in cucina|come si mangia)\b/;

/**
 * Parole che rendono alimentare la domanda: senza una di queste «come si usa
 * il sito?» non va trattata come una domanda di cucina.
 */
const RE_CIBO =
  /\b(?:prodotto|prodotto tipico|ingredient\w*|condiment\w*|piatto|pasta|carne|pesce|verdur\w*|contorn\w*|antipast\w*|prim[oi]|second[oi]|dolc[ei]|sughi?|sugo|caprett\w*|maiale|pollo|patate|riso|minestr\w*|frittat\w*|pane|formagg\w*|salum\w*|salsicc\w*|verdure)\b/;

/** Vero quando la domanda chiede come cucinare o usare un prodotto. */
export function richiestaCucinaPino(query: string): boolean {
  const testo = normalizza(query);
  // Un dolce o un prodotto finito è già pronto: non si cucina, si abbina.
  if (eProdottoFinitoPino(testo)) return false;
  if (!RE_CUCINA.test(testo)) return false;
  if (CUCINA.some((voce) => voce.forme.test(testo))) return true;
  return RE_CIBO.test(testo);
}

/** Scheda di cucina del prodotto riconosciuto nella domanda, o `null`. */
export function schedaCucinaPino(query: string): SchedaCucinaPino | null {
  const testo = normalizza(query);
  const voce = CUCINA.find((candidato) => candidato.forme.test(testo));
  if (!voce) return null;
  return {
    prodotto: voce.prodotto,
    ricette: voce.ricette.map((ricetta) => ({ ...ricetta })),
    consiglio: voce.consiglio,
    vini: [...voce.vini],
    terminiVino: [...voce.terminiVino],
    terminiProdotto: [...voce.terminiProdotto],
  };
}

/**
 * Termini con cui cercare nel catalogo il prodotto da cucinare. Per un prodotto
 * fuori elenco si usano le parole della domanda ripulite dalle formule di
 * cucina, così si può comunque trovare qualcosa (es. «come cucinare il
 * capretto» → «capretto»).
 */
export function terminiRicercaProdottoCucinaPino(query: string): string[] {
  const scheda = schedaCucinaPino(query);
  if (scheda) return scheda.terminiProdotto;
  return [];
}

/** Termini con cui cercare le etichette del vino indicato. */
export function terminiRicercaVinoCucinaPino(query: string): string[] {
  const scheda = schedaCucinaPino(query);
  if (scheda) return scheda.terminiVino;
  const abbinamento = abbinamentoVinoPino(query);
  if (abbinamento) return abbinamento.terminiCatalogo;
  return ["magliocco", "cirò", "greco di bianco"];
}

/** Vini calabresi indicati per il piatto, o `null` se non è una domanda di cucina. */
export function viniCucinaPino(query: string): string[] | null {
  const scheda = schedaCucinaPino(query);
  if (scheda) return scheda.vini;
  const abbinamento = abbinamentoVinoPino(query);
  if (abbinamento) return abbinamento.vini;
  return richiestaCucinaPino(query) ? [] : null;
}

/**
 * Consiglio rapido da chef per chi chiede solo il vino: «vino per la 'nduja»
 * deve ricordare anche come valorizzare il piatto, non solo l'etichetta.
 */
export function consiglioChefRapidoPino(query: string): string | null {
  const scheda = schedaCucinaPino(query);
  if (scheda) {
    const prima = scheda.ricette[0];
    return `**Un consiglio da chef:** ${prima.nome.toLowerCase()} — ${prima.preparazione}. In cottura, ${scheda.consiglio}.`;
  }
  const abbinamento = abbinamentoVinoPino(query);
  if (!abbinamento) return null;
  return `**Un consiglio da chef:** ${abbinamento.prodotto} rende al meglio ${
    abbinamento.piatti[0]
  }, servito tiepido e con un filo d'olio crudo.`;
}

/** Etichette del catalogo che sono davvero vini calabresi. */
function soloViniCalabresi(
  etichette: readonly EtichettaVinoPino[]
): EtichettaVinoPino[] {
  return etichette.filter((etichetta) =>
    vinoCalabreseCatalogoPino(etichetta.nome)
  );
}

function linkProdotto(prodotto: { nome: string; slug: string | null }): string {
  return prodotto.slug
    ? `[${prodotto.nome}](/prodotto/${encodeURIComponent(prodotto.slug)})`
    : `**${prodotto.nome}**`;
}

/** Ricette generiche di cucina calabrese, per un prodotto fuori elenco. */
const RICETTE_GENERICHE: readonly RicettaCucinaPino[] = [
  {
    nome: "Soffritto calabrese",
    preparazione:
      "olio, cipolla di Tropea e un pizzico di peperoncino: la base di quasi tutti i primi della regione",
  },
  {
    nome: "Pasta con la mollica",
    preparazione:
      "tosta la mollica di pane in olio con aglio e peperoncino, poi condisci la pasta con pecorino",
  },
  {
    nome: "Verdure ripiene al forno",
    preparazione:
      "farcisci le verdure con pane, pecorino e salumi e cuoci in forno a 180 °C per mezz'ora",
  },
];

/**
 * Risposta deterministica chef + sommelier: ricette calabresi, consiglio di
 * cottura, vini calabresi indicati e, se ci sono, le schede reali del catalogo.
 *
 * Restituisce `null` quando la domanda non è una richiesta di cucina.
 */
export function rispostaChefSommelierPino(
  query: string,
  prodotti: readonly ProdottoCatalogoCucinaPino[] = [],
  etichette: readonly EtichettaVinoPino[] = [],
  lingua: "it" | "en" = "it"
): string | null {
  if (!richiestaCucinaPino(query)) return null;

  const scheda = schedaCucinaPino(query);
  const vini = scheda ? scheda.vini : [];
  const etichetteVino = soloViniCalabresi(etichette);

  if (lingua === "en") {
    const righe: string[] = [];
    righe.push(
      scheda
        ? `**Chef Pino** — how to cook ${scheda.prodotto}:`
        : "**Chef Pino** — the Calabrian way of cooking:"
    );
    for (const ricetta of scheda ? scheda.ricette : RICETTE_GENERICHE) {
      righe.push(`- **${ricetta.nome}**: ${ricetta.preparazione}`);
    }
    if (scheda) righe.push("", `**Cooking tip:** ${scheda.consiglio}.`);
    if (vini.length > 0) {
      righe.push("", `**Sommelier:** Calabrian wines for these dishes: ${vini.join(", ")}.`);
    }
    if (etichetteVino.length > 0) {
      righe.push("", "**Labels on Radici Calabria:**");
      for (const etichetta of etichetteVino) {
        righe.push(
          `- ${linkProdotto(etichetta)} — €${etichetta.prezzo.toFixed(2).replace(".", ",")} (${etichetta.negozio})`
        );
      }
    }
    if (prodotti.length > 0) {
      righe.push("", "**From the Radici Calabria catalogue:**");
      for (const prodotto of prodotti) {
        righe.push(
          `- ${linkProdotto(prodotto)} — €${prodotto.prezzo.toFixed(2).replace(".", ",")} (${prodotto.negozio})`
        );
      }
    }
    return righe.join("\n");
  }

  const righe: string[] = [];
  righe.push(
    scheda
      ? `**Da chef** — ${scheda.prodotto} in cucina:`
      : "**Da chef** — la cucina calabrese in tre mosse:"
  );
  const ricette = scheda ? scheda.ricette : RICETTE_GENERICHE;
  for (const ricetta of ricette) {
    righe.push(`- **${ricetta.nome}**: ${ricetta.preparazione}`);
  }
  if (scheda) {
    righe.push("", `**Consiglio di cottura:** ${scheda.consiglio}.`);
  } else {
    righe.push(
      "",
      "Dimmi quale prodotto tipico vuoi cucinare (per esempio la 'nduja, i peperoni cruschi o lo stocco) e ti preparo le ricette della tradizione con il vino giusto."
    );
  }

  if (vini.length > 0) {
    righe.push("", `**Da sommelier:** per questi piatti i vini calabresi indicati sono ${vini.join(", ")}.`);
  }

  if (etichetteVino.length > 0) {
    righe.push("", "**Etichette disponibili su Radici Calabria:**");
    for (const etichetta of etichetteVino) {
      righe.push(
        `- ${linkProdotto(etichetta)} — ${prezzoItEuro(etichetta.prezzo)} (${etichetta.negozio})`
      );
    }
  }

  if (prodotti.length > 0) {
    righe.push("", "**Dal catalogo di Radici Calabria:**");
    for (const prodotto of prodotti) {
      righe.push(
        `- ${linkProdotto(prodotto)} — ${prezzoItEuro(prodotto.prezzo)} (${prodotto.negozio})`
      );
    }
  }

  return righe.join("\n");
}

/**
 * Blocco di istruzioni per i prompt. Ricette, consiglio di cottura e vini del
 * prodotto riconosciuto, con il divieto di formule di mancato ritrovamento:
 * un esito negativo nel testo accende lo stato TRISTE anche a risposta riuscita.
 */
export function bloccoChefSommelierPino(query: string): string {
  if (!richiestaCucinaPino(query)) return "";

  const scheda = schedaCucinaPino(query);
  const righe: string[] = [
    "CUCINA E VINO DELLA TRADIZIONE CALABRESE:",
    "- Rispondi come chef e sommelier calabrese: ricette tradizionali, consiglio pratico di cottura e SOLO vini e vitigni autoctoni calabresi (Cirò, Gaglioppo, Magliocco, Greco, Mantonico, Savuto, Bivongi, Terre di Cosenza, Verbicaro).",
    "- Struttura in due parti: prima «Da chef» con 2-3 ricette e un consiglio di cottura, poi «Da sommelier» con il vino calabrese indicato.",
  ];

  if (scheda) {
    righe.push(`- Prodotto riconosciuto: ${scheda.prodotto}.`);
    righe.push(
      `- Ricette da citare: ${scheda.ricette
        .map((ricetta) => `${ricetta.nome} (${ricetta.preparazione})`)
        .join("; ")}.`
    );
    righe.push(`- Consiglio di cottura: ${scheda.consiglio}.`);
    righe.push(`- Vini calabresi indicati: ${scheda.vini.join(", ")}.`);
    righe.push(
      `- Schede del catalogo: cerca il prodotto con searchProducts (termini: ${scheda.terminiProdotto.join(", ")}) e cita solo le schede trovate, con prezzo e link markdown.`
    );
  } else {
    righe.push(
      "- Il prodotto non è nell'elenco dei tipici: proponi la cucina calabrese in generale (soffritto, pasta con la mollica, verdure ripiene) con un abbinamento calabrese completo. Non chiudere con domande."
    );
  }

  righe.push(
    "- Non chiudere con domande o rinvii (niente «vuoi sapere», «preferisci», «dimmi se»): la risposta deve essere completa e auto-sufficiente. Non usare formule come «non ho trovato», «non risultano» o «nessun risultato»: se una scheda non c'è, prosegui con ricette e vino senza commentare l'assenza."
  );
  return righe.join("\n");
}
