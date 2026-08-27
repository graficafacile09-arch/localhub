/**
 * AUDIT READ-ONLY — dati di test nel DB condiviso InCittà.
 * SOLO SELECT. Nessuna insert/update/delete. Nessuna chiamata di scrittura.
 * Uso: node scripts/__audit-dati-test-ro.mjs [fase]
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── carica .env.local ────────────────────────────────────────────────
function loadEnv() {
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv();
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(URL, KEY);

let totalScritture = 0;

/** Solo SELECT con conteggio esatto. */
async function count(tabella) {
  const { count, error } = await db
    .from(tabella)
    .select("*", { count: "exact", head: true });
  if (error) return { err: error.message };
  return { count };
}

/** Solo SELECT di righe (con limite opzionale). */
async function rows(tabella, select, opts = {}) {
  let q = db.from(tabella).select(select ?? "*");
  if (opts.order) q = q.order(opts.order.col, { ascending: opts.order.asc ?? true });
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) return { err: error.message };
  return { data };
}

const TABELLE = [
  "negozi",
  "prodotti",
  "product_media",
  "media",
  "categorie",
  "template_negozi",
  "user_roles",
  "cliente_profili",
  "preferiti",
  "offerte",
  "eventi",
  "admin_activity_log",
  "segnalazioni",
  "ordini",
  "ordini_righe",
  "ordini_eventi",
  "ordine_reclami",
  "reclamo_comunicazioni",
  "negozio_pagamenti",
  "negozio_metodi_pagamento",
  "pagamenti_sessioni",
  "pagamenti_eventi",
  "prodotto_varianti",
  "product_stock_notifications",
  "payout",
  "negozio_metodi_spedizione",
  "piattaforma_config",
  "product_vision_cache",
  "scan_log",
];

async function fase1_conteggi() {
  console.log("=== FASE 1 — CONTEGGI PER TABELLA (solo SELECT) ===");
  for (const t of TABELLE) {
    const r = await count(t);
    console.log(`${t.padEnd(30)} ${r.err ? "ERR: " + r.err : r.count}`);
  }
}

async function fase2_campioni() {
  console.log("\n=== FASE 2 — CAMPIONI (id, nome, data, campi identificativi) ===");
  const campioni = {
    negozi: "id, nome, slug, citta, is_demo, attivo, owner_user_id, created_at, deleted_at",
    prodotti: "id, nome, slug, negozio_id, attivo, created_at",
    ordini: "id, cliente_user_id, negozio_id, stato, codice_ordine, payment_provider, created_at",
    ordini_righe: "id, ordine_id, prodotto_id, nome_prodotto, quantita, prezzo_unitario",
    eventi: "id, negozio_id, titolo, luogo, attivo, created_at",
    offerte: "id, negozio_id, titolo, attiva, created_at",
    "cliente_profili": "id, user_id, nome, email, created_at",
    user_roles: "id, user_id, role",
    media: "id, negozio_id, nome, mime_type, created_at",
    product_media: "id, prodotto_id, url, alt_text, created_at",
    pagamenti_sessioni: "id, ordine_id, provider, stato, created_at",
    payout: "id, negozio_id, stato, periodo_inizio, periodo_fine, created_at",
    ordine_reclami: "id, ordine_id, cliente_user_id, negozio_id, stato, creato_il",
    segnalazioni: "id, utente_id, tipo, riferimento_id, stato, created_at",
  };
  for (const [t, sel] of Object.entries(campioni)) {
    const r = await rows(t, sel, { limit: 200 });
    if (r.err) {
      console.log(`\n[${t}] ERR: ${r.err}`);
      continue;
    }
    console.log(`\n[${t}] — ${r.data.length} righe (max 200)`);
    for (const row of r.data) console.log("  " + JSON.stringify(row));
  }
}

async function fase3_auth_users() {
  console.log("\n=== FASE 3 — auth.users (via admin API, read-only) ===");
  try {
    const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) {
      console.log("ERR: " + error.message);
      return;
    }
    console.log(`totale utenti: ${data.users.length}`);
    for (const u of data.users) {
      console.log(
        `  id=${u.id} email=${u.email ?? "-"} created=${u.created_at} lastSignIn=${u.last_sign_in_at ?? "-"}`
      );
    }
  } catch (e) {
    console.log("ERR listUsers: " + (e instanceof Error ? e.message : e));
  }
}

async function fase4_schema() {
  console.log("\n=== FASE 4 — SCHEMA + RIGHE (select * limit 3) ===");
  const tabelle = [
    "ordini", "cliente_profili", "product_media", "pagamenti_sessioni",
    "pagamenti_eventi", "payout", "ordine_reclami", "reclamo_comunicazioni",
    "segnalazioni", "preferiti", "negozio_metodi_spedizione", "negozio_pagamenti",
    "negozio_metodi_pagamento", "ordini_eventi", "admin_activity_log",
    "product_stock_notifications", "piattaforma_config", "scan_log",
    "product_vision_cache", "negozio_metodi_spedizione", "prodotto_varianti",
    "template_negozi", "categorie",
  ];
  for (const t of tabelle) {
    const r = await rows(t, "*", { limit: 3 });
    if (r.err) {
      console.log(`\n[${t}] ERR: ${r.err}`);
      continue;
    }
    console.log(`\n[${t}] — ${r.data.length} righe (max 3)`);
    for (const row of r.data) console.log("  " + JSON.stringify(row));
  }
}

async function fase5_dettagli() {
  console.log("\n=== FASE 5 — DETTAGLIO COMPLETO (solo SELECT) ===");

  const rOrdini = await rows(
    "ordini",
    "id, numero, stato, totale, modalita, negozio_id, negozio_nome, cliente_user_id, cliente_email, cliente_nome, cliente_cognome, metodo_pagamento, payment_provider, payment_status, created_at, letto_at, annullato_at"
  );
  console.log(`\n[ordini] — ${rOrdini.data?.length ?? 0} righe`);
  for (const o of rOrdini.data ?? []) console.log("  " + JSON.stringify(o));

  const rSess = await rows("pagamenti_sessioni", "id, ordine_id, negozio_id, provider, payment_id, status, amount, created_at");
  console.log(`\n[pagamenti_sessioni] — ${rSess.data?.length ?? 0} righe`);
  for (const o of rSess.data ?? []) console.log("  " + JSON.stringify(o));

  const rPE = await rows("pagamenti_eventi", "id, provider, event_id, event_type, ordine_id, payment_id, status, received_at");
  console.log(`\n[pagamenti_eventi] — ${rPE.data?.length ?? 0} righe`);
  for (const o of rPE.data ?? []) console.log("  " + JSON.stringify(o));

  const rRecl = await rows("ordine_reclami", "id, ordine_id, negozio_id, cliente_user_id, cliente_email, tipo, stato, created_at");
  console.log(`\n[ordine_reclami] — ${rRecl.data?.length ?? 0} righe`);
  for (const o of rRecl.data ?? []) console.log("  " + JSON.stringify(o));

  const rCom = await rows("reclamo_comunicazioni", "id, reclamo_id, mittente, mittente_nome, created_at");
  console.log(`\n[reclamo_comunicazioni] — ${rCom.data?.length ?? 0} righe`);
  for (const o of rCom.data ?? []) console.log("  " + JSON.stringify(o));

  const rSegn = await rows("segnalazioni", "id, user_id, user_email, tipo, titolo, stato, created_at");
  console.log(`\n[segnalazioni] — ${rSegn.data?.length ?? 0} righe`);
  for (const o of rSegn.data ?? []) console.log("  " + JSON.stringify(o));

  const rNP = await rows("negozio_pagamenti", "id, negozio_id, provider, attivo, test_mode, payee_email, iban, account_id, created_at");
  console.log(`\n[negozio_pagamenti] — ${rNP.data?.length ?? 0} righe`);
  for (const o of rNP.data ?? []) console.log("  " + JSON.stringify(o));

  const rNMS = await rows("negozio_metodi_pagamento", "id, negozio_id, metodo, attivo, created_at");
  console.log(`\n[negozio_metodi_pagamento] — ${rNMS.data?.length ?? 0} righe`);
  for (const o of rNMS.data ?? []) console.log("  " + JSON.stringify(o));

  const rNMSp = await rows("negozio_metodi_spedizione", "id, negozio_id, carrier, servizio, attivo, created_at");
  console.log(`\n[negozio_metodi_spedizione] — ${rNMSp.data?.length ?? 0} righe`);
  for (const o of rNMSp.data ?? []) console.log("  " + JSON.stringify(o));

  const rOE = await rows("ordini_eventi", "id, ordine_id, evento, created_at");
  console.log(`\n[ordini_eventi] — ${rOE.data?.length ?? 0} righe (conteggio per ordine qui sotto)`);
  const perOrdine = {};
  for (const o of rOE.data ?? []) perOrdine[o.ordine_id] = (perOrdine[o.ordine_id] ?? 0) + 1;
  console.log("  per ordine: " + JSON.stringify(perOrdine));

  const rMedia = await rows("media", "id, negozio_id, nome, public_url, created_at");
  console.log(`\n[media] — ${rMedia.data?.length ?? 0} righe`);
  for (const o of rMedia.data ?? []) console.log("  " + JSON.stringify(o));
}

async function fase6_cross() {
  console.log("\n=== FASE 6 — VERIFICHE INCROCIATE (solo SELECT) ===");

  // 1. Prodotti orfani (negozio_id inesistente)
  const rN = await rows("negozi", "id");
  const negoziIds = new Set((rN.data ?? []).map((n) => n.id));
  const rP = await rows("prodotti", "id, nome, negozio_id");
  console.log("\n[prodotti orfani: negozio_id inesistente]");
  for (const p of rP.data ?? []) {
    if (!negoziIds.has(p.negozio_id)) console.log(`  id=${p.id} "${p.nome}" negozio_id=${p.negozio_id}`);
  }

  // 2. Prodotti con riferimento in ordini_righe / stock_notifications
  const rR = await rows("ordini_righe", "prodotto_id");
  const rSn = await rows("product_stock_notifications", "prodotto_id");
  const inRighe = new Set((rR.data ?? []).map((x) => String(x.prodotto_id)));
  const inNotif = new Set((rSn.data ?? []).map((x) => String(x.prodotto_id)));
  console.log("\n[prodotti SENZA alcun riferimento (righe ordine/notifiche)]");
  for (const p of rP.data ?? []) {
    const id = String(p.id);
    if (!inRighe.has(id) && !inNotif.has(id)) console.log(`  id=${id} "${p.nome}"`);
  }

  // 3. Uso URL media nei prodotti/negozi
  const rMedia = await rows("media", "id, public_url");
  const urls = (rMedia.data ?? []).map((m) => m.public_url);
  const campi = ["immagine_principale", "immagini", "logo_url", "copertina_url", "immagine_url"];
  const rP2 = await rows("prodotti", "id, nome, immagine_principale");
  console.log("\n[media: riferimenti in prodotti.immagine_principale]");
  for (const p of rP2.data ?? []) {
    const v = String(p.immagine_principale ?? "");
    if (urls.some((u) => u && v.includes(u))) console.log(`  prodotto ${p.id} "${p.nome}" -> ${v}`);
  }
  const rN2 = await rows("negozi", "id, nome, logo_url, copertina_url");
  console.log("[media: riferimenti in negozi.logo_url/copertina_url]");
  for (const n of rN2.data ?? []) {
    for (const v of [n.logo_url, n.copertina_url]) {
      if (v && urls.some((u) => u && String(v).includes(u))) console.log(`  negozio ${n.id} "${n.nome}" -> ${v}`);
    }
  }

  // 4. Ordini con sessioni/reclami (cluster)
  const rS = await rows("pagamenti_sessioni", "ordine_id");
  const rRe = await rows("ordine_reclami", "ordine_id");
  const conSessione = new Set((rS.data ?? []).map((x) => x.ordine_id));
  const conReclamo = new Set((rRe.data ?? []).map((x) => x.ordine_id));
  const rO = await rows("ordini", "id, numero");
  console.log("\n[ordini con sessione pagamento o reclamo]");
  for (const o of rO.data ?? []) {
    const note = [];
    if (conSessione.has(o.id)) note.push("sessione");
    if (conReclamo.has(o.id)) note.push("reclamo");
    if (note.length) console.log(`  ${o.numero} ${o.id} -> ${note.join(", ")}`);
  }

  // 5. Negozi con refs per tabella
  const tabPerNegozio = {
    prodotti: "negozio_id",
    ordini: "negozio_id",
    eventi: "negozio_id",
    offerte: "negozio_id",
    media: "negozio_id",
    "negozio_metodi_spedizione": "negozio_id",
    "negozio_pagamenti": "negozio_id",
    "negozio_metodi_pagamento": "negozio_id",
    ordine_reclami: "negozio_id",
  };
  const refsPerNegozio = {};
  for (const [tab, col] of Object.entries(tabPerNegozio)) {
    const r = await rows(tab, col);
    for (const row of r.data ?? []) {
      const id = row[col];
      if (!id) continue;
      refsPerNegozio[id] = refsPerNegozio[id] ?? {};
      refsPerNegozio[id][tab] = (refsPerNegozio[id][tab] ?? 0) + 1;
    }
  }
  console.log("\n[negozi: conteggio riferimenti]");
  for (const n of rN.data ?? []) {
    const r = refsPerNegozio[n.id];
    if (r) console.log(`  ${n.id} ${JSON.stringify(r)}`);
  }
}

const fase = process.argv[2] ?? "1";
if (fase === "1") await fase1_conteggi();
else if (fase === "2") await fase2_campioni();
else if (fase === "3") await fase3_auth_users();
else if (fase === "4") await fase4_schema();
else if (fase === "5") await fase5_dettagli();
else if (fase === "6") await fase6_cross();
console.log("\n[audit] completato — nessuna scrittura eseguita.");
