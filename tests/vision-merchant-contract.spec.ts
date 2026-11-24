/**
 * CONTRATTO — route vision del percorso venditori (FASE 0 RadiciScan).
 *
 * Protegge i cancelli che precedono qualsiasi chiamata AI e qualsiasi consumo
 * di quota: autenticazione, ownership del negozio, validazione del modello e
 * presenza dell'immagine. Nessun test di questa suite:
 *   - chiama un provider AI,
 *   - consuma la quota mensile (`consume_merchant_monthly_scan`),
 *   - scrive prodotti, negozi o cache.
 *
 * Il test 401 usa il `request` context isolato (nessun cookie). Gli altri
 * usano la fixture merchantA già prevista dalla suite.
 *
 * Richiede il server locale: `npm run dev -- -p 3100` (BASE dei fixture).
 * Se BASE_URL punta altrove, i fixture continuano a usare localhost:3100:
 * non eseguire questa suite contro la produzione.
 */
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { BASE, UTENTI, loginUtente } from "./fixtures/auth";

// Stessa lettura di .env.local usata da tests/merchant-ownership.spec.ts.
const envRaw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
for (const m of envRaw.matchAll(/^([A-Za-z0-9_]+)=(.*)$/gm)) {
  if (m[1] && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/** UUID valido ma non gestito dal merchant fixture: deve fermarsi al gate ownership. */
const NEGOZIO_INESISTENTE = "00000000-0000-4000-8000-000000000000";

type ErroreApi = { success?: boolean; error?: { code?: string; message?: string } };

function endpoint(storeId: string, query = "") {
  return `${BASE}/api/merchant/stores/${storeId}/products/vision${query}`;
}

/** POST multipart dal browser: stessi cookie di sessione del merchant loggato. */
async function postVision(
  page: Page,
  url: string,
  form: Record<string, string> = { nota: "contratto" }
): Promise<{ status: number; body: ErroreApi }> {
  return page.evaluate(
    async ({ url: target, form: campi }) => {
      const fd = new FormData();
      for (const [chiave, valore] of Object.entries(campi)) fd.append(chiave, valore);
      const res = await fetch(target, { method: "POST", body: fd });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // Le risposte di errore restano comunque identificabili dallo status.
      }
      return { status: res.status, body: body as { success?: boolean; error?: { code?: string } } };
    },
    { url, form }
  );
}

/**
 * Id del negozio del merchant fixture: lettura sola (service role) su auth +
 * negozi. È l'unico modo stabile per conoscere l'id senza dipendere dalla
 * dashboard, e non crea né modifica alcuna riga.
 */
async function storeIdMerchantFixture(email: string): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !serviceKey) return "";

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: utenti, error: erroreUtenti } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (erroreUtenti) throw new Error(`lettura utenti fixture: ${erroreUtenti.message}`);

  const utente = utenti.users.find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
  );
  if (!utente) return "";

  const { data: negozi, error: erroreNegozi } = await db
    .from("negozi")
    .select("id")
    .eq("owner_user_id", utente.id)
    .limit(1);
  if (erroreNegozi) throw new Error(`lettura negozi fixture: ${erroreNegozi.message}`);

  return negozi?.[0]?.id ? String(negozi[0].id) : "";
}

test.describe.configure({ mode: "serial" });

test.describe("Vision venditori — contratto di autenticazione e validazione", () => {
  test("senza sessione → 401 UNAUTHORIZED", async ({ request }) => {
    const res = await request.post(endpoint(NEGOZIO_INESISTENTE));

    expect(res.status()).toBe(401);
    const body = (await res.json()) as ErroreApi;
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe("UNAUTHORIZED");
  });

  test("merchant autenticato: ownership, modello e immagine", async ({ page }) => {
    test.setTimeout(120_000);

    // Attende la navigazione post-login: senza attesa il cookie di sessione non
    // è ancora impostato e la fetch partirebbe come anonima (401).
    try {
      await loginUtente(page, UTENTI.merchantA, { waitFor: `${BASE}/` });
    } catch {
      test.skip(
        true,
        "utenti QA assenti o non allineati nel database: eseguire scripts/setup-test-users.mjs"
      );
    }

    await test.step("negozio non proprio → 403 FORBIDDEN", async () => {
      const res = await postVision(page, endpoint(NEGOZIO_INESISTENTE));

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code).toBe("FORBIDDEN");
    });

    const storeId = await storeIdMerchantFixture(UTENTI.merchantA.email);
    test.skip(
      !storeId,
      "nessun negozio QA per merchantA: eseguire scripts/setup-test-users.mjs"
    );

    await test.step("modello sconosciuto → 400 INVALID_MODEL", async () => {
      const res = await postVision(page, endpoint(storeId, "?model=modello-inesistente"));

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code).toBe("INVALID_MODEL");
    });

    await test.step("immagine mancante → 422 INVALID_BODY (nessun consumo di quota)", async () => {
      // `model=gemini` salta il controllo di configurazione Cloudflare: la route
      // arriva al parsing del body e si ferma prima della quota mensile.
      const res = await postVision(page, endpoint(storeId, "?model=gemini"));

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code).toBe("INVALID_BODY");
    });
  });
});
