/**
 * TEST ACCETTAZIONE — BUY-NOW PAYPAL (dispatch end-to-end, mock HTTP PayPal).
 *
 * Dimostra la CATENA COMPLETA del metodo PayPal nel buy-now:
 *   POST /api/cliente/ordini con metodoPagamento='paypal'
 *   → validazione metodo (paypal ammesso)
 *   → pre-flight provider (paypal configurato e attivo)
 *   → creazione ordine (metodo_pagamento='paypal')
 *   → dispatch gateway PayPal (creaSessionePagamentoPerOrdine provider 'paypal')
 *   → sessione + redirect (hosted checkout PayPal).
 *
 * L'unico layer simulato è l'HTTP di PayPal (PAYPAL_API_BASE_URL → mock):
 *   - OAuth2 client-credentials → access token;
 *   - POST /v2/checkout/orders → order id + approve link.
 * Le credenziali del negozio sono placeholder: il mock le accetta, quindi il
 * test verifica il ROUTING reale (PayPal → PayPal, mai Stripe/Klarna) senza
 * toccare l'API reale di PayPal.
 *
 * Copre inoltre il fail-closed: negozio SENZA PayPal → 422 PAYPAL_NON_DISPONIBILE,
 * zero ordini, zero sessioni, nessun fallback.
 *
 * Uso: npx tsx scripts/test-paypal-buynow.ts
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGETTO = join(__dirname, "..");

const CHIAVE_TEST = "chiave-paypal-buynow-0001";
const PAYPAL_CLIENT_ID = "AfPaypalClientIdBuynow";
const PAYPAL_SECRET = "EPaypalSecretBuynow";
const PAYPAL_WEBHOOK_ID = "webhook_id_paypal_buynow";

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

function loadEnv() {
  try {
    const raw = readFileSync(join(PROGETTO, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^[\"']|[\"']$/g, "");
    }
  } catch {}
}

// ── Mock HTTP PayPal (OAuth2 + create order) ────────────────────────────────
function avviaMockPaypal() {
  let contatore = 0;
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += String(c)));
    req.on("end", () => {
      const rispondi = (status: number, payload?: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(payload !== undefined ? JSON.stringify(payload) : "");
      };
      if (req.method === "POST" && req.url === "/v1/oauth2/token") {
        return rispondi(200, { access_token: "MOCK_ACCESS_TOKEN", token_type: "Bearer" });
      }
      if (req.method === "POST" && req.url === "/v2/checkout/orders") {
        contatore++;
        const orderId = `MOCK_PAYPAL_ORDER_${contatore}`;
        return rispondi(200, {
          id: orderId,
          status: "CREATED",
          links: [{ href: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`, rel: "approve" }],
        });
      }
      rispondi(404, { name: "RESOURCE_NOT_FOUND" });
    });
  });
  return new Promise<{ port: number; chiudi: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ port, chiudi: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

const PORTA = Number(process.env.PAYPAL_BUYNOW_PORT ?? 3188);
const BASE = `http://127.0.0.1:${PORTA}`;
let server: ChildProcess | null = null;

async function avviaServer(mockPort: number): Promise<void> {
  const log = createWriteStream(join(tmpdir(), "paypal-buynow-next-dev.log"), { flags: "w" });
  server = spawn(`npx next dev -p ${PORTA} --webpack`, {
    cwd: PROGETTO,
    env: {
      ...process.env,
      PAYMENTS_ENCRYPTION_KEY: CHIAVE_TEST,
      PAYPAL_API_BASE_URL: `http://127.0.0.1:${mockPort}`,
      ORDINI_RATE_LIMIT_PER_MINUTE: "1000",
      ORDINI_RATE_LIMIT_PER_HOUR: "10000",
      RESEND_API_KEY: "",
      NODE_ENV: "development",
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("Server dev terminato. Vedi " + join(tmpdir(), "paypal-buynow-next-dev.log"));
    try {
      const res = await fetch(`${BASE}/api/cliente/ordini`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.7.7.7" },
        body: "{}",
      });
      if (res.status === 422) return console.log(`\nServer dev pronto su ${BASE} (mock PayPal ${mockPort}).\n`);
    } catch {}
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Server dev non pronto entro 240s.");
}

function fermaServer(): void {
  if (!server) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  } catch {}
  server = null;
}

async function postJson(path: string, body: unknown): Promise<{ status: number } & Record<string, any>> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.7.7.8" },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, ...(json ?? {}) };
}

function payloadBuyNow(idempotencyKey: string, prodottoId: string, metodoPagamento: string) {
  return {
    idempotencyKey,
    prodottoId: String(prodottoId),
    varianteId: null,
    quantita: 1,
    modalita: "spedizione",
    cliente: { nome: "Mario", cognome: "Paypal", email: "paypal@localhub.test", telefono: "3331234567" },
    spedizione: {
      indirizzo: "Via Test 1",
      cap: "87100",
      citta: "Cosenza",
      provincia: "CS",
      note: null,
      carrier: "poste_italiane", servizio: "standard",
      metodoPagamento,
    },
    note: null,
  };
}

async function main() {
  loadEnv();
  process.env.PAYMENTS_ENCRYPTION_KEY = CHIAVE_TEST;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error("Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const db = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const ts = Date.now();

  let negozioP: string | null = null; // paypal configurato
  let negozioN: string | null = null; // nessun gateway
  let prodottoP: string | null = null;
  let prodottoN: string | null = null;
  const ordiniCreati: string[] = [];
  let mock: Awaited<ReturnType<typeof avviaMockPaypal>> | null = null;

  try {
    mock = await avviaMockPaypal();
    await avviaServer(mock.port);

    console.log("\n[SETUP] negozio P (paypal configurato) + negozio N (zero gateway)");
    const { data: nP } = await db.from("negozi").insert({ nome: `PaypalP-${ts}`, slug: `paypal-p-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioP = String(nP!.id);
    const { data: nN } = await db.from("negozi").insert({ nome: `PaypalN-${ts}`, slug: `paypal-n-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioN = String(nN!.id);

    await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioP, p_provider: "paypal", p_attivo: true, p_test_mode: true,
      p_client_id: PAYPAL_CLIENT_ID, p_secret: PAYPAL_SECRET, p_webhook_secret: PAYPAL_WEBHOOK_ID, p_chiave: CHIAVE_TEST,
    });
    await db.from("negozio_metodi_pagamento").insert([
      { negozio_id: negozioP, metodo: "paypal", attivo: true, ordine_mostra: 0 },
      { negozio_id: negozioP, metodo: "bonifico", attivo: true, ordine_mostra: 1 },
    ]);

    const { data: pP } = await db.from("prodotti").insert({ negozio_id: negozioP, nome: `PaypalP-${ts}`, slug: `paypal-p-${ts}`, prezzo: 25, quantita_disponibile: 7, attivo: true, ha_varianti: false, peso_grammi: 1500 }).select("id").single();
    prodottoP = String(pP!.id);
    const { data: pN } = await db.from("prodotti").insert({ negozio_id: negozioN, nome: `PaypalN-${ts}`, slug: `paypal-n-${ts}`, prezzo: 20, quantita_disponibile: 7, attivo: true, ha_varianti: false, peso_grammi: 1500 }).select("id").single();
    prodottoN = String(pN!.id);

    // ── T1: negozio SENZA paypal → 422 PAYPAL_NON_DISPONIBILE ────────────
    console.log("\n[T1] Buy-now paypal su negozio NON configurato → 422, zero ordini");
    {
      const esito = await postJson("/api/cliente/ordini", payloadBuyNow(`pp-nonconf-${ts}`, prodottoN, "paypal"));
      check("1a. HTTP 422", esito.status === 422, esito.status);
      check("1b. codice PAYPAL_NON_DISPONIBILE", esito.error?.code === "PAYPAL_NON_DISPONIBILE", esito.error);
      const { count } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `pp-nonconf-%`);
      check("1c. zero ordini creati", Number(count ?? 0) === 0, count);
    }

    // ── T2: negozio CON paypal → ordine + dispatch PayPal (mock) ─────────
    console.log("\n[T2] Buy-now paypal su negozio configurato → ordine paypal + sessione PayPal");
    {
      const { data: stkPrima } = await db.from("prodotti").select("quantita_disponibile").eq("id", prodottoP).single();
      const stockPrima = Number(stkPrima?.quantita_disponibile ?? -1);
      const key = `pp-conf-${ts}`;
      const esito = await postJson("/api/cliente/ordini", payloadBuyNow(key, prodottoP, "paypal"));
      check("2a. 201 + ordine creato", esito.status === 201 && Boolean(esito.data?.ordine?.id), { status: esito.status, error: esito.error });
      const ordineId = esito.data?.ordine?.id ? String(esito.data.ordine.id) : null;
      if (ordineId) ordiniCreati.push(ordineId);
      check("2b. redirectUrl PayPal (hosted checkout)", typeof esito.data?.pagamento?.redirectUrl === "string" && esito.data.pagamento.redirectUrl.startsWith("https://www.sandbox.paypal.com/checkoutnow?"), esito.data?.pagamento);

      const { data: ordine } = await db.from("ordini").select("id, metodo_pagamento, payment_provider, payment_status, stato").eq("id", ordineId).single();
      check("2c. metodo_pagamento='paypal' persistito", ordine?.metodo_pagamento === "paypal", ordine?.metodo_pagamento);
      check("2d. payment_provider='paypal' (mai stripe/klarna)", ordine?.payment_provider === "paypal", ordine?.payment_provider);
      check("2e. payment_status='pending'", ordine?.payment_status === "pending", ordine?.payment_status);
      check("2f. ordine NON cancellato (sessione ok)", ordine?.stato !== "cancellato", ordine?.stato);

      const { data: sessioni } = await db.from("pagamenti_sessioni").select("provider, status").eq("ordine_id", ordineId);
      check("2g. una sessione PayPal persistita", Array.isArray(sessioni) && sessioni.length === 1 && sessioni[0].provider === "paypal", sessioni);

      const { data: stkDopo } = await db.from("prodotti").select("quantita_disponibile").eq("id", prodottoP).single();
      check("2h. stock decrementato UNA volta", Number(stkDopo?.quantita_disponibile ?? -1) === stockPrima - 1, { prima: stockPrima, dopo: stkDopo?.quantita_disponibile });
    }

    // ── T3: nessun fallback — paypal MAI mappa su stripe/klarna/bonifico ──
    console.log("\n[T3] Nessun fallback: paypal → gateway PayPal (mai Stripe/Klarna)");
    {
      const { data: ultimo } = await db.from("ordini").select("payment_provider, metodo_pagamento").like("idempotency_key", `pp-conf-${ts}%`).single();
      check("3a. payment_provider esclusivamente 'paypal'", ultimo?.payment_provider === "paypal", ultimo);
      const { count: sessStripe } = await db.from("pagamenti_sessioni").select("id", { count: "exact", head: true }).in("provider", ["stripe", "klarna"]).gt("created_at", new Date(ts - 60_000).toISOString());
      check("3b. nessuna sessione Stripe/Klarna creata", Number(sessStripe ?? 0) === 0, sessStripe);
    }

    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`PAYPAL BUY-NOW TEST: ${passati} passati, ${falliti} falliti`);
    if (falliti > 0) {
      console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
      process.exitCode = 1;
    } else {
      console.log("TUTTI I TEST PASSATI ✓ — PayPal → gateway PayPal, nessun fallback");
    }
  } finally {
    console.log("\n── CLEANUP ──");
    for (const id of [negozioP, negozioN]) {
      if (!id) continue;
      const { data: ordini } = await db.from("ordini").select("id").eq("negozio_id", id);
      const ids = (ordini ?? []).map((o: any) => String(o.id));
      if (ids.length > 0) {
        await db.from("pagamenti_eventi").delete().in("ordine_id", ids);
        await db.from("pagamenti_sessioni").delete().in("ordine_id", ids);
        await db.from("ordini").delete().in("id", ids);
      }
      await db.from("prodotti").delete().eq("negozio_id", id);
      await db.from("negozio_metodi_pagamento").delete().eq("negozio_id", id);
      await db.from("negozio_pagamenti").delete().eq("negozio_id", id);
      await db.from("negozi").delete().eq("id", id);
    }
    fermaServer();
    if (mock) await mock.chiudi().catch(() => {});
    console.log("  Dati di test eliminati.");
  }
}

main().catch((e) => {
  console.error("Errore:", e);
  process.exit(1);
});
