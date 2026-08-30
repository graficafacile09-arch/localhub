import { test, expect } from "@playwright/test";

/**
 * Suite automatica della NUOVA ricerca semantica di InCittà.
 *
 * Esegue le verifiche contro l'endpoint reale `/api/search` (ricerca normale
 * 🔎) e, per la UX, contro la pagina `/ricerca` con il pulsante ✨ AI.
 *
 * I dati asseriti riflettono lo stato del DB locale/test: il caso principale
 * è "Dott. Bianchi Otorino" (data.tipo_attivita="medico",
 * data.servizi_strutturati=[{nome:"pulizia condotto uditivo", prezzo:35,...}]).
 *
 * Avvio:
 *   BASE_URL=http://localhost:3999 npx playwright test tests/ricerca.spec.ts
 */

// ─── Helper ──────────────────────────────────────────────────────────────────

async function cerca(request: import("@playwright/test").APIRequestContext, query: string) {
  const res = await request.post("/api/search", { data: { query } });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

function negozi(j: { negozi?: { nome: string }[] }) {
  return (j.negozi ?? []).map((n) => n.nome);
}
function prodotti(j: { prodotti?: { nome: string }[] }) {
  return (j.prodotti ?? []).map((p) => p.nome);
}

const DOTT = "Dott. Bianchi Otorino";
const NOME_MEDICO = /Bianchi/i;

// ─── 1-8. Caso medico obbligatorio + niente falsi posivi alimentari ─────────

for (const [q, desc] of [
  ["otorino", "nome esatto"],
  ["dottore", "sinonimo profilo medico"],
  ["medico", "tipo_attivita"],
  ["otorinolaringoiatra", "sinonimo profilo medico"],
  ["specialista orecchie", "linguaggio naturale"],
  ["problemi alle orecchie", "frase naturale"],
  ["problemi uditivi", "frase naturale"],
  ["visita alle orecchie", "frase naturale"],
  ["pulizia orecchie", "frase naturale"],
  ["pulizia condotto uditivo", "nome servizio strutturato"],
]) {
  test(`🔎 "${q}" trova ${DOTT} (${desc})`, async ({ request }) => {
    const j = await cerca(request, q);
    expect(negozi(j).some((n) => NOME_MEDICO.test(n))).toBe(true);
  });
}

test('🔎 "problemi alle orecchie" NON restituisce prodotti alimentari casuali', async ({ request }) => {
  const j = await cerca(request, "problemi alle orecchie");
  // Negozio medico presente.
  expect(negozi(j).some((n) => NOME_MEDICO.test(n))).toBe(true);
  // Nessun falso positivo alimentare/consumer.
  const spazzatura = prodotti(j).filter((p) =>
    /cipolla|cornetto|latte|mouse|orologio|anguria|cola/i.test(p)
  );
  expect(spazzatura).toHaveLength(0);
});

test('🔎 "pulizia orecchie" → risultato medico pertinente senza spazzatura', async ({ request }) => {
  const j = await cerca(request, "pulizia orecchie");
  expect(negozi(j).some((n) => NOME_MEDICO.test(n))).toBe(true);
  const spazzatura = prodotti(j).filter((p) => /mouse|orologio|anguria/i.test(p));
  expect(spazzatura).toHaveLength(0);
});

// ─── 8b-9. Alimentari comuni: nessun falso positivo medico; prodotto corretto ─

test("🔎 panifici: trova Panificio Rossi e NON finti negozi medici", async ({ request }) => {
  const j = await cerca(request, "panificio");
  const nomiN = negozi(j);
  expect(nomiN).toContain("Panificio Rossi");
  expect(nomiN.some((n) => NOME_MEDICO.test(n))).toBe(false);
});

test("🔎 prodotto esistente: 'pane' restituisce Pane Casereccio e risultati pertinenti", async ({ request }) => {
  const j = await cerca(request, "pane");
  const prod = prodotti(j);
  expect(prod).toContain("Pane Casereccio 1,5 kg");
  // Nessun prodotto palesemente fuori contesto (catalogo non diluito a caso).
  const spazzatura = prod.filter((p) => /mouse|orologio|anguria|watch/i.test(p));
  expect(spazzatura).toHaveLength(0);
});

test('🔎 "pane" non restituisce l\'intero catalogo', async ({ request }) => {
  const j = await cerca(request, "pane");
  expect(j.total).toBeLessThan(8);
});

// ─── 10-12. Multi-parola, refusi, accenti, senza risultati ───────────────────

test("🔎 refuso 'panifcio' trova Panificio Rossi (tolleranza errore di battitura)", async ({ request }) => {
  const j = await cerca(request, "panifcio");
  expect(negozi(j)).toContain("Panificio Rossi");
});

test("🔎 accento 'caffè' trova prodotti/titoli pertinenti (normalizzazione accenti)", async ({ request }) => {
  const j = await cerca(request, "caffè");
  const prod = prodotti(j);
  // Devono esserci risultati pertinenti (nessun dump del catalogo).
  expect(prod.length).toBeGreaterThan(0);
  expect(prod.every((p) => p.toLowerCase().includes("caff"))).toBe(true);
});

test("🔎 query senza risultati → nessun risultato spazzatura", async ({ request }) => {
  const j = await cerca(request, "zxqw bizarria9");
  expect(negozi(j)).toHaveLength(0);
  expect(prodotti(j)).toHaveLength(0);
});

// ─── 13. UX: barra di ricerca conserva la query + pulsante ✨ AI apre il pannello ─

test("UX barra: la query resta nel campo e ✨ apre l'Assistente (pannello non vuoto)", async ({ page }) => {
  await page.goto("/ricerca?q=dottore");
  const input = page.getByRole("textbox", { name: "Cerca" }).first();
  await expect(input).toHaveValue("dottore");
  // Pulsante AI (Sparkles) presente nella barra di ricerca.
  const aiBtn = page.getByRole("button", { name: "Chiedi all" });
  await expect(aiBtn.first()).toBeVisible();
  // Click → pannello Assistente si apre con titolo.
  await aiBtn.click();
  await expect(page.getByText("Assistente AI", { exact: false }).first()).toBeVisible();
});