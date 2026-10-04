/**
 * AUDIT (Stripe TEST mode) — trova la configurazione di connected account
 * COMPATIBILE con la piattaforma senza richiedere l'acknowledgment manuale
 * della liability (dashboard Stripe).
 *
 * Uso: node scripts/__audit-stripe-connect-2.mjs
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
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

async function prova(nome, fn) {
  try {
    const out = await fn();
    console.log(`✅ ${nome} → ${out?.id ?? "(ok)"}`);
    return out;
  } catch (e) {
    console.log(`❌ ${nome} → [${e?.code ?? e?.type}] ${e?.message}`);
    return null;
  }
}

const creati = [];

// 1. V2 liability su Stripe
const a = await prova("v2 losses_collector=stripe", () =>
  stripe.v2.core.accounts.create({
    dashboard: "express",
    defaults: {
      currency: "eur",
      responsibilities: { fees_collector: "application_express", losses_collector: "stripe" },
    },
    identity: { country: "IT" },
    configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
    include: ["configuration.merchant"],
  })
);
if (a?.id) creati.push(a.id);

// 2. V2 fees_collector=application
const b = await prova("v2 fees_collector=application", () =>
  stripe.v2.core.accounts.create({
    dashboard: "express",
    defaults: {
      currency: "eur",
      responsibilities: { fees_collector: "application", losses_collector: "application" },
    },
    identity: { country: "IT" },
    configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
    include: ["configuration.merchant"],
  })
);
if (b?.id) creati.push(b.id);

// 3. V1 Express (flusso classico)
const c = await prova("v1 accounts.create type=express", () =>
  stripe.accounts.create({
    type: "express",
    country: "IT",
    email: "audit@example.com",
    business_type: "individual",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
      klarna_payments: { requested: true },
    },
  })
);
if (c?.id) creati.push(c.id);

// 4. V2 senza responsibilities
const d = await prova("v2 senza responsibilities", () =>
  stripe.v2.core.accounts.create({
    dashboard: "express",
    identity: { country: "IT" },
    configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
    include: ["configuration.merchant"],
  })
);
if (d?.id) creati.push(d.id);

// 5. platform profile corrente (se leggibile)
await prova("connect platform profile", () =>
  stripe.rawRequest ? stripe.rawRequest("GET", "/v1/accounts?limit=1") : null
);

// Account Link per l'account v1 se creato
if (c?.id) {
  await prova("v1 accountLinks.create", () =>
    stripe.accountLinks.create({
      account: c.id,
      type: "account_onboarding",
      return_url: "https://example.com/ritorno-stripe",
      refresh_url: "https://example.com/ritorno-stripe?refresh=1",
    })
  );
}

for (const id of creati) {
  await prova(`cleanup ${id}`, () => stripe.accounts.del(id));
}

process.exit(0);
