/**
 * P1.3.3 — benchmark offline del filtro di pertinenza P1.3 sui prodotti dello
 * snapshot reale InCittà.
 *
 * Questo script NON esegue il retrieval Supabase: legge solo lo snapshot locale
 * già creato, ne verifica l'hash e applica lo stesso gate del benchmark P1.3.2.
 * Non chiama modelli AI e non modifica il catalogo.
 *
 * Uso:
 *   node --experimental-strip-types --import ./tests/support/hook-pino.mjs \
 *     scripts/pino-p1-3-3-benchmark.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { mappaProdottoRiga } from "../lib/negozi.ts";
import {
  ordinaProdottiPerBudget,
  prodottoRispettaBudgetPino,
} from "../lib/assistente/tools.ts";
import { gatePertinenza } from "./pino-p1-3-benchmark.mjs";

const PERCORSO_SNAPSHOT_DEFAULT =
  "scripts/pino-p1-3-3-catalog-snapshot-20261104.json";
const PERCORSO_REPORT_DEFAULT =
  "scripts/pino-p1-3-3-benchmark-report-20261104.json";

/**
 * Casi con un insieme atteso verificabile. Gli ID e le motivazioni sono basati
 * sui metadati dello snapshot, non sull'output del gate.
 */
const CASI_PRODOTTO = [
  {
    id: "nome-fileja",
    query: "Cerco Fileja di Tropea",
    tipo: "nome",
    expected: [1513],
    motivazione:
      "Il nome esatto individua Fileja di Tropea; è l'unico prodotto con questo nome.",
  },
  {
    id: "nome-pecorino",
    query: "Cerco Pecorino del Monte Poro",
    tipo: "nome",
    expected: [1508],
    motivazione:
      "Il nome esatto individua Pecorino del Monte Poro; è l'unico prodotto con questo nome.",
  },
  {
    id: "categoria-pasta",
    query: "Cerco pasta",
    tipo: "categoria",
    expected: [1490, 1491, 1513, 1517],
    motivazione:
      "Sono gli unici prodotti che identificano formati di pasta: Tagliatelle, Strascinati, Fileja e Maccheroni. Taralli e biscotti non sono pasta.",
  },
  {
    id: "categoria-formaggio",
    query: "Cerco formaggio",
    tipo: "categoria",
    expected: [1508],
    motivazione:
      "Pecorino del Monte Poro è l'unico formaggio; la sottocategoria è 'Formaggi calabresi' e la caratteristica è 'Formaggio pecorino'.",
  },
  {
    id: "marca-maserati",
    query: "Cerco Maserati",
    tipo: "marca",
    expected: [218],
    motivazione:
      "La marca dichiarata è Maserati; nessun altro prodotto ha questa marca.",
  },
  {
    id: "parole-chiave-amarelli",
    query: "Cerco Amarelli",
    tipo: "parole_chiave",
    expected: [1511],
    motivazione:
      "La parola chiave dichiarata include 'Amarelli'. Il nome non la contiene: il metadato esplicito è l'unica prova dell'associazione.",
  },
  {
    id: "caratteristica-bottiglia-litro",
    query: "Cerco olio in bottiglia da 1 litro",
    tipo: "caratteristiche",
    expected: [1507],
    motivazione:
      "Solo Olio extravergine d'oliva calabrese dichiara 'Bottiglia da 1 litro'. L'altro olio non ha questo formato nei metadati.",
  },
  {
    id: "sottocategoria-pasta-tipica",
    query: "Cerco pasta tipica",
    tipo: "sottocategoria",
    expected: [1513],
    motivazione:
      "Solo Fileja di Tropea ha sottocategoria 'Pasta tipica' e parola chiave 'pasta tipica'. Gli altri formati non hanno questo metadato.",
  },
  {
    id: "descrizione-pane-lievito",
    query: "Cerco pane con lievito madre",
    tipo: "descrizione",
    expected: [1488],
    motivazione:
      "Pane Casereccio è l'unico pane; 'lievito madre' è un dettaglio della descrizione, quindi supporta l'identità 'pane' ma non la sostituisce.",
  },
  {
    id: "budget-miele-sotto-10",
    query: "Cerco miele sotto 10 euro",
    tipo: "budget",
    expected: [1374, 1520, 1521],
    motivazione:
      "I mieli entro 10 euro sono Miele Millefiori del Pollino (9,90), Miele al bergamotto (5,50) e Miele millefiori 500 g (6,00). Il Miele di Castagno (11,90) è fuori budget.",
    maxPrice: 10,
    budgetRigido: true,
  },
  {
    id: "nome-liquirizia-dop",
    query: "Cerco liquirizia DOP",
    tipo: "nome",
    expected: [1511],
    motivazione:
      "Liquirizia di Calabria DOP è l'unico prodotto con liquirizia; 'DOP' è nel nome.",
  },
];

/**
 * Casi senza un insieme atteso prodotto affidabile. Restano visibili per
 * documentare ambiguità e comportamenti del gate, ma non entrano nelle metriche.
 */
const CASI_DIAGNOSTICI = [
  {
    id: "diagnostica-nome-negozio",
    query: "Cerco Mani in Pasta",
    tipo: "falso_positivo",
    expected: null,
    motivazione:
      "Mani in Pasta è il nome del negozio, non un prodotto. Il termine 'Pasta' attiva il ramo alimentare: il gate restituisce i formati di pasta, ma la richiesta non ha un insieme prodotto affidabile.",
  },
  {
    id: "diagnostica-generica-prodotto",
    query: "Cerco prodotto IGP",
    tipo: "generica",
    expected: null,
    motivazione:
      "'Prodotto' non identifica un alimento. Il gate restituisce l'intero catalogo attivo: il caso non consente un'etichetta prodotto verificabile.",
  },
  {
    id: "diagnostica-descrizione-sola",
    query: "Cerco lievito madre",
    tipo: "descrizione",
    expected: null,
    motivazione:
      "'Lievito madre' compare solo nella descrizione di Pane Casereccio. P1.3 non usa la descrizione come identità autosufficiente; il caso documenta il limite, senza entrare nelle metriche.",
  },
];

function arrotonda(valore) {
  return valore == null ? null : Number(valore.toFixed(4));
}

function indiceProdotti(prodotti) {
  return new Map(prodotti.map((prodotto) => [String(prodotto.id), prodotto]));
}

function descrivi(ids, perId) {
  return ids.map((id) => {
    const prodotto = perId.get(String(id));
    return { id, nome: prodotto?.nome ?? null };
  });
}

function valutaCaso(caso, prodotti, perId) {
  let restituiti = gatePertinenza(caso.query, prodotti);
  if (caso.maxPrice != null || caso.minPrice != null) {
    restituiti = ordinaProdottiPerBudget(restituiti, {
      maxPrice: caso.maxPrice ?? null,
      minPrice: caso.minPrice ?? null,
    });
    if (caso.budgetRigido) {
      restituiti = restituiti.filter((prodotto) =>
        prodottoRispettaBudgetPino(prodotto, {
          maxPrice: caso.maxPrice ?? null,
          minPrice: caso.minPrice ?? null,
        })
      );
    }
  }

  const restituitiIds = restituiti.map((prodotto) => String(prodotto.id));
  const expected = Array.isArray(caso.expected)
    ? caso.expected.map(String)
    : null;
  const inclusoNelleMetriche = expected !== null;
  const restituitiSet = new Set(restituitiIds);
  const expectedSet = new Set(expected ?? []);

  const corretti = expected === null
    ? []
    : [...restituitiSet].filter((id) => expectedSet.has(id));
  const falsiPositivi = expected === null
    ? []
    : [...restituitiSet].filter((id) => !expectedSet.has(id));
  const falsiNegativi = expected === null
    ? []
    : [...expectedSet].filter((id) => !restituitiSet.has(id));

  const precisione =
    inclusoNelleMetriche && restituitiIds.length > 0
      ? arrotonda(corretti.length / restituitiIds.length)
      : null;
  const richiamo =
    inclusoNelleMetriche && (expected?.length ?? 0) > 0
      ? arrotonda(corretti.length / expected.length)
      : null;

  return {
    id: caso.id,
    gruppo: inclusoNelleMetriche ? "prodotto" : "diagnostico",
    tipo: caso.tipo,
    query: caso.query,
    motivazione: caso.motivazione,
    inclusa_nelle_metriche: inclusoNelleMetriche,
    candidati: prodotti.map((prodotto) => ({
      id: String(prodotto.id),
      nome: prodotto.nome,
    })),
    attesi: descrivi(expected ?? [], perId),
    restituiti: descrivi(restituitiIds, perId),
    corretti: descrivi(corretti, perId),
    falsi_positivi: descrivi(falsiPositivi, perId),
    falsi_negativi: descrivi(falsiNegativi, perId),
    metriche: inclusoNelleMetriche
      ? {
          precisione,
          richiamo,
          veri_positivi: corretti.length,
          restituiti: restituitiIds.length,
          attesi: expected.length,
        }
      : null,
  };
}

function calcolaMetriche(casi) {
  const inclusi = casi.filter((caso) => caso.inclusa_nelle_metriche);
  const totale = inclusi.reduce(
    (acc, caso) => {
      acc.veri_positivi += caso.metriche.veri_positivi;
      acc.falsi_positivi += caso.falsi_positivi.length;
      acc.falsi_negativi += caso.falsi_negativi.length;
      acc.restituiti += caso.metriche.restituiti;
      acc.attesi += caso.metriche.attesi;
      return acc;
    },
    {
      veri_positivi: 0,
      falsi_positivi: 0,
      falsi_negativi: 0,
      restituiti: 0,
      attesi: 0,
    }
  );

  const precisioni = inclusi
    .map((caso) => caso.metriche.precisione)
    .filter((valore) => valore !== null);
  const richiami = inclusi
    .map((caso) => caso.metriche.richiamo)
    .filter((valore) => valore !== null);

  return {
    casi_inclusi: inclusi.length,
    casi_esclusi: casi.length - inclusi.length,
    micro: {
      precisione:
        totale.restituiti > 0
          ? arrotonda(totale.veri_positivi / totale.restituiti)
          : null,
      richiamo:
        totale.attesi > 0
          ? arrotonda(totale.veri_positivi / totale.attesi)
          : null,
      veri_positivi: totale.veri_positivi,
      falsi_positivi: totale.falsi_positivi,
      falsi_negativi: totale.falsi_negativi,
      restituiti: totale.restituiti,
      attesi: totale.attesi,
    },
    macro: {
      precisione:
        precisioni.length > 0
          ? arrotonda(
              precisioni.reduce((somma, valore) => somma + valore, 0) /
                precisioni.length
            )
          : null,
      richiamo:
        richiami.length > 0
          ? arrotonda(
              richiami.reduce((somma, valore) => somma + valore, 0) /
                richiami.length
            )
          : null,
      casi_precisione_validi: precisioni.length,
      casi_richiamo_validi: richiami.length,
    },
  };
}

export function calcolaReport({
  percorsoSnapshot = PERCORSO_SNAPSHOT_DEFAULT,
} = {}) {
  const percorso = resolve(percorsoSnapshot);
  if (existsSync(`${percorso}.sha256`)) {
    const atteso = readFileSync(`${percorso}.sha256`, "utf8").trim().split(/\s+/)[0];
    const effettivo = createHash("sha256")
      .update(readFileSync(percorso))
      .digest("hex");
    if (atteso !== effettivo) {
      throw new Error(
        `Hash snapshot non valido: atteso ${atteso}, effettivo ${effettivo}`
      );
    }
  }

  const snapshot = JSON.parse(readFileSync(percorso, "utf8"));
  const prodotti = snapshot.prodotti
    .filter((prodotto) => prodotto.attivo === true)
    .map((prodotto) => mappaProdottoRiga(prodotto, prodotto.negozio_nome));
  const perId = indiceProdotti(prodotti);
  const casi = [
    ...CASI_PRODOTTO.map((caso) =>
      valutaCaso(
        { ...caso, expected: caso.expected },
        prodotti,
        perId
      )
    ),
    ...CASI_DIAGNOSTICI.map((caso) =>
      valutaCaso({ ...caso, expected: null }, prodotti, perId)
    ),
  ];
  const metriche = calcolaMetriche(casi);

  return {
    versione: "P1.3.3",
    snapshot: {
      percorso,
      sha256: snapshot.estrazione
        ? createHash("sha256").update(readFileSync(percorso)).digest("hex")
        : null,
      estrazione_utc: snapshot.estrazione?.data_ora_utc ?? null,
    },
    sorgente: "snapshot locale; nessuna query Supabase durante il benchmark",
    catalogo: {
      prodotti_snapshot: snapshot.conteggi?.prodotti_nello_snapshot ?? null,
      prodotti_attivi_usati: prodotti.length,
      prodotti_inattivi_esclusi: snapshot.prodotti.filter(
        (prodotto) => prodotto.attivo !== true
      ).length,
      prodotti_attivi_disponibili:
        snapshot.conteggi?.prodotti_attivi_disponibili ?? null,
      negozi_collegati: snapshot.conteggi?.negozi_collegati_allo_snapshot ?? null,
    },
    distinzione: {
      candidati: "tutti i prodotti attivi dello snapshot",
      restituiti: "prodotti ammessi dal gate P1.3, non il retrieval Supabase",
      attesi: "etichette motivate sui metadati del prodotto",
      corretti: "intersezione tra restituiti e attesi",
      end_to_end: false,
    },
    casi,
    metriche,
  };
}

const percorsoReport = resolve(
  process.argv[2] ?? PERCORSO_REPORT_DEFAULT
);
if (externalEntryPoint()) {
  const report = calcolaReport({
    percorsoSnapshot: process.argv[3] ?? PERCORSO_SNAPSHOT_DEFAULT,
  });
  if (existsSync(percorsoReport)) {
    console.error(`Report già esistente, nessuna sovrascrittura: ${percorsoReport}`);
    process.exit(3);
  }
  const contenuto = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(percorsoReport, contenuto, "utf8");

  const formatta = (valore) => (valore == null ? "n/d" : valore.toFixed(4));
  console.log(`Snapshot: ${report.snapshot.percorso}`);
  console.log(`SHA-256: ${report.snapshot.sha256}`);
  console.log(
    `Catalogo: ${report.catalogo.prodotti_attivi_usati} prodotti attivi; ${report.catalogo.negozi_collegati} negozi collegati`
  );
  console.log("\nCasi prodotto:");
  for (const caso of report.casi.filter((riga) => riga.inclusa_nelle_metriche)) {
    console.log(
      `${caso.id} | ${caso.query} | attesi=${caso.attesi.length} restituiti=${caso.restituiti.length} TP=${caso.metriche.veri_positivi} FP=${caso.falsi_positivi.length} FN=${caso.falsi_negativi.length} P=${formatta(caso.metriche.precisione)} R=${formatta(caso.metriche.richiamo)}`
    );
  }
  console.log("\nCasi diagnostici (esclusi dalle metriche):");
  for (const caso of report.casi.filter((riga) => !riga.inclusa_nelle_metriche)) {
    console.log(
      `${caso.id} | ${caso.query} | restituiti=${caso.restituiti.length}`
    );
  }
  console.log("\nMetriche aggregate:");
  console.log(
    `micro P=${formatta(report.metriche.micro.precisione)} R=${formatta(report.metriche.micro.richiamo)} TP=${report.metriche.micro.veri_positivi} FP=${report.metriche.micro.falsi_positivi} FN=${report.metriche.micro.falsi_negativi}`
  );
  console.log(
    `macro P=${formatta(report.metriche.macro.precisione)} R=${formatta(report.metriche.macro.richiamo)}`
  );
  console.log(`Report: ${percorsoReport}`);
}

function externalEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}
