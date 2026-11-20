import type {
  Discrepanza,
  EtichettaEstratta,
  EvidenzaProvenienza,
  LetturaDocumentale,
  OcrRisultato,
  ProvaDocumentale,
  RicercaWeb,
  RiconoscimentoAi,
  VerificaProduttore,
} from "./tipi";

/**
 * RadiciScan — verifica separata del produttore e della filiera.
 *
 * Dieci controlli indipendenti. Il punto centrale: una denominazione
 * DOP/IGP esistente NON dimostra che la confezione fotografata sia autentica,
 * e la sede calabrese di un'azienda NON dimostra che il prodotto sia di
 * origine calabrese. I PAT non sono certificazioni di origine.
 *
 * `documentato` richiede una fonte ufficiale consultata che lo affermi; una
 * pagina commerciale o un'etichetta letta non bastano.
 */

function normalizza(valore: string): string {
  return valore
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compatibili(a: string, b: string): boolean {
  const na = normalizza(a);
  const nb = normalizza(b);
  if (!na || !nb) return true;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;

  const pa = na.split(" ").filter((parola) => parola.length > 2);
  const pb = nb.split(" ").filter((parola) => parola.length > 2);
  if (pa.length === 0 || pb.length === 0) return true;

  // Simmetria: un nome breve dentro un testo lungo è compatibile se le sue
  // parole compaiono nel testo, non se il testo è contenuto nel nome.
  const setA = new Set(pa);
  const setB = new Set(pb);
  const coperturaB = pb.filter((parola) => setA.has(parola)).length / pb.length;
  const coperturaA = pa.filter((parola) => setB.has(parola)).length / pa.length;
  return Math.max(coperturaA, coperturaB) >= 0.6;
}

function evidenzaWeb(web: RicercaWeb | null, richiesta: (testo: string) => boolean): EvidenzaProvenienza[] {
  if (!web || web.stato !== "ok") return [];
  return web.fonti
    .filter(
      (fonte) =>
        // Una fonte è evidenza solo se il contenuto della pagina è stato
        // scaricato e letto integralmente. Titolo e snippet del motore di
        // ricerca sono indizi di ricerca, non prove documentali.
        fonte.lettoIntegralmente === true &&
        (fonte.natura === "ufficiale_eu" ||
          fonte.natura === "ufficiale_it" ||
          fonte.natura === "regionale") &&
        richiesta(`${fonte.titolo} ${fonte.estratto ?? ""}`)
    )
    .slice(0, 3)
    .map((fonte) => ({
      fonte: `${fonte.titolo} — ${fonte.ente}`,
      url: fonte.url,
      pagina: fonte.pagineLette,
      estratto: (fonte.estratto ?? fonte.titolo).slice(0, 260),
    }));
}

function evidenzeDocumenti(
  lettura: LetturaDocumentale | null,
  richiesta: (testo: string) => boolean
): EvidenzaProvenienza[] {
  if (!lettura) return [];
  const evidenze: EvidenzaProvenienza[] = [];
  for (const documento of lettura.documenti) {
    for (const sezione of documento.sezioni) {
      if (!richiesta(sezione.testo)) continue;
      evidenze.push({
        fonte: `${documento.titolo} (${documento.url})`,
        url: documento.url,
        pagina: sezione.pagina,
        estratto: sezione.testo.replace(/\s+/g, " ").trim().slice(0, 260),
      });
      break;
    }
    if (evidenze.length >= 3) break;
  }
  return evidenze;
}

export interface OpzioniVerificaProduttore {
  riconoscimento: RiconoscimentoAi;
  etichetta: EtichettaEstratta | null;
  ocr: OcrRisultato | null;
  web: RicercaWeb | null;
  prove: readonly ProvaDocumentale[];
  lettura: LetturaDocumentale | null;
  discrepanze: readonly Discrepanza[];
}

export function verificaProduttore(opzioni: OpzioniVerificaProduttore): VerificaProduttore {
  const { riconoscimento, etichetta, ocr, web, prove, lettura, discrepanze } = opzioni;

  // Solo una prova esplicitamente ufficiale può attestare lo stato della
  // denominazione o il gruppo riconosciuto. Un risultato di ricerca o una
  // scheda informativa non diventa ufficiale perché marcata "registrata".
  const prova =
    prove.find((voce) => voce.tipo === "ufficiale" && voce.stato === "registrata") ??
    prove.find((voce) => voce.tipo === "ufficiale") ??
    null;
  const testoOcr = ocr?.stato === "ok" ? ocr.testo : "";
  const produttore = etichetta?.produttore.valore ?? riconoscimento.produttore ?? null;
  const stabilimento = etichetta?.stabilimento.valore ?? riconoscimento.stabilimento ?? null;

  const evidenzeCalabria = [
    ...evidenzeDocumenti(lettura, (testo) => /calabria|cosenza|crotone|catanzaro|vibo|reggio calabria|sila|aspromonte|pollino/i.test(testo)),
    ...evidenzaWeb(web, (testo) => /calabria|cosenza|crotone|catanzaro|vibo|reggio calabria|sila|aspromonte|pollino/i.test(testo)),
  ].slice(0, 3);

  const evidenzeProduttore = evidenzaWeb(
    web,
    (testo) => (produttore ? compatibili(produttore, testo) : false)
  );
  const evidenzeDisciplinare = evidenzeDocumenti(
    lettura,
    (testo) => /disciplinare|zona di produzione|metodo di ottenimento|requisiti/i.test(testo)
  );

  const discrepanzeMedia = discrepanze.filter((voce) => voce.gravita === "media");

  const controlli: VerificaProduttore["controlli"] = [
    {
      id: "identita_prodotto",
      etichetta: "Identità del prodotto",
      stato:
        testoOcr.length === 0
          ? "non_verificabile"
          : compatibili(riconoscimento.prodotto, testoOcr)
            ? "non_verificabile"
            : "incoerente",
      dettaglio:
        testoOcr.length === 0
          ? "Nessun testo OCR: l'identità del prodotto resta un'ipotesi del modello visivo."
          : compatibili(riconoscimento.prodotto, testoOcr)
            ? "Il nome riconosciuto compare nell'etichetta letta dall'OCR, ma questo non prova l'identità o l'autenticità del prodotto."
            : "Il nome riconosciuto dal modello non compare nel testo OCR: possibile lettura parziale o ipotesi errata.",
      evidenze: [],
    },
    {
      id: "denominazione",
      etichetta: "Esistenza e stato della denominazione",
      stato: prova
        ? prova.stato === "registrata"
          ? "documentato"
          : "non_documentato"
        : "non_verificabile",
      dettaglio: prova
        ? `Scheda ufficiale ${prova.id}: stato "${prova.stato.replaceAll("_", " ")}", schema ${prova.schemaQualita ?? "non dichiarato"}. ` +
          "La scheda riguarda la denominazione, non la singola confezione."
        : "Nessuna scheda ufficiale associata: la denominazione non è verificabile.",
      evidenze: prova
        ? [
            {
              fonte: `${prova.titolo} — ${prova.ente}`,
              url: prova.url,
              pagina: null,
              estratto: prova.estratto ?? prova.titolo,
            },
          ]
        : [],
    },
    {
      id: "disciplinare",
      etichetta: "Disciplinare e requisiti di produzione",
      stato: evidenzeDisciplinare.length > 0 ? "documentato" : "non_documentato",
      dettaglio: evidenzeDisciplinare.length > 0
        ? "Sono stati letti passaggi pertinenti al disciplinare o ai requisiti di produzione."
        : !lettura
          ? "Nessun documento è stato letto: i requisiti di produzione non sono documentati."
          : "I documenti letti non contengono passaggi pertinenti sufficienti a documentare i requisiti di produzione.",
      evidenze: evidenzeDisciplinare,
    },
    {
      id: "produttore_etichetta",
      etichetta: "Produttore indicato in etichetta",
      stato: produttore ? "non_verificabile" : "non_documentato",
      dettaglio: produttore
        ? `"${produttore}" è letto in etichetta (o proposto dal modello): non è ancora confermato da un registro ufficiale.`
        : "Nessun produttore leggibile in etichetta.",
      evidenze: produttore
        ? [
            {
              fonte: "Etichetta della confezione (lettura OCR/modello)",
              url: null,
              pagina: null,
              estratto: produttore,
            },
          ]
        : [],
    },
    {
      id: "gruppo_riconosciuto",
      etichetta: "Gruppo di produttori riconosciuto",
      stato: prova?.gruppoProduttori ? "documentato" : "non_documentato",
      dettaglio: prova?.gruppoProduttori
        ? `La scheda ufficiale cita "${prova.gruppoProduttori}" con sede "${prova.sedeGruppo ?? "non indicata"}". ` +
          "L'adesione del produttore della confezione non è dimostrata da questo dato."
        : "La scheda ufficiale non riporta un gruppo di produttori riconosciuto.",
      evidenze: prova?.gruppoProduttori
        ? [
            {
              fonte: `eAmbrosia ${prova.id} — gruppo riconosciuto`,
              url: prova.url,
              pagina: null,
              estratto: prova.gruppoProduttori,
            },
          ]
        : [],
    },
    {
      id: "consorzi_registri",
      etichetta: "Presenza in consorzi o registri",
      stato: evidenzeProduttore.length > 0 ? "documentato" : "non_documentato",
      dettaglio:
        evidenzeProduttore.length > 0
          ? "Fonti web istituzionali o di consorzio citano il produttore. Non è la prova che la confezione sia coperta da certificazione."
          : "Nessuna fonte istituzionale consultata cita il produttore: assenza di riscontro, non prova contraria.",
      evidenze: evidenzeProduttore,
    },
    {
      id: "stabilimento_territorio",
      etichetta: "Stabilimento e territorio di produzione",
      stato: stabilimento || evidenzeCalabria.length > 0 ? "non_verificabile" : "non_documentato",
      dettaglio:
        stabilimento || evidenzeCalabria.length > 0
          ? `Stabilimento letto: "${stabilimento ?? "non indicato"}". Le fonti consultate citano la Calabria, ma il legame con la confezione specifica resta non verificabile.`
          : "Né l'etichetta né i documenti letti indicano uno stabilimento o un territorio di produzione.",
      evidenze: evidenzeCalabria,
    },
    {
      id: "legame_calabria",
      etichetta: "Legame documentato con la Calabria",
      stato: evidenzeCalabria.length > 0 ? "documentato" : "non_documentato",
      dettaglio:
        evidenzeCalabria.length > 0
          ? "La Calabria è citata in una fonte ufficiale o in un documento letto: riguarda la zona di produzione, non la provenienza del singolo esemplare."
          : "Nessuna fonte ufficiale consultata documenta un legame con la Calabria.",
      evidenze: evidenzeCalabria,
    },
    {
      id: "coerenza_etichetta_fonti",
      etichetta: "Coerenza fra etichetta e fonti esterne",
      stato:
        discrepanzeMedia.length > 0
          ? "incoerente"
          : "non_verificabile",
      dettaglio:
        discrepanze.length === 0
          ? "OCR e modello visivo non presentano divergenze registrate, ma la concordanza automatica non costituisce una verifica esterna."
          : `${discrepanze.length} discrepanza/e registrata/e, di cui ${discrepanzeMedia.length} di gravità media. Nessun valore è stato scelto d'ufficio.`,
      evidenze: [],
    },
    {
      id: "incongruenze",
      etichetta: "Incongruenze rilevate",
      stato:
        riconoscimento.incongruenzeRilevate.length > 0 || discrepanzeMedia.length > 0
          ? "incoerente"
          : "non_verificabile",
      dettaglio:
        riconoscimento.incongruenzeRilevate.length + discrepanzeMedia.length === 0
          ? "Nessuna incongruenza segnalata dai controlli automatici."
          : `${riconoscimento.incongruenzeRilevate.length} segnalazione/i del modello e ${discrepanzeMedia.length} discrepanza/e media: l'esito resta da controllare.`,
      evidenze: [],
    },
  ];

  const avvertenze: string[] = [
    "RadiciScan verifica la denominazione e l'etichetta, non l'autenticità della singola confezione.",
  ];
  if (riconoscimento.schemaProposto === "PAT") {
    avvertenze.push(
      "PAT è un prodotto agroalimentare tradizionale: non è una certificazione di origine e non va presentato come DOP/IGP."
    );
  }
  if (prova?.schemaQualita) {
    avvertenze.push(
      `La scheda ${prova.schemaQualita} documenta la denominazione, non l'autenticità della confezione fotografata.`
    );
  }
  if (evidenzeCalabria.length > 0) {
    avvertenze.push(
      "La presenza in Calabria o la sede di un'azienda non dimostrano che il prodotto sia di origine calabrese."
    );
  }

  return {
    controlli,
    sintesi:
      `${controlli.filter((controllo) => controllo.stato === "documentato").length} controlli su ${controlli.length} hanno un riscontro documentale. ` +
      avvertenze.join(" "),
  };
}
