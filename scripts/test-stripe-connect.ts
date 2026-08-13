/**
 * TEST — STRIPE CONNECT (Fase 1).
 *
 * Verifica la catena di collegamento Stripe Connect SENZA credenziali reali:
 *   - state OAuth firmato (CSRF + binding al negozio);
 *   - costruzione dell'URL di autorizzazione Connect;
 *   - GatewayStripe in modalità Connect: usa la SECRET KEY DELLA PIATTAFORMA
 *     e inoltra l'header `Stripe-Account` (nessun secret del merchant);
 *   - fallback legacy/direct invariato (secret del negozio, nessun header);
 *   - fail-closed quando manca la platform key;
 *   - (se la migration 20260827 è applicata) round-trip DB account↔negozio
 *     + readiness + nessuna esposizione di secret;
 *   - regressione readiness legacy (secret + webhook secret).
 *
 * Uso: npx tsx scripts/test-stripe-connect.ts
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { GatewayStripe } from "../lib/pagamenti/stripe";
import {
  firmaStatoConnect,
  verificaStatoConnect,
  estraiEVerificaStatoConnect,
  buildStripeConnectUrl,
  STRIPE_CONNECT_CALLBACK_PATH,
} from "../lib/pagamenti/stripe-connect";
import {
  getStripeConnectAccount,
  getNegozioIdByStripeAccount,
  isProviderProntoPerNegozio,
  risolviCredenzialiGateway,
} from "../lib/pagamenti/config";
import type { ContestoCheckout } from "../lib/pagamenti/types";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const raw = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

let passati = 0;
let falliti = 0;
const fallitiNomi: string[] = [];

function check(nome: string, condizione: boolean, dettaglio?: unknown) {
  if (condizione) {
    passati++;
    console.log(`  ✅ ${nome}`);
  } else {
    falliti++;
    fallitiNomi.push(nome);
    console.log(`  ❌ ${nome}${dettaglio !== undefined ? ` → ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

function avviaMockStripe(): Promise<{
  port: number;
  ultima: () => { headers: Record<string, string | string[] | undefined> } | null;
  chiudi: () => Promise<void>;
}> {
  let ultima: { headers: Record<string, string | string[] | undefined> } | null = null;
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += String(c)));
    req.on("end", () => {
      ultima = { headers: req.headers };
      if (req.method === "POST" && (req.url ?? "").startsWith("/v1/checkout/sessions")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "cs_test_connect",
            url: "https://checkout.stripe.com/c/pay/cs_test_connect",
            status: "open",
            payment_status: "unpaid",
            expires_at: Math.floor(Date.now() / 1000) + 1800,
          })
        );
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        ultima: () => ultima,
        chiudi: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function header(m: { headers: Record<string, string | string[] | undefined> } | null, k: string) {
  const v = m?.headers?.[k];
  return Array.isArray(v) ? v[0] : v;
}

async function main() {
  loadEnv();

  // Valori di piattaforma SOLO per il test (mai salvati, mai reali).
  process.env.STRIPE_CONNECT_CLIENT_ID = process.env.STRIPE_CONNECT_CLIENT_ID ?? "ca_test_connect_123";
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_platform_123";
  process.env.PAYMENTS_ENCRYPTION_KEY = process.env.PAYMENTS_ENCRYPTION_KEY ?? "chiave-test-stripe-connect-0001";

  const negozio = "10000000-0000-4000-8000-000000000002";
  // redirect_uri FISSO e indipendente dal negozio (match esatto Stripe).
  const redirectUri = `https://www.incitta.online${STRIPE_CONNECT_CALLBACK_PATH}`;

  const ctx: ContestoCheckout = {
    ordineId: negozio,
    negozioId: negozio,
    numeroOrdine: "ORD-CONNECT-1",
    importo: 39.9,
    valuta: "EUR",
    metodo: "carta",
    returnUrl: "https://example.com/ok",
    cancelUrl: "https://example.com/cancel",
    righe: [{ nome: "Prodotto test", quantita: 1, prezzoUnitario: 39.9, variante: null }],
    costoSpedizione: 0,
  };

  // ── T1: state OAuth firmato (CSRF + binding) ──────────────────────────
  console.log("\n[T1] state OAuth firmato (CSRF + binding negozio)");
  const state = firmaStatoConnect(negozio);
  check("T1a state inizia con negozioId", state.startsWith(`${negozio}:`), state);
  check("T1b verifica state valido", verificaStatoConnect(state, negozio) === true);
  check("T1c state manipolato → false", verificaStatoConnect(`${state}x`, negozio) === false);
  check(
    "T1d state di altro negozio → false",
    verificaStatoConnect(state, "99999999-9999-9999-9999-999999999999") === false
  );
  check("T1e estrai negozioId dallo state", estraiEVerificaStatoConnect(state) === negozio);
  check("T1f state manomesso → null", estraiEVerificaStatoConnect(`${state}x`) === null);

  // ── T2: URL di autorizzazione Connect ─────────────────────────────────
  console.log("\n[T2] URL autorizzazione Connect");
  const { url: authUrl, state: state2 } = buildStripeConnectUrl(negozio, redirectUri);
  check("T2a dominio connect.stripe.com", authUrl.startsWith("https://connect.stripe.com/oauth/authorize"), authUrl);
  check("T2b client_id presente", authUrl.includes(`client_id=${encodeURIComponent("ca_test_connect_123")}`), authUrl);
  check("T2c scope=read_write", authUrl.includes("scope=read_write"), authUrl);
  check("T2d redirect_uri presente", authUrl.includes(encodeURIComponent(redirectUri)), authUrl);
  check("T2e state riutilizzabile", verificaStatoConnect(state2, negozio) === true);
  check(
    "T2f redirect_uri NON contiene negozioId nel path",
    !authUrl.includes(encodeURIComponent(`/stores/${negozio}/`)),
    authUrl
  );

  // ── T3: gateway Connect → Stripe-Account + platform key ───────────────
  console.log("\n[T3] GatewayStripe Connect (on-behalf-of, nessun secret merchant)");
  const mock = await avviaMockStripe();
  try {
    const gateway = new GatewayStripe({ host: "127.0.0.1", port: mock.port, protocol: "http" });
    const sessione = await gateway.creaSessione(ctx, { stripeAccountId: "acct_test_123", testMode: false });
    check("T3a sessione con url", typeof sessione.redirectUrl === "string" && sessione.redirectUrl.length > 0);
    check("T3b header Stripe-Account", header(mock.ultima(), "stripe-account") === "acct_test_123", header(mock.ultima(), "stripe-account"));
    check("T3c authorization = platform key", header(mock.ultima(), "authorization") === "Bearer sk_test_platform_123", header(mock.ultima(), "authorization"));
  } finally {
    await mock.chiudi();
  }

  // ── T4: gateway legacy direct invariato ───────────────────────────────
  console.log("\n[T4] GatewayStripe legacy direct (nessun header, secret negozio)");
  const mock2 = await avviaMockStripe();
  try {
    const gateway2 = new GatewayStripe({ host: "127.0.0.1", port: mock2.port, protocol: "http" });
    await gateway2.creaSessione(ctx, { secret: "sk_test_merchant_123", webhookSecret: "whsec_x", testMode: true });
    check("T4a nessun header Stripe-Account", header(mock2.ultima(), "stripe-account") === undefined, header(mock2.ultima(), "stripe-account"));
    check("T4b authorization = secret negozio", header(mock2.ultima(), "authorization") === "Bearer sk_test_merchant_123", header(mock2.ultima(), "authorization"));
  } finally {
    await mock2.chiudi();
  }

  // ── T5: platform key mancante → fail-closed ───────────────────────────
  console.log("\n[T5] Connect senza platform key → errore tipizzato");
  const mock3 = await avviaMockStripe();
  try {
    const gateway3 = new GatewayStripe({ host: "127.0.0.1", port: mock3.port, protocol: "http" });
    const oldKey = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    let errore: string | null = null;
    try {
      await gateway3.creaSessione(ctx, { stripeAccountId: "acct_test_123", testMode: false });
    } catch (e) {
      errore = (e as { codice?: string }).codice ?? null;
    } finally {
      process.env.STRIPE_SECRET_KEY = oldKey;
    }
    check("T5a codice STRIPE_PLATFORM_NON_CONFIGURATA", errore === "STRIPE_PLATFORM_NON_CONFIGURATA", errore);
  } finally {
    await mock3.chiudi();
  }

  // ── DB ────────────────────────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    console.log("  ⏭️ T6/T7 SKIP: env Supabase mancante");
  } else {
    const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

    // T6: round-trip Connect (solo se la migration 20260827 è applicata).
    console.log("\n[T6] Round-trip DB account Connect ↔ negozio");
    const { error: probeErr } = await db.from("negozio_pagamenti").select("account_id").limit(1);
    if (probeErr) {
      console.log("  ⏭️ T6 SKIP: colonna account_id assente (migration 20260827 non ancora applicata)");
    } else {
      const ts = Date.now();
      const { data: n } = await db
        .from("negozi")
        .insert({ nome: `StripeConnect-${ts}`, slug: `stripe-connect-${ts}`, attivo: true, is_demo: true })
        .select("id")
        .single();
      const negozioId = String(n!.id);
      try {
        const { error: cErr } = await db
          .from("negozio_pagamenti")
          .upsert(
            { negozio_id: negozioId, provider: "stripe", attivo: true, account_id: "acct_test_123", account_name: "Test Shop" },
            { onConflict: "negozio_id,provider" }
          );
        check("T6a upsert account connect", !cErr, cErr?.message);

        const conn = await getStripeConnectAccount(negozioId);
        check("T6b getStripeConnectAccount", conn?.accountId === "acct_test_123", conn);
        check("T6c account_name", conn?.accountName === "Test Shop", conn?.accountName);

        const risolto = await getNegozioIdByStripeAccount("acct_test_123");
        check("T6d account → negozio", risolto === negozioId, risolto);

        check("T6e isProviderPronto (connect)", (await isProviderProntoPerNegozio(negozioId, "stripe")) === true);

        const cred = await risolviCredenzialiGateway(negozioId, "stripe");
        check("T6f cred: stripeAccountId presente", cred.cred?.stripeAccountId === "acct_test_123");
        check("T6g cred: NESSUN secret/webhook esposto", cred.cred?.secret === undefined && cred.cred?.webhookSecret === undefined);

        await db
          .from("negozio_pagamenti")
          .update({ account_id: null, account_name: null, attivo: false })
          .eq("negozio_id", negozioId)
          .eq("provider", "stripe");
        check("T6h dopo disconnect → non pronto", (await isProviderProntoPerNegozio(negozioId, "stripe")) === false);
      } finally {
        await db.from("negozi").delete().eq("id", negozioId);
      }
    }

    // T7: regressione readiness legacy (secret + webhook secret).
    console.log("\n[T7] Regressione readiness legacy (secret + webhook secret)");
    const ts = Date.now();
    const { data: n2 } = await db
      .from("negozi")
      .insert({ nome: `StripeLegacy-${ts}`, slug: `stripe-legacy-${ts}`, attivo: true, is_demo: true })
      .select("id")
      .single();
    const negozioId2 = String(n2!.id);
    try {
      check("T7a nessuna config → non pronto", (await isProviderProntoPerNegozio(negozioId2, "stripe")) === false);
      const { error: sErr } = await db.rpc("pagamenti_credenziali_salva", {
        p_negozio_id: negozioId2,
        p_provider: "stripe",
        p_attivo: true,
        p_test_mode: true,
        p_client_id: null,
        p_payee_email: null,
        p_iban: null,
        p_secret: "sk_test_legacy",
        p_webhook_secret: "whsec_legacy",
        p_chiave: process.env.PAYMENTS_ENCRYPTION_KEY,
      });
      check("T7b salva config legacy", !sErr, sErr?.message);
      check("T7c secret+webhook → pronto", (await isProviderProntoPerNegozio(negozioId2, "stripe")) === true);
    } finally {
      await db.from("negozi").delete().eq("id", negozioId2);
    }
  }

  console.log(`\n────────── ESITO: ${passati} passati, ${falliti} falliti ──────────`);
  if (falliti > 0) {
    console.log("Test falliti:");
    for (const n of fallitiNomi) console.log(`  - ${n}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("ERRORE:", e);
  process.exit(1);
});
