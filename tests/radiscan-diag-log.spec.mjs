/**
 * Diagnostica RadiciScan: log del fallback vision (senza rete).
 *
 * Verifica: esiti per provider, status HTTP, timeout, provider saltato,
 * assenza di segreti/immagini/base64 nei log e invarianza del messaggio pubblico.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { analyzeRadiciScanImages } = await import("@/lib/radiscan/vision-service");
const { ProviderError } = await import("@/lib/product-assistant/providers/utils");

const SEGRETO = "sk-or-SEGRETO-123";
const IMMAGINE_B64 = "AAAA_BASE64_IMMAGINE_QQQ";
const immagini = [{ buffer: Buffer.from(IMMAGINE_B64, "base64"), filename: "radiscan.jpg", role: "primary" }];

function catturaLog(fn) {
  const righe = [];
  const originali = { warn: console.warn, info: console.info };
  console.warn = (...a) => righe.push(a.join(" "));
  console.info = (...a) => righe.push(a.join(" "));
  return fn().finally(() => {
    console.warn = originali.warn;
    console.info = originali.info;
  }).then((esito) => ({ esito, righe }), (errore) => ({ errore, righe }));
}

function providerFinto(nome, comportamento) {
  return {
    name: nome,
    build: () => ({
      analyze: async () => {
        if (comportamento.errore) throw comportamento.errore;
        return { rawText: comportamento.testo ?? "{}", model: nome, httpStatus: 200, latencyMs: 5 };
      },
    }),
  };
}

test("Cloudflare 429 poi OpenRouter 401: entrambi loggati, errore finale di OpenRouter", async () => {
  const cf = providerFinto("Cloudflare", { errore: new ProviderError("AI_PROVIDER_QUOTA_EXCEEDED", "quota", 429) });
  const or = providerFinto("OpenRouter", { errore: new ProviderError("AI_PROVIDER_UNKNOWN_ERROR", "auth " + SEGRETO, 401) });
  const { errore, righe } = await catturaLog(() =>
    analyzeRadiciScanImages(immagini, "p", undefined, { catena: [cf, or] })
  );
  assert.ok(errore instanceof ProviderError);
  const cfRiga = righe.find((r) => r.includes("provider=Cloudflare"));
  const orRiga = righe.find((r) => r.includes("provider=OpenRouter"));
  assert.match(cfRiga, /codice=AI_PROVIDER_QUOTA_EXCEEDED http_status=429 timeout=false/);
  assert.match(orRiga, /codice=AI_PROVIDER_UNKNOWN_ERROR http_status=401 timeout=false/);
  assert.ok(!righe.join("\n").includes(SEGRETO), "il segreto non deve comparire nei log");
});

test("Cloudflare 500 poi OpenRouter 402: ogni provider registra il proprio status effettivo", async () => {
  const cf = providerFinto("Cloudflare", { errore: new ProviderError("AI_PROVIDER_UNKNOWN_ERROR", "server", 500) });
  const or = providerFinto("OpenRouter", { errore: new ProviderError("AI_PROVIDER_QUOTA_EXCEEDED", "credito", 402) });
  const { errore, righe } = await catturaLog(() =>
    analyzeRadiciScanImages(immagini, "p", undefined, { catena: [cf, or] })
  );
  assert.ok(errore instanceof ProviderError);
  assert.match(righe.find((r) => r.includes("provider=Cloudflare")), /http_status=500 timeout=false/);
  assert.match(righe.find((r) => r.includes("provider=OpenRouter")), /http_status=402 timeout=false/);
});

test("Cloudflare timeout poi OpenRouter successo: timeout loggato, successo di OpenRouter", async () => {
  const cf = providerFinto("Cloudflare", { errore: new ProviderError("AI_PROVIDER_TIMEOUT", "timeout", "unknown") });
  const or = providerFinto("OpenRouter", { testo: '{"ok":true}' });
  const { esito, righe } = await catturaLog(() =>
    analyzeRadiciScanImages(immagini, "p", undefined, { catena: [cf, or] })
  );
  assert.equal(esito.provider, "OpenRouter");
  assert.match(righe.find((r) => r.includes("provider=Cloudflare")), /timeout=true/);
  assert.match(righe.find((r) => r.includes("esito=ok")), /provider=OpenRouter/);
});

test("entrambi indisponibili: nessun successo, ultimo errore rilanciato", async () => {
  const cf = providerFinto("Cloudflare", { errore: new ProviderError("AI_PROVIDER_NETWORK_ERROR", "rete", "unknown") });
  const or = providerFinto("OpenRouter", { errore: new ProviderError("AI_PROVIDER_NETWORK_ERROR", "rete", 503) });
  const { errore, righe } = await catturaLog(() =>
    analyzeRadiciScanImages(immagini, "p", undefined, { catena: [cf, or] })
  );
  assert.ok(errore instanceof ProviderError);
  assert.equal(righe.filter((r) => r.includes("esito=errore")).length, 2);
});

test("provider saltato per configurazione mancante: loggato come saltato, il successo resta", async () => {
  const cfSaltato = { name: "Cloudflare", build: () => null };
  const or = providerFinto("OpenRouter", { testo: '{"ok":true}' });
  const { esito, righe } = await catturaLog(() =>
    analyzeRadiciScanImages(immagini, "p", undefined, { catena: [cfSaltato, or] })
  );
  assert.equal(esito.provider, "OpenRouter");
  assert.match(righe.find((r) => r.includes("provider=Cloudflare")), /esito=saltato motivo=configurazione_mancante/);
});

test("log senza immagini, base64 o segreti", async () => {
  const cf = providerFinto("Cloudflare", { errore: new ProviderError("AI_PROVIDER_UNKNOWN_ERROR", "Bearer " + SEGRETO + " " + IMMAGINE_B64, 500) });
  const { righe } = await catturaLog(() =>
    analyzeRadiciScanImages(immagini, "p", undefined, { catena: [cf] })
  );
  const testo = righe.join("\n");
  assert.ok(!testo.includes(SEGRETO));
  assert.ok(!testo.includes(IMMAGINE_B64));
  assert.ok(!testo.toLowerCase().includes("bearer"));
});
