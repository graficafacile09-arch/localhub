import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { isPinoTransactionalRoute } from "../components/assistant/pino-route";

/**
 * Pino widget — TASK 1 (trascinabile da chiuso) e TASK 2 (nascosto nei flussi
 * transazionali).
 *
 * Copre i 7 test obbligatori:
 *  1. trascinare Pino chiuso su mobile (touch)
 *  2. trascinare Pino chiuso su desktop (mouse)
 *  3. aprire/chiudere la chat dopo lo spostamento
 *  4. aggiungere un prodotto al carrello
 *  5. entrare nel checkout
 *  6. tornare alla homepage
 *  7. verificare che Pino ricompaia
 *
 * Il prodotto usato ha slug reale `nutella-400-g` ed è già usato da
 * guest-flow-ui.spec.ts per il gate della modalità ospite.
 */

const PRODOTTO = "nutella-400-g";
const POS_KEY = "incitta_pino_position_v1";

const WIDGET = '[data-testid="pino-widget"]';
const FLOATING = '[data-testid="pino-floating"]';
const CTA_CHAT = "Apri l'assistente AI di InCittà";
const TASTO_CHIUDI_CHAT = "Chiudi assistente";

type Riquadro = { x: number; y: number; width: number; height: number };
type Punto = { x: number; y: number };

/**
 * Riquadro visivo reale del widget: unione del contenitore e dei discendenti.
 * Su desktop la sagoma di Pino è scalata 2x e sporge dal contenitore, quindi il
 * bounding box del solo contenitore non descrive ciò che si vede a schermo.
 */
async function riquadroVisivo(page: Page, selector: string): Promise<Riquadro> {
  return page.locator(selector).evaluate((root) => {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;

    for (const elemento of [root, ...Array.from(root.querySelectorAll("*"))]) {
      const r = elemento.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }

    return { x: left, y: top, width: right - left, height: bottom - top };
  });
}

/**
 * Attende che il widget sia idratato e sistemato.
 *
 * L'HTML del widget arriva dal server, ma la posizione è applicata dal client:
 * prima dell'idratazione la transform non c'è e, su desktop, la sagoma scalata
 * 2x sporge dal bordo destro finché il clamp di mount non la riporta dentro.
 * Misurare prima di questo momento darebbe risultati incoerenti.
 */
async function attendiPinoPronto(page: Page): Promise<void> {
  await expect(page.locator(WIDGET)).toHaveAttribute("style", /translate3d/);
  await expect
    .poll(
      async () => {
        const box = await riquadroVisivo(page, WIDGET);
        const viewport = page.viewportSize();
        if (!viewport) return false;
        return (
          box.x >= -3 &&
          box.y >= -3 &&
          box.x + box.width <= viewport.width + 3 &&
          box.y + box.height <= viewport.height + 3
        );
      },
      { timeout: 15000 }
    )
    .toBe(true);
}

/**
 * Raggiunge /checkout in modalità ospite.
 *
 * La modalità ospite è una precondizione per arrivare al checkout (senza di
 * essa /checkout reindirizza al login): nell'ambiente automatizzato il cookie
 * può andare perso, quindi lo reimpostiamo e riproviamo. Se il checkout restasse
 * irraggiungibile il test fallirebbe comunque, perché l'ultimo controllo è
 * un'asserzione.
 */
async function vaiACheckout(page: Page, context: BrowserContext, baseURL?: string): Promise<void> {
  for (let tentativo = 0; tentativo < 3; tentativo++) {
    await page.goto("/checkout", { waitUntil: "domcontentloaded" });
    if (new URL(page.url()).pathname === "/checkout") return;

    if (baseURL) {
      await context.addCookies([{ name: "lh_guest", value: "1", url: baseURL }]);
    }
  }

  expect(new URL(page.url()).pathname).toBe("/checkout");
}

/** La chat di Pino è aperta quando è presente il suo tasto di chiusura. */
function chatAperta(page: Page) {
  return page.getByRole("button", { name: TASTO_CHIUDI_CHAT });
}

/** Punto di presa sul personaggio, spostato a destra per non finire sul fumetto. */
async function puntoPresa(page: Page): Promise<Punto> {
  const box = await page.locator(FLOATING).boundingBox();
  if (!box) throw new Error("Pino flottante non misurabile");
  return { x: box.x + box.width * 0.75, y: box.y + box.height * 0.6 };
}

/** Sposta il mouse lontano dal widget: evita che lo stato :hover alteri le misure. */
async function allontanaMouse(page: Page): Promise<void> {
  await page.mouse.move(4, 4);
  await page.waitForTimeout(120);
}

/**
 * Modalità ospite necessaria per raggiungere /checkout.
 *
 * Il percorso reale è il form nella pagina di acquisto (POST /api/auth/guest,
 * pulsante "ACQUISTA COME OSPITE"): lo eseguiamo e ne verifichiamo la risposta.
 * L'ambiente automatizzato non conserva però il cookie HttpOnly impostato dal
 * 303 in produzione (Cloudflare/Chromium): dopo aver verificato la risposta
 * reale, assicuriamo la modalità ospite scrivendo lo stesso cookie nel
 * contesto, così il test resta deterministico e verifica ciò che ci interessa,
 * cioè la visibilità di Pino.
 */
async function attivaOspite(
  page: Page,
  context: BrowserContext,
  baseURL?: string
): Promise<void> {
  await page.goto(`/prodotto/${PRODOTTO}/acquista`, { waitUntil: "domcontentloaded" });

  const bottone = page.getByRole("button", { name: /acquista come ospite/i });
  await expect(bottone).toBeVisible({ timeout: 15000 });

  const [attivazione] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/auth/guest") && r.request().method() === "POST"
    ),
    bottone.click(),
  ]);
  expect(attivazione.status()).toBe(303);

  if (baseURL) {
    await context.addCookies([{ name: "lh_guest", value: "1", url: baseURL }]);
  }

  // La pagina di acquisto non monta l'header: verifichiamo la modalità ospite
  // sulla homepage, dove l'indicatore OSPITE è nell'header.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("ospite-indicatore")).toBeVisible({ timeout: 15000 });
}

async function dragMouse(page: Page, from: Punto, to: Punto, passi = 16): Promise<void> {
  await page.mouse.move(Math.round(from.x), Math.round(from.y));
  await page.mouse.down();
  for (let i = 1; i <= passi; i++) {
    await page.mouse.move(
      Math.round(from.x + ((to.x - from.x) * i) / passi),
      Math.round(from.y + ((to.y - from.y) * i) / passi)
    );
  }
  await page.mouse.up();
}

/** Drag touch reale via CDP: Chromium genera Pointer Events con pointerType "touch". */
async function dragTouch(page: Page, from: Punto, to: Punto, passi = 16): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const x0 = Math.round(from.x);
  const y0 = Math.round(from.y);
  try {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: x0, y: y0, id: 1 }],
    });
    for (let i = 1; i <= passi; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: Math.round(x0 + ((to.x - x0) * i) / passi),
            y: Math.round(y0 + ((to.y - y0) * i) / passi),
            id: 1,
          },
        ],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await cdp.detach();
  }
}

function distanza(a: Riquadro, b: Riquadro): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Il riquadro visivo deve stare dentro la viewport (tolleranza per l'hover di Pino). */
async function attesaDentroSchermo(page: Page, tolleranza = 3): Promise<Riquadro> {
  const box = await riquadroVisivo(page, WIDGET);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("viewport non disponibile");

  expect(box.x, "bordo sinistro dentro lo schermo").toBeGreaterThanOrEqual(-tolleranza);
  expect(box.y, "bordo superiore dentro lo schermo").toBeGreaterThanOrEqual(-tolleranza);
  expect(box.x + box.width, "bordo destro dentro lo schermo").toBeLessThanOrEqual(
    viewport.width + tolleranza
  );
  expect(box.y + box.height, "bordo inferiore dentro lo schermo").toBeLessThanOrEqual(
    viewport.height + tolleranza
  );
  return box;
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK 1 — trascinamento del widget chiuso
// ─────────────────────────────────────────────────────────────────────────────

// Il banner cookie è ancorato in basso (z-[60], stesso livello del widget ma
// dopo nel DOM): su mobile copre l'angolo di Pino e intercetta i pointer
// nell'area del widget finché è visibile. Non c'entra con questa feature, quindi
// accettiamo l'informativa prima di ogni test (come farebbe un utente reale).
test.beforeEach(async ({ context, baseURL }) => {
  if (baseURL) {
    await context.addCookies([
      { name: "incitta_cookie_notice_v1", value: "1", url: baseURL },
    ]);
  }
});

test.describe("Pino chiuso trascinabile — mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("1) drag touch: si sposta, resta a schermo e ricorda la posizione", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(WIDGET)).toBeVisible();
    await attendiPinoPronto(page);

    // Il widget deve neutralizzare lo scroll della pagina durante il drag touch.
    const touchAction = await page
      .locator(WIDGET)
      .evaluate((el) => getComputedStyle(el).touchAction);
    expect(touchAction).toBe("none");

    const partenza = await puntoPresa(page);
    const prima = await attesaDentroSchermo(page);

    await dragTouch(page, partenza, { x: 90, y: 320 });

    const dopo = await attesaDentroSchermo(page);
    expect(distanza(prima, dopo), "Pino si è spostato").toBeGreaterThan(40);

    // Oltre il bordo: il clamp impedisce di uscire dallo schermo.
    const partenza2 = await puntoPresa(page);
    await dragTouch(page, partenza2, { x: -400, y: -600 });
    await attesaDentroSchermo(page);

    // La posizione è salvata e ripristinata dopo un reload (stessa sessione/altra).
    const salvata = await page.evaluate((k) => window.localStorage.getItem(k), POS_KEY);
    expect(salvata, "posizione persistita in localStorage").not.toBeNull();
    const pos = JSON.parse(salvata as string) as { x: number; y: number };
    expect(Math.abs(pos.x) + Math.abs(pos.y), "offset non nullo").toBeGreaterThan(20);

    const primaDelReload = await riquadroVisivo(page, WIDGET);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(WIDGET)).toBeVisible();

    const dopoIlReload = await riquadroVisivo(page, WIDGET);
    expect(
      Math.abs(dopoIlReload.x - primaDelReload.x),
      "x ripristinata dal salvataggio"
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(dopoIlReload.y - primaDelReload.y),
      "y ripristinata dal salvataggio"
    ).toBeLessThanOrEqual(2);
  });
});

test.describe("Pino chiuso trascinabile — desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("2) drag mouse: si sposta, resta a schermo e ricorda la posizione", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(WIDGET)).toBeVisible();
    await attendiPinoPronto(page);

    const partenza = await puntoPresa(page);
    const prima = await attesaDentroSchermo(page);

    await dragMouse(page, partenza, { x: 240, y: 300 });
    await allontanaMouse(page);

    const dopo = await attesaDentroSchermo(page);
    expect(distanza(prima, dopo), "Pino si è spostato").toBeGreaterThan(40);

    // Clamp contro il bordo opposto: drag abbondantemente fuori viewport.
    const partenza2 = await puntoPresa(page);
    await dragMouse(page, partenza2, { x: 1600, y: 1000 });
    await allontanaMouse(page);
    await attesaDentroSchermo(page);

    const salvata = await page.evaluate((k) => window.localStorage.getItem(k), POS_KEY);
    expect(salvata, "posizione persistita in localStorage").not.toBeNull();

    // 3) dopo lo spostamento la chat si apre e si chiude, senza toccare la posizione.
    const posizionePrima = await riquadroVisivo(page, WIDGET);
    await page.getByRole("button", { name: CTA_CHAT }).click();
    await expect(chatAperta(page)).toBeVisible();

    await chatAperta(page).click();
    await expect(chatAperta(page)).toHaveCount(0);

    await expect(page.locator(WIDGET)).toBeVisible();
    const posizioneDopo = await riquadroVisivo(page, WIDGET);
    expect(Math.abs(posizioneDopo.x - posizionePrima.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(posizioneDopo.y - posizionePrima.y)).toBeLessThanOrEqual(2);

    // Un tap sul personaggio (non un drag) riapre la chat.
    const punto = await puntoPresa(page);
    await page.mouse.click(punto.x, punto.y);
    await expect(chatAperta(page)).toBeVisible();
    await chatAperta(page).click();
    await expect(chatAperta(page)).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TASK 2 — Pino nascosto nei flussi transazionali
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Pino nei flussi transazionali", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("matcher: nasconde solo carrello/checkout/pagamento/conferma ordine", () => {
    const transazionali = [
      "/carrello",
      "/carrello/",
      "/checkout",
      "/prodotto/nutella-400-g/acquista",
      "/prodotto/nutella-400-g/acquista/ritiro",
      "/prodotto/nutella-400-g/acquista/spedizione",
      "/ordini/conferma/abc-123",
      "/ordini/conferma/abc-123/recesso",
    ];
    const normali = [
      "/",
      "/negozi",
      "/ricerca",
      "/prodotto/nutella-400-g",
      "/ordini",
      "/cliente/ordini",
      "/merchant/demo/ordini",
      "/assistant",
    ];

    for (const rotta of transazionali) {
      expect(isPinoTransactionalRoute(rotta), `${rotta} deve nascondere Pino`).toBe(true);
    }
    for (const rotta of normali) {
      expect(isPinoTransactionalRoute(rotta), `${rotta} NON deve nascondere Pino`).toBe(false);
    }
  });

  test("4-7) carrello e checkout nascondono Pino, la homepage lo fa ricomparire", async ({
    page,
    context,
    baseURL,
  }) => {
    // Sposta Pino: la posizione deve sopravvivere all'intero flusso.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await attendiPinoPronto(page);
    const partenza = await puntoPresa(page);
    await dragMouse(page, partenza, { x: 300, y: 320 });
    await allontanaMouse(page);
    const posizioneSpostata = await riquadroVisivo(page, WIDGET);

    // 4) prodotto (rotta NON transazionale): Pino visibile, poi aggiunta al carrello.
    await attivaOspite(page, context, baseURL);
    await page.goto(`/prodotto/${PRODOTTO}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(WIDGET)).toBeVisible();
    await page.getByRole("button", { name: /Aggiungi .* al carrello/i }).click();
    await expect(page.getByText("Aggiunto al carrello")).toBeVisible();
    await expect(page.getByRole("link", { name: /Vai al carrello/i })).toBeVisible();

    // 5) carrello: Pino sparisce.
    await page.goto("/carrello", { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe("/carrello");
    await expect(page.locator(WIDGET)).toHaveCount(0);
    await expect(chatAperta(page)).toHaveCount(0);

    // 5b) checkout (pagamento): Pino sparisce.
    await vaiACheckout(page, context, baseURL);
    await expect(page.locator(WIDGET)).toHaveCount(0);

    // 5c) pagamento del flusso acquisto immediato: Pino sparisce.
    await page.goto(`/prodotto/${PRODOTTO}/acquista/ritiro`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(WIDGET)).toHaveCount(0);

    // 5d) conferma ordine: la pagina resta sulla rotta e Pino sparisce.
    await page.goto("/ordini/conferma/ordine-inesistente", { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe("/ordini/conferma/ordine-inesistente");
    await expect(page.getByText("Ordine non trovato.")).toBeVisible();
    await expect(page.locator(WIDGET)).toHaveCount(0);

    // 6) ritorno alla homepage
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // 7) Pino ricompare, nella posizione salvata.
    await expect(page.locator(WIDGET)).toBeVisible();
    await attendiPinoPronto(page);
    const posizioneFinale = await riquadroVisivo(page, WIDGET);
    expect(Math.abs(posizioneFinale.x - posizioneSpostata.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(posizioneFinale.y - posizioneSpostata.y)).toBeLessThanOrEqual(2);
  });
});
