/**
 * Esegue il golden set di Pino contro un ambiente deployato.
 *
 * Uso:
 *   PINO_GOLDEN_LIVE=1 node --env-file-if-exists=.env.local \
 *     scripts/pino-golden-live.mjs
 *
 * Variabili:
 *   PINO_GOLDEN_URL   URL base (default https://www.incitta.online)
 *   PINO_GOLDEN_PAUSA pausa fra richieste in ms (default 3400, rate limit 20/min)
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

const fallimenti = [];
const righe = [];

for (const caso of pinoGoldenCases) {
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
  console.error(`\nFALLITI ${fallimenti.length}/${pinoGoldenCases.length}`);
  for (const f of fallimenti) {
    console.error(`- ${f.caso.id} («${f.caso.text}»): ${f.esito} ${f.dettaglio}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nOK ${pinoGoldenCases.length}/${pinoGoldenCases.length}`);
}
