/**
 * CONTRATTO ISOLATO — route vision del percorso venditori
 * (FASE 0 RadiciScan, Opzione A).
 *
 * Verifica i quattro cancelli della route senza alcun accesso esterno:
 *   1. autenticazione assente      → 401 UNAUTHORIZED
 *   2. ownership negata            → 403 FORBIDDEN
 *   3. modello inesistente         → 400 INVALID_MODEL
 *   4. FormData senza immagine     → 422 INVALID_BODY
 *
 * Tutte le dipendenze sono sostituite da tests/support/hook-vision.mjs.
 * Il test fallisce se viene tentata una chiamata di rete, una RPC, una
 * scrittura, una lettura/scrittura di cache o una chiamata al provider AI.
 *
 * Comando:
 *   node --experimental-strip-types --import ./tests/support/hook-vision.mjs \
 *     --test tests/vision-merchant-contract-unit.spec.mjs
 */
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spia, azzeraSpia } from "@vision-test/spia";

const { POST } = await import("@vision-test/route");

const BASE_ROUTE = "http://vision.test/api/merchant/stores/negozio-test/products/vision";
const NEGOZIO = "negozio-test";

/** Invoca la route handler come farebbe Next, con params risolti. */
async function chiamaRoute(query = "", form = undefined) {
  const richiesta = new Request(`${BASE_ROUTE}${query}`, {
    method: "POST",
    ...(form ? { body: form } : {}),
  });
  return POST(richiesta, { params: Promise.resolve({ negozioId: NEGOZIO }) });
}

/** Nessun test può uscire in rete: la trappola registra e fallisce. */
beforeEach(() => {
  azzeraSpia();
  spia.fetch.length = 0;
  globalThis.fetch = (url) => {
    spia.fetch.push(String(url));
    throw new Error(`Chiamata di rete non consentita: ${url}`);
  };
});

test("401 UNAUTHORIZED: nessuna sessione e nessun cancello successivo", async () => {
  spia.authErrore = true;

  const risposta = await chiamaRoute();
  const corpo = await risposta.json();

  assert.equal(risposta.status, 401);
  assert.equal(corpo.success, false);
  assert.equal(corpo.error.code, "UNAUTHORIZED");

  assert.deepEqual(spia.requireApiArea, ["merchant"], "gate area eseguito una volta");
  assert.equal(spia.canManageStore.length, 0, "ownership non deve essere valutata");
  assert.equal(spia.checkRateLimit.length, 0, "rate limit non deve partire");
  assert.equal(spia.rpc.length, 0, "nessuna RPC");
  assert.equal(spia.scritture.length, 0, "nessuna scrittura");
  assert.equal(spia.provider.length, 0, "nessun provider AI");
  assert.equal(spia.cacheLookup.length, 0, "cache non interrogata");
  assert.equal(spia.fetch.length, 0, "nessuna chiamata di rete");
});

test("403 FORBIDDEN: negozio non gestibile, senza rate limit né quota", async () => {
  spia.ownership = false;

  const risposta = await chiamaRoute();
  const corpo = await risposta.json();

  assert.equal(risposta.status, 403);
  assert.equal(corpo.success, false);
  assert.equal(corpo.error.code, "FORBIDDEN");

  assert.deepEqual(spia.requireApiArea, ["merchant"]);
  assert.equal(spia.canManageStore.length, 1, "ownership valutata una volta");
  assert.equal(spia.canManageStore[0].userId, "utente-vision-test");
  assert.equal(spia.canManageStore[0].negozioId, NEGOZIO);

  assert.equal(spia.checkRateLimit.length, 0, "rate limit non deve partire");
  assert.equal(spia.rpc.length, 0, "nessuna RPC di quota");
  assert.equal(spia.scritture.length, 0, "nessuna scrittura");
  assert.equal(spia.provider.length, 0, "nessun provider AI");
  assert.equal(spia.cacheLookup.length, 0, "cache non interrogata");
  assert.equal(spia.fetch.length, 0, "nessuna chiamata di rete");
});

test("400 INVALID_MODEL: modello sconosciuto, nessuna quota e nessun provider", async () => {
  const risposta = await chiamaRoute("?model=modello-inesistente");
  const corpo = await risposta.json();

  assert.equal(risposta.status, 400);
  assert.equal(corpo.success, false);
  assert.equal(corpo.error.code, "INVALID_MODEL");

  assert.deepEqual(spia.requireApiArea, ["merchant"]);
  assert.equal(spia.canManageStore.length, 1, "ownership superata");
  assert.equal(spia.checkRateLimit.length, 1, "rate limit eseguito prima del modello");
  assert.equal(spia.rpc.length, 0, "quota mensile non consumata");
  assert.equal(spia.scritture.length, 0, "nessuna scrittura");
  assert.equal(spia.provider.length, 0, "nessun provider AI");
  assert.equal(spia.cacheLookup.length, 0, "cache non interrogata");
  assert.equal(spia.fetch.length, 0, "nessuna chiamata di rete");
});

test("422 INVALID_BODY: Gemini senza immagine, fermo prima di quota e cache", async () => {
  const form = new FormData();
  form.append("nota", "nessuna immagine");

  const risposta = await chiamaRoute("?model=gemini", form);
  const corpo = await risposta.json();

  assert.equal(risposta.status, 422);
  assert.equal(corpo.success, false);
  assert.equal(corpo.error.code, "INVALID_BODY");

  assert.deepEqual(spia.requireApiArea, ["merchant"]);
  assert.equal(spia.canManageStore.length, 1, "ownership superata");
  assert.equal(spia.checkRateLimit.length, 1, "rate limit eseguito prima del body");
  assert.equal(spia.rpc.length, 0, "quota mensile non consumata");
  assert.equal(spia.scritture.length, 0, "nessuna scrittura");
  assert.equal(spia.provider.length, 0, "nessun provider AI");
  assert.equal(spia.cacheLookup.length, 0, "cache non interrogata");
  assert.equal(spia.cacheStore.length, 0, "cache non scritta");
  assert.equal(spia.logScan.length, 0, "nessun log di scansione");
  assert.equal(spia.fetch.length, 0, "nessuna chiamata di rete");
});
