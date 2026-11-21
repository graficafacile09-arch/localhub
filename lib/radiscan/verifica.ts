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
 * - una registrazione esatta e attiva in eAmbrosia conferma lo status della
 *   denominazione anche se non duplicata nel registro curato RadiciScan.
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
  "pdo",
  "pgi",
  "tsg",
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

const SCHEMI_PROTETTI: ReadonlySet<SchemaQualita> = new Set([
  "DOP",
  "IGP",
  "STG",
  "DOC",
  "DOCG",
  "IGT",
]);

// Categorie merceologiche generiche: da sole non identificano una
// denominazione e non possono sostituirla nel confronto con eAmbrosia.
const PRODOTTI_GENERICI = new Set([
  "prodotto",
  "prodotti",
  "salume",
  "salumi",
  "formaggio",
  "formaggi",
  "latticino",
  "latticini",
  "prosciutto",
  "prosciutti",
  "salame",
  "salami",
  "pecorino",
  "caciocavallo",
  "salsiccia",
  "salsicce",
  "tradizionale",
  "tipico",
  "tipica",
  "artigianale",
  "locale",
  "nostrano",
  "pasta",
  "olio",
  "vino",
  "miele",
  "pane",
  "dolce",
  "dolci",
  "conserva",
  "conserve",
  "carne",
  "carni",
  "ortaggio",
  "ortaggi",
  "frutta",
  "verdura",
  "specialita",
  "tipicita",
]);

// Il solo territorio non qualifica una denominazione: "Salumi di Calabria"
// resta una categoria, mentre "Soppressata di Calabria" ha un nome proprio.
const PAROLE_TERRITORIO_GENERICHE = new Set([
  "calabria",
  "italia",
  "italiano",
  "italiana",
  "regione",
  "provincia",
  "comune",
  "nord",
  "sud",
  "centro",
]);

function schemaProtetto(schema: SchemaQualita | null): boolean {
  return schema !== null && SCHEMI_PROTETTI.has(schema);
}

/**
 * Il nome prodotto può sostituire la denominazione solo se è specifico.
 * Una categoria generica ("salumi", "formaggio") non basta: evitiamo di
 * attribuire una DOP a una pagina che parla soltanto di una categoria.
 */
export function prodottoSpecificoPerVerifica(prodotto: string): boolean {
  const normalizzato = normalizzaDenominazione(prodotto);
  if (!normalizzato || normalizzato.length < 4) return false;

  const parole = normalizzato
    .split(" ")
    .filter((parola) => parola.length >= 3);
  if (parole.length === 0) return false;

  // Una categoria generica può diventare specifica solo con un qualificatore
  // che non sia a sua volta generico o soltanto territoriale.
  return parole.some(
    (parola) =>
      !PRODOTTI_GENERICI.has(parola) &&
      !PAROLE_TERRITORIO_GENERICHE.has(parola)
  );
}

/**
 * Chiave unica per la verifica: la denominazione letta, oppure il nome
 * prodotto specifico quando la denominazione manca ed esiste uno schema
 * protetto. Non viene mai usata per dichiarare una denominazione verificata.
 */
export function chiaveDenominazionePerVerifica(
  riconoscimento: RiconoscimentoAi
): string {
  const proposta = riconoscimento.denominazioneProposta?.trim() ?? "";
  if (proposta) return proposta;

  const prodotto = riconoscimento.prodotto?.trim() ?? "";
  if (!prodottoSpecificoPerVerifica(prodotto)) return "";
  if (!schemaProtetto(riconoscimento.schemaProposto)) return "";
  return prodotto;
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
 * contenimento ai confini di parola ("Calabria" ⊂ "Regione Calabria").
 * Il contenimento non deve confondere nomi geografici con parole derivate
 * ("Crotone" non è "Crotonese").
 */
export function territoriCoerenti(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  const na = normalizzaTesto(a);
  const nb = normalizzaTesto(b);
  if (!na || !nb) return true;
  return (
    na === nb ||
    contieneParole(na, nb) ||
    contieneParole(nb, na)
  );
}

type ConfrontoTerritoriale =
  | "coerente"
  | "incoerente"
  | "non_comparabile";

interface AreeTerritoriali {
  regioni: Set<string>;
  province: Map<string, string>;
}

// Mappa statica e limitata: le regioni italiane e le cinque province
// calabresi. Non è una base geografica completa: serve solo a riconoscere
// relazioni amministrative evidenti senza chiamate esterne.
const REGIONI_ITALIANE: ReadonlyArray<readonly string[]> = [
  ["Abruzzo"],
  ["Basilicata", "Lucania"],
  ["Calabria"],
  ["Campania"],
  ["Emilia-Romagna", "Emilia Romagna"],
  ["Friuli-Venezia Giulia", "Friuli Venezia Giulia"],
  ["Lazio"],
  ["Liguria"],
  ["Lombardia"],
  ["Marche"],
  ["Molise"],
  ["Piemonte"],
  ["Puglia", "Apulia"],
  ["Sardegna"],
  ["Sicilia"],
  ["Toscana"],
  ["Trentino-Alto Adige", "Trentino Alto Adige"],
  ["Umbria"],
  ["Valle d'Aosta", "Valle d Aosta"],
  ["Veneto"],
];

const PROVINCE_CALABRESI: ReadonlyArray<{
  nomi: readonly string[];
  regione: string;
}> = [
  { nomi: ["Cosenza"], regione: "Calabria" },
  { nomi: ["Crotone"], regione: "Calabria" },
  { nomi: ["Catanzaro"], regione: "Calabria" },
  { nomi: ["Vibo Valentia"], regione: "Calabria" },
  { nomi: ["Reggio Calabria", "Reggio di Calabria"], regione: "Calabria" },
];

function contieneParole(testoNormalizzato: string, espressione: string): boolean {
  const normalizzata = normalizzaTesto(espressione);
  return (
    normalizzata.length > 0 &&
    ` ${testoNormalizzato} `.includes(` ${normalizzata} `)
  );
}

function descriviAreeTerritoriali(territorio: string | null): AreeTerritoriali {
  const testo = normalizzaTesto(territorio ?? "");
  const regioni = new Set<string>();
  const province = new Map<string, string>();
  if (!testo) return { regioni, province };

  for (const gruppo of REGIONI_ITALIANE) {
    if (gruppo.some((nome) => contieneParole(testo, nome))) {
      regioni.add(normalizzaTesto(gruppo[0]));
    }
  }

  for (const provincia of PROVINCE_CALABRESI) {
    if (provincia.nomi.some((nome) => contieneParole(testo, nome))) {
      province.set(
        normalizzaTesto(provincia.nomi[0]),
        normalizzaTesto(provincia.regione)
      );
    }
  }

  return { regioni, province };
}

/**
 * Confronto a tre stati. Il lessico resta la prima verifica; la mappa entra
 * in gioco solo quando le due stringhe non si contengono. Una differenza
 * testuale non diventa mai, da sola, una contraddizione: se manca una
 * relazione geografica nota il risultato è `non_comparabile`.
 */
export function confrontaTerritori(
  a: string | null,
  b: string | null
): ConfrontoTerritoriale {
  const na = normalizzaTesto(a ?? "");
  const nb = normalizzaTesto(b ?? "");
  // Un dato assente non è una compatibilità: senza entrambi i territori il
  // confronto è dichiarato non comparabile, mai coerente.
  if (!na || !nb) return "non_comparabile";
  if (territoriCoerenti(na, nb)) return "coerente";

  const areaA = descriviAreeTerritoriali(a);
  const areaB = descriviAreeTerritoriali(b);
  if (
    (areaA.regioni.size === 0 && areaA.province.size === 0) ||
    (areaB.regioni.size === 0 && areaB.province.size === 0)
  ) {
    return "non_comparabile";
  }

  // Con province note da entrambe le parti il confronto resta provinciale:
  // Cosenza e Crotone sono diverse anche se entrambe in Calabria.
  if (areaA.province.size > 0 && areaB.province.size > 0) {
    for (const provincia of areaA.province.keys()) {
      if (areaB.province.has(provincia)) return "coerente";
    }
    return "incoerente";
  }

  if (areaA.province.size > 0) {
    for (const regione of areaA.province.values()) {
      if (areaB.regioni.has(regione)) return "coerente";
    }
    return "incoerente";
  }

  if (areaB.province.size > 0) {
    for (const regione of areaB.province.values()) {
      if (areaA.regioni.has(regione)) return "coerente";
    }
    return "incoerente";
  }

  for (const regione of areaA.regioni) {
    if (areaB.regioni.has(regione)) return "coerente";
  }
  return "incoerente";
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

type CoerenzaTerritoriale =
  | "coerente"
  | "incoerente"
  | "non_verificabile";

/**
 * Confronta il territorio letto in etichetta soltanto con il territorio della
 * fonte curata che corrisponde alla stessa denominazione e allo stesso schema
 * della prova eAmbrosia. `sedeGruppo` è la sede amministrativa del gruppo e
 * non può sostituire l'area di produzione ufficiale.
 */
function coerenzaTerritorialeProva(
  riconoscimento: RiconoscimentoAi,
  prova: ProvaDocumentale,
  registro: readonly FonteUfficiale[]
): CoerenzaTerritoriale {
  const territorioLetto = riconoscimento.territorioProposto?.trim() ?? "";
  if (!territorioLetto || prova.schemaQualita === null) {
    return "non_verificabile";
  }

  const territoriUfficiali = registro
    .filter(
      (fonte) =>
        fonte.tipoAtto === "denominazione" &&
        fonteDocumentata(fonte) &&
        fonte.schemaQualita === prova.schemaQualita &&
        denominazioniEquivalenti(fonte.denominazione, prova.denominazione)
    )
    .map((fonte) => fonte.territorio?.trim() ?? "")
    .filter((territorio) => territorio.length > 0);

  if (territoriUfficiali.length === 0) return "non_verificabile";

  const esiti = territoriUfficiali.map((territorio) =>
    confrontaTerritori(territorioLetto, territorio)
  );
  if (esiti.every((esito) => esito === "coerente")) return "coerente";
  if (esiti.every((esito) => esito === "incoerente")) return "incoerente";
  return "non_verificabile";
}

type MotivoCoerenzaNonVerificabile =
  | "schema_mancante"
  | "territorio_mancante"
  | "territorio_non_comparabile";

type CoerenzaSenzaDenominazione =
  | { stato: "coerente" }
  | { stato: "non_verificabile"; motivo: MotivoCoerenzaNonVerificabile }
  | { stato: "assente" };

/**
 * Coerenza di schema e territorio quando la denominazione non è leggibile.
 *
 * Non restituisce la fonte trovata: appartiene a un'altra denominazione e non
 * va presentata come fonte del prodotto analizzato. La coerenza è congiunta:
 * lo schema deve essere indicato e confrontabile, e il territorio deve essere
 * presente e compatibile. Un dato mancante non produce mai `coerente`.
 */
export function esisteCoerenzaSenzaDenominazione(
  registro: readonly FonteUfficiale[],
  schema: SchemaQualita | null,
  territorio: string | null
): CoerenzaSenzaDenominazione {
  const territorioLetto = territorio?.trim() ?? "";
  if (!schema && !territorioLetto) return { stato: "assente" };
  if (!schema) {
    return { stato: "non_verificabile", motivo: "schema_mancante" };
  }
  if (!territorioLetto) {
    return { stato: "non_verificabile", motivo: "territorio_mancante" };
  }

  let nonComparabile = false;
  for (const fonte of registro) {
    if (!fonteDocumentata(fonte)) continue;
    if (fonte.schemaQualita !== schema) continue;
    if (!isUrlFonteUfficiale(fonte.urlUfficiale)) continue;

    const confronto = confrontaTerritori(territorioLetto, fonte.territorio);
    if (confronto === "coerente") return { stato: "coerente" };
    if (confronto === "non_comparabile") nonComparabile = true;
  }

  return nonComparabile
    ? { stato: "non_verificabile", motivo: "territorio_non_comparabile" }
    : { stato: "assente" };
}

function motivoCoerenzaNonVerificabile(
  motivo: MotivoCoerenzaNonVerificabile
): string {
  switch (motivo) {
    case "schema_mancante":
      return "lo schema non è indicato, quindi la compatibilità congiunta di schema e territorio non è verificabile";
    case "territorio_mancante":
      return "lo schema indicato è compatibile con fonti registrate, ma il territorio non è indicato, quindi la compatibilità territoriale non è stata verificata";
    case "territorio_non_comparabile":
      return "lo schema indicato è compatibile con fonti registrate, ma il territorio non è confrontabile, quindi la compatibilità territoriale non è stata verificata";
  }
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
    const schema = prova.schemaQualita ?? "denominazione protetta";
    return (
      `Denominazione ${schema} confermata: "${prova.denominazione}" risulta registrata ` +
      `nel registro ufficiale eAmbrosia (${prova.riferimentoNormativo ?? "scheda UE"}). ` +
      "La registrazione e la documentazione ufficiale confermano lo status della denominazione; " +
      "non costituiscono autenticazione della singola confezione, del lotto o del produttore."
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
 * Una registrazione esatta e attiva in eAmbrosia conferma lo status della
 * denominazione anche se non duplicata nel registro curato RadiciScan.
 * Il livello applicativo resta distinto dall'autenticazione della confezione:
 * la prova europea non identifica il singolo lotto o produttore fotografato.
 */
function verificaBase(
  riconoscimento: RiconoscimentoAi,
  registro: readonly FonteUfficiale[],
  ricerca: EsitoRicercaDocumentale = RICERCA_NON_ESEGUITA
): VerificaBase {
  const proposta = riconoscimento.denominazioneProposta?.trim() ?? "";
  const prove = ricerca.prove.filter((prova) => prova.tipo === "ufficiale");

  if (!proposta) {
    const chiaveSenzaDenominazione =
      chiaveDenominazionePerVerifica(riconoscimento);
    const proveProdotto = chiaveSenzaDenominazione
      ? prove.filter(
          (prova) =>
            prova.stato === "registrata" &&
            denominazioniEquivalenti(
              prova.denominazione,
              chiaveSenzaDenominazione
            ) &&
            schemiCompatibili(
              riconoscimento.schemaProposto,
              prova.schemaQualita
            )
        )
      : [];
    const prodotto = riconoscimento.prodotto.trim();
    const valutazioniProdotto = proveProdotto.map((prova) => ({
      prova,
      coerenza: coerenzaTerritorialeProva(riconoscimento, prova, registro),
    }));
    const provaIncoerente = valutazioniProdotto.find(
      (valutazione) => valutazione.coerenza === "incoerente"
    );

    if (provaIncoerente) {
      const territorioLetto =
        riconoscimento.territorioProposto?.trim() ?? "non indicato";
      return nonVerificato(
        "incongruenza_possibile",
        "territorio_incoerente",
        `Nessuna denominazione leggibile: il nome prodotto "${prodotto}" coincide con la denominazione registrata "${provaIncoerente.prova.denominazione}" in eAmbrosia, ma il territorio letto ("${territorioLetto}") contraddice il territorio della fonte curata. Il riscontro non viene trattato come positivo; il dato va controllato.`,
        null,
        prove,
        ricerca
      );
    }

    const proveAccettabili = valutazioniProdotto.filter(
      (valutazione) => valutazione.coerenza !== "incoerente"
    );

    if (proveAccettabili.length === 1) {
      const { prova, coerenza } = proveAccettabili[0];
      const messaggioTerritorio =
        coerenza === "coerente"
          ? ` Il territorio letto ("${riconoscimento.territorioProposto}") è compatibile con il territorio della fonte curata che corrisponde alla stessa denominazione e schema.`
          : " L'area di produzione ufficiale non è disponibile o non è confrontabile: non viene dichiarata alcuna compatibilità territoriale.";
      return nonVerificato(
        "coerente_non_verificato",
        "riscontro_parziale",
        `Nessuna denominazione leggibile: il nome prodotto "${prodotto}" coincide esattamente con la denominazione registrata "${prova.denominazione}" nel registro ufficiale eAmbrosia (${prova.riferimentoNormativo ?? "scheda UE"}).${messaggioTerritorio} Il riscontro riguarda il nome del prodotto, non una denominazione letta in etichetta: la denominazione non è confermata e la confezione non è autenticata.`,
        null,
        prove,
        ricerca
      );
    }

    if (proveAccettabili.length > 1) {
      return nonVerificato(
        "coerente_non_verificato",
        "riscontro_parziale",
        `Nessuna denominazione leggibile: il nome prodotto "${prodotto}" corrisponde a ${proveAccettabili.length} schede registrate in eAmbrosia. Serve un controllo manuale per scegliere quella pertinente; la denominazione non è confermata.`,
        null,
        prove,
        ricerca
      );
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

    const coerenzaRegistro = esisteCoerenzaSenzaDenominazione(
      registro,
      riconoscimento.schemaProposto,
      riconoscimento.territorioProposto
    );
    if (coerenzaRegistro.stato === "coerente") {
      return nonVerificato(
        "coerente_non_verificato",
        "coerente_senza_denominazione",
        "Nessuna denominazione leggibile: schema e territorio sono compatibili con fonti registrate per altre denominazioni, ma la denominazione del prodotto non è confermata.",
        null,
        prove,
        ricerca
      );
    }
    if (coerenzaRegistro.stato === "non_verificabile") {
      return nonVerificato(
        "non_verificato",
        "non_confermata",
        `Nessuna denominazione leggibile: ${motivoCoerenzaNonVerificabile(coerenzaRegistro.motivo)}. La denominazione non è confermata.`,
        null,
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

    const territorioLetto = riconoscimento.territorioProposto?.trim() ?? "";
    const coerenzaTerritoriale = territorioLetto
      ? confrontaTerritori(territorioLetto, documentata.territorio)
      : null;

    if (coerenzaTerritoriale === "incoerente") {
      return nonVerificato(
        "incongruenza_possibile",
        "territorio_incoerente",
        `Possibile incongruenza: il territorio dichiarato ("${territorioLetto}") contraddice quello della fonte ufficiale ("${documentata.territorio}"). Da controllare, non è una conclusione.`,
        documentata,
        prove,
        ricerca
      );
    }

    const notaTerritorio =
      coerenzaTerritoriale === "non_comparabile"
        ? ` Il territorio dichiarato ("${territorioLetto}") non è confrontabile con il territorio della fonte ufficiale ("${documentata.territorio}"): la compatibilità territoriale non è stata verificata. La verifica riguarda la denominazione, non la provenienza della singola confezione; il prodotto non è dichiarato falso o non autentico.`
        : !territorioLetto
          ? " Il territorio non è indicato: la compatibilità territoriale non è stata verificata. La verifica riguarda la denominazione, non la provenienza della singola confezione; il prodotto non è dichiarato falso o non autentico."
          : "";

    return {
      esito: "confermata",
      livello: "verificato",
      fonte: proiettaFonte(documentata),
      denominazioneVerificata: documentata.denominazione,
      motivazione: `Denominazione confermata su fonte ufficiale registrata (${documentata.ente}), consultata il ${documentata.consultataIl}.${notaTerritorio}`,
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
    const coerenzaRegistro = esisteCoerenzaSenzaDenominazione(
      registro,
      riconoscimento.schemaProposto,
      riconoscimento.territorioProposto
    );
    if (coerenzaRegistro.stato === "coerente") {
      return nonVerificato(
        "coerente_non_verificato",
        "non_confermata",
        `La denominazione "${proposta}" non risulta nel registro curato; schema e territorio sono compatibili con fonti registrate per altre denominazioni, quindi la lettura è solo coerente, non verificata. La ricerca esterna non è stata eseguita.`,
        null,
        prove,
        ricerca
      );
    }
    if (coerenzaRegistro.stato === "non_verificabile") {
      return nonVerificato(
        "non_verificato",
        "non_confermata",
        `La denominazione "${proposta}" non risulta nel registro curato; ${motivoCoerenzaNonVerificabile(coerenzaRegistro.motivo)}. La ricerca esterna non è stata eseguita.`,
        null,
        prove,
        ricerca
      );
    }
    return nonVerificato(
      "non_verificato",
      "non_confermata",
      `La denominazione "${proposta}" non risulta nel registro curato e la ricerca esterna non è stata eseguita: nessuna verifica documentale possibile.`,
      null,
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
  const chiave = chiaveDenominazionePerVerifica(riconoscimento);
  const provaRiferimento =
    base.prove.find(
      (prova) => chiave !== "" && denominazioniEquivalenti(prova.denominazione, chiave)
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
