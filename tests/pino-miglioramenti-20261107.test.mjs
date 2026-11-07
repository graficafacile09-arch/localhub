/**
 * Pino — miglioramenti del controllo generale del 7 novembre 2026.
 *
 * Coprono i difetti trovati dopo il primo deploy: telemetria assente in
 * streaming, latenza di ora/data, vuoti onesti contati come errori, nome del
 * negozio scambiato per qualifica e richieste d'ordine ignorate.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  richiestaOraDataPino,
  rispostaOraDataPino,
} from "../lib/assistente/local-intents.ts";
import { richiestaRistorazionePino } from "../lib/assistente/routing-policy.ts";
import { calcolaEsitoTurnoPino } from "../lib/assistente/telemetria.ts";
import {
  messaggioNessunaAttivitaApertaPino,
  messaggioOrdineNonDisponibilePino,
  richiestaOrdinePino,
} from "../lib/assistente/messaggi-pino.ts";
import {
  nomeNegozioNominatoPino,
  rimuoviNomeNegozioPino,
} from "../lib/assistente/info-attivita.ts";

const sorgente = (percorso) =>
  readFileSync(join(process.cwd(), percorso), "utf8").replace(/\r\n/g, "\n");

// ── 1. Ora e data senza modello ─────────────────────────────────────────────

test("ora e data sono deterministiche e usano Europe/Rome", () => {
  const istante = new Date("2026-11-07T14:42:00Z");
  assert.equal(rispostaOraDataPino("che ore sono?", istante), "Sono le 15:42.");
  assert.equal(
    rispostaOraDataPino("che giorno è oggi?", istante),
    "Oggi è sabato 7 novembre 2026."
  );
  assert.equal(
    rispostaOraDataPino("what time is it?", istante, "en"),
    "It's 15:42."
  );
});

test("una domanda sugli orari di un negozio non è una richiesta di ora", () => {
  assert.equal(richiestaOraDataPino("che ora apre il panificio?"), null);
  assert.equal(richiestaOraDataPino("a che ora chiude Zini?"), null);
});

// ── 2. Ristorazione riconosciuta anche senza «dove» ─────────────────────────

test("«cosa posso mangiare stasera?» è una richiesta di ristorazione", () => {
  assert.equal(richiestaRistorazionePino("cosa posso mangiare stasera?"), true);
  assert.equal(richiestaRistorazionePino("cosa mangio a cena?"), true);
  assert.equal(richiestaRistorazionePino("quanto costa il pane?"), false);
});

// ── 3. I vuoti onesti non sono fallimenti di comprensione ───────────────────

test("offerte, eventi, orari e servizi assenti contano come turno riuscito", () => {
  for (const motivo of [
    "offerte_assenti",
    "eventi_assenti",
    "servizio_assente",
    "orari",
    "ora_data",
    "follow_up",
  ]) {
    assert.equal(
      calcolaEsitoTurnoPino({ motivo, negozi: 0, prodotti: 0 }),
      "ok",
      motivo
    );
  }
  // Un vero vuoto di ricerca resta un vuoto.
  assert.equal(
    calcolaEsitoTurnoPino({ motivo: "finale", negozi: 0, prodotti: 0 }),
    "vuoto"
  );
});

test("il messaggio «nessuna attività aperta» non elenca categorie fuori tema", () => {
  const it = messaggioNessunaAttivitaApertaPino("it");
  assert.match(it, /nessuna attività/i);
  assert.equal(/categorie pubblicate/i.test(it), false);
});

// ── 4. Il nome del negozio è un filtro, non una qualifica ──────────────────

test("«pane di Zini» riconosce il negozio e lo toglie dalla qualifica", () => {
  const nomi = ["Terre del Pollino", "Panificio Zini"];
  const negozio = nomeNegozioNominatoPino("quanto costa il pane di Zini?", nomi);
  assert.equal(negozio, "Panificio Zini");

  const domanda = rimuoviNomeNegozioPino("quanto costa il pane di Zini?", negozio);
  assert.match(domanda, /pane/);
  assert.equal(/zini/i.test(domanda), false);
});

test("un attributo del prodotto non viene scambiato per un negozio", () => {
  assert.equal(
    nomeNegozioNominatoPino("cerco pane integrale", ["Panificio Zini"]),
    null
  );
});

// ── 5. Ordinare è dichiarato, non ignorato ─────────────────────────────────

test("la richiesta d'ordine riceve una nota, non un ordine finto", () => {
  assert.equal(richiestaOrdinePino("vorrei ordinare una pizza"), true);
  assert.equal(
    richiestaOrdinePino("quale negozio mi consigli per comprare olio?"),
    false
  );
  assert.match(
    messaggioOrdineNonDisponibilePino("it"),
    /Non posso completare l'ordine/
  );
});

// ── 6. La telemetria copre anche lo streaming ──────────────────────────────

test("la route scrive la telemetria anche nel percorso streaming", () => {
  const route = sorgente("app/api/assistente/route.ts");
  assert.ok(route.includes("registraTelemetriaTurno"));
  assert.ok(route.includes("streaming: true"));
  assert.ok(route.includes('request.headers.get("x-pino-origine")'));
  assert.ok(route.includes("msContesto"));
  // La scrittura avviene dentro lo stream, prima della chiusura.
  const stream = route.slice(
    route.indexOf("function rispostaInStreaming"),
    route.indexOf("export async function POST")
  );
  assert.ok(stream.indexOf("registraTelemetriaTurno") < stream.indexOf("controller.close()"));
});

test("la chat dichiara il proprio canale alla route", () => {
  const client = sorgente("components/assistant/pino-fetch.ts");
  assert.ok(client.includes('"x-pino-origine": "ui"'));
});

test("il test di audit è collegato a test:pino", () => {
  const pkg = JSON.parse(sorgente("package.json"));
  assert.ok(pkg.scripts["test:pino"].includes("tests/pino-audit-difetti.test.mjs"));
  assert.ok(
    pkg.scripts["test:pino"].includes("tests/pino-miglioramenti-20261107.test.mjs")
  );
});
