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
  return { id, nome };
}

/** Inserisce un ordine REALE (service role) e ritorna { id, numero }. */
async function inserisciOrdineDiTest(
  negozioId: string,
  negozioNome: string,
  suffisso: number
): Promise<{ id: string; numero: string }> {
  const key = `qa-ord-batch-${suffisso}-${Date.now()}-${negozioId.slice(0, 8)}`;
  const { data, error } = await adminDb()
    .from("ordini")
    .insert({
      idempotency_key: key,
      modalita: "ritiro",
      totale: 10 + suffisso,
      negozio_id: negozioId,
      negozio_nome: negozioNome,
      cliente_nome: "QA",
      cliente_cognome: "Batch",
    })
    .select("id, numero");
  expect(error, "insert ordine must succeed").toBeNull();
  return {
    id: data?.[0]?.id as string,
    numero: data?.[0]?.numero as string,
  };
}

async function loginAdmin(page: import("@playwright/test").Page) {
  await loginUtente(page, UTENTI.admin);
}
async function loginMerchant(page: import("@playwright/test").Page) {
  await loginUtente(page, UTENTI.merchantD);
}

/** Soft-delete del negozio di test via service role (pulizia robusta). */
async function cestinaNegozioDiTest(storeId: string) {
  await adminDb()
    .from("negozi")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", storeId)
    .is("deleted_at", null);
}

test.describe.configure({ mode: "serial" });

test.describe("ELIMINA SELEZIONATI — Area Amministratore (batch soft delete)", () => {
  test("admin seleziona 2 ordini → Elimina selezionati → spariscono, nel Cestino, ripristinabili; Annulla resta separato", async ({ page }) => {
    test.setTimeout(300_000);

    // Merchant: crea un negozio reale + 3 ordini.
    await loginMerchant(page);
    const nomeNegozio = `QA Batch ${Date.now()}`;
    const { id: storeId } = await creaNegozio(page, nomeNegozio);
    const o1 = await inserisciOrdineDiTest(storeId, nomeNegozio, 1);
    const o2 = await inserisciOrdineDiTest(storeId, nomeNegozio, 2);
    const o3 = await inserisciOrdineDiTest(storeId, nomeNegozio, 3);

    try {
      // Annulla o3 dal percorso VENDITORE (proprietario) — Annulla resta
      // separato dall'eliminazione: stato cancellato, NON nel Cestino.
      const annulla = await page.evaluate(async (args) => {
        const r = await fetch(`/api/merchant/stores/${args.storeId}/ordini/${args.ordineId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stato: "cancellato", motivo: "annullato_altre_ragioni", nota: "batch test" }),
        });
        return { status: r.status };
      }, { storeId, ordineId: o3.id });
      expect(annulla.status, "annulla (merchant owner) should be 200").toBe(200);

      // Admin: apri la console ordini filtrata su questo negozio.
      await loginAdmin(page);
      await page.goto(`${BASE}/amministratore/ordini`);
      const negozioSelect = page.locator(`select:has(option[value="${storeId}"])`);
      await negozioSelect.selectOption(storeId);
      await expect(page.getByLabel(`Seleziona ${o1.numero}`)).toBeVisible();

      // "Seleziona tutti" → barra azioni col conteggio degli ordini visibili;
      // "Deseleziona" → la barra sparisce.
      await page.getByText("Seleziona tutti").click();
      const barra = page.getByRole("button", { name: /^Elimina selezionati \(\d+\)$/ });
      await expect(barra).toBeVisible();
      const nVisibili = await page.getByLabel(/^Seleziona LH-\d/).count();
      await expect(barra).toHaveText(`Elimina selezionati (${nVisibili})`);
      await page.getByRole("button", { name: "Deseleziona" }).click();
      await expect(page.getByRole("button", { name: /^Elimina selezionati/ })).toHaveCount(0);

      // Seleziona SOLO o1 e o2 (o3 annullato resta fuori).
      await page.getByLabel(`Seleziona ${o1.numero}`).check();
      await page.getByLabel(`Seleziona ${o2.numero}`).check();
      await expect(page.getByRole("button", { name: "Elimina selezionati (2)" })).toBeVisible();

      // Conferma esplicita con il conteggio.
      await page.getByRole("button", { name: "Elimina selezionati (2)" }).click();
      await expect(
        page.getByRole("heading", { name: "Eliminare gli ordini selezionati?" })
      ).toBeVisible();
      await page.getByRole("button", { name: "Elimina selezionati", exact: true }).click();

      // Feedback del numero cestinati.
      await expect(page.getByText(/2 ordini spostati nel Cestino/)).toBeVisible();

      // o1/o2 NON sono più nell'elenco ordinario; o3 (annullato) sì.
      const lista = await page.evaluate(async () => {
        const r = await fetch("/api/amministratore/ordini?per_pagina=100");
        return r.json();
      });
      const idOrdinari = ((lista.data?.ordini ?? []) as { id: string }[]).map((o) => o.id);
      expect(idOrdinari, "eliminated orders must not be in ordinary list").not.toContain(o1.id);
      expect(idOrdinari, "eliminated orders must not be in ordinary list").not.toContain(o2.id);
      expect(idOrdinari, "annulled order stays in ordinary list (Annulla separato)").toContain(o3.id);

      // o1/o2 sono nel Cestino ordini; o3 no.
      const cestino = await page.evaluate(async () => {
        const r = await fetch("/api/amministratore/ordini/cestino");
        return r.json();
      });
      const idCestino = ((cestino.data?.ordini ?? []) as { id: string }[]).map((o) => o.id);
      expect(idCestino, "eliminated orders must be in trash").toContain(o1.id);
      expect(idCestino, "eliminated orders must be in trash").toContain(o2.id);
      expect(idCestino, "annulled order must NOT be in trash").not.toContain(o3.id);

      // DB: soft delete (deleted_at impostato) che NON tocca lo stato.
      for (const o of [o1, o2]) {
        const { data: row, error: dbErr } = await adminDb()
          .from("ordini")
          .select("stato, deleted_at")
          .eq("id", o.id)
          .single();
        expect(dbErr, "db read must succeed").toBeNull();
        expect(row?.deleted_at, "deleted_at must be set (soft delete)").not.toBeNull();
        expect(row?.stato, "soft delete must NOT change order state").not.toBe("cancellato");
      }

      // Ripristino di entrambi → tornano nell'elenco ordinario e fuori dal Cestino.
      for (const o of [o1, o2]) {
        const status = await page.evaluate(async (id) => {
          const r = await fetch(`/api/amministratore/ordini/${id}/ripristina`, { method: "POST" });
          return r.status;
        }, o.id);
        expect(status, "admin ripristina should be 200").toBe(200);
      }

      const listaFinale = await page.evaluate(async () => {
        const r = await fetch("/api/amministratore/ordini?per_pagina=100");
        return r.json();
      });
      const idFinali = ((listaFinale.data?.ordini ?? []) as { id: string }[]).map((o) => o.id);
      expect(idFinali, "restored orders must be back in ordinary list").toContain(o1.id);
      expect(idFinali, "restored orders must be back in ordinary list").toContain(o2.id);
    } finally {
      for (const o of [o1, o2, o3]) {
        await adminDb().from("ordini").delete().eq("id", o.id);
      }
      await cestinaNegozioDiTest(storeId);
    }
  });

  test("un utente NON amministratore NON può eseguire l'eliminazione multipla (403 via API)", async ({ page }) => {
    test.setTimeout(180_000);

    await loginMerchant(page);
    const nomeNegozio = `QA Batch NoAdmin ${Date.now()}`;
    const { id: storeId } = await creaNegozio(page, nomeNegozio);
    const ordine = await inserisciOrdineDiTest(storeId, nomeNegozio, 1);

    try {
      // Merchant (non admin) tenta il batch → 403.
      const status = await page.evaluate(async (id) => {
        const r = await fetch("/api/amministratore/ordini/cestina-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ordineIds: [id] }),
        });
        return r.status;
      }, ordine.id);
      expect(status, "non-admin batch must be 403").toBe(403);

      // L'ordine NON è stato cestinato.
      const { data: row } = await adminDb()
        .from("ordini")
        .select("deleted_at")
        .eq("id", ordine.id)
        .single();
      expect(row?.deleted_at, "order must remain untouched after 403").toBeNull();
    } finally {
      await adminDb().from("ordini").delete().eq("id", ordine.id);
      await cestinaNegozioDiTest(storeId);
    }
  });

  test("selezione vuota → nessuna eliminazione (422 lato API, nessuna barra azioni in UI)", async ({ page }) => {
    test.setTimeout(180_000);

    await loginAdmin(page);

    // API: body vuoto → 422, nessun ordine toccato.
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/amministratore/ordini/cestina-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordineIds: [] }),
      });
      return { status: r.status, json: await r.json() };
    });
    expect(res.status, "empty batch must be 422").toBe(422);

    // UI: senza selezione la barra azioni non esiste.
    await page.goto(`${BASE}/amministratore/ordini`);
    await expect(page.getByRole("button", { name: /^Elimina selezionati/ })).toHaveCount(0);
  });
});
