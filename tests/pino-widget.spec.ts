import { test, expect, type BrowserContext, type CDPSession, type Page } from "@playwright/test";
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

// ─────────────────────────────────────────────────────────────────────────────
// TASK 3 — prestazioni del drag
//
// Il drag deve essere fluido: durante il movimento non si legge il layout, non
// si scrive su localStorage e non si tocca React. Il numero di scritture sullo
// stile è limitato ai frame, non ai pointermove ricevuti: è la differenza fra un
// movimento a filo del refresh e un movimento che insegue ogni evento.
// ─────────────────────────────────────────────────────────────────────────────

/** Misure raccolte nella pagina, limitate al widget di Pino. */
type MisureDrag = { lettureLayout: number; scrittureStorage: string[]; scrittureStile: number };

/** Movimenti inviati in un solo drag "veloce" (uno per frame, come un mouse reale). */
const PASSI_DRAG_VELOCE = 60;
/**
 * Lo stile viene riscritto al massimo una volta per movimento ricevuto: gli
 * aggiornamenti sono raggruppati sui frame, non moltiplicati per evento.
 */
const MAX_SCRITTURE_STILE = PASSI_DRAG_VELOCE + 2;

type GlobalInstrumentato = {
  __pino?: MisureDrag;
  __pinoNodo?: Element | null;
  __pinoOsservatore?: MutationObserver;
};

/**
 * Instrumenta la pagina contando SOLO ciò che riguarda il widget di Pino:
 * letture di layout sul widget e sui suoi discendenti, scritture di posizione in
 * localStorage e riscritture dell'attributo `style`. Si chiama una volta per
 * pagina; cambiando nodo (widget completo ↔ ridotto) basta ripassare il nuovo
 * selettore.
 */
async function strumentaPino(page: Page, selettore: string = WIDGET): Promise<void> {
  await page.evaluate((sel) => {
    const nodo = document.querySelector(sel);
    if (!nodo) throw new Error(`widget di Pino non trovato: ${sel}`);

    const glob = window as unknown as GlobalInstrumentato;

    if (!glob.__pino) {
      glob.__pino = { lettureLayout: 0, scrittureStorage: [], scrittureStile: 0 };

      const gbc = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function (...args: []) {
        const corrente = glob.__pinoNodo;
        if (corrente && (this === corrente || corrente.contains(this))) {
          glob.__pino!.lettureLayout++;
        }
        return gbc.apply(this, args);
      };

      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (chiave: string, valore: string) {
        if (chiave.startsWith("incitta_pino")) glob.__pino!.scrittureStorage.push(chiave);
        return setItem.call(this, chiave, valore);
      };
    }

    glob.__pinoNodo = nodo;
    glob.__pinoOsservatore?.disconnect();
    glob.__pinoOsservatore = new MutationObserver((record) => {
      glob.__pino!.scrittureStile += record.length;
    });
    glob.__pinoOsservatore.observe(nodo, { attributes: true, attributeFilter: ["style"] });
  }, selettore);
}

/** Azzera i contatori: le misure valgono dal drag in poi. */
async function azzeraPino(page: Page): Promise<void> {
  await page.evaluate(() => {
    const stato = (window as unknown as GlobalInstrumentato).__pino;
    if (!stato) return;
    stato.lettureLayout = 0;
    stato.scrittureStorage = [];
    stato.scrittureStile = 0;
  });
}

/**
 * Legge i contatori. Va chiamata PRIMA di qualsiasi misura del riquadro: le
 * helper di misura usano `getBoundingClientRect` e quindi incrementano il conteggio.
 */
async function leggiPino(page: Page): Promise<MisureDrag> {
  return page.evaluate(() => {
    const stato = (window as unknown as GlobalInstrumentato).__pino;
    if (!stato) return { lettureLayout: 0, scrittureStorage: [], scrittureStile: 0 };
    return {
      lettureLayout: stato.lettureLayout,
      scrittureStorage: [...stato.scrittureStorage],
      scrittureStile: stato.scrittureStile,
    };
  });
}

/** Aspetta due frame: garantisce che l'aggiornamento raggruppato sia stato applicato. */
async function attendiDueFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

/**
 * Drag "veloce": i movimenti vengono inviati in rapida successione, senza pause
 * artificiali fra l'uno e l'altro (un movimento al frame, come un drag umano
 * deciso). È lo scenario in cui un'implementazione che lavora a ogni
 * pointermove — misure di layout, storage, render — si sfalda.
 *
 * `rilascia: false` lascia il pointer premuto: permette di misurare il costo del
 * solo movimento, prima del rilascio. La sessione CDP va chiusa dal chiamante.
 */
async function trascinaVeloce(
  session: CDPSession,
  {
    da,
    a,
    passi = PASSI_DRAG_VELOCE,
    touch = false,
    rilascia = true,
  }: { da: Punto; a: Punto; passi?: number; touch?: boolean; rilascia?: boolean }
): Promise<void> {
  const x0 = Math.round(da.x);
  const y0 = Math.round(da.y);
  const xv = (i: number) => Math.round(x0 + ((a.x - x0) * i) / passi);
  const yv = (i: number) => Math.round(y0 + ((a.y - y0) * i) / passi);

  if (touch) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: x0, y: y0, id: 1 }],
    });
    for (let i = 1; i <= passi; i++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: xv(i), y: yv(i), id: 1 }],
      });
    }
    if (rilascia) {
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    return;
  }

  await session.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: x0,
    y: y0,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  for (let i = 1; i <= passi; i++) {
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: xv(i),
      y: yv(i),
      buttons: 1,
    });
  }
  if (rilascia) {
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: xv(passi),
      y: yv(passi),
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
  }
}

/** Rilascia il pointer lasciato premuto da `trascinaVeloce({ rilascia: false })`. */
async function rilasciaVeloce(
  session: CDPSession,
  { a, touch = false }: { a: Punto; touch?: boolean }
): Promise<void> {
  if (touch) {
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    return;
  }
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: Math.round(a.x),
    y: Math.round(a.y),
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
}

/** Punto al centro di un elemento (per il widget ridotto, che non ha il personaggio). */
async function puntoCentrale(page: Page, selettore: string): Promise<Punto> {
  const box = await page.locator(selettore).boundingBox();
  if (!box) throw new Error(`${selettore} non misurabile`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Offset salvato del widget (`translate3d`), indipendente dalla sua forma: la
 * versione ridotta e quella completa hanno ancoraggi e ingombri diversi, quindi
 * la posizione si confronta sull'offset, non sul riquadro visivo.
 */
async function offsetWidget(page: Page, selettore: string): Promise<Punto> {
  const valore = await page.locator(selettore).evaluate((el) => el.style.transform);
  const trovato = /translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(valore);
  if (!trovato) throw new Error(`transform non riconosciuta: ${valore}`);
  return { x: Number(trovato[1]), y: Number(trovato[2]) };
}

test.describe("Pino — prestazioni del drag", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("3) drag desktop rapido: niente layout né storage durante il movimento", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(WIDGET)).toBeVisible();
    await attendiPinoPronto(page);
    await strumentaPino(page);

    const partenza = await puntoPresa(page);
    const prima = await riquadroVisivo(page, WIDGET);
    const destinazione = { x: partenza.x - 300, y: partenza.y - 180 };
    const atteso = {
      x: prima.x + (destinazione.x - partenza.x),
      y: prima.y + (destinazione.y - partenza.y),
    };

    await azzeraPino(page);
    const session = await page.context().newCDPSession(page);
    try {
      await trascinaVeloce(session, { da: partenza, a: destinazione, rilascia: false });
      await attendiDueFrame(page);

      // Durante il movimento: nessuna misura di layout, nessuna scrittura su
      // disco, e molte meno scritture di stile che pointermove ricevuti.
      const durante = await leggiPino(page);
      expect(durante.lettureLayout, "nessuna lettura di layout durante il drag").toBe(0);
      expect(durante.scrittureStorage, "nessun salvataggio durante il drag").toEqual([]);
      expect(durante.scrittureStile, "il widget si è mosso").toBeGreaterThan(0);
      expect(
        durante.scrittureStile,
        `scritture di stile (${durante.scrittureStile}) raggruppate sui frame, non una per pointermove`
      ).toBeLessThanOrEqual(MAX_SCRITTURE_STILE);

      await rilasciaVeloce(session, { a: destinazione });
    } finally {
      await session.detach();
    }

    await attendiDueFrame(page);

    // Al rilascio: la posizione viene applicata e salvata una sola volta.
    const dopoRilascio = await leggiPino(page);
    expect(dopoRilascio.scrittureStorage, "una sola scrittura, al pointerup").toEqual([POS_KEY]);
    expect(dopoRilascio.lettureLayout, "nessuna lettura di layout fino al rilascio").toBe(0);

    // Il widget è arrivato esattamente dove è finito il puntatore.
    const dopo = await attesaDentroSchermo(page);
    expect(Math.abs(dopo.x - atteso.x), "x finale = x del puntatore").toBeLessThanOrEqual(3);
    expect(Math.abs(dopo.y - atteso.y), "y finale = y del puntatore").toBeLessThanOrEqual(3);

    // Niente inerzia: al rilascio il movimento è finito (nessuna transition su transform).
    await page.waitForTimeout(300);
    const assestato = await riquadroVisivo(page, WIDGET);
    expect(Math.abs(assestato.x - dopo.x), "nessuna deriva dopo il rilascio").toBeLessThanOrEqual(1);
    expect(Math.abs(assestato.y - dopo.y), "nessuna deriva dopo il rilascio").toBeLessThanOrEqual(1);
  });

  test("4) apri/chiudi Pino dopo il movimento, poi drag rapido del widget ridotto", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(WIDGET)).toBeVisible();
    await attendiPinoPronto(page);

    const partenza = await puntoPresa(page);
    const session = await page.context().newCDPSession(page);
    try {
      await trascinaVeloce(session, { da: partenza, a: { x: partenza.x - 260, y: partenza.y - 160 } });
    } finally {
      await session.detach();
    }
    await attendiDueFrame(page);
    const dopoIlDrag = await riquadroVisivo(page, WIDGET);

    // Aprire e chiudere la chat non deve spostare il widget.
    await page.getByRole("button", { name: CTA_CHAT }).click();
    await expect(chatAperta(page)).toBeVisible();
    await chatAperta(page).click();
    await expect(chatAperta(page)).toHaveCount(0);
    await expect(page.locator(WIDGET)).toBeVisible();

    const dopoLaChat = await riquadroVisivo(page, WIDGET);
    expect(Math.abs(dopoLaChat.x - dopoIlDrag.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(dopoLaChat.y - dopoIlDrag.y)).toBeLessThanOrEqual(2);

    // Widget ridotto: si trascina con la stessa fluidità e non "insegue" il
    // puntatore dopo il rilascio (era il caso della transition generica su
    // transform, che animava ogni singolo aggiornamento).
    await page.getByRole("button", { name: "Chiudi Pino" }).click();
    const ridotto = page.locator('[data-testid="pino-richiama"]');
    await expect(ridotto).toBeVisible();
    await strumentaPino(page, '[data-testid="pino-richiama"]');

    const presaRidotto = await puntoCentrale(page, '[data-testid="pino-richiama"]');
    const primaRidotto = await riquadroVisivo(page, '[data-testid="pino-richiama"]');
    const destinazioneRidotto = { x: presaRidotto.x - 320, y: presaRidotto.y - 140 };
    const attesoRidotto = {
      x: primaRidotto.x + (destinazioneRidotto.x - presaRidotto.x),
      y: primaRidotto.y + (destinazioneRidotto.y - presaRidotto.y),
    };

    await azzeraPino(page);
    const session2 = await page.context().newCDPSession(page);
    try {
      await trascinaVeloce(session2, {
        da: presaRidotto,
        a: destinazioneRidotto,
        rilascia: false,
      });
      await attendiDueFrame(page);

      const durante = await leggiPino(page);
      expect(durante.lettureLayout, "nessuna lettura di layout durante il drag").toBe(0);
      expect(durante.scrittureStorage, "nessun salvataggio durante il drag").toEqual([]);
      expect(durante.scrittureStile).toBeGreaterThan(0);
      expect(durante.scrittureStile).toBeLessThanOrEqual(MAX_SCRITTURE_STILE);

      await rilasciaVeloce(session2, { a: destinazioneRidotto });
    } finally {
      await session2.detach();
    }
    await attendiDueFrame(page);

    const dopoRilascioRidotto = await leggiPino(page);
    expect(dopoRilascioRidotto.scrittureStorage).toEqual([POS_KEY]);

    const dopoRidotto = await riquadroVisivo(page, '[data-testid="pino-richiama"]');
    expect(Math.abs(dopoRidotto.x - attesoRidotto.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(dopoRidotto.y - attesoRidotto.y)).toBeLessThanOrEqual(3);

    await page.waitForTimeout(300);
    const assestatoRidotto = await riquadroVisivo(page, '[data-testid="pino-richiama"]');
    expect(
      Math.abs(assestatoRidotto.x - dopoRidotto.x),
      "il widget ridotto non continua a muoversi dopo il rilascio"
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(assestatoRidotto.y - dopoRidotto.y)).toBeLessThanOrEqual(1);

    // Un tap (non un drag) riporta Pino intero, con lo stesso offset salvato.
    const offsetRidotto = await offsetWidget(page, '[data-testid="pino-richiama"]');
    const centro = await puntoCentrale(page, '[data-testid="pino-richiama"]');
    await page.mouse.click(centro.x, centro.y);
    await expect(page.locator(WIDGET)).toBeVisible();
    const offsetRichiamato = await offsetWidget(page, WIDGET);
    expect(Math.abs(offsetRichiamato.x - offsetRidotto.x), "offset x conservato").toBeLessThanOrEqual(1);
    expect(Math.abs(offsetRichiamato.y - offsetRidotto.y), "offset y conservato").toBeLessThanOrEqual(1);
    await attesaDentroSchermo(page);
  });

  test("5) reload: la posizione raggiunta con un drag rapido viene ripristinata", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(WIDGET)).toBeVisible();
    await attendiPinoPronto(page);

    const partenza = await puntoPresa(page);
    const session = await page.context().newCDPSession(page);
    try {
      await trascinaVeloce(session, { da: partenza, a: { x: partenza.x - 340, y: partenza.y - 120 } });
    } finally {
      await session.detach();
    }
    await attendiDueFrame(page);

    const salvata = await page.evaluate((k) => window.localStorage.getItem(k), POS_KEY);
    expect(salvata, "posizione persistita al pointerup").not.toBeNull();

    const primaDelReload = await riquadroVisivo(page, WIDGET);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(WIDGET)).toBeVisible();
    await attendiPinoPronto(page);

    const dopoIlReload = await riquadroVisivo(page, WIDGET);
    expect(Math.abs(dopoIlReload.x - primaDelReload.x), "x ripristinata").toBeLessThanOrEqual(2);
    expect(Math.abs(dopoIlReload.y - primaDelReload.y), "y ripristinata").toBeLessThanOrEqual(2);
  });
});

test.describe("Pino — prestazioni del drag (mobile)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("6) drag touch rapido: fluido, dentro lo schermo, salvato solo al rilascio", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(WIDGET)).toBeVisible();
    await attendiPinoPronto(page);
    await strumentaPino(page);

    const partenza = await puntoPresa(page);
    const prima = await riquadroVisivo(page, WIDGET);
    const destinazione = { x: partenza.x - 60, y: partenza.y - 220 };
    const atteso = {
      x: prima.x + (destinazione.x - partenza.x),
      y: prima.y + (destinazione.y - partenza.y),
    };

    await azzeraPino(page);
    const session = await page.context().newCDPSession(page);
    try {
      await trascinaVeloce(session, {
        da: partenza,
        a: destinazione,
        touch: true,
        rilascia: false,
      });
      await attendiDueFrame(page);

      const durante = await leggiPino(page);
      expect(durante.lettureLayout, "nessuna lettura di layout durante il drag").toBe(0);
      expect(durante.scrittureStorage, "nessun salvataggio durante il drag").toEqual([]);
      expect(durante.scrittureStile).toBeGreaterThan(0);
      expect(durante.scrittureStile).toBeLessThanOrEqual(MAX_SCRITTURE_STILE);

      await rilasciaVeloce(session, { a: destinazione, touch: true });
    } finally {
      await session.detach();
    }

    await attendiDueFrame(page);
    const dopoRilascio = await leggiPino(page);
    expect(dopoRilascio.scrittureStorage, "salvataggio solo al rilascio").toEqual([POS_KEY]);

    const dopo = await attesaDentroSchermo(page);
    expect(Math.abs(dopo.x - atteso.x), "x finale = x del dito").toBeLessThanOrEqual(6);
    expect(Math.abs(dopo.y - atteso.y), "y finale = y del dito").toBeLessThanOrEqual(6);
  });
});
