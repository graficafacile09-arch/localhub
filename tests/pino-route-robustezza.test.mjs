import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  conScadenzaPino,
  rispostaDegradataPino,
} from "../lib/assistente/degradazione.ts";
import {
  TOKEN_SENZA_REFUSI,
  VOCABOLARIO_PINO,
  correggiErroriBattitura,
} from "../lib/assistente/semantica.ts";
import { correggiTokenCatalogo } from "../lib/assistente/understanding.ts";
import { richiestaGuidaAttrazioniPino } from "../lib/assistente/index.ts";

const sorgente = (percorso) =>
  readFileSync(join(process.cwd(), percorso), "utf8").replace(/\r\n/g, "\n");

// ─── Scadenza e degradazione ────────────────────────────────────────────────

test("conScadenzaPino restituisce il valore entro la scadenza", async () => {
  const esito = await conScadenzaPino(Promise.resolve("ok"), 100);
  assert.deepEqual(esito, { ok: true, valore: "ok" });
});

test("conScadenzaPino scade senza lanciare", async () => {
  const lenta = new Promise((resolve) => setTimeout(() => resolve("tardi"), 200));
  const esito = await conScadenzaPino(lenta, 5);
  assert.deepEqual(esito, { ok: false, motivo: "timeout" });
});

test("conScadenzaPino propaga la rejection al chiamante", async () => {
  await assert.rejects(
    conScadenzaPino(Promise.reject(new Error("boom")), 100),
    /boom/
  );
});

test("degradazione: cita i risultati reali della ricerca classica", async () => {
  const risposta = await rispostaDegradataPino(
    [{ role: "user", content: "olio del Pollino" }],
    {
      cerca: async () => ({
        prodotti: [
          {
            nome: "Olio EVO del Pollino",
            prezzo: 12.5,
            negozio_nome: "Terre del Pollino",
          },
        ],
        negozi: [{ nome: "Terre del Pollino", categoria: "Alimentari" }],
      }),
    }
  );

  assert.match(risposta.risposta, /ricerca classica/);
  assert.match(risposta.risposta, /Olio EVO del Pollino/);
  assert.match(risposta.risposta, /12\.50/);
  assert.equal(risposta.source, "assistente");
  assert.equal(risposta.prodotti.length, 1);
});

test("degradazione: zero risultati viene dichiarato, non inventato", async () => {
  const risposta = await rispostaDegradataPino(
    [{ role: "user", content: "prodotto inesistente" }],
    { cerca: async () => ({ prodotti: [], negozi: [] }) }
  );

  assert.match(risposta.risposta, /non trova risultati/);
  assert.equal(risposta.prodotti.length, 0);
  assert.equal(risposta.negozi.length, 0);
});

test("degradazione: senza messaggio utente non interroga il catalogo", async () => {
  let chiamate = 0;
  const risposta = await rispostaDegradataPino([], {
    cerca: async () => {
      chiamate += 1;
      return { prodotti: [], negozi: [] };
    },
  });

  assert.equal(chiamate, 0);
  assert.match(risposta.risposta, /non riesco a cercare/);
});

// ─── Routing: acquisto con toponimo vs visita ───────────────────────────────

test("un acquisto con toponimo resta catalogo, non guida Attrazioni", () => {
  assert.equal(
    richiestaGuidaAttrazioniPino("Avete l'olio extravergine del Pollino?"),
    false
  );
  assert.equal(
    richiestaGuidaAttrazioniPino("Quanto costa il miele del Pollino?"),
    false
  );
});

test("le richieste di visita restano nella guida Attrazioni", () => {
  assert.equal(
    richiestaGuidaAttrazioniPino("Vorrei visitare il Parco Nazionale del Pollino"),
    true
  );
  assert.equal(richiestaGuidaAttrazioniPino("La Civita"), true);
  assert.equal(
    richiestaGuidaAttrazioniPino("Cosa posso visitare a Castrovillari?"),
    true
  );
});

// ─── Refusi: i destinatari non diventano prodotti ──────────────────────────

test("i destinatari sono protetti dalla correzione dei refusi", () => {
  for (const parola of ["moglie", "marito", "madre", "padre", "nonna"]) {
    assert.equal(TOKEN_SENZA_REFUSI.has(parola), true, parola);
  }
  // Il percorso reale (usato dal planner) lascia intatta la frase.
  assert.equal(
    correggiErroriBattitura("regalo per mia moglie sotto 30 euro"),
    "regalo per mia moglie sotto 30 euro"
  );
});

test("i verbi del mangiare non diventano capi di abbigliamento", () => {
  for (const verbo of ["mangia", "mangio", "mangiare"]) {
    assert.equal(TOKEN_SENZA_REFUSI.has(verbo), true, verbo);
  }
  assert.equal(
    correggiErroriBattitura("dove si mangia bene?"),
    "dove si mangia bene?"
  );
});

test("i refusi veri continuano a essere corretti", () => {
  assert.equal(correggiTokenCatalogo("orologgio", VOCABOLARIO_PINO), "orologio");
  assert.equal(correggiTokenCatalogo("telefonno", VOCABOLARIO_PINO), "telefono");
});

// ─── Contratto della rotta ─────────────────────────────────────────────────

test("la rotta ha scadenza, degradazione e streaming, e non risponde 500", () => {
  const route = sorgente("app/api/assistente/route.ts");

  assert.ok(route.includes("export const maxDuration"));
  assert.ok(route.includes("conScadenzaPino"));
  assert.ok(route.includes("rispostaDegradataPino"));
  assert.ok(route.includes("application/x-ndjson"));
  assert.equal(route.includes("status: 500"), false);
  // Il JSON storico resta identico per i consumer che non chiedono lo stream.
  assert.ok(route.includes("return NextResponse.json({\n      ...risultato,"));
});

test("nessun secondo contratto tool: searchProducts resta l'unico", () => {
  const tools = sorgente("lib/assistente/function-calling.ts");
  assert.equal(tools.includes("cercaProdottiNelDatabase"), false);
  assert.ok(tools.includes('name: "searchProducts"'));
});
