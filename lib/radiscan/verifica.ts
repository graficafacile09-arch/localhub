import { valutaProvenienza } from "./filiera";
import {
  fonteDocumentata,
  isUrlFonteUfficiale,
  type FonteUfficiale,
  type SchemaQualita,
} from "./fonti";
import type {
  EsitoRicercaDocumentale,
  FontePubblica,
  LetturaDocumentale,
  ProvaDocumentale,
  RiconoscimentoAi,
  VerificaDocumentale,
} from "./tipi";

/**
 * RadiciScan — verifica documentale.
 *
 * Due livelli di prova, tenuti distinti:
 * - il registro curato `radiscan_fonti` può sostenere `verificato`, perché
 *   ogni riga `denominazione` è stata controllata e resa completa;
 * - la ricerca eAmbrosia restituisce prove ufficiali, ma non crea da sola
 *   una fonte curata: una corrispondenza esatta produce `riscontro_parziale`
 *   finché la scheda non entra nel registro.
 *
 * Il confronto con il registro resta esatto dopo normalizzazione. Per la
 * ricerca esterna è ammessa una sola variazione morfologica documentata
 * (Peperone/Peperoni, Fico/Fichi), mai una somiglianza generica.
 */

const ETICHETTE_QUALITA = [
  "dop",
  "igp",
  "stg",
  "doc",
  "docg",
  "igt",
  "pat",
  "deco",
];

const RICERCA_NON_ESEGUITA: EsitoRicercaDocumentale = {
  stato: "non_eseguita",
  fonte: null,
  consultataIl: null,
  query: [],
  prove: [],
  messaggio: "Ricerca documentale non eseguita.",
  lettura: null,
};

/** Minuscole, senza diacritici, punteggiatura ridotta a spazi. */
export function normalizzaTesto(valore: string): string {
  return valore
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Ricompatta le sigle scritte con i punti: "d o p" -> "dop".
 * Serve perché "D.O.P." viene normalizzato in tre token separati, che
 * altrimenti sfuggirebbero al riconoscimento dell'etichetta di qualità.
 */
function compattaSigle(parole: readonly string[]): string[] {
  const risultato: string[] = [];
  let sigla = "";

  for (const parola of parole) {
    if (parola.length === 1) {
      sigla += parola;
      continue;
    }
    if (sigla) {
      risultato.push(sigla);
      sigla = "";
    }
    risultato.push(parola);
  }
  if (sigla) risultato.push(sigla);

  return risultato;
}

/** Normalizzazione per il confronto delle denominazioni. */
export function normalizzaDenominazione(valore: string): string {
  const parole = compattaSigle(normalizzaTesto(valore).split(" ").filter(Boolean));
  while (parole.length > 1 && ETICHETTE_QUALITA.includes(parole[parole.length - 1])) {
    parole.pop();
  }
  return parole.join(" ");
}

/**
 * Variazioni morfologiche ammesse per una singola parola. Non è un motore
 * fuzzy: sono solo le coppie singolare/plurale frequenti nelle denominazioni
 * italiane, usate per interrogare il registro e per riconoscere alias noti.
 */
export function variantiParola(parola: string): string[] {
  const pulita = normalizzaTesto(parola);
  if (!pulita) return [];

  const varianti = new Set<string>([pulita]);
  const aggiungi = (valore: string) => {
    if (valore.length >= 4) varianti.add(valore);
  };

  if (pulita.endsWith("one")) aggiungi(`${pulita.slice(0, -1)}i`);
  if (pulita.endsWith("oni")) aggiungi(`${pulita.slice(0, -1)}e`);
  if (pulita.endsWith("chi")) aggiungi(`${pulita.slice(0, -3)}co`);
  if (pulita.endsWith("co")) aggiungi(`${pulita.slice(0, -2)}chi`);
  if (pulita.endsWith("ghi")) aggiungi(`${pulita.slice(0, -3)}go`);
  if (pulita.endsWith("go")) aggiungi(`${pulita.slice(0, -2)}ghi`);
  if (pulita.endsWith("i")) aggiungi(`${pulita.slice(0, -1)}o`);
  if (pulita.endsWith("o")) aggiungi(`${pulita.slice(0, -1)}i`);
  if (pulita.endsWith("a")) aggiungi(`${pulita.slice(0, -1)}e`);
  if (pulita.endsWith("e")) aggiungi(`${pulita.slice(0, -1)}a`);

  return [...varianti];
}

function paroleEquivalenti(a: string, b: string): boolean {
  if (a === b) return true;
  return variantiParola(a).includes(b) || variantiParola(b).includes(a);
}

/**
 * Equivalenza controllata fra due denominazioni: stessa lunghezza in parole
 * e al massimo una parola con variazione morfologica ammessa. "Pecorino
 * Crotonese" e "Pecorino Romano" restano diverse; "Peperone di Senise" e
 * "Peperoni di Senise" sono la stessa denominazione.
 */
export function denominazioniEquivalenti(a: string, b: string): boolean {
  const na = normalizzaDenominazione(a);
  const nb = normalizzaDenominazione(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const pa = na.split(" ");
  const pb = nb.split(" ");
  if (pa.length !== pb.length) return false;

  let differenze = 0;
  for (let indice = 0; indice < pa.length; indice += 1) {
    if (pa[indice] === pb[indice]) continue;
    if (!paroleEquivalenti(pa[indice], pb[indice])) return false;
    differenze += 1;
  }

  return differenze <= 1;
}

/**
 * Coerenza tra due territori: uguaglianza dopo normalizzazione oppure
 * contenimento di uno nell'altro ("Calabria" ⊂ "Regione Calabria").
 * Un territorio più ampio non conferma una denominazione: serve solo a
 * escludere contraddizioni evidenti.
 */
export function territoriCoerenti(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  const na = normalizzaTesto(a);
  const nb = normalizzaTesto(b);
  if (!na || !nb) return true;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/**
 * DOC/DOCG sono manifestazioni italiane di una PDO unionale; IGT di una PGI.
 * Il confronto con eAmbrosia non deve quindi segnalare un'incongruenza
 * soltanto perché il registro usa la sigla europea.
 */
function schemiCompatibili(
  proposto: SchemaQualita | null,
  prova: SchemaQualita | null
): boolean {
  if (!proposto || !prova) return true;
  if (proposto === prova) return true;
  if ((proposto === "DOC" || proposto === "DOCG") && prova === "DOP") return true;
  if (proposto === "IGT" && prova === "IGP") return true;
  return false;
}

function proiettaFonte(fonte: FonteUfficiale): FontePubblica {
  return {
    id: fonte.id,
    slug: fonte.slug,
    denominazione: fonte.denominazione,
    ente: fonte.ente,
    urlUfficiale: fonte.urlUfficiale,
    riferimentoNormativo: fonte.riferimentoNormativo,
    consultataIl: fonte.consultataIl,
    schemaQualita: fonte.schemaQualita,
    territorio: fonte.territorio,
  };
}

function esisteCoerenzaSenzaDenominazione(
  registro: readonly FonteUfficiale[],
  schema: SchemaQualita | null,
  territorio: string | null
): FonteUfficiale | null {
  if (!schema && !territorio) return null;
  for (const fonte of registro) {
    if (!fonteDocumentata(fonte)) continue;
    if (schema && fonte.schemaQualita !== schema) continue;
    if (territorio && !territoriCoerenti(territorio, fonte.territorio)) continue;
    if (!isUrlFonteUfficiale(fonte.urlUfficiale)) continue;
    return fonte;
  }
  return null;
}

type VerificaBase = Omit<VerificaDocumentale, "provenienza">;

function nonVerificato(
  livello: VerificaDocumentale["livello"],
  esito: VerificaDocumentale["esito"],
  motivazione: string,
  fonte: FonteUfficiale | null = null,
  prove: ProvaDocumentale[] = [],
  ricerca: EsitoRicercaDocumentale = RICERCA_NON_ESEGUITA
): VerificaBase {
  return {
    esito,
    livello,
    fonte: fonte ? proiettaFonte(fonte) : null,
    denominazioneVerificata: null,
    motivazione,
    prove: [...prove],
    ricerca,
  };
}

function motivazioneRiscontroParziale(
  prova: ProvaDocumentale,
  proposta: string,
  esatta: boolean
): string {
  if (!esatta) {
    return (
      `Riscontro parziale: il registro eAmbrosia ha restituito una denominazione affine ` +
      `("${prova.denominazione}") per la ricerca "${proposta}". Il documento è ufficiale, ` +
      "ma non dimostra da solo la corrispondenza con il prodotto specifico."
    );
  }

  if (prova.stato === "registrata") {
    return (
      `Riscontro parziale: "${prova.denominazione}" è iscritta nel registro eAmbrosia ` +
      `(${prova.riferimentoNormativo ?? "atto ufficiale"}). La prova è ufficiale, ma la scheda ` +
      "del disciplinare non è ancora acquisita nel registro curato RadiciScan: il prodotto " +
      "specifico non è confermato."
    );
  }

  if (prova.stato === "pubblicata" || prova.stato === "in_domanda") {
    return (
      `Riscontro parziale: "${prova.denominazione}" compare nel registro eAmbrosia con stato ` +
      `"${prova.stato.replaceAll("_", " ")}". La domanda o la pubblicazione non equivale alla ` +
      "registrazione e non conferma il prodotto specifico."
    );
  }

  if (prova.stato === "rimossa") {
    return (
      `Possibile incongruenza: "${prova.denominazione}" compare nel registro eAmbrosia, ` +
      "ma risulta rimossa o cancellata. Il dato va controllato e non conferma il prodotto."
    );
  }

  return (
    `Riscontro parziale: "${prova.denominazione}" è presente nel registro eAmbrosia, ` +
    "ma lo stato non è sufficiente a confermare la denominazione."
  );
}

/**
 * Verifica una denominazione proposta contro il registro curato e le prove
 * ufficiali recuperate online. Restituisce sempre una motivazione leggibile
 * e non usa mai dati del modello come se fossero fonte.
 *
 * NOTA: la lettura dei documenti non può mai alzare il livello. Anche un
 * disciplinare letto per intero resta `riscontro_parziale` finché la scheda
 * non entra nel registro curato: i documenti provano la denominazione, non
 * la confezione fotografata.
 */
function verificaBase(
  riconoscimento: RiconoscimentoAi,
  registro: readonly FonteUfficiale[],
  ricerca: EsitoRicercaDocumentale = RICERCA_NON_ESEGUITA
): VerificaBase {
  const proposta = riconoscimento.denominazioneProposta?.trim() ?? "";
  const prove = ricerca.prove.filter((prova) => prova.tipo === "ufficiale");

  if (!proposta) {
    const coerente = esisteCoerenzaSenzaDenominazione(
      registro,
      riconoscimento.schemaProposto,
      riconoscimento.territorioProposto
    );
    if (coerente) {
      return nonVerificato(
        "coerente_non_verificato",
        "coerente_senza_denominazione",
        "Nessuna denominazione leggibile: schema e territorio sono compatibili con fonti registrate, ma la denominazione non è confermata.",
        coerente,
        prove,
        ricerca
      );
    }
    return nonVerificato(
      "non_verificato",
      "nessuna_denominazione",
      "Nessuna denominazione di qualità leggibile: il prodotto resta un riconoscimento non confermato.",
      null,
      prove,
      ricerca
    );
  }

  const cercata = normalizzaDenominazione(proposta);
  const candidate = registro.filter(
    (fonte) =>
      fonte.tipoAtto === "denominazione" &&
      normalizzaDenominazione(fonte.denominazione) === cercata
  );

  if (candidate.length > 0) {
    const documentata = candidate.find((fonte) => fonteDocumentata(fonte));
    if (!documentata) {
      return nonVerificato(
        "non_verificato",
        "fonte_non_verificabile",
        `La denominazione "${proposta}" compare nel registro, ma la fonte non è attiva e completa: non può sostenere il livello verificato.`,
        candidate[0] ?? null,
        prove,
        ricerca
      );
    }

    if (
      riconoscimento.schemaProposto &&
      documentata.schemaQualita !== riconoscimento.schemaProposto
    ) {
      return nonVerificato(
        "incongruenza_possibile",
        "schema_incoerente",
        `Possibile incongruenza: lo schema dichiarato (${riconoscimento.schemaProposto}) non corrisponde a quello della fonte ufficiale (${documentata.schemaQualita}), che resta l'unico riferimento valido.`,
        documentata,
        prove,
        ricerca
      );
    }

    if (
      riconoscimento.territorioProposto &&
      !territoriCoerenti(riconoscimento.territorioProposto, documentata.territorio)
    ) {
      return nonVerificato(
        "incongruenza_possibile",
        "territorio_incoerente",
        `Possibile incongruenza: il territorio dichiarato ("${riconoscimento.territorioProposto}") non coincide con quello della fonte ufficiale ("${documentata.territorio}"). Da controllare, non è una conclusione.`,
        documentata,
        prove,
        ricerca
      );
    }

    return {
      esito: "confermata",
      livello: "verificato",
      fonte: proiettaFonte(documentata),
      denominazioneVerificata: documentata.denominazione,
      motivazione: `Denominazione confermata su fonte ufficiale registrata (${documentata.ente}), consultata il ${documentata.consultataIl}.`,
      prove,
      ricerca,
    };
  }

  if (ricerca.stato === "non_disponibile") {
    return nonVerificato(
      "non_verificato",
      "ricerca_non_disponibile",
      ricerca.messaggio ??
        "La ricerca documentale non è stata completata: il risultato non dimostra l'assenza di fonti.",
      null,
      prove,
      ricerca
    );
  }

  const esatte = prove.filter((prova) =>
    denominazioniEquivalenti(prova.denominazione, proposta)
  );

  if (esatte.length > 0) {
    const prova = esatte[0];
    if (!schemiCompatibili(riconoscimento.schemaProposto, prova.schemaQualita)) {
      return nonVerificato(
        "incongruenza_possibile",
        "schema_incoerente",
        `Possibile incongruenza: lo schema letto (${riconoscimento.schemaProposto}) non corrisponde a quello della scheda eAmbrosia (${prova.schemaQualita}). La scheda ufficiale resta il riferimento.`,
        null,
        prove,
        ricerca
      );
    }

    if (esatte.length > 1) {
      return nonVerificato(
        "coerente_non_verificato",
        "riscontro_parziale",
        `Riscontro parziale: il registro eAmbrosia restituisce ${esatte.length} denominazioni equivalenti a "${proposta}". Serve un controllo manuale per scegliere quella pertinente.`,
        null,
        prove,
        ricerca
      );
    }

    if (prova.stato === "rimossa") {
      return nonVerificato(
        "incongruenza_possibile",
        "riscontro_parziale",
        motivazioneRiscontroParziale(prova, proposta, true),
        null,
        prove,
        ricerca
      );
    }

    return nonVerificato(
      "coerente_non_verificato",
      "riscontro_parziale",
      motivazioneRiscontroParziale(prova, proposta, true),
      null,
      prove,
      ricerca
    );
  }

  if (prove.length > 0) {
    const prova = prove[0];
    return nonVerificato(
      "coerente_non_verificato",
      "riscontro_parziale",
      motivazioneRiscontroParziale(prova, proposta, false),
      null,
      prove,
      ricerca
    );
  }

  if (ricerca.stato === "non_eseguita") {
    const coerente = esisteCoerenzaSenzaDenominazione(
      registro,
      riconoscimento.schemaProposto,
      riconoscimento.territorioProposto
    );
    return nonVerificato(
      coerente ? "coerente_non_verificato" : "non_verificato",
      "non_confermata",
      coerente
        ? `La denominazione "${proposta}" non risulta nel registro curato; schema e territorio sono compatibili con fonti registrate, quindi la lettura è solo coerente, non verificata. La ricerca esterna non è stata eseguita.`
        : `La denominazione "${proposta}" non risulta nel registro curato e la ricerca esterna non è stata eseguita: nessuna verifica documentale possibile.`,
      coerente,
      prove,
      ricerca
    );
  }

  return nonVerificato(
    "non_verificato",
    "non_confermata",
    `Nessun riscontro per "${proposta}" nel registro eAmbrosia consultato il ${
      ricerca.consultataIl ?? "data non disponibile"
    }. L'assenza di risultati non dimostra che la denominazione non esista.`,
    null,
    [],
    ricerca
  );
}

/**
 * Aggiunge la lettura documentale alla motivazione senza mai dichiararla
 * completa se non lo è: il messaggio della lettura riporta pagine lette,
 * allegati non scaricati e assenza di OCR.
 */
function notaLettura(lettura: LetturaDocumentale | null): string {
  if (!lettura || lettura.stato === "non_tentata") return "";
  return ` Lettura documentale — ${lettura.messaggio}`;
}

/**
 * Punto di ingresso della verifica: livello e motivazione restano quelli
 * della verifica documentale, mentre `provenienza` distingue esplicitamente
 * denominazione, territorio, filiera e confezione fotografata.
 */
export function verificaDenominazione(
  riconoscimento: RiconoscimentoAi,
  registro: readonly FonteUfficiale[],
  ricerca: EsitoRicercaDocumentale = RICERCA_NON_ESEGUITA
): VerificaDocumentale {
  const base = verificaBase(riconoscimento, registro, ricerca);
  const proposta = riconoscimento.denominazioneProposta?.trim() ?? "";
  const provaRiferimento =
    base.prove.find(
      (prova) => proposta !== "" && denominazioniEquivalenti(prova.denominazione, proposta)
    ) ??
    base.prove[0] ??
    null;
  const lettura = ricerca.lettura ?? null;

  return {
    ...base,
    motivazione: `${base.motivazione}${notaLettura(lettura)}`,
    provenienza: valutaProvenienza(riconoscimento, provaRiferimento, lettura),
  };
}
