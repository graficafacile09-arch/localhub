import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { BASE, UTENTI, loginUtente } from "./fixtures/auth";

// Il runner Playwright NON carica .env.local: la carichiamo manualmente
// (stesso pattern di trash-cestino.spec.ts) per inserire/verificare dati con
// la service role.
const envRaw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
for (const m of envRaw.matchAll(/^([A-Za-z0-9_]+)=(.*)$/gm)) {
  if (m[1] && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

const qaStoreIds: string[] = [];

/** Crea un negozio REALE via API merchant e ritorna { id, nome }. */
async function creaNegozio(
  page: import("@playwright/test").Page,
  nome: string
): Promise<{ id: string; nome: string }> {
  const json = await page.evaluate(async (n) => {
    const r = await fetch("/api/merchant/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: n, categoria: "Bar", citta: "Castrovillari" }),
    });
    return r.json();
  }, nome);
  const id: string = json.data?.storeId;
  expect(id, "create must return storeId").toBeTruthy();
  qaStoreIds.push(id);
  return { id, nome };
}

async function loginAdmin(page: import("@playwright/test").Page) {
  await loginUtente(page, UTENTI.admin);
}
async function loginMerchant(page: import("@playwright/test").Page) {
  await loginUtente(page, UTENTI.merchantD);
}

async function leggiNegozio(storeId: string): Promise<{ deleted_at: string | null; deleted_by: string | null }> {
  const { data, error } = await adminDb()
    .from("negozi")
    .select("deleted_at, deleted_by")
    .eq("id", storeId)
    .single();
  expect(error, "read negozio must succeed").toBeNull();
  return { deleted_at: data?.deleted_at ?? null, deleted_by: data?.deleted_by ?? null };
}

async function idCestinoAdmin(page: import("@playwright/test").Page): Promise<string[]> {
  const json = await page.evaluate(async () => {
    const r = await fetch("/api/amministratore/cestino");
    return r.json();
  });
  return ((json.data?.stores ?? []) as { id: string }[]).map((s) => s.id);
}

async function cestinaSingola(page: import("@playwright/test").Page, storeId: string): Promise<number> {
  return page.evaluate(async (id) => {
    const r = await fetch(`/api/amministratore/negozi/${id}/cestina`, { method: "POST" });
    return r.status;
  }, storeId);
}

test.describe.configure({ mode: "serial" });

test.describe("ELIMINA SELEZIONATI — Negozi Area Amministratore (batch soft delete)", () => {
  test("TEST 1 — admin: Seleziona tutti → 2 negozi → Elimina selezionati → Cestino → ripristino", async ({ page }) => {
    test.setTimeout(300_000);

    await loginMerchant(page);
    const base = `QA Batch ${Date.now()}`;
    const s1 = await creaNegozio(page, `${base} A`);
    const s2 = await creaNegozio(page, `${base} B`);

    try {
      await loginAdmin(page);
      await page.goto(`${BASE}/amministratore/attivita`, { waitUntil: "networkidle" });
      // Filtra per nome univoco: nella lista restano solo i 2 QA.
      await page.getByLabel("Cerca negozio").fill(base);
      await expect(page.getByLabel(`Seleziona ${s1.nome}`)).toBeVisible();
      await expect(page.getByLabel(`Seleziona ${s2.nome}`)).toBeVisible();

      // "Seleziona tutti" → barra azioni col conteggio dei negozi visibili.
      await page.getByText("Seleziona tutti", { exact: true }).click();
      await expect(page.getByRole("button", { name: /Elimina selezionati \(2\)/ })).toBeVisible();
      await expect(page.getByText("2 negozi selezionati").first()).toBeVisible();

      // "Deseleziona" → la barra sparisce.
      await page.getByRole("button", { name: "Deseleziona" }).click();
      await expect(page.getByRole("button", { name: /Elimina selezionati/ })).not.toBeVisible();

      // Seleziona i 2 singolarmente → "Elimina selezionati (2)" → conferma.
      await page.getByLabel(`Seleziona ${s1.nome}`).check();
      await page.getByLabel(`Seleziona ${s2.nome}`).check();
      await expect(page.getByRole("button", { name: /Elimina selezionati \(2\)/ })).toBeVisible();
      await page.getByRole("button", { name: /Elimina selezionati \(2\)/ }).click();
      await expect(page.getByRole("heading", { name: "Eliminare i negozi selezionati?" })).toBeVisible();
      await page.getByRole("button", { name: "Elimina selezionati", exact: true }).click();

      // Feedback col numero cestinato.
      await expect(page.getByText("2 negozi spostati nel Cestino.")).toBeVisible();

      // Spariscono dalla lista.
      await expect(page.getByLabel(`Seleziona ${s1.nome}`)).not.toBeVisible();
      await expect(page.getByLabel(`Seleziona ${s2.nome}`)).not.toBeVisible();

      // Nel Cestino + deleted_at/deleted_by impostati.
      const idsCestino = await idCestinoAdmin(page);
      expect(idsCestino).toContain(s1.id);
      expect(idsCestino).toContain(s2.id);
      const d1 = await leggiNegozio(s1.id);
      const d2 = await leggiNegozio(s2.id);
      expect(d1.deleted_at, "s1 deleted_at set").not.toBeNull();
      expect(d2.deleted_at, "s2 deleted_at set").not.toBeNull();

      // Ripristinabili: tornano fuori dal Cestino.
      for (const s of [s1, s2]) {
        const status = await page.evaluate(async (id) => {
          const r = await fetch(`/api/amministratore/negozi/${id}/ripristina`, { method: "POST" });
          return r.status;
        }, s.id);
        expect(status, "ripristina should be 200").toBe(200);
      }
      const idsCestinoDopo = await idCestinoAdmin(page);
      expect(idsCestinoDopo).not.toContain(s1.id);
      expect(idsCestinoDopo).not.toContain(s2.id);
      expect((await leggiNegozio(s1.id)).deleted_at, "s1 restored").toBeNull();
      expect((await leggiNegozio(s2.id)).deleted_at, "s2 restored").toBeNull();
    } finally {
      // Pulizia robusta: hard delete dei negozi QA (senza ordini/prodotti).
      await adminDb().from("admin_activity_log").delete().eq("target_id", s1.id);
      await adminDb().from("admin_activity_log").delete().eq("target_id", s2.id);
      await adminDb().from("ordini").delete().eq("negozio_id", s1.id);
      await adminDb().from("ordini").delete().eq("negozio_id", s2.id);
      await adminDb().from("prodotti").delete().eq("negozio_id", s1.id);
      await adminDb().from("prodotti").delete().eq("negozio_id", s2.id);
      await adminDb().from("prenotazioni").delete().eq("negozio_id", s1.id);
      await adminDb().from("prenotazioni").delete().eq("negozio_id", s2.id);
      await adminDb().from("media").delete().eq("negozio_id", s1.id);
      await adminDb().from("media").delete().eq("negozio_id", s2.id);
      await adminDb().from("negozi").delete().eq("id", s1.id);
      await adminDb().from("negozi").delete().eq("id", s2.id);
    }
  });

  test("TEST 2 — selezione vuota: nessuna barra azioni; API batch con array vuoto → 422", async ({ page }) => {
    test.setTimeout(180_000);

    await loginAdmin(page);
    await page.goto(`${BASE}/amministratore/attivita`, { waitUntil: "networkidle" });
    await expect(page.getByText("Seleziona tutti", { exact: true })).toBeVisible();
    // Nessuna selezione → nessuna barra azioni.
    await expect(page.getByRole("button", { name: /Elimina selezionati/ })).not.toBeVisible();

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/amministratore/negozi/cestina-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ negozioIds: [] }),
      });
      return { status: r.status, json: await r.json() };
    });
    expect(res.status, "empty batch must be 422").toBe(422);
  });

  test("TEST 3 — non-admin: POST batch → 403; nessun negozio modificato", async ({ page }) => {
    test.setTimeout(180_000);

    await loginMerchant(page);
    const store = await creaNegozio(page, `QA Batch Sic ${Date.now()}`);

    try {
      const res = await page.evaluate(async (id) => {
        const r = await fetch("/api/amministratore/negozi/cestina-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ negozioIds: [id] }),
        });
        return r.status;
      }, store.id);
      expect(res, "non-admin batch must be 403").toBe(403);

      const stato = await leggiNegozio(store.id);
      expect(stato.deleted_at, "store must remain active").toBeNull();
      expect(stato.deleted_by, "deleted_by must be null").toBeNull();
    } finally {
      await adminDb().from("admin_activity_log").delete().eq("target_id", store.id);
      await adminDb().from("negozi").delete().eq("id", store.id);
    }
  });

  test("TEST 4 — regressione: singola, ripristino, definitiva, Elimina tutto, già-cestinati non ricestinati", async ({ page }) => {
    test.setTimeout(300_000);

    await loginMerchant(page);
    const base = `QA Batch Regr ${Date.now()}`;
    const sA = await creaNegozio(page, `${base} A`);
    const sB = await creaNegozio(page, `${base} B`);
    const sC = await creaNegozio(page, `${base} C`);

    try {
      await loginAdmin(page);

      // (a) Eliminazione SINGOLA funziona.
      expect(await cestinaSingola(page, sA.id), "single cestina 200").toBe(200);
      expect((await leggiNegozio(sA.id)).deleted_at, "sA trashed").not.toBeNull();

      // (b) Il batch NON ricestina un negozio già nel Cestino: sA già
      // cestinato + sB attivo → solo sB viene cestinato, sA resta intatto.
      const res = await page.evaluate(async (ids) => {
        const r = await fetch("/api/amministratore/negozi/cestina-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ negozioIds: ids }),
        });
        return { status: r.status, json: await r.json() };
      }, [sA.id, sB.id]);
      expect(res.status, "batch 200").toBe(200);
      expect(res.json.data.trashed, "only sB trashed").toBe(1);
      expect((res.json.data.trashedIds as string[]), "trashedIds == [sB]").toEqual([sB.id]);
      expect((res.json.data.errori as { negozioId: string }[]).map((e) => e.negozioId)).toContain(sA.id);
      expect((await leggiNegozio(sB.id)).deleted_at, "sB trashed").not.toBeNull();
      expect((await leggiNegozio(sA.id)).deleted_at, "sA not re-trashed").not.toBeNull();

      // (c) RIPRISTINO singolo funziona (sA).
      const restore = await page.evaluate(async (id) => {
        const r = await fetch(`/api/amministratore/negozi/${id}/ripristina`, { method: "POST" });
        return r.status;
      }, sA.id);
      expect(restore, "restore 200").toBe(200);
      expect((await leggiNegozio(sA.id)).deleted_at, "sA restored").toBeNull();

      // (d) ELIMINAZIONE DEFINITIVA singola: sB (nel Cestino) sparisce per
      // sempre (riga eliminata dal DB).
      const definitivo = await page.evaluate(async (id) => {
        const r = await fetch(`/api/amministratore/negozi/${id}/definitivo`, { method: "DELETE" });
        return r.status;
      }, sB.id);
      expect(definitivo, "definitivo 200").toBe(200);
      const { data: rigaB } = await adminDb().from("negozi").select("id").eq("id", sB.id).maybeSingle();
      expect(rigaB, "sB physically deleted").toBeNull();

      // (e) "Elimina tutto" dal Cestino: cestina sA e sC, poi DELETE /cestino.
      expect(await cestinaSingola(page, sA.id)).toBe(200);
      expect(await cestinaSingola(page, sC.id)).toBe(200);
      const svuota = await page.evaluate(async () => {
        const r = await fetch("/api/amministratore/cestino", { method: "DELETE" });
        return r.status;
      });
      expect(svuota, "empty trash 200").toBe(200);
      const { data: rigaA } = await adminDb().from("negozi").select("id").eq("id", sA.id).maybeSingle();
      const { data: rigaC } = await adminDb().from("negozi").select("id").eq("id", sC.id).maybeSingle();
      expect(rigaA, "sA physically deleted").toBeNull();
      expect(rigaC, "sC physically deleted").toBeNull();
      const idsCestino = await idCestinoAdmin(page);
      expect(idsCestino).not.toContain(sA.id);
      expect(idsCestino).not.toContain(sC.id);
    } finally {
      for (const s of [sA, sB, sC]) {
        await adminDb().from("admin_activity_log").delete().eq("target_id", s.id);
        await adminDb().from("ordini").delete().eq("negozio_id", s.id);
        await adminDb().from("prodotti").delete().eq("negozio_id", s.id);
        await adminDb().from("prenotazioni").delete().eq("negozio_id", s.id);
        await adminDb().from("media").delete().eq("negozio_id", s.id);
        await adminDb().from("negozi").delete().eq("id", s.id);
      }
    }
  });
});
