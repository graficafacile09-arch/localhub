import test from "node:test";
import assert from "node:assert/strict";
import { isRichiestaChefSommelierOTerritorio } from "../lib/assistente/routing-policy.ts";

test("ricette, abbinamenti, territorio e filiere passano alla generazione AI", () => {
  const domande = [
    "parlami di una ricetta tipica calabrese",
    "come cucinare la nduja",
    "che vino abbino alla fileja",
    "quali vitigni calabresi conosco",
    "parlami del Parco del Pollino",
    "cosa sono le filiere di Radici Calabria",
    "cos'è la DOP del caciocavallo silano",
  ];
  for (const domanda of domande) {
    assert.equal(isRichiestaChefSommelierOTerritorio(domanda), true, domanda);
  }
});

test("domande estranee al tema culinario e territoriale non vengono instradate", () => {
  assert.equal(isRichiestaChefSommelierOTerritorio("quanto costa la spedizione"), false);
});
