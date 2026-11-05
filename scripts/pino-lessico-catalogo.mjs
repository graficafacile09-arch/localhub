/**
 * Pino — Copertura del lessico sul catalogo reale.
 *
 * `lib/assistente/lexicon.ts` è curato a mano. Va bene per le parole che
 * conosciamo, ma invecchia appena i negozianti aggiungono prodotti: questo
 * script legge lo snapshot del catalogo, estrae le parole che descrivono i
 * prodotti e le confronta con il lessico, elencando le assenze.
 *
 * Non modifica nulla e non scrive sul database: è un report. L'aggiunta al
 * lessico resta una decisione umana (una parola nuova può creare falsi
 * positivi: «pasta» è un soggetto, «artigianale» è una caratteristica).
 *
 * Uso: `npm run benchmark:pino:lessico`
 *      `npm run benchmark:pino:lessico -- --json`
 *
 * @module scripts/pino-lessico-catalogo
 */
import { readFileSync } from "node:fs";
import { normalizza } from "../lib/text-utils.ts";
import {
  SOGGETTI_ALIMENTARI_PINO,
  SOGGETTI_CATALOGO_PINO,
} from "../lib/assistente/lexicon.ts";

const snapshot = JSON.parse(
  readFileSync(
    new URL("./pino-p1-3-3-catalog-snapshot-20261104.json", import.meta.url),
    "utf8"
  )
);
const prodotti = snapshot.prodotti ?? [];

// Parole di servizio: compaiono in quasi tutti i prodotti e non identificano
// nulla. Stessa logica di `PAROLE_NON_QUALIFICANTI` in `tools.ts`.
const STOPWORDS = new Set(
  (
    "alimentari alimentare prodotto prodotti confezione confezioni formato " +
    "grammi grammo chili litro litri bottiglia bottiglie vaso vasetto " +
    "artigianale tradizionale tipico tipica tipici tipiche calabrese " +
    "calabresi italiano italiana italiani italiane locale locali " +
    "senza con della delle degli della nella nelle presso ogni altro " +
    "altra altri altre questo questa questi queste essere viene fatto " +
    "fatta fatti fatte della dello dalla dalle nel nei negli sull sulla"
  ).split(/\s+/)
);

const note = new Set();
for (const soggetto of SOGGETTI_CATALOGO_PINO) {
  note.add(normalizza(soggetto.termine));
  for (const forma of soggetto.forme) note.add(normalizza(forma));
}
for (const alimento of SOGGETTI_ALIMENTARI_PINO) note.add(normalizza(alimento));

/** Conteggio per parola: in quanti prodotti compare e un esempio. */
const conteggi = new Map();
for (const prodotto of prodotti) {
  const testo = [
    prodotto.nome,
    prodotto.categoria,
    prodotto.sottocategoria,
    ...(prodotto.parole_chiave ?? []),
    ...(prodotto.caratteristiche ?? []),
  ]
    .filter(Boolean)
    .join(" ");
  const parole = new Set(
    normalizza(testo)
      .split(/\s+/)
      .filter((parola) => parola.length >= 4 && !STOPWORDS.has(parola))
  );
  for (const parola of parole) {
    if (note.has(parola)) continue;
    const voce = conteggi.get(parola) ?? { prodotti: 0, esempio: "" };
    voce.prodotti += 1;
    if (!voce.esempio) voce.esempio = String(prodotto.nome ?? "");
    conteggi.set(parola, voce);
  }
}

const assenze = [...conteggi.entries()]
  .filter(([, voce]) => voce.prodotti >= 2)
  .map(([parola, voce]) => ({ parola, ...voce }))
  .sort((a, b) => b.prodotti - a.prodotti || a.parola.localeCompare(b.parola));

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      {
        prodotti: prodotti.length,
        vociLessico:
          SOGGETTI_CATALOGO_PINO.length + SOGGETTI_ALIMENTARI_PINO.length,
        assenze,
      },
      null,
      2
    )
  );
} else {
  console.log("Pino — copertura del lessico sullo snapshot di catalogo");
  console.log(
    `Prodotti: ${prodotti.length} · soggetti nel lessico: ${SOGGETTI_CATALOGO_PINO.length} + ${SOGGETTI_ALIMENTARI_PINO.length} alimentari`
  );
  console.log("");
  if (assenze.length === 0) {
    console.log("Nessuna parola ricorrente fuori dal lessico.");
  } else {
    console.log(
      `Parole in almeno 2 prodotti e assenti dal lessico (${assenze.length}):`
    );
    for (const voce of assenze) {
      console.log(
        `  ${voce.parola.padEnd(20)} ${String(voce.prodotti).padStart(2)} prodotti  es. «${voce.esempio}»`
      );
    }
    console.log("");
    console.log(
      "Report, non modifica: valuta se ognuna è un soggetto di catalogo o una caratteristica."
    );
  }
}
