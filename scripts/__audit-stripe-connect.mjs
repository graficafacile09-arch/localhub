/**
 * AUDIT (Stripe TEST mode) — riproduce ESATTAMENTE la chiamata di
 * createStripeExpressAccount + createStripeAccountLink usata da
 * POST /api/pagamenti/connect/crea, per osservare l'errore reale.
 *
 * Uso: node scripts/__audit-stripe-connect.mjs
 * Crea un account di TEST e lo elimina a fine script.
 */

import fs from "fs";
import Stripe from "stripe";

const txt = fs.readFileSync(".env.local", "utf8");
for (const line of txt.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

const key = process.env.STRIPE_SECRET_KEY ?? "";
console.log("chiave:", key.slice(0, 12) + "…", "(test:", key.startsWith("sk_test_"), ")");

const stripe = new Stripe(key);

async function prova(nome, fn) {
  try {
    const out = await fn();
    console.log(`✅ ${nome}\n${JSON.stringify(out, null, 2).slice(0, 1600)}`);
    return out;
  } catch (e) {
    const info = {
      name: e?.name,
      type: e?.type,
      code: e?.code,
      statusCode: e?.statusCode,
      message: e?.message,
      param: e?.param,
      raw: e?.raw?.message,
    };
    console.log(`❌ ${nome}\n${JSON.stringify(info, null, 2)}`);
    return null;
  }
}

// 1. Esattamente i parametri di createStripeExpressAccount().
const creato = await prova("v2.core.accounts.create (parametri attuali)", () =>
  stripe.v2.core.accounts.create({
    contact_email: undefined,
    display_name: undefined,
    dashboard: "express",
    defaults: {
      currency: "eur",
      responsibilities: {
        fees_collector: "application_express",
        losses_collector: "application",
      },
    },
    identity: { country: "IT" },
    configuration: {
      merchant: {
        capabilities: {
          card_payments: { requested: true },
          klarna_payments: { requested: true },
        },
      },
    },
    include: ["configuration.merchant", "requirements"],
  })
);

if (creato?.id) {
  await prova("v2.core.accountLinks.create (parametri attuali)", () =>
    stripe.v2.core.accountLinks.create({
      account: creato.id,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["merchant"],
          return_url: "https://example.com/ritorno-stripe",
          refresh_url: "https://example.com/ritorno-stripe?refresh=1",
          collection_options: { fields: "currently_due", future_requirements: "omit" },
        },
      },
    })
  );

  await prova("cleanup: accounts.del", () => stripe.accounts.del(creato.id));
}

process.exit(0);
