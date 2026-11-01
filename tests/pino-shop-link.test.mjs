import assert from "node:assert/strict";
import test from "node:test";
import { pinoShopHref } from "../lib/assistente/shop-link.ts";

test("Pino does not create shop routes from missing or null slugs", () => {
  assert.equal(pinoShopHref(null), null);
  assert.equal(pinoShopHref(undefined), null);
  assert.equal(pinoShopHref("null"), null);
  assert.equal(pinoShopHref("undefined"), null);
  assert.equal(pinoShopHref("   "), null);
});

test("Pino preserves valid public shop slugs", () => {
  assert.equal(pinoShopHref("panificio-zini"), "/negozio/panificio-zini");
});
