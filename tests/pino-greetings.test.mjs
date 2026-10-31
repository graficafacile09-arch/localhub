import assert from "node:assert/strict";
import test from "node:test";
import { rispostaSalutoPino, rispostaRelazionalePino } from "../lib/assistente/greetings.ts";

test("Pino answers a simple Italian hello in a warmer tone", () => {
  const reply = rispostaSalutoPino("Ciao");
  assert.match(reply ?? "", /^Ciao!/);
  assert.match(reply ?? "", /😊/);
  assert.match(reply ?? "", /ti aiuto volentieri/i);
});
test("Pino recognizes a greeting addressed to him", () => {
  assert.match(rispostaSalutoPino("Ciao Pino") ?? "", /^Ciao!/);
});
test("Pino keeps English greetings in English", () => {
  assert.match(rispostaSalutoPino("Hello") ?? "", /^Hello!/);
  assert.match(rispostaSalutoPino("Hello") ?? "", /happy to help/i);
});
test("Pino does not mistake a concrete request for a greeting", () => {
  assert.equal(rispostaSalutoPino("Cerco un orologio"), null);
});


test("Pino answers a greeting plus personal check-in locally", () => {
  assert.match(rispostaRelazionalePino("Ciao Pino, come stai?") ?? "", /Tutto bene, grazie!/);
});
test("Pino answers invitations to chat and tolerates a typo", () => {
  assert.match(rispostaRelazionalePino("Ti va di fare due chiacchiere?") ?? "", /Volentieri!/);
  assert.match(rispostaRelazionalePino("Facciamo 2 chiacchiere") ?? "", /Volentieri!/);
  assert.match(rispostaRelazionalePino("Ti va di fare due kiacchiere?") ?? "", /Volentieri!/);
});
test("Pino answers thanks and misunderstandings", () => {
  assert.match(rispostaRelazionalePino("Grazie Pino") ?? "", /Di nulla!/);
  assert.match(rispostaRelazionalePino("Non hai capito") ?? "", /correggo il tiro/i);
});
test("Pino does not intercept concrete catalog requests", () => {
  assert.equal(rispostaRelazionalePino("Cerco un orologgio sotto 100 euro"), null);
});
