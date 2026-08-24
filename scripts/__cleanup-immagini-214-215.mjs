/**
 * PULIZIA RIFERIMENTI IMMAGINE ORFANI (FASE 8)
 *
 * Rimuove immagine_principale dai prodotti 214 e 215 USANDO il flusso
 * applicativo esistente: PUT /api/merchant/stores/{id}/products/{id} con
 * immaginePrincipale: "" (che il data layer mappa esplicitamente a NULL:
 * `trim() ? upload : null`). L'eco di tutti gli altri campi è fedele ai
 * valori correnti → si modifica SOLO immagine_principale.
 *
 * Sessione: admin.test (autorizzato localmente), che per canManageStore e
 * areaConsenteAccesso gestisce anche i negozi (Panificio Rossi).
 */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3100";
const STORE = "f3a82af7-dd47-482f-8a49-ea58e692238c";
const IDS = [214, 215];

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// 1) valori correnti dal DB (per l'eco fedele)
const { data: correnti } = await db.from("prodotti").select("*").in("id", IDS);
const mappa = new Map((correnti ?? []).map((r) => [Number(r.id), r]));

function buildPayload(row) {
  return {
    nome: row.nome,
    descrizione: row.descrizione,
    // campo immagine: SVUOTATO (l'unica modifica voluta)
    immaginePrincipale: "",
    categoria: row.categoria,
    sottocategoria: row.sottocategoria ?? null,
    marca: row.marca ?? undefined,
    colore: row.colore ?? undefined,
    materiale: row.materiale ?? undefined,
    // campi null/non configurati → omessi (restano invariati nel DB)
    paroleChiave: Array.isArray(row.parole_chiave) ? row.parole_chiave : [],
    prezzo: Number(row.prezzo),
    prezzoSuggerito: row.prezzo_suggerito != null ? Number(row.prezzo_suggerito) : null,
    quantitaDisponibile: row.quantita_disponibile,
    statoCondizione: row.stato_condizione ?? null,
    attivo: row.attivo,
    originePubblicazione: row.origine_pubblicazione ?? "manuale",
  };
}

// 2) login admin (localmente autorizzato)
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`${BASE}/login?area=admin`);
await page.waitForSelector("#email", { timeout: 15000 });
await page.fill("#email", "admin.test@localhub.it");
await page.fill("#password", "AdminTest123!");
await page.click('form[action="/api/auth/login"] button[type="submit"]');
await page.waitForURL("**/amministratore**", { timeout: 25000 });
console.log("Login admin OK");

// 3) PUT per ciascun prodotto
for (const id of IDS) {
  const row = mappa.get(id);
  if (!row) {
    console.log(`prodotto ${id}: non trovato — salto`);
    continue;
  }
  const payload = buildPayload(row);
  const r = await ctx.request.put(`${BASE}/api/merchant/stores/${STORE}/products/${id}`, {
    data: payload,
  });
  const body = await r.json();
  const ok = r.status() === 200;
  const nuovo = ok ? body.data?.product?.immagine_principale : undefined;
  console.log(`PUT prodotto ${id} → ${r.status()} | immagine dopo: ${JSON.stringify(nuovo)} ${ok ? "✅" : "❌ " + JSON.stringify(body).slice(0, 200)}`);
}

await browser.close();
process.exit(0);
