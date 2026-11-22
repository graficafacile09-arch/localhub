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

  // Province lucane: utile quando l'etichetta riporta solo la sigla.
  if (/(^| )(pz|mt)( |$)/.test(normalizzato)) {
    return { tipo: "fuori_calabria", luogo: normalizzato };
  }
  return null;
}

function valutaTerritorio(
  prova: ProvaDocumentale | null,
  lettura: LetturaDocumentale | null,
  riconoscimento: RiconoscimentoAi
): ValutazioneProvenienza["territorio"] {
  const territorio = classificaTerritorioDichiarato(riconoscimento.territorioProposto);
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
      motivo:
        `Non è un prodotto di filiera calabrese. L'etichetta indica un territorio esterno alla Calabria (${riconoscimento.territorioProposto}); il Pollino lucano è l'eccezione territoriale ammessa.`,
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
