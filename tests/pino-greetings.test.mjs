import assert from "node:assert/strict";
import test from "node:test";
import { rispostaSalutoPino } from "../lib/assistente/greetings.ts";

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


import { rispostaRelazionalePino } from "../lib/assistente/greetings.ts";

test("Pino responds naturally to thanks and keeps the conversation open", () => {
  assert.match(rispostaRelazionalePino("Grazie Pino") ?? "", /Di nulla!/);
});
test("Pino answers a personal check-in transparently", () => {
  const reply = rispostaRelazionalePino("Come stai?");
  assert.match(reply ?? "", /Non ho giornate o stati d'animo come una persona/);
});
test("Pino acknowledges misunderstandings without blaming the user", () => {
  const reply = rispostaRelazionalePino("Non hai capito");
  assert.match(reply ?? "", /ho interpretato male/i);
  assert.match(reply ?? "", /correggo il tiro/i);
});
test("Pino is transparent about consciousness and feelings", () => {
  assert.match(rispostaRelazionalePino("Hai sentimenti?") ?? "", /non ho coscienza né sentimenti/i);
});
test("Pino does not intercept a concrete shopping request", () => {
  assert.equal(rispostaRelazionalePino("Cerco un orologio sotto 100 euro"), null);
});


test("Pino accepts a direct invitation to chat", () => {
  const reply = rispostaRelazionalePino("Ti va di fare due chiacchiere?");
  assert.match(reply ?? "", /Volentieri!/);
});

test("Pino understands a chat invitation with a spelling mistake", () => {
  const reply = rispostaRelazionalePino("Ti va di fare due kiacchiere?");
  assert.match(reply ?? "", /Volentieri!/);
});

test("Pino understands an informal chat invitation", () => {
  const reply = rispostaRelazionalePino("Facciamo 2 chiacchiere");
  assert.match(reply ?? "", /Volentieri!/);
});

test("Pino does not intercept a concrete catalog request containing a typo", () => {
  assert.equal(rispostaRelazionalePino("Cerco un orologgio sotto 100 euro"), null);
});
