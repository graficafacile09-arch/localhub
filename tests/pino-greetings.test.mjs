import test from "node:test";
import assert from "node:assert/strict";
import { rispostaRelazionalePino, rispostaSalutoPino } from "../lib/assistente/greetings.ts";

test("Pino answers a greeting plus personal check-in locally", () => {
  assert.match(rispostaRelazionalePino("Ciao Pino, come stai?") ?? "", /Tutto bene, grazie!/);
});
test("Pino answers direct and informal chat invitations", () => {
  assert.match(rispostaRelazionalePino("Ti va di fare due chiacchiere?") ?? "", /Volentieri!/);
  assert.match(rispostaRelazionalePino("Facciamo 2 chiacchiere") ?? "", /Volentieri!/);
});
test("Pino tolerates a typo in a chat invitation", () => {
  assert.match(rispostaRelazionalePino("Ti va di fare due kiacchiere?") ?? "", /Volentieri!/);
});
test("Pino answers thanks and misunderstandings", () => {
  assert.match(rispostaRelazionalePino("Grazie Pino") ?? "", /Di nulla!/);
  assert.match(rispostaRelazionalePino("Non hai capito") ?? "", /correggo il tiro/i);
});
test("Pino keeps English greetings in English", () => {
  assert.match(rispostaSalutoPino("Hello") ?? "", /What would you like/);
});
test("Pino does not intercept concrete catalog requests", () => {
  assert.equal(rispostaRelazionalePino("Cerco un orologgio sotto 100 euro"), null);
  assert.equal(rispostaSalutoPino("Cerco un orologio"), null);
});
