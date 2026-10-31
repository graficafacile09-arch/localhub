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
