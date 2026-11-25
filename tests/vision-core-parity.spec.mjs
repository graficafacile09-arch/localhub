/**
 * PARITÀ FASE 1 — core vision condiviso vs percorso venditori.
 *
 * Dimostra che l'estrazione in lib/vision-core e components/vision riproduce
 * esattamente il comportamento attuale, senza che la route o il uploader
 * venditori siano stati modificati:
 *  1. prompt identico byte per byte;
 *  2. parser del suggerimento identico su un corpus di payload realistici;
 *  3. pipeline sharp identica byte per byte (crop e no-crop);
 *  4. hash cache identico (computeAverageHash produttiva vs core);
 *  5. marcatori JSX dei componenti identici al uploader;
 *  6. indipendenza: il core non importa il percorso venditori e la route
 *     non importa il core.
 *
 * Comando:
 *   node --experimental-strip-types --import ./tests/support/hook-vision.mjs \
 *     --test tests/vision-core-parity.spec.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const radice = (percorso) => fileURLToPath(new URL(`../${percorso}`, import.meta.url));

const core = await import("@/lib/vision-core");
const { buildVisionPrompt: buildVisionPromptVenditori } = await import(
  "../lib/product-assistant/prompts.ts"
);
const { extractSuggestion } = await import(
  "../lib/product-assistant/providers/utils.ts"
);
const { computeAverageHash: computeAverageHashVenditori } = await import(
  "../lib/product-assistant/vision-cache.ts"
);

const ROUTE = readFileSync(
  radice("app/api/merchant/stores/[negozioId]/products/vision/route.ts"),
  "utf8"
);
const UPLOADER = readFileSync(
  radice("components/merchant/ai/MerchantProductAiUploader.tsx"),
  "utf8"
);

// ─── 1. Prompt ───────────────────────────────────────────────────────────────

test("prompt: identico byte per byte in ogni contesto", () => {
  const contesti = [
    undefined,
    {},
    { negozioNome: "Prova" },
    { negozioNome: "Sapori di Castrovillari", negozioCategoria: "Alimentari" },
    { negozioNome: "" },
    { negozioCategoria: "Solo categoria" },
  ];

  for (const contesto of contesti) {
    assert.equal(
      core.buildVisionPrompt(contesto),
      buildVisionPromptVenditori(contesto),
      `prompt diverso per contesto ${JSON.stringify(contesto)}`
    );
  }

  const base = core.buildVisionPrompt();
  assert.equal(Buffer.byteLength(base, "utf8"), 1206, "byte del prompt base venditori");
  assert.equal(
    Buffer.from(base, "utf8").toString("hex").length / 2,
    1206,
    "nessun byte aggiunto"
  );
  assert.ok(!base.includes("\r"), "nessun terminator di riga diverso da LF");
});

// ─── 2. Parser del suggerimento ──────────────────────────────────────────────

test("parser: identico a extractSuggestion su corpus realistico e casi limite", () => {
  const corpus = [
    {},
    null,
    undefined,
    42,
    "testo",
    [],
    [{ nome: "array" }],
    {
      nome: "  Caffè Passalacqua  ",
      descrizione: "  ",
      categoria: "Alimentari",
      marca: null,
      prezzo_suggerito: "3,50 €",
      confidenza: "87",
      quantita_suggerita: "2",
    },
    {
      nome: "Trapano",
      categoria: "Elettronica",
      marca: "Bosch",
      colore: "blu",
      materiale: "plastica",
      parole_chiave: "fai da te, trapano, 18V",
      prezzoSuggerito: 129.99,
      statoCondizione: "ricondizionato",
      confidenza: 150,
      immaginePrincipale: "https://example.test/a.jpg",
      descrizioneCompleta: "Descrizione lunga",
      caratteristiche: "['18V', 'batteria', 'custodia']",
      peso_volume: "1,8 kg",
      seo_title: "Trapano Bosch 18V",
      seo_description: "Trapano professionale",
      alt_text_immagine: "Trapano blu",
      filtri_catalogo: { alimentazione: "batteria", vuoto: "  " },
    },
    {
      nome: "Maglia",
      paroleChiave: ["cotone", "estate; unisex"],
      stato_condizione: "usato",
      quantita_suggerita: -3,
      confidenza: -10,
      caratteristiche: ["  ", "cotone", 12],
      filtri_catalogo: { taglia: " M " },
    },
    {
      nome: "Oggetto",
      confidenza: "non numerica",
      prezzo_suggerito: "abc",
      stato_condizione: "inventato",
      filtri_catalogo: [],
    },
    {
      nome: "Oggetto",
      confidenza: null,
      prezzo_suggerito: Infinity,
      parole_chiave: [],
      caratteristiche: [],
      filtri_catalogo: {},
    },
  ];

  for (const caso of corpus) {
    assert.deepStrictEqual(
      core.parseVisionSuggestion(caso),
      extractSuggestion(caso),
      `parser diverso per ${JSON.stringify(caso)}`
    );
  }
});

test("json: stessa estrazione della route (fence, ritaglio, body non valido)", () => {
  const casi = [
    ['{"nome":"Prodotto"}', '{"nome":"Prodotto"}'],
    ['```json\n{"nome":"Prodotto"}\n```', '{"nome":"Prodotto"}'],
    ['```\n{"nome":"Prodotto"}\n```', '{"nome":"Prodotto"}'],
    ['Ecco il risultato: {"nome":"Prodotto"} fine', '{"nome":"Prodotto"}'],
    ['  {"nome":"Prodotto"}  ', '{"nome":"Prodotto"}'],
    ["nessun json", "nessun json"],
  ];

  for (const [testo, atteso] of casi) {
    assert.equal(core.extractJsonText(testo), atteso, `estrazione diversa per ${testo}`);
  }

  assert.equal(core.stripCodeFence('```json\n{"a":1}\n```'), '{"a":1}');
  assert.deepStrictEqual(core.parseVisionJson('```json\n{"a":1}\n```'), {
    ok: true,
    value: { a: 1 },
  });
  assert.deepStrictEqual(core.parseVisionJson("non json"), { ok: false });
});

// ─── 3. Pipeline immagine ────────────────────────────────────────────────────

async function fixture(width, height) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      raw[i] = (x * 7 + y * 3) % 256;
      raw[i + 1] = (x * 2 + y * 11) % 256;
      raw[i + 2] = ((x ^ y) * 5) % 256;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** Catena di riferimento: copia letterale della route venditori. */
async function riferimentoRoute(input, crop) {
  if (crop) {
    const result = await sharp(input)
      .resize(640, 640, {
        fit: "cover",
        position: "attention",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { data: result.data, width: result.info.width, height: result.info.height };
  }

  const result = await sharp(input)
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  return { data: result.data, width: result.info.width, height: result.info.height };
}

test("immagine: buffer, dimensioni e base64 identici alla catena della route", async () => {
  const immagini = [
    await fixture(800, 600),
    await fixture(1600, 1200),
    await fixture(300, 300),
    await fixture(40, 20),
  ];

  for (const immagine of immagini) {
    for (const crop of [false, true]) {
      const atteso = await riferimentoRoute(immagine, crop);
      const ottenuto = await core.processImageBuffer(immagine, crop);

      assert.ok(
        ottenuto.data.equals(atteso.data),
        `buffer diverso (${immagine.length} byte, crop=${crop})`
      );
      assert.equal(ottenuto.width, atteso.width, "larghezza diversa");
      assert.equal(ottenuto.height, atteso.height, "altezza diversa");
      assert.equal(core.toBase64(ottenuto.data), ottenuto.data.toString("base64"));
    }
  }

  assert.equal(core.CROP_SIZE, 640);
  assert.equal(core.NO_CROP_MAX_DIM, 1024);
  assert.equal(core.JPEG_QUALITY, 80);
  assert.equal(core.PROVIDER_MIME, "image/jpeg");
});

// ─── 4. Hash della cache ────────────────────────────────────────────────────

test("hash: identico a computeAverageHash produttiva su grezzi e processati", async () => {
  assert.equal(typeof computeAverageHashVenditori, "function");

  const immagini = [await fixture(640, 480), await fixture(1200, 900)];

  for (const immagine of immagini) {
    const grezzo = await core.computeAverageHash(immagine);
    assert.equal(grezzo, await computeAverageHashVenditori(immagine));
    assert.match(grezzo, /^[0-9a-f]{16}$/, "hash 64 bit in esadecimale");

    for (const crop of [false, true]) {
      const processata = await core.processImageBuffer(immagine, crop);
      assert.equal(
        await core.computeAverageHash(processata.data),
        await computeAverageHashVenditori(processata.data),
        `hash diverso sul buffer processato (crop=${crop})`
      );
    }
  }

  assert.equal(core.hammingDistance("ffffffffffffffff", "ffffffffffffffff"), 0);
  assert.equal(
    core.hammingDistance(
      core.hexToBitString("0000000000000000"),
      core.hexToBitString("ffffffffffffffff")
    ),
    64
  );
  assert.equal(core.hammingDistance("0000", "00000000"), 64, "lunghezze diverse = 64");
  assert.equal(core.hexToBitString("f"), "1111");
  assert.ok(core.isCacheMatch("ffffffffffffffff", "ffffffffffffffff"));
  assert.ok(!core.isCacheMatch("0000000000000000", "ffffffffffffffff"));
});

// ─── 5. Componenti condivisi ────────────────────────────────────────────────

const MARKERS = {
  "VisionCameraViewfinder.tsx": [
    "relative bg-black rounded-2xl overflow-hidden pointer-events-none select-none touch-none",
    "w-full aspect-square object-cover pointer-events-none",
    "Inquadra il prodotto...",
    "aspect-square w-4/5 rounded-xl border-2 border-white/70",
    "0 0 0 9999px rgba(0,0,0,0.5)",
    "rounded-tl-xl border-t-4 border-l-4 border-white",
    "bg-gradient-to-t from-black/60 to-transparent",
    "pointer-events-auto flex cursor-pointer items-center gap-1.5 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/30 active:scale-[0.97]",
  ],
  "VisionCaptureActions.tsx": [
    "grid grid-cols-1 gap-4 sm:grid-cols-2",
    "group relative w-full overflow-hidden rounded-[2rem] border-2 border-dashed border-blue-300 bg-gradient-to-b from-blue-50 to-blue-50/60 px-4 py-8 text-center transition-all hover:border-blue-400 hover:shadow-lg hover:shadow-blue-200/50 active:scale-[0.99]",
    "mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-gradient-to-b from-blue-500 to-blue-700 shadow-lg shadow-blue-300/50 transition-transform duration-300 group-hover:scale-110",
    "mt-4 text-lg font-bold text-slate-800",
    "mt-1 text-xs text-slate-500",
    "Scatta foto",
    "Usa la fotocamera",
    "Carica immagine",
    "Scegli una foto dal dispositivo",
  ],
  "VisionPreviewActions.tsx": [
    "overflow-hidden rounded-[1.75rem] bg-slate-100 shadow-inner",
    "max-h-72 w-full object-contain",
    "flex gap-3",
    "flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50",
    "flex-1 rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition hover:shadow-xl hover:shadow-blue-500/40 active:scale-[0.98]",
    "Anteprima prodotto",
    "Rifai foto",
    "Analizza con AI",
  ],
  "VisionAnalyzing.tsx": [
    "flex min-h-[200px] items-center justify-center rounded-[1.75rem] bg-slate-50",
    "relative flex h-16 w-16 items-center justify-center",
    "absolute h-16 w-16 animate-ping rounded-full bg-blue-200 opacity-30",
    "relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 shadow-lg",
    "L&apos;AI sta analizzando il prodotto",
    "Riconoscimento in corso...",
  ],
};

test("componenti: marcatori JSX identici e nessun collegamento al percorso venditori", () => {
  for (const [file, marcatori] of Object.entries(MARKERS)) {
    const sorgente = readFileSync(radice(`components/vision/${file}`), "utf8");

    for (const marcatore of marcatori) {
      assert.ok(
        UPLOADER.includes(marcatore),
        `marcatore assente dal uploader venditori: ${marcatore}`
      );
      assert.ok(
        sorgente.includes(marcatore),
        `marcatore assente da ${file}: ${marcatore}`
      );
    }

    assert.ok(
      !/from\s+["'][^"']*(product-assistant|components\/merchant|@\/lib\/auth)/.test(sorgente),
      `${file} importa il percorso venditori`
    );
  }

  assert.ok(
    !UPLOADER.includes("components/vision"),
    "il uploader venditori non deve importare i componenti condivisi in Fase 1"
  );
});

// ─── 6. Indipendenza e ancoraggio alla route ────────────────────────────────

test("indipendenza: core senza dipendenze dal percorso venditori", () => {
  const cartella = radice("lib/vision-core");
  const file = readdirSync(cartella).filter((f) => f.endsWith(".ts"));
  assert.deepStrictEqual(file.sort(), [
    "image-hash.ts",
    "image.ts",
    "index.ts",
    "prompt.ts",
    "suggestion.ts",
    "types.ts",
  ]);

  const importVietati = [
    [/from\s+["'][^"']*product-assistant/, "product-assistant"],
    [/from\s+["']next\/server["']/, "next/server"],
    [/from\s+["'][^"']*supabase[^"']*["']/, "Supabase"],
    [/from\s+["'][^"']*components\/merchant/, "components/merchant"],
    [/from\s+["'][^"']*@\/lib\/auth/, "@/lib/auth"],
  ];

  for (const nome of file) {
    const sorgente = readFileSync(`${cartella}/${nome}`, "utf8");
    for (const [motivo, etichetta] of importVietati) {
      assert.ok(!motivo.test(sorgente), `${nome} importa ${etichetta}`);
    }
    assert.ok(!/\bfetch\s*\(/.test(sorgente), `${nome} fa chiamate di rete`);
  }

  assert.ok(!/vision-core/.test(ROUTE), "la route venditori non deve importare il core");
});

test("ancoraggio: la route venditori conserva catena, prompt e parser originali", () => {
  assert.match(ROUTE, /const CROP_SIZE = 640;/);
  assert.match(ROUTE, /const NO_CROP_MAX_DIM = 1024;/);
  assert.match(ROUTE, /const JPEG_QUALITY = 80;/);
  assert.match(ROUTE, /\.resize\(CROP_SIZE, CROP_SIZE, \{/);
  assert.match(ROUTE, /position: "attention"/);
  assert.match(ROUTE, /\.resize\(NO_CROP_MAX_DIM, NO_CROP_MAX_DIM, \{ fit: "inside", withoutEnlargement: true \}\)/);
  assert.match(ROUTE, /\.jpeg\(\{ quality: JPEG_QUALITY \}\)/);
  assert.match(ROUTE, /buildVisionPrompt\(\)/);
  assert.match(ROUTE, /extractSuggestion\(/);
  assert.match(ROUTE, /from "@\/lib\/product-assistant\/prompts"/);
  assert.match(ROUTE, /from "@\/lib\/product-assistant\/vision-cache"/);
});
