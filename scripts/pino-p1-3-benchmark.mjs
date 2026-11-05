/**
 * P1.3.2 — benchmark locale e verificabile del gate di pertinenza Pino.
 *
 * IMPORTANTE: questo benchmark NON esegue il retrieval Supabase. Lavora su
 * prodotti già disponibili nella fixture locale e misura solo il filtro di
 * pertinenza applicato a quei prodotti. Non è una prova del recupero reale.
 *
 * Separazione dei casi:
 *   - gruppo "prodotto": richieste con un soggetto prodotto e un insieme atteso
 *     esplicito; entrano in TP/FP/FN e nelle metriche.
 *   - gruppo "diagnostico": "Cerco Bottega locale" (ambiguità marca/negozio) e
 *     "Cerco qualcosa di bello" (richiesta generica). Restano visibili nel
 *     report, ma non entrano nelle metriche aggregate.
 *
 * Il gate riproduce la decisione applicata da `searchProducts` prima del
 * budget:
 *   - alimenti: `prodottoPertinente`;
 *   - altre richieste: `filtraProdottiPerSoggettoUnico`.
 * Il budget viene applicato dopo, con le stesse funzioni del percorso reale.
 */
import { pathToFileURL } from "node:url";

import { mappaProdottoRiga } from "../lib/negozi.ts";
import {
  filtraProdottiPerSoggettoUnico,
  ordinaProdottiPerBudget,
  prodottoPertinente,
  prodottoRispettaBudgetPino,
} from "../lib/assistente/tools.ts";
import { normalizzaQueryCatalogo } from "../lib/assistente/understanding.ts";
import {
  casiBenchmarkP13,
  casiProdottoP13,
  casiDiagnosticiP13,
  righeCatalogoP13,
} from "../tests/fixtures/pino-p1-3-catalog.mjs";

export const RE_ALIMENTO =
  /\b(pasta|pane|pizza|dolci?|gelato|torte?|biscotti|formaggio|salumi|prosciutto|carne|pesce|verdura|frutta|olio|miele|conserve|farina|riso|nutella|cipolla|pomodoro|bread|noodles|cake|cookies|cheese|meat|fish|vegetables|fruit|honey|flour|rice|onion|tomato)\b/;

export const prodottiP13 = righeCatalogoP13.map((riga) =>
  mappaProdottoRiga(riga, riga.negozio_nome)
);

export function gatePertinenza(query, prodotti = prodottiP13) {
  const alimento = query.toLowerCase().match(RE_ALIMENTO)?.[1];
  if (alimento) {
    return prodotti.filter((prodotto) =>
      prodottoPertinente(prodotto, [alimento], [])
    );
  }
  return filtraProdottiPerSoggettoUnico(
    prodotti,
    normalizzaQueryCatalogo(query),
    query
  );
}

function arrotonda(valore) {
  return valore == null ? null : Number(valore.toFixed(4));
}

/**
 * Misura un singolo caso. Le metriche non definite sono `null`, mai 1:
 * - precisione n/d se non viene restituito alcun prodotto;
 * - richiamo n/d se non ci sono prodotti attesi (o se il caso è diagnostico).
 */
export function misuraCaso(caso, prodotti = prodottiP13) {
  const avvio = performance.now();
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
  const durataMs = performance.now() - avvio;

  const nomi = restituiti.map((prodotto) => prodotto.nome);
  const attesi = Array.isArray(caso.expected) ? [...caso.expected] : null;
  const inclusoNelleMetriche = caso.gruppo === "prodotto" && attesi !== null;

  let veriPositivi = null;
  let falsiPositivi = null;
  let falsiNegativi = null;
  let posizioni = [];

  if (attesi !== null) {
    const restituitiSet = new Set(nomi);
    const attesiSet = new Set(attesi);
    const nomiTp = nomi.filter((nome) => attesiSet.has(nome));
    veriPositivi = nomiTp.length;
    falsiPositivi = nomi.filter((nome) => !attesiSet.has(nome));
    falsiNegativi = [...attesiSet].filter((nome) => !restituitiSet.has(nome));
    posizioni = nomi
      .map((nome, indice) =>
        attesiSet.has(nome) ? { nome, posizione: indice + 1 } : null
      )
      .filter(Boolean);
  }

  const precisione =
    inclusoNelleMetriche && nomi.length > 0
      ? arrotonda(veriPositivi / nomi.length)
      : null;
  const richiamo =
    inclusoNelleMetriche && attesi.length > 0
      ? arrotonda(veriPositivi / attesi.length)
      : null;
  const budgetOk = restituiti.every((prodotto) =>
    caso.maxPrice == null && caso.minPrice == null
      ? true
      : prodottoRispettaBudgetPino(prodotto, {
          maxPrice: caso.maxPrice ?? null,
          minPrice: caso.minPrice ?? null,
        })
  );

  return {
    id: caso.id,
    gruppo: caso.gruppo,
    diagnostica: caso.diagnostica ?? null,
    motivoEsclusione: caso.motivoEsclusione ?? null,
    inclusoNelleMetriche,
    query: caso.query,
    restituiti: nomi,
    attesi,
    veriPositivi,
    falsiPositivi,
    falsiNegativi,
    posizioni,
    precisione,
    richiamo,
    budgetOk,
    durataMs: Number(durataMs.toFixed(3)),
  };
}

/** Calcola micro e macro metriche sui soli casi inclusi. */
export function calcolaMetriche(risultati) {
  const inclusi = risultati.filter((riga) => riga.inclusoNelleMetriche);
  const totali = inclusi.reduce(
    (acc, riga) => {
      acc.veriPositivi += riga.veriPositivi ?? 0;
      acc.falsiPositivi += riga.falsiPositivi?.length ?? 0;
      acc.falsiNegativi += riga.falsiNegativi?.length ?? 0;
      acc.restituiti += riga.restituiti.length;
      acc.attesi += riga.attesi?.length ?? 0;
      acc.durataMs += riga.durataMs;
      if (!riga.budgetOk) acc.budgetFalliti += 1;
      return acc;
    },
    {
      veriPositivi: 0,
      falsiPositivi: 0,
      falsiNegativi: 0,
      restituiti: 0,
      attesi: 0,
      durataMs: 0,
      budgetFalliti: 0,
    }
  );

  const precisioni = inclusi
    .map((riga) => riga.precisione)
    .filter((valore) => valore !== null);
  const richiami = inclusi
    .map((riga) => riga.richiamo)
    .filter((valore) => valore !== null);

  return {
    casiInclusi: inclusi.length,
    micro: {
      precisione:
        totali.restituiti > 0
          ? arrotonda(totali.veriPositivi / totali.restituiti)
          : null,
      richiamo:
        totali.attesi > 0 ? arrotonda(totali.veriPositivi / totali.attesi) : null,
      veriPositivi: totali.veriPositivi,
      falsiPositivi: totali.falsiPositivi,
      falsiNegativi: totali.falsiNegativi,
      restituiti: totali.restituiti,
      attesi: totali.attesi,
      casiPrecisioneNd: inclusi.filter((riga) => riga.precisione === null).length,
      casiRichiamoNd: inclusi.filter((riga) => riga.richiamo === null).length,
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
      casiPrecisioneValidi: precisioni.length,
      casiRichiamoValidi: richiami.length,
    },
    budgetFalliti: totali.budgetFalliti,
    latenzaTotaleMs: Number(totali.durataMs.toFixed(3)),
  };
}

export function calcolaReport() {
  const risultati = casiBenchmarkP13.map((caso) => misuraCaso(caso));
  const prodotti = risultati.filter((riga) => riga.inclusoNelleMetriche);
  const diagnostici = risultati.filter((riga) => !riga.inclusoNelleMetriche);
  const metriche = calcolaMetriche(risultati);

  return {
    versione: "P1.3.2",
    catalogo: "fixture locale P1.3.2",
    prodotti: prodottiP13.length,
    casiTotali: risultati.length,
    casiInclusi: prodotti.length,
    casiEsclusi: diagnostici.length,
    inclusione: {
      gruppo: "prodotto",
      ids: prodotti.map((riga) => riga.id),
    },
    esclusione: diagnostici.map((riga) => ({
      id: riga.id,
      gruppo: riga.gruppo,
      diagnostica: riga.diagnostica,
      motivo: riga.motivoEsclusione,
    })),
    input: {
      recupero: "NON eseguito: prodotti già disponibili nella fixture locale.",
      retrievalReale: false,
      nota:
        "Il benchmark misura il filtro di pertinenza su prodotti già presenti; non prova il retrieval Supabase.",
    },
    fasi: {
      recupero: "fixture locale (12 prodotti mappati), nessuna query DB",
      filtro:
        "prodottoPertinente per alimenti; filtraProdottiPerSoggettoUnico per non alimenti",
      risultatiFinali: "nomi restituiti dopo gate e, se presente, budget",
      ordinamento:
        "ordine della fixture; per i casi con budget, ordinaProdottiPerBudget",
    },
    ...metriche,
    risultati: prodotti,
    diagnostici,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = calcolaReport();
  console.log("PINO P1.3.2 — BENCHMARK PERTINENZA (FIXTURE LOCALI)");
  console.log(
    JSON.stringify(
      {
        versione: report.versione,
        catalogo: report.catalogo,
        prodotti: report.prodotti,
        casiTotali: report.casiTotali,
        casiInclusi: report.casiInclusi,
        casiEsclusi: report.casiEsclusi,
        inclusione: report.inclusione,
        esclusione: report.esclusione,
        input: report.input,
        fasi: report.fasi,
        micro: report.micro,
        macro: report.macro,
        budgetFalliti: report.budgetFalliti,
        latenzaTotaleMs: report.latenzaTotaleMs,
        tabella: report.risultati.map((riga) => ({
          caso: riga.id,
          restituiti: riga.restituiti.length,
          attesi: riga.attesi.length,
          veriPositivi: riga.veriPositivi,
          falsiPositivi: riga.falsiPositivi,
          falsiNegativi: riga.falsiNegativi,
          precisione: riga.precisione,
          richiamo: riga.richiamo,
          budgetOk: riga.budgetOk,
          posizioni: riga.posizioni,
          durataMs: riga.durataMs,
        })),
        diagnostici: report.diagnostici.map((riga) => ({
          caso: riga.id,
          diagnostica: riga.diagnostica,
          motivoEsclusione: riga.motivoEsclusione,
          restituiti: riga.restituiti,
          attesi: riga.attesi,
          precisione: riga.precisione,
          richiamo: riga.richiamo,
        })),
      },
      null,
      2
    )
  );
}
