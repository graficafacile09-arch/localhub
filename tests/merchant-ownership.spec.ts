/**
 * P12 — AUDIT OWNERSHIP ROUTE MERCHANT FIGLIE.
 *
 * Test isolato: crea due merchant e due negozi QA temporanei con service role,
 * poi verifica lettura/scrittura nei due versi, slug cross-store e accesso
 * dell'amministratore autorizzato. Nessun pagamento, checkout o RLS viene
 * modificato.
 */
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { UTENTI } from "./fixtures/auth";

const envRaw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
for (const m of envRaw.matchAll(/^([A-Za-z0-9_]+)=(.*)$/gm)) {
  if (m[1] && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// Mai usare il default di playwright (produzione) per una suite distruttiva
// che crea fixture: il test richiede BASE_URL oppure il server locale 3100.
const TEST_BASE = process.env.BASE_URL ?? "http://localhost:3100";

function adminDb(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

const ts = Date.now();
const merchantA = {
  chiave: "p12-merchant-a",
  email: `p12-merchant-a-${ts}@localhub.it`,
  password: "P12MerchantA123!",
  fullName: "P12 Merchant A",
  ruolo: "merchant" as const,
};
const merchantB = {
  chiave: "p12-merchant-b",
  email: `p12-merchant-b-${ts}@localhub.it`,
  password: "P12MerchantB123!",
  fullName: "P12 Merchant B",
  ruolo: "merchant" as const,
};

let userAId = "";
let userBId = "";
let storeAId = "";
let storeBId = "";
const storeASlug = `p12-store-a-${ts}`;
const storeBSlug = `p12-store-b-${ts}`;

async function createMerchant(
  db: SupabaseClient,
  merchant: typeof merchantA,
  store: { nome: string; slug: string }
): Promise<{ userId: string; storeId: string }> {
  const { data: userData, error: userError } = await db.auth.admin.createUser({
    email: merchant.email,
    password: merchant.password,
    email_confirm: true,
    user_metadata: { full_name: merchant.fullName },
  });
  expect(userError, `${merchant.chiave} user creation`).toBeNull();
  if (!userData.user) throw new Error(`${merchant.chiave} user was not created`);

  const userId = userData.user.id;
  const { error: roleError } = await db
    .from("user_roles")
    .insert({ user_id: userId, role: "merchant" });
  expect(roleError, `${merchant.chiave} role creation`).toBeNull();

  const { data: storeData, error: storeError } = await db
    .from("negozi")
    .insert({
      owner_user_id: userId,
      nome: store.nome,
      slug: store.slug,
      categoria: "Bar",
      citta: "Castrovillari",
      attivo: true,
    })
    .select("id")
    .single();
  expect(storeError, `${merchant.chiave} store creation`).toBeNull();
  if (!storeData?.id) throw new Error(`${merchant.chiave} store was not created`);

  return { userId, storeId: String(storeData.id) };
}

async function cleanupMerchant(db: SupabaseClient, userId: string, storeId: string) {
  if (storeId) await db.from("negozi").delete().eq("id", storeId);
  if (userId) {
    await db.from("user_roles").delete().eq("user_id", userId);
    await db.auth.admin.deleteUser(userId);
  }
}

type ApiInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

async function loginTestUser(page: Page, merchant: typeof merchantA | typeof UTENTI.admin) {
  await page.goto(`${TEST_BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(merchant.email);
  await page.locator("#password").fill(merchant.password);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL(`${TEST_BASE}/`, { timeout: 30_000 });
}

async function apiJson(page: Page, path: string, init?: ApiInit) {
  return page.evaluate(
    async ({ path: requestPath, init: requestInit }) => {
      const response = await fetch(requestPath, requestInit);
      let json: unknown = null;
      try {
        json = await response.json();
      } catch {
        // The status is sufficient for redirect/error responses.
      }
      return { status: response.status, json };
    },
    { path, init }
  );
}

function settingsPayload(descrizione: string) {
  return {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ descrizione }),
  };
}

test.describe.configure({ mode: "serial" });

test.describe("P12 — ownership cross-store delle route merchant", () => {
  test.beforeAll(async () => {
    const db = adminDb();
    const createdA = await createMerchant(db, merchantA, {
      nome: `P12 Negozio A ${ts}`,
      slug: storeASlug,
    });
    userAId = createdA.userId;
    storeAId = createdA.storeId;

    const createdB = await createMerchant(db, merchantB, {
      nome: `P12 Negozio B ${ts}`,
      slug: storeBSlug,
    });
    userBId = createdB.userId;
    storeBId = createdB.storeId;
  });

  test.afterAll(async () => {
    const db = adminDb();
    await cleanupMerchant(db, userAId, storeAId);
    await cleanupMerchant(db, userBId, storeBId);
  });

  test("merchant A/B: proprio negozio consentito, negozio altrui negato in lettura e scrittura", async ({ page }) => {
    test.setTimeout(180_000);

    await test.step("Merchant A — proprio negozio consentito", async () => {
      await loginTestUser(page, merchantA);

      const ownGet = await apiJson(page, `/api/merchant/stores/${storeAId}/settings`);
      expect(ownGet.status).toBe(200);
      const ownSettings = (ownGet.json as { data?: { settings?: { descrizione?: string | null } } })
        .data?.settings;

      const ownPut = await apiJson(
        page,
        `/api/merchant/stores/${storeAId}/settings`,
        settingsPayload(ownSettings?.descrizione ?? "")
      );
      expect(ownPut.status).toBe(200);
    });

    await test.step("Merchant A — negozio B negato anche usando lo slug B", async () => {
      const crossGet = await apiJson(page, `/api/merchant/stores/${storeBId}/settings`);
      expect(crossGet.status).toBe(403);

      const crossPut = await apiJson(
        page,
        `/api/merchant/stores/${storeBId}/settings`,
        settingsPayload("P12 CROSS-STORE MUST NOT BE SAVED")
      );
      expect(crossPut.status).toBe(403);

      // Lo slug pubblico identifica davvero B, ma non diventa un lasciapassare
      // per l'API merchant quando viene usato al posto dell'ID di negozio.
      const crossSlugGet = await apiJson(page, `/api/merchant/stores/${storeBSlug}/settings`);
      expect(crossSlugGet.status).toBe(403);
      const publicSlugPage = await page.request.get(`${TEST_BASE}/negozio/${storeBSlug}`);
      expect(publicSlugPage.status()).toBe(200);
      await expect(await publicSlugPage.text()).toContain(`P12 Negozio B ${ts}`);
    });

    await page.evaluate(async () => {
      await fetch("/api/auth/signout", { method: "POST", redirect: "manual" });
    });
    await page.goto(`${TEST_BASE}/login`, { waitUntil: "networkidle" });

    await test.step("Merchant B — negozio B consentito, negozio A negato", async () => {
      await loginTestUser(page, merchantB);

      const ownGet = await apiJson(page, `/api/merchant/stores/${storeBId}/settings`);
      expect(ownGet.status).toBe(200);
      const ownSettings = (ownGet.json as { data?: { settings?: { descrizione?: string | null } } })
        .data?.settings;

      const ownPut = await apiJson(
        page,
        `/api/merchant/stores/${storeBId}/settings`,
        settingsPayload(ownSettings?.descrizione ?? "")
      );
      expect(ownPut.status).toBe(200);

      const crossGet = await apiJson(page, `/api/merchant/stores/${storeAId}/settings`);
      expect(crossGet.status).toBe(403);
      const crossPut = await apiJson(
        page,
        `/api/merchant/stores/${storeAId}/settings`,
        settingsPayload("P12 CROSS-STORE MUST NOT BE SAVED")
      );
      expect(crossPut.status).toBe(403);
    });
  });

  test("admin autorizzato: accesso previsto e apply-template supera il gate ownership", async ({ page }) => {
    test.setTimeout(120_000);
    await loginTestUser(page, UTENTI.admin);

    const adminGet = await apiJson(page, `/api/merchant/stores/${storeBId}/settings`);
    expect(adminGet.status).toBe(200);

    const adminPut = await apiJson(
      page,
      `/api/merchant/stores/${storeBId}/settings`,
      settingsPayload("")
    );
    expect(adminPut.status).toBe(200);

    // Template inesistente: il test verifica solo che il controllo ownership
    // consenta l'ingresso admin; il service fallisce prima di qualsiasi UPDATE.
    const templateAttempt = await apiJson(
      page,
      `/api/merchant/stores/${storeBId}/apply-template/p12-template-nonexistent`,
      { method: "POST" }
    );
    expect(templateAttempt.status).toBe(500);
    expect((templateAttempt.json as { error?: { code?: string } }).error?.code).toBe("APPLY_FAILED");
  });
});
