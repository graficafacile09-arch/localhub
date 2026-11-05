import assert from "node:assert/strict";
import test from "node:test";

import { chatConAssistente } from "../lib/assistente/index.ts";
import { validaToolParams } from "../lib/assistente/tools.ts";

// ─── Budget esplicito nel percorso REALE ────────────────────────────────────
//
// Il test attraversa orchestratore → costruzione parametri → contratto dei tool
// → `searchProducts` → Search Service. Gemini è simulato per dimostrare che il
// modello non può introdurre né togliere un vincolo; Supabase è il client finto
// dell'hook di test, che registra tabelle e filtri `gte`/`lte` realmente usati.

process.env.GEMINI_API_KEY = "test-budget-pino";
process.env.GEMINI_MODEL = "gemini-test";

let pianoGemini = null;

globalThis.fetch = async (url, init) => {
  assert.match(String(url), /generativelanguage\.googleapis\.com/);
  assert.equal(init?.method, "POST");
  const corpo = JSON.parse(init.body);
  assert.ok(Array.isArray(corpo.contents) && corpo.contents.length > 0);
  const piano = pianoGemini ?? {
    surface: "products",
    intent: "food",
    query: "pasta",
    terms: ["pasta"],
    exclusions: [],
    minPrice: null,
    maxPrice: null,
    city: null,
    openNow: false,
    confidence: "alta",
  };
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(piano) }] } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
};

const spia = () => globalThis.__pinoSpiaSupabase;

function azzeraSpia() {
  const s = spia();
  if (!s) return;
  s.tabelle.length = 0;
  s.selezioni.length = 0;
  s.filtri.length = 0;
}

function rispondi(testo) {
  return chatConAssistente([{ role: "user", content: testo }]);
}

function filtriPrezzo() {
  return (spia()?.filtri ?? []).filter((f) => f.colonna === "prezzo");
}

function pianoPasta(limiti) {
  return {
    surface: "products",
    intent: "food",
    query: "pasta",
    terms: ["pasta"],
    exclusions: [],
    city: null,
    openNow: false,
    confidence: "alta",
    ...limiti,
  };
}

test("lo zero esplicito non viene scartato dal contratto dei parametri", () => {
  const esito = validaToolParams("searchProducts", { maxPrice: 0, prezzoRigido: true });
  assert.deepEqual(esito.params, { maxPrice: 0, prezzoRigido: true });
  assert.deepEqual(esito.problemi, []);
});

test("«entro 0 euro»: tetto zero vincolante, nessun prodotto positivo", async () => {
  // Il modello prova ad allargare il tetto: non deve riuscirci.
  pianoGemini = pianoPasta({ minPrice: null, maxPrice: 999 });
  azzeraSpia();

  const r = await rispondi("Cerco pasta entro 0 euro");

  assert.equal(r.prodotti.length, 0);
  assert.match(r.risposta, /fino a €0/);
  assert.doesNotMatch(r.risposta, /tra €0 e €0/);
  assert.equal(filtriPrezzo().length, 0, "nessuna query di prodotti deve partire");
  assert.ok(
    !spia().tabelle.includes("prodotti"),
    "il corto circuito a monte evita la ricerca prodotti"
  );
});

test("«senza budget»: lo zero inventato dal modello non diventa un limite", async () => {
  // Il modello restituisce 0/0 pur non essendoci alcun budget nella richiesta.
  pianoGemini = pianoPasta({ minPrice: 0, maxPrice: 0 });
  azzeraSpia();

  const r = await rispondi("Cerco pasta senza budget");

  assert.doesNotMatch(r.risposta, /€\s*0/);
  assert.doesNotMatch(r.risposta, /tra €0 e €0/);
  assert.equal(filtriPrezzo().length, 0, "nessun filtro economico deve essere applicato");
  assert.ok(
    spia().tabelle.includes("prodotti"),
    "la ricerca prodotti resta attiva, senza budget"
  );
});

const CASI_POSITIVI = [
  ["Cerco pasta sotto 5 euro", 5, null],
  ["Cerco pasta fino a 30 euro", 30, null],
  ["Cerco pasta tra 5 e 15 euro", 15, 5],
  ["Cerco pasta sopra 10 euro", null, 10],
];

for (const [richiesta, maxAtteso, minAtteso] of CASI_POSITIVI) {
  test(`${richiesta} → limiti deterministici ${minAtteso ?? "-"} / ${maxAtteso ?? "-"}`, async () => {
    // Valori ostili dal modello: devono essere sostituiti dall'estrazione.
    pianoGemini = pianoPasta({ minPrice: 1, maxPrice: 1 });
    azzeraSpia();

    const r = await rispondi(richiesta);

    assert.ok(r.prodotti.length === 0);
    const filtri = filtriPrezzo();
    if (maxAtteso != null) {
      assert.ok(
        filtri.some((f) => f.tipo === "lte" && Number(f.valore) === maxAtteso),
        `manca il tetto ${maxAtteso}: ${JSON.stringify(filtri)}`
      );
    } else {
      assert.ok(!filtri.some((f) => f.tipo === "lte"), "nessun tetto atteso");
    }
    if (minAtteso != null) {
      assert.ok(
        filtri.some((f) => f.tipo === "gte" && Number(f.valore) === minAtteso),
        `manca la soglia ${minAtteso}: ${JSON.stringify(filtri)}`
      );
    } else {
      assert.ok(!filtri.some((f) => f.tipo === "gte"), "nessuna soglia attesa");
    }
  });
}
