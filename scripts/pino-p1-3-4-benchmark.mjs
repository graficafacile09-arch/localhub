/**
 * P1.3.4 — confronto prima/dopo del gate di pertinenza sui dati reali P1.3.3.
 *
 * Il benchmark usa esclusivamente lo snapshot locale per i casi alimentari.
 * I casi non alimentari usano le fixture P1.3/P1.3.2 perché lo snapshot reale
 * non contiene borse; restano offline e servono solo a verificare che la
 * correzione non abbia regressioni fuori dal ramo alimentare.
 *
 * Non esegue query Supabase, non chiama AI e non modifica il catalogo.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { mappaProdottoRiga } from "../lib/negozi.ts";
import {
  filtraProdottiAlimentariPino,
  filtraProdottiPerSoggettoUnico,
  ordinaProdottiPerBudget,
  prodottoRispettaBudgetPino,
} from "../lib/assistente/tools.ts";
import { normalizzaQueryCatalogo } from "../lib/assistente/understanding.ts";
import { RE_ALIMENTO, gatePertinenza } from "./pino-p1-3-benchmark.mjs";
import {
  righeCatalogoP13,
} from "../tests/fixtures/pino-p1-3-catalog.mjs";
import {
  righeCatalogoAmbiguitaP13,
} from "../tests/fixtures/pino-p1-3-2-ambiguita.mjs";

const PERCORSO_SNAPSHOT = resolve(
  process.argv[3] ?? "scripts/pino-p1-3-3-catalog-snapshot-20261104.json"
);
const PERCORSO_REPORT = resolve(
  process.argv[2] ?? "scripts/pino-p1-3-4-benchmark-report-20261104.json"
);

const snapshot = JSON.parse(readFileSync(PERCORSO_SNAPSHOT, "utf8"));
const PERCORSO_REPORT_P133 = resolve(
  "scripts/pino-p1-3-3-benchmark-report-20261104.json"
);
const reportP133 = existsSync(PERCORSO_REPORT_P133)
  ? JSON.parse(readFileSync(PERCORSO_REPORT_P133, "utf8"))
  : null;

function verificaSnapshot() {
  const sidecar = `${PERCORSO_SNAPSHOT}.sha256`;
  if (!existsSync(sidecar)) {
    throw new Error(`Sidecar SHA-256 mancante: ${sidecar}`);
  }
  const atteso = readFileSync(sidecar, "utf8").trim().split(/\s+/)[0];
  const effettivo = createHash("sha256")
    .update(readFileSync(PERCORSO_SNAPSHOT))
    .digest("hex");
  if (atteso !== effettivo) {
    throw new Error(`Hash snapshot non valido: atteso ${atteso}, effettivo ${effettivo}`);
  }
  return effettivo;
}

export const SHA256_SNAPSHOT = verificaSnapshot();

export const prodottiSnapshot = snapshot.prodotti
  .filter((prodotto) => prodotto.attivo === true)
  .map((prodotto) => mappaProdottoRiga(prodotto, prodotto.negozio_nome));

const prodottiSnapshotPerNome = new Map(
  prodottiSnapshot.map((prodotto) => [prodotto.nome, prodotto])
);
const primaP133PerId = new Map(
  (reportP133?.casi ?? []).map((caso) => [caso.id, caso])
);

export const prodottiFixtureP13 = righeCatalogoP13.map((riga) =>
  mappaProdottoRiga(riga, riga.negozio_nome)
);

export const prodottiFixtureAmbiguita = righeCatalogoAmbiguitaP13.map((riga) =>
  mappaProdottoRiga(riga, riga.negozio_nome)
);

const CATALOGHI = {
  snapshot: prodottiSnapshot,
  fixture: prodottiFixtureP13,
  fixtureAmbiguita: prodottiFixtureAmbiguita,
};

export const CASI_P134 = [
  // Casi alimentari già usati in P1.3.3, con le stesse etichette.
  {
    id: "nome-fileja",
    gruppo: "alimentare",
    catalogo: "snapshot",
    query: "Cerco Fileja di Tropea",
    expected: [1513],
    motivazione: "Nome esatto; unico prodotto con questo nome.",
  },
  {
    id: "nome-pecorino",
    gruppo: "alimentare",
    catalogo: "snapshot",
    query: "Cerco Pecorino del Monte Poro",
    expected: [1508],
    motivazione: "Nome esatto; unico prodotto con questo nome.",
  },
  {
    id: "categoria-pasta",
    gruppo: "alimentare",
    catalogo: "snapshot",
    query: "Cerco pasta",
    expected: [1490, 1491, 1513, 1517],
    motivazione:
      "Tagliatelle, Strascinati, Fileja e Maccheroni sono gli unici formati di pasta; taralli e biscotti restano esclusi.",
  },
  {
    id: "categoria-formaggio",
    gruppo: "alimentare",
    catalogo: "snapshot",
    query: "Cerco formaggio",
    expected: [1508],
    motivazione: "Pecorino è l'unico formaggio, tramite sottocategoria e caratteristica.",
  },
  {
    id: "marca-maserati",
    gruppo: "alimentare",
    catalogo: "snapshot",
    query: "Cerco Maserati",
    expected: [218],
    motivazione: "Marca dichiarata Maserati.",
  },
  {
    id: "parole-chiave-amarelli",
    gruppo: "alimentare",
    catalogo: "snapshot",
    query: "Cerco Amarelli",
    expected: [1511],
    motivazione:
      "Amarelli è una parola chiave esatta e distintiva della Liquirizia di Calabria DOP.",
  },
  {
    id: "caratteristica-bottiglia-litro",
    gruppo: "alimentare",
    catalogo: "snapshot",
    query: "Cerco olio in bottiglia da 1 litro",
    expected: [1507],
    motivazione:
      "Solo l'olio calabrese dichiara 'Bottiglia da 1 litro'; l'altro olio non documenta il formato.",
  },
  {
    id: "sottocategoria-pasta-tipica",
    gruppo: "alimentare",
    catalogo: "snapshot",
    query: "Cerco pasta tipica",
    expected: [1513],
    motivazione:
      "Solo Fileja ha sottocategoria 'Pasta tipica' e la relativa parola chiave.",
  },
  {
    id: "descrizione-pane-lievito",
    gruppo: "alimentare",
    catalogo: "snapshot",
    query: "Cerco pane con lievito madre",
    expected: [1488],
    motivazione:
      "Pane Casereccio è l'unico pane; il lievito madre è un dettaglio descrittivo che non sostituisce l'identità.",
  },
  {
    id: "budget-miele-sotto-10",
    gruppo: "alimentare",
    catalogo: "snapshot",
    query: "Cerco miele sotto 10 euro",
    expected: [1374, 1520, 1521],
    motivazione:
      "Miele di Castagno (11,90) è fuori budget; restano Millefiori del Pollino (9,90), bergamotto (5,50) e millefiori 500 g (6,00).",
    maxPrice: 10,
    budgetRigido: true,
  },
  {
    id: "nome-liquirizia-dop",
    gruppo: "alimentare",
    catalogo: "snapshot",
    query: "Cerco liquirizia DOP",
    expected: [1511],
    motivazione: "Liquirizia di Calabria DOP è l'unico prodotto con liquirizia; DOP è nel nome.",
  },

  // Regressioni non alimentari offline. La borsa non esiste nello snapshot
  // reale, quindi si usa la fixture P1.3 già approvata.
  {
    id: "nonfood-borsa-pelle",
    gruppo: "non_alimentare",
    catalogo: "fixture",
    query: "Cerco una borsa in pelle",
    expected: ["p13-borsa", "p13-tracolla", "p13-borsa-vintage"],
    motivazione:
      "La fixture contiene tre prodotti pertinenti; il filtro non deve alterare il ramo non alimentare.",
  },
  {
    id: "nonfood-borsa-caratteristica",
    gruppo: "non_alimentare",
    catalogo: "fixture",
    query: "Cerco una borsa fatta a mano",
    expected: ["p13-borsa"],
    motivazione:
      "Solo Borsa in pelle dichiara 'Fatta a mano'; è il comportamento già coperto da P1.3.",
  },
  {
    id: "nonfood-marca",
    gruppo: "non_alimentare",
    catalogo: "fixtureAmbiguita",
    query: "Cerco Pelletteria Rossi",
    expected: ["a-borsa", "a-cintura", "a-borsa-borgo"],
    motivazione:
      "La marca attraversa due negozi e non coincide con il catalogo di un singolo negozio.",
  },
  {
    id: "nonfood-marca-snapshot",
    gruppo: "non_alimentare",
    catalogo: "snapshot",
    query: "Cerco Maserati",
    expected: [218],
    motivazione: "Marca reale dell'orologio, distinta dal nome del negozio.",
  },
];

export const CASI_DIAGNOSTICI_P134 = [
  {
    id: "diagnostica-nome-negozio",
    gruppo: "diagnostico",
    catalogo: "snapshot",
    query: "Cerco Mani in Pasta",
    expected: null,
    motivazione:
      "Mani in Pasta è un negozio: il termine 'Pasta' attiva il ramo alimentare, ma non esiste un insieme prodotto affidabile.",
  },
  {
    id: "diagnostica-generica-prodotto",
    gruppo: "diagnostico",
    catalogo: "snapshot",
    query: "Cerco prodotto IGP",
    expected: null,
    motivazione:
      "Richiesta generica: 'prodotto' non identifica un alimento; il gate non deve essere misurato come se avesse un insieme atteso.",
  },
  {
    id: "diagnostica-descrizione-sola",
    gruppo: "diagnostico",
    catalogo: "snapshot",
    query: "Cerco lievito madre",
    expected: null,
    motivazione:
      "La descrizione da sola non identifica il prodotto; il caso documenta il limite senza entrare nelle metriche.",
  },
  {
    id: "diagnostica-negozio-fixture",
    gruppo: "diagnostico",
    catalogo: "fixtureAmbiguita",
    query: "Cerco Emporio del Cuoio",
    expected: null,
    motivazione:
      "Query di negozio; non va attribuita alla marca o a tutti i prodotti del negozio.",
  },
  {
    id: "diagnostica-borsa-snapshot",
    gruppo: "diagnostico",
    catalogo: "snapshot",
    query: "Cerco borsa in pelle",
    expected: null,
    motivazione:
      "Lo snapshot reale non contiene borse: il caso è un controllo negativo, non un'etichetta di prodotto.",
  },
];

export function gatePertinenzaP134(query, prodotti = prodottiSnapshot) {
  const alimento = query.toLowerCase().match(RE_ALIMENTO)?.[1];
  if (alimento) {
    return filtraProdottiAlimentariPino(prodotti, query, alimento);
  }
  return filtraProdottiPerSoggettoUnico(
    prodotti,
    normalizzaQueryCatalogo(query),
    query
  );
}

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

function valutaCaso(caso, restituiti) {
  const catalogo = CATALOGHI[caso.catalogo];
  const perId = new Map(catalogo.map((prodotto) => [String(prodotto.id), prodotto]));
  const idsRestituiti = restituiti.map((prodotto) => String(prodotto.id));
  const expected = Array.isArray(caso.expected)
    ? caso.expected.map(String)
    : null;
  const setRestituiti = new Set(idsRestituiti);
  const setAttesi = new Set(expected ?? []);
  const corretti = expected
    ? [...setRestituiti].filter((id) => setAttesi.has(id))
    : [];
  const falsiPositivi = expected
    ? [...setRestituiti].filter((id) => !setAttesi.has(id))
    : [];
  const falsiNegativi = expected
    ? [...setAttesi].filter((id) => !setRestituiti.has(id))
    : [];
  const incluso = expected !== null;

  return {
    incluso,
    restituiti: idsRestituiti,
    attesi: expected,
    corretti,
    falsiPositivi,
    falsiNegativi,
    precisione:
      incluso && idsRestituiti.length > 0
        ? arrotonda(corretti.length / idsRestituiti.length)
        : null,
    richiamo:
      incluso && expected.length > 0
        ? arrotonda(corretti.length / expected.length)
        : null,
    dettagli: {
      candidati: catalogo.map((prodotto) => ({
        id: String(prodotto.id),
        nome: prodotto.nome,
      })),
      restituiti: restituiti.map((prodotto) => ({
        id: String(prodotto.id),
        nome: prodotto.nome,
      })),
      attesi: [...(expected ?? [])].map((id) => ({
        id,
        nome: perId.get(id)?.nome ?? null,
      })),
    },
  };
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
              precisioni.reduce((s, valore) => s + valore, 0) /
                precisioni.length
            )
          : null,
      richiamo:
        richiami.length > 0
          ? arrotonda(richiami.reduce((s, valore) => s + valore, 0) / richiami.length)
          : null,
      casiPrecisioneValidi: precisioni.length,
      casiRichiamoValidi: richiami.length,
    },
  };
}

function restituitiPrima(caso) {
  // Per i casi alimentari P1.3.3 il baseline autorevole è il report già
  // prodotto prima delle correzioni. La fixture e i casi nuovi usano il gate
  // precedente, invariato fuori dal ramo alimentare.
  if (caso.catalogo === "snapshot" && primaP133PerId.has(caso.id)) {
    const voci = primaP133PerId.get(caso.id).restituiti ?? [];
    return voci
      .map((voce) => {
        if (typeof voce === "string") return prodottiSnapshotPerNome.get(voce);
        return (
          prodottiSnapshot.find(
            (prodotto) => String(prodotto.id) === String(voce?.id)
          ) ?? prodottiSnapshotPerNome.get(voce?.nome)
        );
      })
      .filter(Boolean);
  }
  const catalogo = CATALOGHI[caso.catalogo];
  return applicaBudget(gatePertinenza(caso.query, catalogo), caso);
}

export function calcolaReportP134() {
  const casi = [...CASI_P134, ...CASI_DIAGNOSTICI_P134].map((caso) => {
    const prima = valutaCaso(caso, restituitiPrima(caso));
    const dopo = valutaCaso(
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
      query: caso.query,
      motivazione: caso.motivazione,
      inclusoNelleMetriche: dopo.incluso,
      prima,
      dopo,
      confronto: confronta(prima, dopo),
    };
  });

  const alimentari = casi.filter((caso) => caso.gruppo === "alimentare");
  const nonAlimentari = casi.filter((caso) => caso.gruppo === "non_alimentare");
  return {
    versione: "P1.3.4",
    snapshot: {
      percorso: PERCORSO_SNAPSHOT,
      sha256: SHA256_SNAPSHOT,
      prodottiAttivi: prodottiSnapshot.length,
    },
    sorgente: "snapshot P1.3.3 per alimentari; fixture offline per non alimentari",
    distinzione: {
      recupero: "non eseguito: nessuna query Supabase",
      filtro: "gate P1.3.4 applicato ai candidati offline",
      endToEnd: false,
    },
    casi,
    metriche: {
      alimentari: {
        prima: metriche(alimentari, "prima"),
        dopo: metriche(alimentari, "dopo"),
      },
      nonAlimentari: {
        prima: metriche(nonAlimentari, "prima"),
        dopo: metriche(nonAlimentari, "dopo"),
      },
    },
    casiMigliorati: casi.filter((caso) => caso.confronto === "migliorato").map((c) => c.id),
    casiPeggiorati: casi.filter((caso) => caso.confronto === "peggiorato").map((c) => c.id),
    casiInvariati: casi.filter((caso) => caso.confronto === "invariato").map((c) => c.id),
    diagnostici: casi
      .filter((caso) => !caso.inclusoNelleMetriche)
      .map((caso) => ({ id: caso.id, query: caso.query, motivazione: caso.motivazione })),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const report = calcolaReportP134();
  if (existsSync(PERCORSO_REPORT)) {
    console.error(`Report già esistente, nessuna sovrascrittura: ${PERCORSO_REPORT}`);
    process.exit(3);
  }
  writeFileSync(PERCORSO_REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const f = (v) => (v == null ? "n/d" : v.toFixed(4));
  console.log(`Snapshot: ${report.snapshot.percorso}`);
  console.log(`SHA-256: ${report.snapshot.sha256}`);
  console.log(
    `Alimentari: prima P=${f(report.metriche.alimentari.prima.micro.precisione)} R=${f(report.metriche.alimentari.prima.micro.richiamo)}; dopo P=${f(report.metriche.alimentari.dopo.micro.precisione)} R=${f(report.metriche.alimentari.dopo.micro.richiamo)}`
  );
  console.log(
    `Non alimentari: prima P=${f(report.metriche.nonAlimentari.prima.micro.precisione)} R=${f(report.metriche.nonAlimentari.prima.micro.richiamo)}; dopo P=${f(report.metriche.nonAlimentari.dopo.micro.precisione)} R=${f(report.metriche.nonAlimentari.dopo.micro.richiamo)}`
  );
  console.log(`Migliorati: ${report.casiMigliorati.join(", ") || "nessuno"}`);
  console.log(`Peggiorati: ${report.casiPeggiorati.join(", ") || "nessuno"}`);
  for (const caso of report.casi.filter((c) => c.gruppo !== "diagnostico")) {
    console.log(
      `${caso.id} | ${caso.query} | prima=${caso.prima.restituiti.length} dopo=${caso.dopo.restituiti.length} TP=${caso.dopo.corretti.length} FP=${caso.dopo.falsiPositivi.length} FN=${caso.dopo.falsiNegativi.length}`
    );
  }
  console.log(`Report: ${PERCORSO_REPORT}`);
}
