/**
 * RADICISCAN — MOTORE VISIVO CONDIVISO CON AGGIUNGI PRODOTTI
 *
 * Verifica, senza rete e senza provider reali:
 *  - preprocessing 1024 px / JPEG 80 e auto-orientamento;
 *  - vista intera + dettaglio ad alta risoluzione quando disponibile;
 *  - fallback sul secondo modello anche quando il primo output non rispetta lo schema;
 *  - fallback attivato soltanto su un errore reale del provider;
 *  - schema tollerante sulla forma, rigoroso sul significato.
 *
 * Comando:
 *   node --experimental-strip-types --import ./tests/support/hook-radiscan.mjs \
 *     --test tests/radiscan-vision-gemma.spec.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

const radiscan = await import("@/lib/radiscan");
const {
  analizzaOutputModello,
  analizzaProdotto,
  dimensioniVisione,
  preparaImmagineVisione,
  VISION_JPEG_QUALITY,
  VISION_MAX_DIM,
} = radiscan;

const providerVision = await import("@/lib/radiscan/provider-vision-prodotti");
const vision = await import("@/lib/product-assistant/vision-service");
const { ProviderError } = await import("@/lib/product-assistant/providers/utils");

// ─── Preprocessing ───────────────────────────────────────────────────────

test("preprocessing: lato massimo 1024, proporzioni conservate", () => {
  assert.deepEqual(dimensioniVisione(4000, 3000), { larghezza: 1024, altezza: 768 });
  assert.deepEqual(dimensioniVisione(3000, 4000), { larghezza: 768, altezza: 1024 });
  assert.deepEqual(dimensioniVisione(800, 600), { larghezza: 800, altezza: 600 });
  assert.deepEqual(dimensioniVisione(0, 0), { larghezza: 0, altezza: 0 });
  assert.equal(VISION_MAX_DIM, 1024);
  assert.equal(VISION_JPEG_QUALITY, 80);
});

test("preprocessing: usa rotate, resize 1024 inside e JPEG 80", async () => {
  const chiamate = { rotate: 0, resize: null, jpeg: null };
  const pipeline = {
    rotate() {
      chiamate.rotate += 1;
      return this;
    },
    resize(opzioni) {
      chiamate.resize = opzioni;
      return this;
    },
    jpeg(opzioni) {
      chiamate.jpeg = opzioni;
      return this;
    },
    async toBuffer(opzioni) {
      assert.equal(opzioni.resolveWithObject, true);
      return { data: Buffer.from("JPEG-RIDOTTA"), info: { width: 1024, height: 768 } };
    },
  };

  const risultato = await preparaImmagineVisione("AQID", "image/jpeg", {
    sharpImpl: () => pipeline,
  });

  assert.equal(chiamate.rotate, 1);
  assert.deepEqual(chiamate.resize, {
    width: 1024,
    height: 1024,
    fit: "inside",
    withoutEnlargement: true,
  });
  assert.deepEqual(chiamate.jpeg, { quality: 80 });
  assert.equal(risultato.mime, "image/jpeg");
  assert.equal(risultato.ridimensionata, true);
  assert.equal(risultato.base64, Buffer.from("JPEG-RIDOTTA").toString("base64"));
});

test("preprocessing: se Sharp fallisce si usa l'originale, senza errori", async () => {
  const originale = Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString("base64");
  const risultato = await preparaImmagineVisione(originale, "image/jpeg", {
    sharpImpl: () => {
      throw new Error("sharp assente");
    },
  });

  assert.equal(risultato.base64, originale);
  assert.equal(risultato.ridimensionata, false);
  assert.equal(risultato.mime, "image/jpeg");
});

// ─── Pipeline: una sola immagine, nessun dettaglio ───────────────────────

test("pipeline: il provider riceve una sola immagine e nessun dettaglio", async () => {
  let ricevuto = null;
  const provider = {
    nome: "finto",
    modello: "finto-1",
    async genera(input) {
      ricevuto = input;
      return {
        testo: JSON.stringify({ prodotto: "Soppressata di Calabria", confidenza: 70 }),
      };
    },
  };

  await analizzaProdotto(
    {
      immagineBase64: Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString("base64"),
      mimeType: "image/jpeg",
    },
    { provider, registro: [] }
  );

  assert.ok(ricevuto);
  assert.equal(ricevuto.immagineDettaglioBase64, undefined);
  assert.equal(ricevuto.mimeType, "image/jpeg");
  assert.ok(ricevuto.immagineBase64.length > 0);
});

test("pipeline: i tempi distinguono preprocessing e chiamata visiva", async () => {
  const provider = {
    nome: "finto",
    modello: "finto-1",
    async genera() {
      return { testo: JSON.stringify({ prodotto: "Pecorino", confidenza: 60 }) };
    },
  };

  const { esito, meta } = await analizzaProdotto(
    {
      immagineBase64: Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString("base64"),
      mimeType: "image/jpeg",
    },
    { provider, registro: [] }
  );

  assert.equal(typeof esito.tempi.preprocessamentoMs, "number");
  assert.equal(typeof esito.tempi.identificazioneMs, "number");
  assert.equal(typeof esito.tempi.documentiMs, "number");
  assert.equal(typeof esito.tempi.totaleMs, "number");
  assert.ok(esito.tempi.totaleMs >= esito.tempi.identificazioneMs);
  assert.equal(meta.durataMs, esito.tempi.identificazioneMs);
});

// ─── Catena provider: niente fallback per un errore di formato ───────────

function providerFinto(nome, comportamento) {
  return {
    name: nome,
    build: () => ({
      analyze: async () => comportamento(),
    }),
  };
}

test("vision: senza validatore il testo viene restituito al chiamante", async () => {
  let secondiChiamati = 0;
  const risultato = await vision.analyzeImagesWithPrompt(
    [{ buffer: Buffer.from([1, 2, 3]), filename: "a.jpg", role: "primary" }],
    "prompt",
    undefined,
    {
      catena: [
        providerFinto("Cloudflare", () => ({
          rawText: "ecco il prodotto: Soppressata",
          model: "gemma-4",
          latencyMs: 10,
          httpStatus: 200,
        })),
        providerFinto("OpenRouter", () => {
          secondiChiamati += 1;
          return { rawText: '{"prodotto":"X"}', model: "qwen", latencyMs: 10, httpStatus: 200 };
        }),
      ],
    }
  );

  assert.equal(secondiChiamati, 0);
  assert.equal(risultato.provider, "Cloudflare");
  assert.equal(risultato.rawText, "ecco il prodotto: Soppressata");
});

test("vision: uno schema non valido attiva il fallback e accetta la risposta valida", async () => {
  let secondiChiamati = 0;
  const risultato = await vision.analyzeImagesWithPrompt(
    [{ buffer: Buffer.from([1, 2, 3]), filename: "a.jpg", role: "primary" }],
    "prompt",
    undefined,
    {
      validateRawText: (rawText) => radiscan.analizzaOutputModello(rawText).ok,
      catena: [
        providerFinto("Cloudflare", () => ({
          rawText: "prodotto non strutturato",
          model: "gemma-4",
          latencyMs: 10,
          httpStatus: 200,
        })),
        providerFinto("OpenRouter", () => {
          secondiChiamati += 1;
          return {
            rawText: '{"prodotto":"Soppressata di Calabria","confidenza":80}',
            model: "qwen",
            latencyMs: 10,
            httpStatus: 200,
          };
        }),
      ],
    }
  );

  assert.equal(secondiChiamati, 1);
  assert.equal(risultato.provider, "OpenRouter");
  assert.equal(radiscan.analizzaOutputModello(risultato.rawText).ok, true);
});

test("vision: un errore reale del provider attiva il fallback breve", async () => {
  const risultato = await vision.analyzeImagesWithPrompt(
    [{ buffer: Buffer.from([1, 2, 3]), filename: "a.jpg", role: "primary" }],
    "prompt",
    undefined,
    {
      timeoutMs: 1234,
      fallbackTimeoutMs: 567,
      catena: [
        providerFinto("Cloudflare", () => {
          throw new ProviderError("AI_PROVIDER_TIMEOUT", "timeout", "timeout");
        }),
        providerFinto("OpenRouter", () => ({
          rawText: '{"prodotto":"X"}',
          model: "qwen",
          latencyMs: 10,
          httpStatus: 200,
        })),
      ],
    }
  );

  assert.equal(risultato.provider, "OpenRouter");
  assert.equal(risultato.model, "qwen");
});

test("vision: una risposta vuota è un errore del provider, non un parsing da correggere", async () => {
  let secondiChiamati = 0;
  await vision.analyzeImagesWithPrompt(
    [{ buffer: Buffer.from([1, 2, 3]), filename: "a.jpg", role: "primary" }],
    "prompt",
    undefined,
    {
      catena: [
        providerFinto("Cloudflare", () => ({ rawText: "   ", model: "gemma-4", latencyMs: 1, httpStatus: 200 })),
        providerFinto("OpenRouter", () => {
          secondiChiamati += 1;
          return { rawText: '{"prodotto":"X"}', model: "qwen", latencyMs: 1, httpStatus: 200 };
        }),
      ],
    }
  );
  assert.equal(secondiChiamati, 1);
});

// ─── Adattatore RadiciScan ───────────────────────────────────────────────

test("adattatore: vista intera + dettaglio e fallback schema", async () => {
  let catturato = null;
  const provider = providerVision.creaProviderVisionProdotti({
    analizza: async (immagini, prompt, signal, opzioni) => {
      catturato = { immagini, prompt, opzioni };
      return { rawText: '{"prodotto":"X"}', model: "gemma-4", provider: "Cloudflare" };
    },
  });

  const esito = await provider.genera({
    prompt: "prompt-radiscan",
    immagineBase64: "AQID",
    mimeType: "image/jpeg",
    immagineDettaglioBase64: "DETTAGLIO",
  });

  assert.equal(catturato.immagini.length, 2);
  assert.equal(catturato.immagini[0].role, "primary");
  assert.equal(catturato.immagini[1].role, "detail");
  assert.equal(catturato.immagini[1].filename, "radiscan-dettaglio.jpg");
  assert.equal(typeof catturato.opzioni.validateRawText, "function");
  assert.equal(catturato.prompt, "prompt-radiscan");
  assert.equal(catturato.opzioni.maxOutputTokens, 700);
  assert.equal(catturato.opzioni.timeoutMs, 15_000);
  assert.equal(catturato.opzioni.fallbackTimeoutMs, 7_000);
  assert.equal(esito.modello, "gemma-4");
});

// ─── Cablaggio: nessun servizio esterno nel percorso rapido ─────────────

test("route: usa il motore condiviso, non Gemini/Tavily/OCR", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const sorgente = readFileSync(
    fileURLToPath(new URL("../app/api/radiscan/analisi/route.ts", import.meta.url)),
    "utf8"
  );

  assert.match(sorgente, /creaProviderVisionProdotti/);
  assert.ok(!sorgente.includes("creaProviderGemini"));
  assert.ok(!sorgente.includes("web-tavily"));
  assert.ok(!sorgente.includes("creaOcr"));
  assert.ok(!sorgente.includes("GEMINI_API_KEY"));
  assert.match(sorgente, /export const maxDuration = 30/);
});

// ─── Schema: forma tollerante, significato rigoroso ──────────────────────

test("schema: Markdown, testo attorno e chiavi in ordine diverso", () => {
  const esito = analizzaOutputModello(
    'Ecco il risultato:\n```json\n{"confidenza": 82, "prodotto": "Soppressata di Calabria", "categoria": "Salumi"}\n```\nFine.'
  );

  assert.equal(esito.ok, true);
  assert.equal(esito.valore.riconoscimento.prodotto, "Soppressata di Calabria");
  assert.equal(esito.valore.riconoscimento.confidenza, 82);
});

test("schema: campi facoltativi mancanti, null e camelCase", () => {
  const esito = analizzaOutputModello(
    JSON.stringify({
      prodotto: "Caciocavallo Silano",
      schemaProposto: "DOP",
      territorioProposto: "Calabria",
      certificazioni: null,
      ingredienti: null,
      note: null,
      confidenza: "74",
      indicatoreEtichetta: "bollino DOP",
    })
  );

  assert.equal(esito.ok, true);
  const r = esito.valore.riconoscimento;
  assert.equal(r.schemaProposto, "DOP");
  assert.equal(r.territorioProposto, "Calabria");
  assert.equal(r.confidenza, 74);
  assert.deepEqual(r.certificazioni, []);
  assert.deepEqual(r.ingredienti, []);
  assert.equal(r.note, null);
});

test("schema: elenchi scritti come stringa separata da virgole", () => {
  const esito = analizzaOutputModello(
    JSON.stringify({
      prodotto: "Olio di Calabria",
      ingredienti: "olio extravergine di oliva; sale",
      certificazioni: "DOP, IGP",
      confidenza: 91,
    })
  );

  assert.equal(esito.ok, true);
  assert.deepEqual(esito.valore.riconoscimento.ingredienti, [
    "olio extravergine di oliva",
    "sale",
  ]);
  assert.deepEqual(esito.valore.riconoscimento.certificazioni, ["DOP", "IGP"]);
});

test("schema: JSON troncato viene chiuso senza inventare campi", () => {
  const esito = analizzaOutputModello(
    '{"prodotto":"Pecorino Crotonese","categoria":"Formaggi","confidenza":66,"note":"etichetta parz'
  );

  assert.equal(esito.ok, true);
  const r = esito.valore.riconoscimento;
  assert.equal(r.prodotto, "Pecorino Crotonese");
  assert.equal(r.categoria, "Formaggi");
  assert.equal(r.confidenza, 66);
  assert.equal(r.produttore, null);
  assert.deepEqual(r.certificazioni, []);
});

test("schema: senza nome prodotto non esiste riconoscimento", () => {
  const esito = analizzaOutputModello(JSON.stringify({ categoria: "Salumi", confidenza: 90 }));
  assert.equal(esito.ok, false);
  assert.match(esito.motivo, /prodotto/);
});

test("schema: sicurezza invariata su schema e denominazione generica", () => {
  const generica = analizzaOutputModello(
    JSON.stringify({
      prodotto: "Soppressata di Calabria",
      denominazione_proposta: "Denominazione di Origine Protetta",
      schema_proposto: "DOP",
      confidenza: 80,
    })
  );
  assert.equal(generica.ok, true);
  assert.equal(
    generica.valore.riconoscimento.denominazioneProposta,
    "Soppressata di Calabria"
  );

  const inventato = analizzaOutputModello(
    JSON.stringify({ prodotto: "X", schema_proposto: "SUPERDOP", confidenza: 50 })
  );
  assert.equal(inventato.ok, true);
  assert.equal(inventato.valore.riconoscimento.schemaProposto, null);
});
