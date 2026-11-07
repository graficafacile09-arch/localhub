/**
 * Pino — memoria di sessione e attributi nei follow-up.
 *
 * La cronologia recente resta il veicolo principale del contesto. Questi test
 * coprono il caso dopo un reload: la sessione fornisce solo soggetto,
 * attributi e budget, mai il testo della domanda.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  componiDomandaConSessionePino,
  sembraContinuazionePino,
  sessionIdValidoPino,
} from "../lib/assistente/sessione.ts";
import { messaggioAttributoNonDocumentatoPino } from "../lib/assistente/messaggi-pino.ts";
import { estraiSoggettoPino } from "../lib/assistente/understanding.ts";

const sorgente = (percorso) =>
  readFileSync(join(process.cwd(), percorso), "utf8").replace(/\r\n/g, "\n");

test("sessionId: solo identificativi generati dal client", () => {
  assert.equal(sessionIdValidoPino("ass-1762524000000-ab12cd34"), true);
  assert.equal(sessionIdValidoPino("corto"), false);
  assert.equal(sessionIdValidoPino("../../etc/passwd"), false);
  assert.equal(sessionIdValidoPino("ass 123456789"), false);
  assert.equal(sessionIdValidoPino(null), false);
});

test("una continuazione breve è riconosciuta, una domanda nuova no", () => {
  assert.equal(sembraContinuazionePino("e rosso?"), true);
  assert.equal(sembraContinuazionePino("solo rossi"), true);
  assert.equal(sembraContinuazionePino("e sotto 10 euro?"), true);
  assert.equal(sembraContinuazionePino("quanto costa la spedizione?"), false);
  assert.equal(sembraContinuazionePino("cerco un vino"), false);
});

test("il soggetto della sessione non è la cornice «consigliami»", () => {
  assert.equal(estraiSoggettoPino("consigliami un vino"), "vino");
  assert.equal(estraiSoggettoPino("consigliami vino"), "vino");
  assert.equal(estraiSoggettoPino("cerco del pane"), "pane");
});

test("la sessione ricostruisce soggetto, attributi e budget", () => {
  const sessione = {
    soggetto: "vino",
    attributi: ["rosso"],
    maxPrice: 10,
  };
  assert.equal(
    componiDomandaConSessionePino("e sotto 10 euro?", sessione),
    "vino rosso sotto 10 euro"
  );
  assert.equal(
    componiDomandaConSessionePino("e rosso?", { soggetto: "vino", attributi: [], maxPrice: null }),
    "vino rosso"
  );
  // Una nuova ricerca non viene riscritta.
  assert.equal(
    componiDomandaConSessionePino("cerco del pane", sessione),
    "cerco del pane"
  );
});

test("l'attributo non documentato viene dichiarato, non inventato", () => {
  const it = messaggioAttributoNonDocumentatoPino("it", "rosso");
  assert.match(it, /non dichiara/);
  assert.match(it, /rosso/);
  const en = messaggioAttributoNonDocumentatoPino("en", "red");
  assert.match(en, /doesn't declare/);
});

test("la route legge e salva la sessione, e la chat dichiara il canale", () => {
  const route = sorgente("app/api/assistente/route.ts");
  assert.ok(route.includes("recuperaSessionePino"));
  assert.ok(route.includes("salvaSessionePino"));
  assert.ok(route.includes("sembraContinuazionePino"));
  assert.ok(route.includes("componiDomandaConSessionePino"));
  assert.ok(route.includes('request.headers.get("x-pino-origine")'));

  const client = sorgente("components/assistant/pino-fetch.ts");
  assert.ok(client.includes('"x-pino-origine": "ui"'));
});

test("l'orchestratore dichiara gli attributi accumulati non documentati", () => {
  const index = sorgente("lib/assistente/index.ts");
  assert.ok(index.includes("attributiNonDocumentati"));
  assert.ok(index.includes("messaggioAttributoNonDocumentatoPino"));
});

test("la migrazione della sessione non conserva il testo della domanda", () => {
  const sql = sorgente("supabase/migrations/20261107_pino_sessioni.sql");
  assert.ok(sql.includes("create table if not exists public.pino_sessioni"));
  assert.ok(sql.includes("session_id text primary key"));
  assert.equal(/domanda\s+text/i.test(sql), false);
  assert.ok(sql.includes("enable row level security"));
});

test("il test è collegato a test:pino", () => {
  const pkg = JSON.parse(sorgente("package.json"));
  assert.ok(pkg.scripts["test:pino"].includes("tests/pino-sessione-followup.test.mjs"));
});
