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
  const key = `qa-ord-def-${suffisso}-${Date.now()}-${negozioId.slice(0, 8)}`;
  const { data, error } = await adminDb()
    .from("ordini")
    .insert({
      idempotency_key: key,
      modalita: "ritiro",
      totale: 20 + suffisso,
      negozio_id: negozioId,
      negozio_nome: negozioNome,
      cliente_nome: "QA",
      cliente_cognome: "Definitivo",
    })
    .select("id, numero");
  expect(error, "insert ordine must succeed").toBeNull();
  return { id: data?.[0]?.id as string, numero: data?.[0]?.numero as string };
}

/** Inserisce un prodotto REALE per il negozio (per le righe ordine). */
async function inserisciProdottoDiTest(negozioId: string): Promise<number> {
  const { data, error } = await adminDb()
    .from("prodotti")
    .insert({
      slug: `qa-ord-def-${Date.now()}`,
      negozio_id: negozioId,
      nome: "Prodotto QA Definitivo",
      categoria: "Bar",
      prezzo: 5,
      attivo: true,
      quantita_disponibile: 10,
      origine_pubblicazione: "manuale",
    })
    .select("id")
    .single();
  expect(error, "insert prodotto must succeed").toBeNull();
  return data?.id as number;
}

/** Crea TUTTI i dati collegati a un ordine (per verificare la loro rimozione). */
async function creaDatiCollegati(ordineId: string, negozioId: string, prodottoId: number) {
  const { error: errRiga } = await adminDb()
    .from("ordini_righe")
    .insert({
      ordine_id: ordineId,
      prodotto_id: prodottoId,
      nome_prodotto: "Prodotto QA Definitivo",
      prezzo_unitario: 5,
      quantita: 1,
    });
  expect(errRiga, "insert riga must succeed").toBeNull();

  const { error: errEvento } = await adminDb()
    .from("ordini_eventi")
    .insert({ ordine_id: ordineId, evento: "ordine_creato" });
  expect(errEvento, "insert evento must succeed").toBeNull();

  const { error: errSessione } = await adminDb()
    .from("pagamenti_sessioni")
    .insert({
      ordine_id: ordineId,
      negozio_id: negozioId,
      provider: "stripe",
      idempotency_key: `qa-ord-def-sess-${Date.now()}-${ordineId.slice(0, 8)}`,
    });
  expect(errSessione, "insert pagamenti_sessioni must succeed").toBeNull();

  const { error: errEvPag } = await adminDb()
    .from("pagamenti_eventi")
    .insert({
      provider: "stripe",
      event_id: `qa-ev-${Date.now()}-${ordineId.slice(0, 8)}`,
      ordine_id: ordineId,
      negozio_id: negozioId,
    });
  expect(errEvPag, "insert pagamenti_eventi must succeed").toBeNull();

  const { data: reclamo, error: errReclamo } = await adminDb()
    .from("ordine_reclami")
    .insert({
      ordine_id: ordineId,
      negozio_id: negozioId,
      cliente_nome: "QA Definitivo",
      tipo: "ordine_non_arrivato",
    })
    .select("id")
    .single();
  expect(errReclamo, "insert ordine_reclami must succeed").toBeNull();

  const { error: errComunicazione } = await adminDb()
    .from("reclamo_comunicazioni")
    .insert({ reclamo_id: reclamo?.id as string, mittente: "cliente", corpo: "test definitivo" });
  expect(errComunicazione, "insert reclamo_comunicazioni must succeed").toBeNull();
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

test.describe("CESTINO ORDINI — eliminazione DEFINITIVA (pattern negozi)", () => {
  test("TEST 1 — admin elimina definitivamente un ordine dal Cestino (dati collegati + log)", async ({ page }) => {
    test.setTimeout(300_000);

    await loginMerchant(page);
    const nomeNegozio = `QA Definitivo ${Date.now()}`;
    const { id: storeId } = await creaNegozio(page, nomeNegozio);
    const prodottoId = await inserisciProdottoDiTest(storeId);
    const ordine = await inserisciOrdineDiTest(storeId, nomeNegozio, 1);
    await creaDatiCollegati(ordine.id, storeId, prodottoId);

    try {
      // Soft delete (cestina) → l'ordine compare nel Cestino.
      await loginAdmin(page);
      const cestina = await page.evaluate(async (id) => {
        const r = await fetch(`/api/amministratore/ordini/${id}/cestina`, { method: "POST" });
        return r.status;
      }, ordine.id);
      expect(cestina, "cestina should be 200").toBe(200);

      const cestinoPrima = await page.evaluate(async () => {
        const r = await fetch("/api/amministratore/ordini/cestino");
        return r.json();
      });
      const idCestinoPrima = ((cestinoPrima.data?.ordini ?? []) as { id: string }[]).map((o) => o.id);
      expect(idCestinoPrima, "order must be in trash after soft delete").toContain(ordine.id);

      // Eliminazione DEFINITIVA.
      const definitivo = await page.evaluate(async (id) => {
        const r = await fetch(`/api/amministratore/ordini/${id}/definitivo`, { method: "DELETE" });
        return { status: r.status, json: await r.json() };
      }, ordine.id);
      expect(definitivo.status, "definitive delete should be 200").toBe(200);

      // Non più nel Cestino né nell'elenco ordinario.
      const cestinoDopo = await page.evaluate(async () => {
        const r = await fetch("/api/amministratore/ordini/cestino");
        return r.json();
      });
      const idCestinoDopo = ((cestinoDopo.data?.ordini ?? []) as { id: string }[]).map((o) => o.id);
      expect(idCestinoDopo, "order must NOT be in trash after definitive delete").not.toContain(ordine.id);

      const lista = await page.evaluate(async () => {
        const r = await fetch("/api/amministratore/ordini?per_pagina=100");
        return r.json();
      });
      const idOrdinari = ((lista.data?.ordini ?? []) as { id: string }[]).map((o) => o.id);
      expect(idOrdinari, "order must NOT be in ordinary list").not.toContain(ordine.id);

      // La riga ordini NON esiste più.
      const { data: ordineRimasto } = await adminDb()
        .from("ordini")
        .select("id")
        .eq("id", ordine.id)
        .maybeSingle();
      expect(ordineRimasto, "order row must be physically deleted").toBeNull();

      // I dati collegati sono stati eliminati.
      for (const tabella of ["ordini_righe", "ordini_eventi", "pagamenti_sessioni", "pagamenti_eventi", "ordine_reclami"] as const) {
        const { data: figli } = await adminDb().from(tabella).select("id").eq("ordine_id", ordine.id);
        expect(figli ?? [], `${tabella} must be empty after definitive delete`).toHaveLength(0);
      }
      // reclamo_comunicazioni (cascata dal reclamo).
      const { data: reclami } = await adminDb().from("ordine_reclami").select("id").eq("ordine_id", ordine.id);
      const { data: comunicazioni } = await adminDb()
        .from("reclamo_comunicazioni")
        .select("id")
        .in("reclamo_id", (reclami ?? []).map((r) => r.id));
      expect(comunicazioni ?? [], "reclamo_comunicazioni must be empty").toHaveLength(0);

      // Log attività ORDINE_ELIMINATO_DEFINITIVO.
      const { data: log } = await adminDb()
        .from("admin_activity_log")
        .select("operation_type, target_id, result")
        .eq("operation_type", "ordine_eliminato_definitivo")
        .eq("target_id", ordine.id);
      expect(log ?? [], "activity log entry must exist").toHaveLength(1);
      expect(log?.[0]?.result).toBe("success");
    } finally {
      // Pulizia: prodotto e negozio di test (ordine già eliminato).
      if (prodottoId) {
        await adminDb().from("prodotti").delete().eq("id", prodottoId);
      }
      await adminDb().from("ordini").delete().eq("id", ordine.id);
      await cestinaNegozioDiTest(storeId);
    }
  });

  test("TEST 2 — admin svuota l'intero Cestino ordini (DELETE batch)", async ({ page }) => {
    test.setTimeout(300_000);

    await loginMerchant(page);
    const nomeNegozio = `QA Svuota ${Date.now()}`;
    const { id: storeId } = await creaNegozio(page, nomeNegozio);
    const o1 = await inserisciOrdineDiTest(storeId, nomeNegozio, 1);
    const o2 = await inserisciOrdineDiTest(storeId, nomeNegozio, 2);

    try {
      await loginAdmin(page);
      // Soft delete di entrambi.
      for (const o of [o1, o2]) {
        const status = await page.evaluate(async (id) => {
          const r = await fetch(`/api/amministratore/ordini/${id}/cestina`, { method: "POST" });
          return r.status;
        }, o.id);
        expect(status, "cestina should be 200").toBe(200);
      }

      // Svuota il Cestino.
      const res = await page.evaluate(async () => {
        const r = await fetch("/api/amministratore/ordini/cestino", { method: "DELETE" });
        return { status: r.status, json: await r.json() };
      });
      expect(res.status, "empty trash should be 200").toBe(200);
      const deleted = Number(res.json?.data?.deleted ?? 0);
      const ordineIds: string[] = res.json?.data?.ordineIds ?? [];
      expect(deleted, "at least 2 orders deleted").toBeGreaterThanOrEqual(2);
      expect(ordineIds, "both test orders among deleted").toContain(o1.id);
      expect(ordineIds, "both test orders among deleted").toContain(o2.id);

      // Il Cestino non li contiene più e le righe sono fisicamente eliminate.
      const cestinoDopo = await page.evaluate(async () => {
        const r = await fetch("/api/amministratore/ordini/cestino");
        return r.json();
      });
      const idCestinoDopo = ((cestinoDopo.data?.ordini ?? []) as { id: string }[]).map((o) => o.id);
      expect(idCestinoDopo, "trash must be empty of test orders").not.toContain(o1.id);
      expect(idCestinoDopo, "trash must be empty of test orders").not.toContain(o2.id);

      for (const o of [o1, o2]) {
        const { data: riga } = await adminDb()
          .from("ordini")
          .select("id")
          .eq("id", o.id)
          .maybeSingle();
        expect(riga, "order must be physically deleted").toBeNull();
      }
    } finally {
      await adminDb().from("ordini").delete().eq("id", o1.id);
      await adminDb().from("ordini").delete().eq("id", o2.id);
      await cestinaNegozioDiTest(storeId);
    }
  });

  test("TEST 3 — sicurezza: non-admin NON può eliminare definitivamente (403)", async ({ page }) => {
    test.setTimeout(240_000);

    await loginMerchant(page);
    const nomeNegozio = `QA Def Sicurezza ${Date.now()}`;
    const { id: storeId } = await creaNegozio(page, nomeNegozio);
    const ordine = await inserisciOrdineDiTest(storeId, nomeNegozio, 1);

    try {
      // Merchant tenta DELETE singolo e DELETE svuota Cestino → 403.
      const single = await page.evaluate(async (id) => {
        const r = await fetch(`/api/amministratore/ordini/${id}/definitivo`, { method: "DELETE" });
        return r.status;
      }, ordine.id);
      expect(single, "non-admin single definitive delete must be 403").toBe(403);

      const svuota = await page.evaluate(async () => {
        const r = await fetch("/api/amministratore/ordini/cestino", { method: "DELETE" });
        return r.status;
      });
      expect(svuota, "non-admin empty-trash must be 403").toBe(403);

      // L'ordine resta INTATTO (attivo, non cestinato, non eliminato).
      const { data: riga } = await adminDb()
        .from("ordini")
        .select("id, deleted_at")
        .eq("id", ordine.id)
        .single();
      expect(riga, "order must still exist").not.toBeNull();
      expect(riga?.deleted_at, "order must remain not-trashed").toBeNull();
    } finally {
      await adminDb().from("ordini").delete().eq("id", ordine.id);
      await cestinaNegozioDiTest(storeId);
    }
  });

  test("TEST 4 — guardia: mai eliminare definitivamente un ordine NON cestinato", async ({ page }) => {
    test.setTimeout(240_000);

    await loginMerchant(page);
    const nomeNegozio = `QA Def Guardia ${Date.now()}`;
    const { id: storeId } = await creaNegozio(page, nomeNegozio);
    const ordine = await inserisciOrdineDiTest(storeId, nomeNegozio, 1);

    try {
      await loginAdmin(page);
      // Nessun soft delete: l'ordine è ancora ATTIVO.
      const res = await page.evaluate(async (id) => {
        const r = await fetch(`/api/amministratore/ordini/${id}/definitivo`, { method: "DELETE" });
        return { status: r.status, json: await r.json() };
      }, ordine.id);
      expect(res.status, "definitive delete of ACTIVE order must fail").toBe(409);
      expect(res.json?.error?.code, "error code").toBe("ORDINE_NON_NEL_CESTINO");

      // L'ordine è rimasto intatto.
      const { data: riga } = await adminDb()
        .from("ordini")
        .select("id, stato, deleted_at")
        .eq("id", ordine.id)
        .single();
      expect(riga, "order must still exist").not.toBeNull();
      expect(riga?.deleted_at, "order must remain active").toBeNull();
      expect(riga?.stato, "order state must be untouched").toBe("in_preparazione");
    } finally {
      await adminDb().from("ordini").delete().eq("id", ordine.id);
      await cestinaNegozioDiTest(storeId);
    }
  });
});
