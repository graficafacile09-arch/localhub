import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const LEGACY_KEY = "lh_ricordami_credenziali";
const DATABASE_NAME = "incitta-ricordami";

async function resetRememberMe(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ databaseName, legacyKey }) => {
    localStorage.removeItem(legacyKey);
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  }, { databaseName: DATABASE_NAME, legacyKey: LEGACY_KEY });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#email").waitFor();
  await expect(page.locator('form[action="/api/auth/login"] button[type="submit"]')).toBeEnabled();
}

async function mockLogin(page: Page, succeed: boolean) {
  await page.route("**/api/auth/login", async (route) => {
    if (succeed) {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>Logged in</title>",
      });
      return;
    }
    await route.fulfill({
      status: 303,
      headers: { location: "/login?error=Credenziali%20non%20valide" },
      body: "",
    });
  });
}

test.describe("R4 — Ricordami cifrato", () => {
  test.beforeEach(async ({ page }) => {
    await resetRememberMe(page);
  });

  test("ricorda email e password cifrate, ripristina dopo riapertura e cancella", async ({ page }) => {
    await mockLogin(page, true);
    const email = "r4@example.test";
    const password = "Pässwørd!§🚀";

    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("checkbox", { name: "Ricordami" }).check();
    await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
    await page.waitForLoadState("domcontentloaded");
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });

    const storageState = await page.evaluate(async ({ databaseName }) => {
      const localStorageValue = localStorage.getItem("lh_ricordami_credenziali");
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const record = await new Promise<unknown>((resolve, reject) => {
        const transaction = database.transaction("encrypted-credentials", "readonly");
        const request = transaction.objectStore("encrypted-credentials").get("login-credentials");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return { localStorageValue, record };
    }, { databaseName: DATABASE_NAME });

    expect(storageState.localStorageValue).toBeNull();
    expect(storageState.record).toMatchObject({
      version: 1,
      algorithm: "AES-GCM",
    });
    expect(JSON.stringify(storageState.record)).not.toContain(password);

    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#email")).toHaveValue(email);
    await expect(page.locator("#password")).toHaveValue(password);
    await expect(page.getByRole("checkbox", { name: "Ricordami" })).toBeChecked();

    await page.getByRole("checkbox", { name: "Ricordami" }).uncheck();
    await page.waitForTimeout(100);
    const remaining = await page.evaluate(async ({ databaseName }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const values = await new Promise<{ key: unknown; record: unknown }>((resolve, reject) => {
        const transaction = database.transaction(["crypto-keys", "encrypted-credentials"], "readonly");
        let key: unknown;
        let record: unknown;
        transaction.objectStore("crypto-keys").get("login-credentials").onsuccess = (event) => {
          key = (event.target as IDBRequest).result;
        };
        transaction.objectStore("encrypted-credentials").get("login-credentials").onsuccess = (event) => {
          record = (event.target as IDBRequest).result;
        };
        transaction.oncomplete = () => resolve({ key, record });
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
      return values;
    }, { databaseName: DATABASE_NAME });
    expect(remaining.key).toBeUndefined();
    expect(remaining.record).toBeUndefined();
  });

  test("migra il formato legacy solo dopo verifica del record cifrato", async ({ page }) => {
    const email = "legacy@example.test";
    const password = "Legacy!密碼";
    await page.evaluate(({ legacyKey, emailValue, passwordValue }) => {
      localStorage.setItem(legacyKey, JSON.stringify({ email: emailValue, password: passwordValue }));
    }, { legacyKey: LEGACY_KEY, emailValue: email, passwordValue: password });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#email")).toHaveValue(email);
    await expect(page.locator("#password")).toHaveValue(password);
    await expect(page.getByRole("checkbox", { name: "Ricordami" })).toBeChecked();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), LEGACY_KEY)).toBeNull();

    const encrypted = await page.evaluate(async ({ databaseName }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const record = await new Promise<unknown>((resolve, reject) => {
        const request = database.transaction("encrypted-credentials", "readonly")
          .objectStore("encrypted-credentials").get("login-credentials");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return record;
    }, { databaseName: DATABASE_NAME });
    expect(encrypted).toMatchObject({ version: 1, algorithm: "AES-GCM" });
    expect(JSON.stringify(encrypted)).not.toContain(password);
  });

  test("login fallito non sovrascrive una credenziale valida", async ({ page }) => {
    await mockLogin(page, true);
    const original = { email: "valid@example.test", password: "Correct!密碼" };
    await page.locator("#email").fill(original.email);
    await page.locator("#password").fill(original.password);
    await page.getByRole("checkbox", { name: "Ricordami" }).check();
    await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
    await page.waitForLoadState("domcontentloaded");
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#email")).toHaveValue(original.email);
    await expect(page.locator("#password")).toHaveValue(original.password);

    await page.unroute("**/api/auth/login");
    await mockLogin(page, false);
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.locator("#email").fill("wrong@example.test");
    await page.locator("#password").fill("Wrong!пароль");
    await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
    await expect(page).toHaveURL(/\/login\?error=/);

    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#email")).toHaveValue(original.email);
    await expect(page.locator("#password")).toHaveValue(original.password);
  });

  test("record cifrato corrotto non manda in crash il login", async ({ page }) => {
    await page.evaluate(async ({ databaseName }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("crypto-keys")) db.createObjectStore("crypto-keys");
          if (!db.objectStoreNames.contains("encrypted-credentials")) db.createObjectStore("encrypted-credentials");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("encrypted-credentials", "readwrite");
        transaction.objectStore("encrypted-credentials").put({ version: 999, algorithm: "AES-GCM", iv: "bad", ciphertext: "bad" }, "login-credentials");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    }, { databaseName: DATABASE_NAME });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page).not.toHaveTitle(/error/i);
  });
});
