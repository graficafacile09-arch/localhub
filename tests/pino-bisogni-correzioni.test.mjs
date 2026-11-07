/**
 * Pino — Bisogni, equivalenze di attività e memoria delle correzioni.
 *
 * Tre difetti misurati in produzione il 7 novembre 2026:
 * - "panetteria" → 0 risultati, mentre il catalogo pubblica "Panificio Zini";
 * - "ho sete" / "una birra" → "Non trovo risultati per questa richiesta";
 * - una correzione dell'utente ("no, intendevo…") veniva trattata come una
 *   nuova ricerca, quindi il difetto si ripeteva.
 *
 * Il database è il client finto di `tests/support/hook-pino.mjs`: qui si
 * verificano decisioni, testi e scritture, non il retrieval reale (per quello
 * c'è `npm run benchmark:pino:golden`).
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  applicaCorrezioniPino,
  chiaveCorrezionePino,
  rilevaCorrezionePino,
} from "../lib/assistente/apprendimento.ts";
import {
  alternativeBisognoPino,
  rilevaBisognoPino,
} from "../lib/assistente/bisogni.ts";
import { chatConAssistente } from "../lib/assistente/index.ts";
import { messaggioVuotoConCatalogoPino } from "../lib/assistente/messaggi-pino.ts";
import { negozioAttivitaCompatibilePino } from "../lib/assistente/tools.ts";

globalThis.fetch = async (url) => {
  throw new Error(`rete disattivata nei test Pino: ${String(url)}`);
};

const u = (content) => ({ role: "user", content });
const a = (content) => ({ role: "assistant", content });

test("i bisogni impliciti sono riconosciuti senza catalogo", () => {
  assert.equal(rilevaBisognoPino("ho fame"), "fame");
  assert.equal(rilevaBisognoPino("dove posso mangiare qualcosa"), "fame");
  assert.equal(rilevaBisognoPino("ho sete"), "sete");
  assert.equal(rilevaBisognoPino("una birra"), "sete");
  assert.equal(rilevaBisognoPino("gastronomia"), "cibo_pronto");
  assert.equal(rilevaBisognoPino("pane"), null);
});

test("le alternative pubblicate dipendono dal bisogno", () => {
  const fame = alternativeBisognoPino("ho fame");
  assert.ok(fame?.termini.includes("panificio"));
  assert.ok(fame?.termini.includes("alimentari"));

  const sete = alternativeBisognoPino("ho sete");
  assert.deepEqual(sete?.termini, ["alimentari"]);
});

test("«panetteria» accetta un panificio, «pizzeria» no", () => {
  const panificio = {
    nome: "Panificio Zini",
    categoria: "Panificio",
    data: { tipo_attivita: "Panificio" },
  };
  const bar = {
    nome: "Bar Centrale",
    categoria: "Bar",
    data: { tipo_attivita: "Bar" },
  };

  assert.equal(negozioAttivitaCompatibilePino(panificio, "panetteria"), true);
  assert.equal(negozioAttivitaCompatibilePino(panificio, "panificio"), true);
  assert.equal(negozioAttivitaCompatibilePino(panificio, "pizzeria"), false);
  assert.equal(negozioAttivitaCompatibilePino(bar, "panetteria"), false);
});

test("una correzione esplicita viene riconosciuta e isolata", () => {
  const panino = rilevaCorrezionePino([
    u("ho fame"),
    a("Nel catalogo non risultano ristoranti."),
    u("no, intendevo un panino"),
  ]);
  assert.equal(panino?.correzione, "panino");
  assert.equal(panino?.tipo, "prodotto");
  assert.equal(panino?.domandaPrecedente, "ho fame");

  const panificio = rilevaCorrezionePino([
    u("ho fame"),
    a("Ecco i ristoranti."),
    u("non è un ristorante, è un panificio"),
  ]);
  assert.equal(panificio?.correzione, "panificio");
  assert.equal(panificio?.tipo, "attivita");

  // Una richiesta normale dopo una risposta non è una correzione.
  assert.equal(rilevaCorrezionePino([u("ho fame"), a("…"), u("e da bere?")]), null);
});

test("la correzione appresa sostituisce l'interpretazione sbagliata", () => {
  assert.equal(applicaCorrezioniPino("panetteria", ["panificio"]), "panificio");
  assert.equal(applicaCorrezioniPino("panetteria", []), "panetteria");
  assert.equal(chiaveCorrezionePino("  Ho Fame! "), "ho fame");
});

test("«ho sete» non finisce nel messaggio generico", async () => {
  const r = await chatConAssistente([u("ho sete")]);
  assert.doesNotMatch(r.risposta, /Non trovo risultati per questa richiesta/);
  assert.match(r.risposta, /bar|bere|bevande/i);
  assert.deepEqual(r.negozi, []);
});

test("la correzione viene salvata e la risposta la prende in carico", async () => {
  const spia = (globalThis.__pinoSpiaSupabase ??= {
    clientCreati: 0,
    rpc: [],
    tabelle: [],
    selezioni: [],
    filtri: [],
    upsert: [],
    altri: [],
  });
  spia.upsert.length = 0;

  const r = await chatConAssistente([
    u("ho fame"),
    a("Nel catalogo non risultano ristoranti."),
    u("no, intendevo un panino"),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.match(r.risposta, /avevo capito male/i);
  assert.ok(
    spia.upsert.some((voce) => voce.valori && voce.valori.chiave === "ho fame"),
    "la correzione deve essere scritta su pino_correzioni"
  );
});

test("il vuoto informato elenca le categorie pubblicate", () => {
  const testo = messaggioVuotoConCatalogoPino("it", [
    { categoria: "Panificio", negozi: 3 },
    { categoria: "Alimentari", negozi: 2 },
  ]);
  assert.match(testo, /Panificio \(3\)/);
  assert.match(testo, /Alimentari \(2\)/);
  assert.doesNotMatch(testo, /Prova con un'altra categoria e zona/);
});
