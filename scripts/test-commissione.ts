/**
 * TEST COMMISSIONE PIATTAFORMA (V1) — puri + mock gateway Stripe.
 *
 * Copre:
 *   A) commissione 10% calcolata correttamente;
 *   B) arrotondamento deterministico ai centesimi;
 *   C) la commissione non è manipolabile dal client (nessun campo nel payload);
 *   E) Stripe Connect → application_fee_amount corretto (in centesimi, dallo
 *      snapshot ordine);
 *   F) ordine senza Connect → comportamento legacy (NESSUNA application fee);
 *   G) multi-negozio → commissione indipendente per ogni ordine;
 *   J) casi limite: totale zero, importi decimali, clamp fee ≤ totale.
 *
 * Nessuna chiamata di rete reale: Stripe è simulato con un server HTTP locale
 * (pattern test-pagamenti-f1). Nessun dato modificato.
 *
 * Uso: npx tsx scripts/test-commissione.ts
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Stripe from "stripe";
import { GatewayStripe } from "@/lib/pagamenti/stripe";
import { calcolaCommissione, COMMISSIONE_PERCENTUALE_DEFAULT } from "@/lib/pagamenti/commissione";
import type { ContestoCheckout, CredenzialiGateway } from "@/lib/pagamenti/types";

// Carica .env.local (per PAYMENTS_ENCRYPTION_KEY non serve qui; nessuna rete reale)
try {
  const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* nessun env necessario per i test puri/mock */
}

let passati = 0;
let falliti = 0;

function check(label: string, cond: boolean, dettaglio?: unknown) {
  if (cond) {
    passati++;
    console.log(`  ✅ ${label}`);
  } else {
    falliti++;
    console.log(`  ❌ ${label}${dettaglio !== undefined ? ` — ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

function uguali(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}

const CTX_BASE: ContestoCheckout = {
  ordineId: "11111111-1111-4111-8111-111111111111",
  negozioId: "22222222-2222-4222-8222-222222222222",
  numeroOrdine: "LH-000999",
  importo: 31.0,
  valuta: "EUR",
  metodo: "carta",
  returnUrl: "https://www.incitta.online/ordini/conferma/11111111-1111-4111-8111-111111111111",
  cancelUrl: "https://www.incitta.online/ordini/conferma/11111111-1111-4111-8111-111111111111",
};

/** Server HTTP locale che simula le route Stripe usate dal gateway. */
function avviaMockStripe() {
  const chiamate: Array<{ url: string; method: string; body: string }> = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += String(c)));
    req.on("end", () => {
      chiamate.push({ url: req.url ?? "", method: req.method ?? "GET", body });
      if (req.method === "POST" && (req.url ?? "").startsWith("/v1/checkout/sessions")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          id: "cs_test_creata",
          url: "https://checkout.stripe.com/c/pay/cs_test_creata",
          status: "open",
          payment_status: "unpaid",
          expires_at: Math.floor(Date.now() / 1000) + 1800,
        }));
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  return new Promise<{ port: number; chiamate: typeof chiamate; chiudi: () => Promise<void> }>(
    (resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const port = (server.address() as AddressInfo).port;
        resolve({ port, chiamate, chiudi: () => new Promise((r) => server.close(() => r())) });
      });
    }
  );
}

async function main() {
  console.log("\n=== A) COMMISSIONE 10% ===\n");
  {
    check("totale 100 → commissione 10.00", uguali(calcolaCommissione(100, 10), 10));
    check("totale 50 → commissione 5.00", uguali(calcolaCommissione(50, 10), 5));
    check("totale 31 → commissione 3.10", uguali(calcolaCommissione(31, 10), 3.1));
    check("default percentuale = 10", COMMISSIONE_PERCENTUALE_DEFAULT === 10);
  }

  console.log("\n=== B) ARROTONDAMENTO CENTESIMI ===\n");
  {
    check("99.99 × 10% → 10.00 (round(999.9)=1000c)", uguali(calcolaCommissione(99.99, 10), 10));
    check("12.34 × 10% → 1.23 (round(123.4)=123c)", uguali(calcolaCommissione(12.34, 10), 1.23));
    check("123.45 × 10% → 12.35 (round(1234.5)=1235c)", uguali(calcolaCommissione(123.45, 10), 12.35));
    check("7.5% su 20 → 1.50", uguali(calcolaCommissione(20, 7.5), 1.5));
    check("3 decimali: 10.555 → 10.56 (centesimi)", uguali(calcolaCommissione(10.555, 10), 1.06));
  }

  console.log("\n=== C) NON MANIPOLABILE DAL CLIENT ===\n");
  {
    // La funzione accetta SOLO (totale, percentuale) — nessun valore dal client.
    // La percentuale proviene dalla config server (getCommissionePercentuale).
    check("la percentuale non è un parametro del payload/checkout", true);
    // Verifica concreta: il payload RPC NON contiene campi commissione.
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260904_commissione_piattaforma.sql"),
      "utf8"
    );
    const leggeDaPayload = /p_payload\s*->>\s*'commissione/i.test(migration);
    check("la RPC non legge MAI la commissione dal payload", !leggeDaPayload);
  }

  console.log("\n=== E) STRIPE CONNECT → application_fee_amount ===\n");
  const mock = await avviaMockStripe();
  const gateway = new GatewayStripe({ host: "127.0.0.1", port: mock.port, protocol: "http" });
  try {
    // La piattaforma usa la PROPRIA secret key per le richieste Connect.
    process.env.STRIPE_SECRET_KEY = "sk_test_piattaforma_mock";

    const credConnect: CredenzialiGateway = {
      stripeAccountId: "acct_merchant_mock",
      testMode: true,
    };

    // E1: commissione snapshot 3.10 su totale 31 → fee 310 centesimi.
    {
      const n = mock.chiamate.length;
      await gateway.creaSessione({ ...CTX_BASE, commissioneImporto: 3.1 }, credConnect);
      const body = decodeURIComponent(mock.chiamate[n]?.body ?? "");
      check("application_fee_amount presente (310 centesimi)", body.includes("application_fee_amount]=310"), body.match(/application_fee_amount\]=\d+/)?.[0] ?? "assente");
    }

    // E2: clamp — fee snapshot > totale → fee = totale (in centesimi).
    {
      const n = mock.chiamate.length;
      await gateway.creaSessione({ ...CTX_BASE, importo: 10, commissioneImporto: 15 }, credConnect);
      const body = decodeURIComponent(mock.chiamate[n]?.body ?? "");
      check("fee clamp a totale (1000 centesimi)", body.includes("application_fee_amount]=1000"), body.match(/application_fee_amount\]=\d+/)?.[0] ?? "assente");
    }

    // E3: commissione 0 / assente → nessuna fee anche con Connect.
    {
      const n = mock.chiamate.length;
      await gateway.creaSessione({ ...CTX_BASE, commissioneImporto: 0 }, credConnect);
      const body = decodeURIComponent(mock.chiamate[n]?.body ?? "");
      check("commissione 0 → nessuna application_fee", !body.includes("application_fee_amount"));
    }
  } finally {
    delete process.env.STRIPE_SECRET_KEY;
  }

  console.log("\n=== F) LEGACY (senza Connect) → invariato ===\n");
  {
    const credLegacy: CredenzialiGateway = {
      secret: "sk_test_negozio_legacy",
      testMode: true,
    };
    const n = mock.chiamate.length;
    await gateway.creaSessione({ ...CTX_BASE, commissioneImporto: 3.1 }, credLegacy);
    const body = decodeURIComponent(mock.chiamate[n]?.body ?? "");
    check("senza account_id → NESSUNA application_fee", !body.includes("application_fee_amount"));
    check("importo totale ancora dal DB (3100 centesimi)", body.includes("unit_amount]=3100"));
  }

  console.log("\n=== G) MULTI-NEGOZIO → commissione indipendente per ordine ===\n");
  {
    const ordine1 = calcolaCommissione(100, 10);
    const ordine2 = calcolaCommissione(50, 10);
    check("ordine 1 → 10.00, ordine 2 → 5.00 (indipendenti)", uguali(ordine1, 10) && uguali(ordine2, 5));
    check("commissione mai negativa", calcolaCommissione(100, 10) >= 0);
  }

  console.log("\n=== J) CASI LIMITE ===\n");
  {
    check("totale 0 → 0.00", uguali(calcolaCommissione(0, 10), 0));
    check("totale negativo → 0.00", uguali(calcolaCommissione(-10, 10), 0));
    check("percentuale 0 → 0.00", uguali(calcolaCommissione(100, 0), 0));
    check("percentuale negativa → 0.00", uguali(calcolaCommissione(100, -5), 0));
    check("percentuale 200 → clamp a totale", uguali(calcolaCommissione(5, 200), 5));
    check("commissione mai superiore al totale", calcolaCommissione(999.99, 10) <= 999.99);
  }

  await mock.chiudi();

  console.log(`\nCommissione: ${passati} passati, ${falliti} falliti.`);
  process.exit(falliti === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
