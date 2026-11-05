/**
 * P1.3.5 — benchmark offline del gate di pertinenza prodotti.
 *
 * Confronta il comportamento P1.3.4 (report locale già prodotto) con il gate
 * P1.3.5. Usa lo stesso snapshot P1.3.3 per i casi alimentari e le fixture
 * offline per le regressioni non alimentari. Nessuna query Supabase, nessuna
 * chiamata AI e nessuna scrittura sul catalogo.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ordinaProdottiPerBudget, prodottoRispettaBudgetPino } from "../lib/assistente/tools.ts";
import {
  CASI_P134,
  prodottiFixtureAmbiguita,
  prodottiFixtureP13,
  prodottiSnapshot,
  SHA256_SNAPSHOT,
  gatePertinenzaP134,
} from "./pino-p1-3-4-benchmark.mjs";

const PERCORSO_REPORT = resolve(
  process.argv[2] ?? "scripts/pino-p1-3-5-benchmark-report-20261105.json"
);
const PERCORSO_REPORT_P134 = resolve(
  "scripts/pino-p1-3-4-benchmark-report-20261104.json"
);

const reportP134 = existsSync(PERCORSO_REPORT_P134)
  ? JSON.parse(readFileSync(PERCORSO_REPORT_P134, "utf8"))
  : null;
if (!reportP134) {
  throw new Error(`Baseline P1.3.4 mancante: ${PERCORSO_REPORT_P134}`);
}

const CATALOGHI = {
  snapshot: prodottiSnapshot,
  fixture: prodottiFixtureP13,
  fixtureAmbiguita: prodottiFixtureAmbiguita,
};

const UNIT_CASI = [
  {
    id: "unita-1-litro",
    gruppo: "unita",
    catalogo: "snapshot",
    query: "Cerco olio in bottiglia da 1 litro",
    expected: [1507],
    motivazione: "Forma estesa singolare.",
    prima: ["1507"],
  },
  {
    id: "unita-1-l",
    gruppo: "unita",
    catalogo: "snapshot",
    query: "Cerco olio in bottiglia da 1 l",
    expected: [1507],
    motivazione: "Abbreviazione del litro.",
    prima: [],
  },
  {
    id: "unita-100-cl",
    gruppo: "unita",
    catalogo: "snapshot",
    query: "Cerco olio in bottiglia da 100 cl",
    expected: [1507],
    motivazione: "100 cl equivalgono a 1 litro.",
    prima: [],
  },
  {
    id: "unita-1000-ml",
    gruppo: "unita",
    catalogo: "snapshot",
    query: "Cerco olio in bottiglia da 1000 ml",
    expected: [1507],
    motivazione: "1000 ml equivalgono a 1 litro.",
    prima: [],
  },
  {
    id: "unita-1-litri",
    gruppo: "unita",
    catalogo: "snapshot",
    query: "Cerco olio in bottiglia da 1 litri",
    expected: [1507],
    motivazione: "Plurale non canonico ma non ambiguo.",
    prima: [],
  },
  {
    id: "unita-un-litro",
    gruppo: "unita",
    catalogo: "snapshot",
    query: "Cerco olio in bottiglia da un litro",
    expected: [1507],
    motivazione: "Numero scritto in lettere.",
    prima: ["1376", "1507"],
  },
  {
    id: "unita-mezzo-litro",
    gruppo: "unita",
    catalogo: "snapshot",
    query: "Cerco olio in bottiglia da mezzo litro",
    expected: [],
    motivazione:
      "Nessun olio dello snapshot documenta 500 ml; il prodotto da 1 litro non deve soddisfare mezzo litro.",
    prima: ["1376", "1507"],
  },
  {
    id: "unita-2-litri",
    gruppo: "unita",
    catalogo: "snapshot",
    query: "Cerco olio in bottiglia da 2 litri",
    expected: [],
    motivazione: "Quantità non documentata.",
    prima: [],
  },
  {
    id: "unita-1-kg",
    gruppo: "unita",
    catalogo: "snapshot",
    query: "Cerco olio in bottiglia da 1 kg",
    expected: [],
    motivazione: "Il peso non è compatibile con un formato di volume.",
    prima: [],
  },
  {
    id: "unita-1-metro",
    gruppo: "unita",
    catalogo: "snapshot",
    query: "Cerco olio in bottiglia da 1 m",
    expected: [],
    motivazione: "La lunghezza non è compatibile con il formato del prodotto.",
    prima: [],
  },
];

const CASI = [...CASI_P134, ...UNIT_CASI];

function applicaBudget(risultati, caso) {
  if (caso.maxPrice == null && caso.minPrice == null) return risultati;
  let filtrati = ordinaProdottiPerBudget(risultati, {
    maxPrice: caso.maxPrice ?? null,
    minPrice: caso.minPrice ?? null,
  });
  if (caso.budgetRigido) {
    filtrati = filtrati.filter((prodotto) =>
      prodottoRispettaBudgetPino(prodotto, {
        maxPrice: caso.maxPrice ?? null,
        minPrice: caso.minPrice ?? null,
      })
    );
  }
  return filtrati;
}

function arrotonda(valore) {
  return valore == null ? null : Number(valore.toFixed(4));
}

function valuta(caso, restituiti) {
  const idsRestituiti = restituiti.map((prodotto) => String(prodotto.id));
  const attesi = Array.isArray(caso.expected)
    ? caso.expected.map(String)
    : null;
  const setRestituiti = new Set(idsRestituiti);
  const setAttesi = new Set(attesi ?? []);
  const corretti = attesi
    ? [...setRestituiti].filter((id) => setAttesi.has(id))
    : [];
  const falsiPositivi = attesi
    ? [...setRestituiti].filter((id) => !setAttesi.has(id))
    : [];
  const falsiNegativi = attesi
    ? [...setAttesi].filter((id) => !setRestituiti.has(id))
    : [];
  const incluso = attesi !== null;
  return {
    incluso,
    restituiti: idsRestituiti,
    attesi,
    corretti,
    falsiPositivi,
    falsiNegativi,
    precisione:
      incluso && idsRestituiti.length > 0
        ? arrotonda(corretti.length / idsRestituiti.length)
        : null,
    richiamo:
      incluso && attesi.length > 0
        ? arrotonda(corretti.length / attesi.length)
        : null,
  };
}

function restituitiPrima(caso) {
  if (Array.isArray(caso.prima)) {
    const perId = new Map(
      CATALOGHI[caso.catalogo].map((prodotto) => [String(prodotto.id), prodotto])
    );
    return caso.prima.map((id) => perId.get(String(id))).filter(Boolean);
  }
  const baseline = reportP134.casi.find((voce) => voce.id === caso.id);
  if (!baseline) {
    throw new Error(`Nessun baseline P1.3.4 per ${caso.id}`);
  }
  const perId = new Map(
    CATALOGHI[caso.catalogo].map((prodotto) => [String(prodotto.id), prodotto])
  );
  return (baseline.dopo?.restituiti ?? []).map((id) => perId.get(String(id))).filter(Boolean);
}

function confronta(prima, dopo) {
  const punteggio = (esito) =>
    esito.incluso
      ? esito.corretti.length -
        esito.falsiPositivi.length -
        esito.falsiNegativi.length
      : 0;
  if (punteggio(dopo) > punteggio(prima)) return "migliorato";
  if (punteggio(dopo) < punteggio(prima)) return "peggiorato";
  return "invariato";
}

function metriche(casi, fase) {
  const inclusi = casi.filter((caso) => caso[fase].incluso);
  const somma = inclusi.reduce(
    (acc, caso) => {
      const esito = caso[fase];
      acc.veriPositivi += esito.corretti.length;
      acc.falsiPositivi += esito.falsiPositivi.length;
      acc.falsiNegativi += esito.falsiNegativi.length;
      acc.restituiti += esito.restituiti.length;
      acc.attesi += esito.attesi?.length ?? 0;
      return acc;
    },
    {
      veriPositivi: 0,
      falsiPositivi: 0,
      falsiNegativi: 0,
      restituiti: 0,
      attesi: 0,
    }
  );
  const precisioni = inclusi
    .map((caso) => caso[fase].precisione)
    .filter((valore) => valore !== null);
  const richiami = inclusi
    .map((caso) => caso[fase].richiamo)
    .filter((valore) => valore !== null);
  return {
    casi: inclusi.length,
    micro: {
      precisione:
        somma.restituiti > 0
          ? arrotonda(somma.veriPositivi / somma.restituiti)
          : null,
      richiamo:
        somma.attesi > 0 ? arrotonda(somma.veriPositivi / somma.attesi) : null,
      ...somma,
    },
    macro: {
      precisione:
        precisioni.length > 0
          ? arrotonda(
              precisioni.reduce((totale, valore) => totale + valore, 0) /
                precisioni.length
            )
          : null,
      richiamo:
        richiami.length > 0
          ? arrotonda(
              richiami.reduce((totale, valore) => totale + valore, 0) /
                richiami.length
            )
          : null,
    },
  };
}

export function calcolaReportP135() {
  const casi = CASI.map((caso) => {
    const prima = valuta(caso, restituitiPrima(caso));
    const dopo = valuta(
      caso,
      applicaBudget(
        gatePertinenzaP134(caso.query, CATALOGHI[caso.catalogo]),
        caso
      )
    );
    return {
      id: caso.id,
      gruppo: caso.gruppo,
      catalogo: caso.catalogo,
      fonte: caso.catalogo === "snapshot" ? "snapshot reale" : "fixture offline",
      baseline: Array.isArray(caso.prima)
        ? "manuale, non replay P1.3.4"
        : "report P1.3.4",
      query: caso.query,
      motivazione: caso.motivazione,
      prima,
      dopo,
      confronto: confronta(prima, dopo),
    };
  });

  const unita = casi.filter((caso) => caso.gruppo === "unita");
  const alimentari = casi.filter((caso) => caso.gruppo === "alimentare");
  const nonAlimentari = casi.filter((caso) => caso.gruppo === "non_alimentare");
  const sottocategorie = casi.filter(
    (caso) => caso.id === "sottocategoria-pasta-tipica"
  );
  const caratteristiche = casi.filter((caso) =>
    [
      "caratteristica-bottiglia-litro",
      "descrizione-pane-lievito",
      "nonfood-borsa-caratteristica",
    ].includes(caso.id)
  );
  const prodotto = casi.filter((caso) => caso.gruppo !== "unita");
  return {
    versione: "P1.3.5",
    snapshot: {
      sha256: SHA256_SNAPSHOT,
      prodottiAttivi: prodottiSnapshot.length,
    },
    sorgente: "snapshot P1.3.3 + fixture P1.3/P1.3.2",
    baseline: {
      prodotto:
        "riuso del report P1.3.4 per le etichette già esistenti, stesso catalogo per prima e dopo",
      unita:
        "valori 'prima' manuali nello script per i casi unita: non è un replay eseguito di P1.3.4",
    },
    distinzione: {
      recupero: "non eseguito: nessuna query Supabase",
      filtro: "gate P1.3.5 applicato ai candidati offline",
      endToEnd: false,
    },
    casi,
    metriche: {
      unita: { prima: metriche(unita, "prima"), dopo: metriche(unita, "dopo") },
      alimentari: {
        prima: metriche(alimentari, "prima"),
        dopo: metriche(alimentari, "dopo"),
      },
      non_alimentari: {
        prima: metriche(nonAlimentari, "prima"),
        dopo: metriche(nonAlimentari, "dopo"),
      },
      sottocategorie: {
        prima: metriche(sottocategorie, "prima"),
        dopo: metriche(sottocategorie, "dopo"),
      },
      caratteristiche: {
        prima: metriche(caratteristiche, "prima"),
        dopo: metriche(caratteristiche, "dopo"),
      },
      prodotto: {
        prima: metriche(prodotto, "prima"),
        dopo: metriche(prodotto, "dopo"),
      },
    },
    casiMigliorati: casi
      .filter((caso) => caso.confronto === "migliorato")
      .map((caso) => caso.id),
    casiPeggiorati: casi
      .filter((caso) => caso.confronto === "peggiorato")
      .map((caso) => caso.id),
    casiInvariati: casi
      .filter((caso) => caso.confronto === "invariato")
      .map((caso) => caso.id),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const report = calcolaReportP135();
  if (existsSync(PERCORSO_REPORT)) {
    console.error(`Report già esistente, nessuna sovrascrittura: ${PERCORSO_REPORT}`);
    process.exit(3);
  }
  writeFileSync(PERCORSO_REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const f = (valore) => (valore == null ? "n/d" : valore.toFixed(4));
  console.log(`Snapshot SHA-256: ${report.snapshot.sha256}`);
  console.log(
    `Unità: prima P=${f(report.metriche.unita.prima.micro.precisione)} R=${f(report.metriche.unita.prima.micro.richiamo)}; dopo P=${f(report.metriche.unita.dopo.micro.precisione)} R=${f(report.metriche.unita.dopo.micro.richiamo)}`
  );
  console.log(
    `Prodotto: prima P=${f(report.metriche.prodotto.prima.micro.precisione)} R=${f(report.metriche.prodotto.prima.micro.richiamo)}; dopo P=${f(report.metriche.prodotto.dopo.micro.precisione)} R=${f(report.metriche.prodotto.dopo.micro.richiamo)}`
  );
  console.log(`Migliorati: ${report.casiMigliorati.join(", ") || "nessuno"}`);
  console.log(`Peggiorati: ${report.casiPeggiorati.join(", ") || "nessuno"}`);
  console.log(`Report: ${PERCORSO_REPORT}`);
}
