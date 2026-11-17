/**
 * Esegue il golden set di Pino contro un ambiente deployato.
 *
 * Uso:
 *   PINO_GOLDEN_LIVE=1 node --env-file-if-exists=.env.local \
 *     scripts/pino-golden-live.mjs
 *
 * Variabili:
 *   PINO_GOLDEN_URL    URL base (default https://www.incitta.online)
 *   PINO_GOLDEN_PAUSA  pausa fra richieste in ms (default 3400, rate limit 20/min)
 *   PINO_GOLDEN_FILTER ids separati da virgola da eseguire (es. "sete,birra")
 *
 * Esce con codice 1 se un caso fallisce: è un controllo, non un report.
 */
import { pinoGoldenCases } from "../tests/fixtures/pino-golden-set.mjs";

if (process.env.PINO_GOLDEN_LIVE !== "1") {
  throw new Error(
    "Golden set live disattivato: imposta PINO_GOLDEN_LIVE=1 per eseguirlo contro un ambiente deployato."
  );
}

const base = (process.env.PINO_GOLDEN_URL ?? "https://www.incitta.online").replace(/\/+$/, "");
const pausa = Number(process.env.PINO_GOLDEN_PAUSA ?? 3400);
const attesa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const filtro = new Set(
  (process.env.PINO_GOLDEN_FILTER ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);
const casi = filtro.size > 0
  ? pinoGoldenCases.filter((caso) => filtro.has(caso.id))
  : pinoGoldenCases;

if (casi.length === 0) {
  throw new Error(
    `Nessun caso golden corrisponde a PINO_GOLDEN_FILTER=${process.env.PINO_GOLDEN_FILTER}`
  );
}

const fallimenti = [];
const righe = [];

for (const caso of casi) {
  const inizio = Date.now();
  let esito = "ok";
  let dettaglio = "";
  try {
    const risposta = await fetch(`${base}/api/assistente`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: caso.text }] }),
    });
    const json = await risposta.json();
    const negozi = (json.negozi ?? []).length;
    const prodotti = (json.prodotti ?? []).length;
    const notizie = (json.notizie ?? []).length;
    const contenuti = (json.contenuti ?? []).length;
    const nomiProdotti = (json.prodotti ?? []).map((prodotto) => String(prodotto?.nome ?? ""));
    const titoliNotizie = (json.notizie ?? []).map((notizia) => String(notizia?.titolo ?? ""));
    const titoliContenuti = (json.contenuti ?? []).map((contenuto) => String(contenuto?.titolo ?? ""));
    const testo = String(json.risposta ?? "");

    if (risposta.status !== 200) {
      esito = "http";
      dettaglio = `status ${risposta.status}`;
    } else if (caso.minNegozi != null && negozi < caso.minNegozi) {
      esito = "negozi";
      dettaglio = `${negozi} < ${caso.minNegozi}`;
    } else if (caso.minProdotti != null && prodotti < caso.minProdotti) {
      esito = "prodotti";
      dettaglio = `${prodotti} < ${caso.minProdotti}`;
    } else if (caso.minNotizie != null && notizie < caso.minNotizie) {
      esito = "notizie";
      dettaglio = `${notizie} < ${caso.minNotizie}`;
    } else if (caso.minContenuti != null && contenuti < caso.minContenuti) {
      esito = "contenuti";
      dettaglio = `${contenuti} < ${caso.minContenuti}`;
    } else if ((caso.mustNotizie ?? []).some((re) => !titoliNotizie.some((titolo) => re.test(titolo)))) {
      esito = "notizia-attesa";
      dettaglio = (caso.mustNotizie ?? []).filter((re) => !titoliNotizie.some((titolo) => re.test(titolo))).map(String).join(" ");
    } else if ((caso.mustContenuti ?? []).some((re) => !titoliContenuti.some((titolo) => re.test(titolo)))) {
      esito = "contenuto-atteso";
      dettaglio = (caso.mustContenuti ?? []).filter((re) => !titoliContenuti.some((titolo) => re.test(titolo))).map(String).join(" ");
    } else if ((caso.mustProdotti ?? []).some((re) => !nomiProdotti.some((nome) => re.test(nome)))) {
      esito = "prodotto-atteso";
      dettaglio = (caso.mustProdotti ?? [])
        .filter((re) => !nomiProdotti.some((nome) => re.test(nome)))
        .map(String)
        .join(" ");
    } else if ((caso.mustMatch ?? []).some((re) => !re.test(testo))) {
      esito = "testo-assente";
      dettaglio = (caso.mustMatch ?? []).filter((re) => !re.test(testo)).map(String).join(" ");
    } else if ((caso.mustNot ?? []).some((re) => re.test(testo))) {
      esito = "testo-vietato";
      dettaglio = (caso.mustNot ?? []).filter((re) => re.test(testo)).map(String).join(" ");
    }
  } catch (errore) {
    esito = "errore";
    dettaglio = String(errore);
  }

  const ms = Date.now() - inizio;
  righe.push({ caso: caso.id, esito, ms, dettaglio });
  if (esito !== "ok") fallimenti.push({ caso, esito, dettaglio, ms });
  await attesa(pausa);
}

console.table(righe);
if (fallimenti.length > 0) {
  console.error(`\nFALLITI ${fallimenti.length}/${casi.length}`);
  for (const f of fallimenti) {
    console.error(`- ${f.caso.id} («${f.caso.text}»): ${f.esito} ${f.dettaglio}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nOK ${casi.length}/${casi.length}`);
}
