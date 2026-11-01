import test from "node:test";
import assert from "node:assert/strict";
import { normalizzaArgomentiRicercaPino } from "../lib/assistente/function-calling-contract.ts";

test("Pino normalizza una ricerca servizio senza perdere ambito e filtri", () => {
  const args = normalizzaArgomentiRicercaPino({
    ricerca: "  lavaggio auto a domicilio  ",
    ambito: "negozi_servizi",
    categoria: "  servizi auto ",
    prezzoMassimo: 99,
    citta: "Castrovillari",
    apertiOra: true,
    limite: 12,
  });

  assert.equal(args.ricerca, "lavaggio auto a domicilio");
  assert.equal(args.ambito, "negozi_servizi");
  assert.equal(args.categoria, "servizi auto");
  assert.equal(args.prezzoMassimo, 99);
  assert.equal(args.citta, "Castrovillari");
  assert.equal(args.apertiOra, true);
  assert.equal(args.limite, 12);
});

test("Pino applica limiti sicuri agli argomenti generati da Gemini", () => {
  const args = normalizzaArgomentiRicercaPino({
    ricerca: "x".repeat(300),
    ambito: "comando_non_previsto",
    prezzoMassimo: -10,
    prezzoMinimo: "non-un-numero",
    limite: 500,
    escludiNomi: [" Orologio A ", 12, "Orologio B", ...Array.from({ length: 30 }, (_, i) => "Nome " + i)],
  });

  assert.equal(args.ricerca.length, 120);
  assert.equal(args.ambito, "tutto");
  assert.equal(args.prezzoMassimo, undefined);
  assert.equal(args.prezzoMinimo, undefined);
  assert.equal(args.limite, 20);
  assert.equal(args.escludiNomi?.[0], "Orologio A");
  assert.equal(args.escludiNomi?.length, 20);
});

test("Pino usa valori predefiniti quando Gemini omette campi opzionali", () => {
  const args = normalizzaArgomentiRicercaPino({
    ricerca: "orologio",
    ambito: "prodotti",
  });

  assert.equal(args.ambito, "prodotti");
  assert.equal(args.limite, 8);
  assert.equal(args.apertiOra, false);
  assert.equal(args.prezzoMassimo, undefined);
});

test("Pino accetta al massimo tre varianti semantiche distinte", () => {
  const args = normalizzaArgomentiRicercaPino({
    ricerca: "lavaggio auto",
    ambito: "negozi_servizi",
    varianti: ["pulizia auto", "lavaggio veicoli", "autolavaggio", "pulizia auto", 7],
  });

  assert.deepEqual(args.varianti, ["pulizia auto", "lavaggio veicoli", "autolavaggio"]);
});
