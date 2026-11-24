// PROVA TEMPORANEA: nessun database, solo mock ritardato. Da eliminare dopo l'uso.
import test from "node:test";
import assert from "node:assert/strict";

// Stessa forma di entroBudget in lib/radiscan/handler.ts (non esportato).
async function entroBudget(lavoro, ms) {
  let timer;
  try {
    await Promise.race([
      lavoro,
      new Promise((_, rifiuta) => {
        timer = setTimeout(() => rifiuta(new Error("timeout")), ms);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

test("probe: scrittura ritardata oltre il budget", async () => {
  let completata = false;
  const scrittura = new Promise((risolvi) =>
    setTimeout(() => {
      completata = true;
      risolvi();
    }, 300)
  );

  const esitoBudget = await entroBudget(scrittura, 100);
  assert.equal(esitoBudget, false, "il budget scade prima della scrittura");
  assert.equal(completata, false, "al momento della risposta la scrittura non è completata");

  await scrittura;
  assert.equal(completata, true, "la scrittura continua e si completa dopo il timeout");
});
