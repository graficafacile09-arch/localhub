/**
 * Contratto HTTP pubblico della diagnostica RadiciScan.
 *
 * Verifica che gli errori dei provider arrivino al client con status e
 * messaggi invariati, e che i log diagnostici non contengano dati sensibili.
 * Nessuna rete: il provider è iniettato.
 *
 * Comando:
 *   node --experimental-strip-types --import ./tests/support/hook-radiscan.mjs \
 *     --test tests/radiscan-diag-contratto-http.spec.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

const { creaHandlerAnalisi, ErroreRadiciScan, CODICI_ERRORE } = await import("@/lib/radiscan");
const { ProviderError } = await import("@/lib/product-assistant/providers/utils");

const URL_ROUTE = "https://example.test/api/radiscan/analisi";
const UUID_UTENTE = "33333333-3333-4333-8333-333333333333";
const SALE = "sale-di-test-lungo-16";
const SEGRETO = "segreto-cache-di-test-0123456789abcdef";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

function repositoryFinto() {
  return {
    async leggiRegistro() {
      return [];
    },
    async leggiCache() {
      return null;
    },
    async scriviCache() {},
    async registraAnalisi() {},
    async consumaQuota(_chiave, modalita) {
      return modalita === "anonimo"
        ? { consentita: true, usatiOggi: 1, limiteGiorno: 15, limiteMinuto: 3 }
        : { consentita: true, usatiOggi: 1, limiteGiorno: 60, limiteMinuto: 10 };
    },
  };
}

function richiesta() {
  const form = new FormData();
  form.append("immagine", new File([JPEG], "foto.jpg", { type: "image/jpeg" }));
  return new Request(URL_ROUTE, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.7" },
    body: form,
  });
}

/** Esegue l'handler con un provider che lancia `errore`; restituisce risposta e log. */
async function eseguiConErrore(errore) {
  const logs = [];
  const warnOriginale = console.warn;
  const precedenteVercel = process.env.VERCEL;
  const precedenteProxy = process.env.RADISCAN_TRUSTED_PROXY;
  process.env.VERCEL = "1";
  delete process.env.RADISCAN_TRUSTED_PROXY;
  console.warn = (...args) => logs.push(args.join(" "));
  try {
    const handler = creaHandlerAnalisi({
      utenteCorrente: async () => ({ id: UUID_UTENTE }),
      creaRepository: () => repositoryFinto(),
      creaProvider: () => ({
        nome: "finto",
        modello: "finto",
        async genera() {
          throw errore;
        },
      }),
      saleQuota: SALE,
      segretoCache: SEGRETO,
      adesso: () => new Date("2026-11-18T10:00:00.000Z"),
    });
    const risposta = await handler(richiesta());
    const corpo = await risposta.json();
    return { stato: risposta.status, corpo, logs };
  } finally {
    console.warn = warnOriginale;
    if (precedenteVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = precedenteVercel;
    if (precedenteProxy === undefined) delete process.env.RADISCAN_TRUSTED_PROXY; else process.env.RADISCAN_TRUSTED_PROXY = precedenteProxy;
  }
}

test("ProviderError non convertito diventa 500 ERRORE_INTERNO con messaggio generico", async () => {
  const errore = new ProviderError("AI_PROVIDER_RATE_LIMIT", "Cloudflare: 429 dettaglio grezzo", 429);
  const { stato, corpo } = await eseguiConErrore(errore);
  assert.equal(stato, 500, JSON.stringify(corpo));
  assert.equal(corpo.errore.codice, "ERRORE_INTERNO");
  assert.equal(corpo.errore.messaggio, "Errore interno. Riprova più tardi.");
  assert.doesNotMatch(JSON.stringify(corpo), /429|Cloudflare|dettaglio grezzo/);
});

test("ErroreRadiciScan di quota mantiene 503 ANALISI_NON_DISPONIBILE invariato", async () => {
  const { stato, corpo } = await eseguiConErrore(
    new ErroreRadiciScan(CODICI_ERRORE.PROVIDER_QUOTA, "quota provider grezza")
  );
  assert.equal(stato, 503, JSON.stringify(corpo));
  assert.equal(corpo.errore.codice, "ANALISI_NON_DISPONIBILE");
  assert.equal(corpo.errore.messaggio, "Servizio di analisi non disponibile. Riprova più tardi.");
});

test("ErroreRadiciScan di timeout mantiene 504 ANALISI_SCADUTA invariato", async () => {
  const { stato, corpo } = await eseguiConErrore(
    new ErroreRadiciScan(CODICI_ERRORE.PROVIDER_TIMEOUT, "timeout grezzo")
  );
  assert.equal(stato, 504, JSON.stringify(corpo));
  assert.equal(corpo.errore.codice, "ANALISI_SCADUTA");
});

test("ProviderError registra origine=provider, code e http_status nel log handler", async () => {
  const errore = new ProviderError("AI_PROVIDER_QUOTA_EXCEEDED", "Cloudflare 429 grezzo", 429);
  const { logs, stato } = await eseguiConErrore(errore);
  assert.equal(stato, 500);
  const riga = logs.find((r) => r.includes("esito=errore"));
  assert.ok(riga, logs.join(" | "));
  assert.match(riga, /origine=provider codice=AI_PROVIDER_QUOTA_EXCEEDED http_status=429/);
  assert.doesNotMatch(riga, /Cloudflare 429 grezzo/);
});

test("ErroreRadiciScan registra origine=radiciscan senza http_status", async () => {
  const { logs } = await eseguiConErrore(
    new ErroreRadiciScan(CODICI_ERRORE.PROVIDER_TIMEOUT, "timeout grezzo")
  );
  const riga = logs.find((r) => r.includes("esito=errore"));
  assert.ok(riga.includes("origine=radiciscan codice=RADICSCAN_PROVIDER_TIMEOUT http_status=n/d"), riga);
});

test("creaProvider che lancia: 503 ANALISI_NON_DISPONIBILE invariato, log origine=inizializzazione_provider, nessun dettaglio al client", async () => {
  const logs = [];
  const warnOriginale = console.warn;
  const precedenteVercel = process.env.VERCEL;
  const precedenteProxy = process.env.RADISCAN_TRUSTED_PROXY;
  process.env.VERCEL = "1";
  delete process.env.RADISCAN_TRUSTED_PROXY;
  console.warn = (...args) => logs.push(args.join(" "));
  let risposta;
  try {
    const handler = creaHandlerAnalisi({
      utenteCorrente: async () => ({ id: UUID_UTENTE }),
      creaRepository: () => repositoryFinto(),
      creaProvider: () => {
        throw new Error("dettaglio interno x");
      },
      saleQuota: SALE,
      segretoCache: SEGRETO,
      adesso: () => new Date("2026-11-18T10:00:00.000Z"),
    });
    risposta = await handler(richiesta());
  } finally {
    console.warn = warnOriginale;
    if (precedenteVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = precedenteVercel;
    if (precedenteProxy === undefined) delete process.env.RADISCAN_TRUSTED_PROXY; else process.env.RADISCAN_TRUSTED_PROXY = precedenteProxy;
  }
  const corpo = await risposta.json();
  assert.equal(risposta.status, 503, JSON.stringify(corpo));
  assert.equal(corpo.errore.codice, "ANALISI_NON_DISPONIBILE");
  assert.equal(corpo.errore.messaggio, "Servizio di analisi non disponibile.");
  assert.doesNotMatch(JSON.stringify(corpo), /dettaglio interno|Error/);
  const riga = logs.find((r) => r.includes("origine=inizializzazione_provider"));
  assert.ok(riga, logs.join(" | "));
  assert.ok(riga.includes("tipo=Error codice=NON_CLASSIFICATO"), riga);
  assert.doesNotMatch(riga, /dettaglio interno/);
});

test("il log diagnostico non contiene messaggi grezzi, chiavi né base64", async () => {
  const errore = new ProviderError(
    "AI_PROVIDER_UNAUTHORIZED",
    "Bearer sk-or-SEGRETO-123 base64AAAA",
    401
  );
  const { logs } = await eseguiConErrore(errore);
  const testoLog = logs.join("\n");
  assert.match(testoLog, /http_status=401/);
  assert.doesNotMatch(testoLog, /sk-or|Bearer|SEGRETO|base64AAAA/);
  assert.doesNotMatch(testoLog, new RegExp(JPEG.toString("base64")));
});
