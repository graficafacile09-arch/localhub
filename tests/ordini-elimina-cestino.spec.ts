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

/** Inserisce un ordine REALE per il negozio (service role) e ritorna l'id. */
async function inserisciOrdineDiTest(negozioId: string, negozioNome: string): Promise<string> {
  const key = `qa-ord-elim-${Date.now()}-${negozioId.slice(0, 8)}`;
  const { data, error } = await adminDb()
    .from("ordini")
    .insert({
      idempotency_key: key,
      modalita: "ritiro",
      totale: 12.5,
      negozio_id: negozioId,
      negozio_nome: negozioNome,
      cliente_nome: "QA",
      cliente_cognome: "Ordini",
    })
    .select("id");
  expect(error, "insert ordine must succeed").toBeNull();
  return data?.[0]?.id as string;
}

async function loginAdmin(page: import("@playwright/test").Page) {
  await loginUtente(page, UTENTI.admin);
}
async function loginMerchant(page: import("@playwright/test").Page) {
  await loginUtente(page, UTENTI.merchantD);
}

test.describe.configure({ mode: "serial" });

test.describe("ELIMINA ORDINE — Area Amministratore (soft delete nel Cestino)", () => {
  test("admin elimina (soft delete) un ordine → sparisce dall'elenco e finisce nel Cestino; ripristino OK", async ({ page }) => {
    test.setTimeout(240_000);

    // 1. Merchant: crea un negozio reale (nome NON-demo).
    await loginMerchant(page);
    const nomeNegozio = `QA Ord Elim ${Date.now()}`;
    const { id: storeId } = await creaNegozio(page, nomeNegozio);

    // 2. Inserisci un ordine REALE.
    const ordineId = await inserisciOrdineDiTest(storeId, nomeNegozio);

    try {
      // 3. Admin: l'ordine è visibile nel dettaglio.
      await loginAdmin(page);
      const dettaglioInit = await page.evaluate(async (id) => {
        const r = await fetch(`/api/amministratore/ordini/${id}`);
        return { status: r.status, json: await r.json() };
      }, ordineId);
      expect(dettaglioInit.status, "GET dettaglio before elimina should be 200").toBe(200);
      expect(dettaglioInit.json.data.ordine.id).toBe(ordineId);

      // 4. API cestina (soft delete, non annulla, non cancella fisico).
      const cestina = await page.evaluate(async (id) => {
        const r = await fetch(`/api/amministratore/ordini/${id}/cestina`, { method: "POST" });
        return { status: r.status, json: await r.json() };
      }, ordineId);
      expect(cestina.status, "admin cestina should be 200").toBe(200);

      // 5. L'ordine NON è più nell'elenco ordinario (getOrdiniAdmin esclude cestinati).
      const listaDopo = await page.evaluate(async () => {
        const r = await fetch("/api/amministratore/ordini");
        return r.json();
      });
      const idOrdinari = ((listaDopo.data?.ordini ?? []) as { id: string }[]).map((o) => o.id);
      expect(idOrdinari, "eliminated order must not be in ordinary list").not.toContain(ordineId);

      // 6. Ed è presente nel Cestino ordini (lista del cestino).
      const cestinoJson = await page.evaluate(async () => {
        const r = await fetch("/api/amministratore/ordini/cestino");
        return r.json();
      });
      const idCestino = ((cestinoJson.data?.ordini ?? []) as { id: string }[]).map((o) => o.id);
      expect(idCestino, "eliminated order must be in orders trash").toContain(ordineId);

      // 7. Il record ESISTE ancora nel DB (soft delete: non cancellato fisicamente).
      const { data: dbRow, error: dbErr } = await adminDb()
        .from("ordini")
        .select("id, deleted_at, stato")
        .eq("id", ordineId)
        .single();
      expect(dbErr, "db read must succeed").toBeNull();
      expect(dbRow, "order row must still exist (soft delete)").not.toBeNull();
      expect(dbRow?.deleted_at, "deleted_at must be set").not.toBeNull();
      // Il soft delete NON è un annullamento: lo stato non è cambiato.
      expect(dbRow?.stato, "soft delete must not change order state (Annulla separato)").not.toBe("cancellato");

      // 8. Ripristino → torna nell'elenco ordinario.
      const ripristina = await page.evaluate(async (id) => {
        const r = await fetch(`/api/amministratore/ordini/${id}/ripristina`, { method: "POST" });
        return { status: r.status, json: await r.json() };
      }, ordineId);
      expect(ripristina.status, "admin ripristina should be 200").toBe(200);

      const listaFinale = await page.evaluate(async () => {
        const r = await fetch("/api/amministratore/ordini");
        return r.json();
      });
      const idFinali = ((listaFinale.data?.ordini ?? []) as { id: string }[]).map((o) => o.id);
      expect(idFinali, "restored order must be back in ordinary list").toContain(ordineId);

      const cestinoFinale = await page.evaluate(async () => {
        const r = await fetch("/api/amministratore/ordini/cestino");
        return r.json();
      });
      const idCestinoFinale = ((cestinoFinale.data?.ordini ?? []) as { id: string }[]).map((o) => o.id);
      expect(idCestinoFinale, "restored order must not be in trash").not.toContain(ordineId);
    } finally {
      // Cleanup: rimuovi l'ordine di test (se non rimosso dal ripristino lo
      // cancelliamo davvero).
      await adminDb().from("ordini").delete().eq("id", ordineId);
      // Riporta il negozio di test nel cestino (pulizia piattaforma).
      await page.evaluate(async (id) => {
        await fetch(`/api/amministratore/negozi/${id}/cestina`, { method: "POST" });
      }, storeId);
    }
  });

  test("un utente NON amministratore NON può eseguire l'eliminazione (403 via API)", async ({ page }) => {
    test.setTimeout(180_000);

    // Merchant: crea negozio + ordine.
    await loginMerchant(page);
    const nomeNegozio = `QA Ord NoAdmin ${Date.now()}`;
    const { id: storeId } = await creaNegozio(page, nomeNegozio);
    const ordineId = await inserisciOrdineDiTest(storeId, nomeNegozio);

    try {
      // Merchant (non admin) tenta di cestinare via API → 403.
      const cestina = await page.evaluate(async (id) => {
        const r = await fetch(`/api/amministratore/ordini/${id}/cestina`, { method: "POST" });
        return { status: r.status };
      }, ordineId);
      expect(cestina.status, "non-admin cestina must be 403").toBe(403);

      // La lettura del cestino ordini è anch'essa admin-only → 403.
      const cestino = await page.evaluate(async () => {
        const r = await fetch("/api/amministratore/ordini/cestino");
        return { status: r.status };
      });
      expect(cestino.status, "non-admin reading orders trash must be 403").toBe(403);

      // L'ordine esiste ancora (non rimosso né alterato dal tentativo
      // non-admin). Nota: la colonna deleted_at dipende dalla migration
      // cestino (non ancora applicata), quindi il check di non-cestino è
      // dimostrato dagli assert 403 sopra; qui verifichiamo solo l'esistenza.
      const { data: dbRow } = await adminDb()
        .from("ordini")
        .select("id")
        .eq("id", ordineId)
        .single();
      expect(dbRow, "order must still exist after rejected attempt").not.toBeNull();
      expect(dbRow?.id, "order id matches").toBe(ordineId);
    } finally {
      await adminDb().from("ordini").delete().eq("id", ordineId);
      await page.evaluate(async (id) => {
        await fetch(`/api/amministratore/negozi/${id}/cestina`, { method: "POST" });
      }, storeId);
    }
  });

  test("Elimina (soft delete) NON altera 'Annulla ordine' e resta distinto dallo stato cancellato", async ({ page }) => {
    test.setTimeout(180_000);

    // Merchant: crea negozio + ordine, poi lo annulla (Annulla resta invariato).
    // L'Annulla passa dal percorso VENDITORE (proprietario del negozio), che usa
    // la STESSA RPC aggiorna_stato_ordine del percorso admin. Su production il
    // gate admin della RPC è email-based (is_admin_authorized → solo
    // graficafacile09), quindi admin.test non può annullare via PATCH admin;
    // qui verifichiamo il percorso reale del proprietario (invariato).
    await loginMerchant(page);
    const nomeNegozio = `QA Ord Annulla ${Date.now()}`;
    const { id: storeId } = await creaNegozio(page, nomeNegozio);
    const ordineId = await inserisciOrdineDiTest(storeId, nomeNegozio);

    try {
      // Annulla l'ordine dal percorso venditore (motivo obbligatorio) → stato cancellato.
      const annulla = await page.evaluate(async (args) => {
        const r = await fetch(`/api/merchant/stores/${args.storeId}/ordini/${args.ordineId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stato: "cancellato", motivo: "annullato_altre_ragioni", nota: "test" }),
        });
        return { status: r.status, json: await r.json() };
      }, { storeId, ordineId });
      expect(annulla.status, "annulla should be 200").toBe(200);

      const { data: dopoAnnulla } = await adminDb()
        .from("ordini")
        .select("stato, deleted_at")
        .eq("id", ordineId)
        .single();
      expect(dopoAnnulla?.stato, "state must be cancellato").toBe("cancellato");
      expect(dopoAnnulla?.deleted_at, "annullare NON deve mettere nel cestino").toBeNull();

      // Ora elimina (soft delete) un ordine annullato: deve finire nel cestino.
      // L'eliminazione è admin-only: passiamo alla sessione admin.
      await loginAdmin(page);
      const cestina = await page.evaluate(async (id) => {
        const r = await fetch(`/api/amministratore/ordini/${id}/cestina`, { method: "POST" });
        return { status: r.status };
      }, ordineId);
      expect(cestina.status, "cestina of an annulled order should be 200").toBe(200);

      const { data: dopoCestina } = await adminDb()
        .from("ordini")
        .select("stato, deleted_at")
        .eq("id", ordineId)
        .single();
      expect(dopoCestina?.deleted_at, "Elimina deve spostare nel cestino").not.toBeNull();
      expect(dopoCestina?.stato, "Elimina deve PRESERVARE lo stato (non tocca Annulla)").toBe("cancellato");
    } finally {
      await adminDb().from("ordini").delete().eq("id", ordineId);
      await page.evaluate(async (id) => {
        await fetch(`/api/amministratore/negozi/${id}/cestina`, { method: "POST" });
      }, storeId);
    }
  });
});