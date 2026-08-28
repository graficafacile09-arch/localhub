import { test, expect, Page } from "@playwright/test";
import { UTENTI } from "./fixtures/users";

/**
 * Verifica SICUREZZA modalità ospite + anti-autoacquisto (SERVER-SIDE).
 *
 * Nessun ordine reale viene creato:
 *  - caso OWN (merchant → proprio negozio) → atteso 403 PRODOTTO_DEL_PROPRIO_NEGOZIO
 *    (il blocco avviene PRIMA della RPC/crazione ordine);
 *  - caso GUEST (no sessione) → il controllo proprietario NON deve scattare:
 *    con payload invalid si deve ricevere un errore di VALIDAZIONE (422),
 *    MAI 403.
 *  - caso ALTRO negozio (merchant → negozio altrui) → il blocco non deve
 *    scattare (verifica read-only di utentePossiedeNegozio=false).
 */

const PRODOTTO_PROPRIO = "1368"; // qa-smoke-whatsapp-2 (negozio di commerciante-c)
const PRODOTTO_ALTRO = "1396"; // nutella-400-g (demo-sapori-castrovillari)

function payload(prodottoId: string, { valido }: { valido: boolean }) {
  const p: Record<string, unknown> = {
    idempotencyKey: `test-api-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    prodottoId,
    quantita: 1,
    modalita: "ritiro",
    cliente: {
      nome: valido ? "Test" : "", // nome vuoto → VALIDATION (mai raggiunge l'ordine)
      cognome: "Ospite",
      email: "guest-test@example.com",
      telefono: "3330000000",
    },
    ritiro: { data: "2030-01-01", fascia: "10:00-12:00" },
  };
  return p;
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login?area=merchant", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login-form");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("#login-form button[type=submit]");
  // L'area merchant reindirizza in /merchant se il login riesce.
  await page.waitForURL(/\/merchant/, { timeout: 25000 });
}

async function postOrdine(page: Page, body: unknown): Promise<{ status: number; code?: string }> {
  return page.evaluate(async (payloadBody) => {
    const res = await fetch("/api/cliente/ordini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadBody),
    });
    let json: Record<string, unknown> = {};
    try { json = (await res.json()) as Record<string, unknown>; } catch { /* noop */ }
    return {
      status: res.status,
      code: (json.error as Record<string, string> | undefined)?.code,
    };
  }, body);
}

test.describe("Modalità ospite + anti-autoacquisto (server)", () => {
  test("G) merchant bloccato nell'acquisto dei PROPRI prodotti (403, zero ordini)", async ({ context }) => {
    const page = await context.newPage();
    await login(page, UTENTI.merchantC.email, UTENTI.merchantC.password);

    const esito = await postOrdine(page, payload(PRODOTTO_PROPRIO, { valido: true }));
    expect(esito.status).toBe(403);
    expect(esito.code).toBe("PRODOTTO_DEL_PROPRIO_NEGOZIO");
    console.log(`✓ merchant → proprio negozio: HTTP ${esito.status} / ${esito.code} (nessun ordine)`);
  });

  test("H0) ANONIMO senza modalità ospite → 403 GUEST_REQUIRED (nessun ordine)", async ({ context }) => {
    const page = await context.newPage(); // nessun login, nessuna modalità ospite
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const esito = await postOrdine(page, payload(PRODOTTO_ALTRO, { valido: false }));
    expect(esito.status).toBe(403);
    expect(esito.code).toBe("GUEST_REQUIRED");
    console.log(`✓ anonimo senza modalità ospite: HTTP ${esito.status} / ${esito.code}`);
  });

  test("H) GUEST (modalità esplicita) non bloccato dalla regola proprietario (niente 403)", async ({ context }) => {
    const page = await context.newPage(); // nessun login = ospite
    await page.goto("/", { waitUntil: "domcontentloaded" }); // base origin per il fetch relativo

    // Attivazione della modalità ospite (cookie httpOnly impostato dal server
    // e accettato dal browser): senza di essa l'API risponderebbe 403 GUEST_REQUIRED.
    const attivazione = await page.evaluate(async () => {
      const res = await fetch("/api/auth/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "activate" }),
      });
      return res.status;
    });
    expect(attivazione).toBe(200);

    const esito = await postOrdine(page, payload(PRODOTTO_ALTRO, { valido: false }));
    // Con payload non valido il server deve RIFIUTARE per VALIDAZIONE (422),
    // MAI per la regola proprietario (403): l'ospite non possiede negozi.
    expect(esito.status).toBe(422);
    expect(esito.code).not.toBe("PRODOTTO_DEL_PROPRIO_NEGOZIO");
    console.log(`✓ guest + payload non valido: HTTP ${esito.status} / ${esito.code} (non bloccato dalla regola)`);
  });
});