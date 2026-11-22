import { ALIAS_COMUNI_CALABRIA, COMUNI_CALABRIA } from "./comuni-calabria";
import type {
  EvidenzaProvenienza,
  LetturaDocumentale,
  ProvaDocumentale,
  RiconoscimentoAi,
  StatoProvenienza,
  ValutazioneProvenienza,
} from "./tipi";

/**
 * RadiciScan — provenienza, territorio e filiera, tenuti SEPARATI.
 *
 * Non si usa la geografia come prova: che un prodotto sia calabrese, che
 * un'impresa abbia sede in Calabria o che il nome contenga una provincia non
 * dimostra l'iscrizione a una filiera riconosciuta. Ogni voce è `documentato`
 * solo se una fonte ufficiale consultata lo afferma, e l'evidenza riporta
 * fonte, URL e pagina.
 *
 * Fonti ufficiali calabresi previste per l'integrazione progressiva (non
 * ancora collegate in questa fase, perché gli endpoint non sono stati
 * verificati e non vanno inventati):
 * - ARSAC — Registro regionale dei prodotti agroalimentari tradizionali (PAT);
 * - Regione Calabria — atti e decreti di riconoscimento;
 * - MASAF — Registro nazionale DOP/IGP/STG e organismi di controllo;
 * - ICQRF — controlli e sanzioni;
 * - SINAB/SIAN — quando pertinenti al prodotto;
 * - consorzi di tutela e distretti del cibo riconosciuti.
 *
 * Finché una fonte non è verificata, lo stato resta `non_documentato`: mai
 * `documentato` per inferenza.
 */

const SEGNALI_CALABRIA = [
  "calabria",
  "cosenza",
  "crotone",
  "catanzaro",
  "vibo valentia",
  "reggio calabria",
] as const;

const CONTESTO = 110;
const MAX_EVIDENZE = 3;

function normalizza(valore: string): string {
  return valore
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function segnaleCalabria(testo: string | null | undefined): string | null {
  if (!testo) return null;
  const normalizzato = normalizza(testo);
  if (!normalizzato) return null;
  for (const segnale of SEGNALI_CALABRIA) {
    if (normalizzato.includes(segnale)) return segnale;
  }
  return null;
}

function estrattoAttorno(testo: string, segnale: string): string {
  const indice = normalizza(testo).indexOf(segnale);
  if (indice < 0) return testo.slice(0, CONTESTO * 2).trim();
  const inizio = Math.max(0, indice - CONTESTO);
  const fine = Math.min(testo.length, indice + segnale.length + CONTESTO);
  return `${inizio > 0 ? "…" : ""}${testo.slice(inizio, fine).trim()}${
    fine < testo.length ? "…" : ""
  }`;
}

function evidenzeDaDocumenti(lettura: LetturaDocumentale | null): EvidenzaProvenienza[] {
  if (!lettura) return [];
  const evidenze: EvidenzaProvenienza[] = [];

  for (const documento of lettura.documenti) {
    for (const sezione of documento.sezioni) {
      const segnale = segnaleCalabria(sezione.testo);
      if (!segnale) continue;
      evidenze.push({
        fonte: `${documento.titolo} (${documento.url})`,
        url: documento.url,
        pagina: sezione.pagina,
        estratto: estrattoAttorno(sezione.testo, segnale),
      });
      break;
    }
    if (evidenze.length >= MAX_EVIDENZE) break;
  }

  return evidenze;
}

const COMUNI_POLLINO_LUCANO = [
  "calvera", "carbone", "castelluccio inferiore", "castelluccio superiore",
  "castelsaraceno", "castronuovo sant andrea", "castronuovo di sant andrea",
  "cersosimo", "chiaromonte", "episcopia", "fardella",
  "francavilla in sinni", "latronico", "lauria", "noepoli", "rotonda",
  "san costantino albanese", "san giorgio lucano", "san paolo albanese",
  "san severino lucano", "senise", "teana", "terranova di pollino",
  "valsinni", "viggianello",
] as const;

const REGIONI_NON_CALABRIA = [
  "abruzzo", "basilicata", "campania", "emilia romagna", "friuli venezia giulia",
  "lazio", "liguria", "lombardia", "marche", "molise", "piemonte", "puglia",
  "sardegna", "sicilia", "toscana", "trentino alto adige", "umbria",
  "valle d aosta", "veneto",
] as const;

/**
 * Province e città metropolitane esterne al perimetro ammesso.
 * Le province calabresi non sono qui: Calabria e i 24 comuni del Pollino
 * lucano restano le sole aree territoriali ammesse da questa filiera.
 */
const PROVINCE_NON_CALABRIA = [
  "alessandria", "asti", "biella", "cuneo", "novara", "torino", "verbano cusio ossola", "vercelli",
  "aosta",
  "bergamo", "brescia", "como", "cremona", "lecco", "lodi", "mantova", "milano",
  "monza e brianza", "monza brianza", "pavia", "sondrio", "varese",
  "bolzano", "trento",
  "belluno", "padova", "rovigo", "treviso", "venezia", "verona", "vicenza",
  "gorizia", "pordenone", "trieste", "udine",
  "genova", "imperia", "la spezia", "savona",
  "piacenza", "parma", "reggio emilia", "modena", "bologna", "ferrara", "ravenna",
  "forli cesena", "rimini",
  "massa carrara", "lucca", "pistoia", "firenze", "prato", "livorno", "pisa",
  "arezzo", "siena", "grosseto",
  "perugia", "terni",
  "ancona", "ascoli piceno", "fermo", "macerata", "pesaro e urbino", "pesaro urbino",
  "viterbo", "rieti", "roma", "latina", "frosinone",
  "laquila", "teramo", "pescara", "chieti",
  "campobasso", "isernia",
  "napoli", "caserta", "benevento", "avellino", "salerno",
  "foggia", "bari", "taranto", "brindisi", "lecce", "barletta andria trani",
  "potenza", "matera",
  "cagliari", "nuoro", "oristano", "sassari", "sud sardegna",
  "palermo", "catania", "messina", "siracusa", "ragusa", "trapani",
  "agrigento", "caltanissetta", "enna",
] as const;

function contieneLuogo(testo: string, luogo: string): boolean {
  return ` ${testo} `.includes(` ${luogo} `);
}

/**
 * Classifica soltanto il territorio esplicitamente proposto dalla lettura
 * dell'etichetta. Non usa il nome commerciale del prodotto come provenienza.
 */
export function classificaTerritorioDichiarato(testo: string | null | undefined):
  | { tipo: "pollino_lucano"; comune: string }
  | { tipo: "fuori_calabria"; luogo: string }
  | null {
  if (!testo?.trim()) return null;
  const normalizzato = normalizza(testo);

  const comunePollino = COMUNI_POLLINO_LUCANO.find((comune) =>
    contieneLuogo(normalizzato, normalizza(comune))
  );
  if (comunePollino) return { tipo: "pollino_lucano", comune: comunePollino };

  const regione = REGIONI_NON_CALABRIA.find((nome) =>
    contieneLuogo(normalizzato, normalizza(nome))
  );
  if (regione) return { tipo: "fuori_calabria", luogo: regione };

  // Anche una sola provincia/città metropolitana identifica un territorio
  // esterno: per esempio "Parma" sull'etichetta del Prosciutto di Parma DOP.
  const provincia = PROVINCE_NON_CALABRIA.find((nome) =>
    contieneLuogo(normalizzato, normalizza(nome))
  );
  if (provincia) return { tipo: "fuori_calabria", luogo: provincia };

  // Sigle provinciali lucane, quando sono esplicitamente lette in etichetta.
  if (/(^| )(pz|mt)( |$)/.test(normalizzato)) {
    return { tipo: "fuori_calabria", luogo: normalizzato };
  }
  return null;
}

const PROVINCE_CALABRESI_PERIMETRO = [
  "cosenza", "crotone", "catanzaro", "vibo valentia",
  "reggio calabria", "reggio di calabria",
] as const;

export type ClassificazionePerimetro =
  | { stato: "ammesso"; area: "calabria" | "pollino_lucano"; luogo: string }
  | { stato: "fuori_perimetro"; luogo: string }
  | { stato: "indeterminato"; motivo: "assente" | "non_riconosciuto" };

/**
 * Classifica un territorio rispetto al perimetro ammesso da RadiciScan:
 * tutta la Calabria e i soli comuni del Parco Nazionale del Pollino situati
 * in Basilicata.
 *
 * Sono ammessi la regione, le province calabresi e i singoli comuni della
 * Calabria (elenco ISTAT in `comuni-calabria.ts`), anche quando l'etichetta
 * indica il solo nome del comune senza provincia né regione.
 *
 * Solo l'area riconosciuta è ammessa: un territorio assente, sconosciuto o
 * ambiguo resta `indeterminato` e non può sostenere l'ammissibilità
 * territoriale. Un luogo esterno riconosciuto vince anche quando il testo
 * cita la Calabria, perché un'indicazione contraddittoria non è una prova.
 */
export function classificaPerimetro(
  testo: string | null | undefined
): ClassificazionePerimetro {
  const dichiarato = classificaTerritorioDichiarato(testo);
  if (dichiarato?.tipo === "fuori_calabria") {
    return { stato: "fuori_perimetro", luogo: dichiarato.luogo };
  }
  if (dichiarato?.tipo === "pollino_lucano") {
    return {
      stato: "ammesso",
      area: "pollino_lucano",
      luogo: dichiarato.comune,
    };
  }
  if (!testo?.trim()) return { stato: "indeterminato", motivo: "assente" };

  const normalizzato = normalizza(testo);
  if (contieneLuogo(normalizzato, "calabria")) {
    return { stato: "ammesso", area: "calabria", luogo: "Calabria" };
  }
  const provincia = PROVINCE_CALABRESI_PERIMETRO.find((nome) =>
    contieneLuogo(normalizzato, nome)
  );
  if (provincia) {
    return { stato: "ammesso", area: "calabria", luogo: provincia };
  }

  // Comune calabrese indicato da solo: il nome deve comparire come parola
  // intera, così «Lagonegro» o «Cassano d'Adda» non vengono promossi.
  const comune = [...COMUNI_CALABRIA, ...ALIAS_COMUNI_CALABRIA].find((nome) =>
    contieneLuogo(normalizzato, normalizza(nome))
  );
  if (comune) {
    return { stato: "ammesso", area: "calabria", luogo: comune };
  }

  return { stato: "indeterminato", motivo: "non_riconosciuto" };
}

/**
 * Il nome geografico vale come territorio soltanto quando proviene da una
 * corrispondenza ESATTA con una denominazione DOP/IGP/STG ufficiale e
 * registrata. Il nome commerciale o una prova affine non bastano.
 */
function denominazioneUfficialeEsatta(
  prova: ProvaDocumentale | null,
  riconoscimento: RiconoscimentoAi
): boolean {
  return Boolean(
    prova &&
      prova.tipo === "ufficiale" &&
      prova.stato === "registrata" &&
      (prova.schemaQualita === "DOP" ||
        prova.schemaQualita === "IGP" ||
        prova.schemaQualita === "STG") &&
      riconoscimento.denominazioneProposta?.trim() &&
      normalizza(prova.denominazione) ===
        normalizza(riconoscimento.denominazioneProposta ?? "")
  );
}

/**
 * Verdetto esplicito sul perimetro territoriale ammesso: tutta la Calabria e
 * i soli comuni del Parco Nazionale del Pollino situati in Basilicata.
 *
 * Restituisce il luogo esterno soltanto quando la provenienza è riconosciuta
 * come esterna. Un territorio non riconosciuto resta indeterminato: non viene
 * dichiarato ammesso e non viene usato per confermare nulla.
 */
export function territorioFuoriPerimetro(
  riconoscimento: RiconoscimentoAi,
  prova: ProvaDocumentale | null
): { luogo: string; origine: "etichetta" | "denominazione" } | null {
  const etichetta = classificaTerritorioDichiarato(
    riconoscimento.territorioProposto
  );
  if (etichetta?.tipo === "fuori_calabria") {
    return { luogo: etichetta.luogo, origine: "etichetta" };
  }

  const ufficiale = denominazioneUfficialeEsatta(prova, riconoscimento)
    ? classificaTerritorioDichiarato(prova?.denominazione)
    : null;
  if (ufficiale?.tipo === "fuori_calabria") {
    return { luogo: ufficiale.luogo, origine: "denominazione" };
  }

  return null;
}

function valutaTerritorio(
  prova: ProvaDocumentale | null,
  lettura: LetturaDocumentale | null,
  riconoscimento: RiconoscimentoAi
): ValutazioneProvenienza["territorio"] {
  const territorioEtichetta = classificaTerritorioDichiarato(
    riconoscimento.territorioProposto
  );

  const territorioDaDenominazione = denominazioneUfficialeEsatta(
    prova,
    riconoscimento
  )
    ? classificaTerritorioDichiarato(prova?.denominazione)
    : null;
  const territorio = territorioEtichetta ?? territorioDaDenominazione;
  const territorioDaFonteUfficiale =
    territorioEtichetta === null && territorioDaDenominazione !== null;

  if (territorio?.tipo === "pollino_lucano") {
    return {
      stato: "non_documentato",
      evidenze: [],
      motivo:
        `Territorio indicato: ${territorio.comune}, nel versante lucano del Parco Nazionale del Pollino. È compreso nell'area territoriale ammessa da RadiciScan, pur trovandosi amministrativamente in Basilicata e non in Calabria.`,
    };
  }
  if (territorio?.tipo === "fuori_calabria") {
    return {
      stato: "non_documentato",
      evidenze: [],
      motivo: territorioDaFonteUfficiale
        ? `La denominazione ufficiale ${prova?.schemaQualita} "${prova?.denominazione}" risulta registrata in eAmbrosia e identifica un'area geografica esterna alla Calabria (${territorio.luogo}). È fuori dal perimetro territoriale ammesso da RadiciScan; questo non mette in dubbio la legittimità della DOP/IGP/STG.`
        : `L'etichetta indica un territorio esterno alla Calabria (${riconoscimento.territorioProposto}). È fuori dal perimetro territoriale ammesso da RadiciScan; il Pollino lucano è l'eccezione territoriale.`,
    };
  }

  if (!prova) {
    return {
      stato: "non_verificabile",
      evidenze: [],
      motivo:
        "Nessuna scheda ufficiale è collegata al prodotto: il collegamento con la Calabria non è verificabile.",
    };
  }

  const evidenzeTerritoriali = evidenzeDaDocumenti(lettura);

  // La sede amministrativa del gruppo è un dato della scheda, non l'area di
  // produzione: resta visibile come informazione separata, ma non sostiene
  // lo stato `documentato`.
  const sedeAmministrativa: EvidenzaProvenienza | null = prova.sedeGruppo
    ? {
        fonte: `Scheda eAmbrosia ${prova.id} — sede amministrativa del gruppo riconosciuto (non area di produzione)`,
        url: prova.url,
        pagina: null,
        estratto: prova.sedeGruppo.replace(/\s+/g, " ").trim().slice(0, 200),
      }
    : null;

  if (evidenzeTerritoriali.length > 0) {
    return {
      stato: "documentato",
      evidenze: [
        ...(sedeAmministrativa ? [sedeAmministrativa] : []),
        ...evidenzeTerritoriali,
      ].slice(0, MAX_EVIDENZE),
      motivo:
        "La Calabria è citata in un documento ufficiale letto: è un'evidenza documentale distinta dalla sede amministrativa del gruppo e non autentica la singola confezione.",
    };
  }

  const indicato = riconoscimento.territorioProposto;
  return {
    stato: "non_documentato",
    evidenze: sedeAmministrativa ? [sedeAmministrativa] : [],
    motivo:
      "Nessun documento ufficiale letto indica la Calabria come area di produzione" +
      (indicato
        ? `; il territorio letto in etichetta ("${indicato}") non è una fonte documentale.`
        : "; il nome del prodotto non è prova di provenienza.") +
      " La prova disponibile non contiene un'area di produzione ufficiale confrontabile." +
      (sedeAmministrativa
        ? " La sede amministrativa del gruppo non è l'area di produzione della denominazione e non viene usata come prova territoriale."
        : ""),
  };
}

function valutaFiliera(prova: ProvaDocumentale | null): ValutazioneProvenienza["filiera"] {
  if (!prova) {
    return {
      stato: "non_verificabile",
      ente: null,
      evidenze: [],
      motivo:
        "Nessuna scheda ufficiale è collegata al prodotto: l'appartenenza a una filiera non è verificabile.",
    };
  }

  if (prova.gruppoProduttori) {
    return {
      stato: "documentato",
      ente: prova.gruppoProduttori,
      evidenze: [
        {
          fonte: `Scheda eAmbrosia ${prova.id} — recognisedProducersGroup`,
          url: prova.url,
          pagina: null,
          estratto: prova.gruppoProduttori,
        },
      ],
      motivo:
        "Il registro eAmbrosia documenta un gruppo di produttori riconosciuto per questa denominazione. " +
        "Non dimostra che il produttore della confezione fotografata vi aderisca.",
    };
  }

  return {
    stato: "non_documentato",
    ente: null,
    evidenze: [],
    motivo:
      "La scheda ufficiale non riporta un gruppo di produttori riconosciuto: " +
      "l'appartenenza a una filiera riconosciuta non è documentata. La sola presenza geografica non basta.",
  };
}

/**
 * Valutazione esplicita di ciò che resta fuori dalla denominazione.
 *
 * `confezione` è SEMPRE `non_verificabile`: una fotografia non può provare che
 * il singolo esemplare sia certificato, indipendentemente da quanto la
 * denominazione sia ben documentata.
 */
export function valutaProvenienza(
  riconoscimento: RiconoscimentoAi,
  prova: ProvaDocumentale | null,
  lettura: LetturaDocumentale | null
): ValutazioneProvenienza {
  return {
    confezione: {
      stato: "non_verificabile",
      messaggio:
        "La confezione fotografata non è verificabile: RadiciScan legge l'etichetta e confronta la denominazione con fonti ufficiali, " +
        "ma non può stabilire se quel singolo prodotto sia coperto da certificazione. " +
        "La verifica della denominazione non è la verifica della confezione.",
    },
    territorio: valutaTerritorio(prova, lettura, riconoscimento),
    filiera: valutaFiliera(prova),
  };
}

/** Stato sintetico per l'interfaccia, senza trasformare l'assenza in prova. */
export function etichettaProvenienza(stato: StatoProvenienza): string {
  switch (stato) {
    case "documentato":
      return "Documentato";
    case "non_documentato":
      return "Non documentato";
    case "non_verificabile":
    default:
      return "Non verificabile";
  }
}
