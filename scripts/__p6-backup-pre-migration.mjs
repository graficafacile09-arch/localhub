/**
 * P6 — BACKUP READ-ONLY PRE-MIGRATION (Production favrminotoawoxhehshh).
 *
 * Usa `supabase db query --linked` (Management API, SOLO query SELECT) per
 * salvare su file, PRIMA di applicare le migration P0-P3:
 *   1. definizioni esatte di TUTTE le funzioni public (pg_get_functiondef);
 *   2. colonne + default delle tabelle toccate dal payment-first;
 *   3. indici (pg_get_indexdef) e vincoli (pg_get_constraintdef);
 *   4. RLS/policy di pagamenti_sessioni;
 *   5. conteggi snapshot (marcatore).
 *
 * Nessuna scrittura, nessun secret stampato.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

// CLI globale (npm): dist/supabase.js — token in ~/.supabase/access-token.
const SUPABASE_JS = join(os.homedir(), "AppData", "Roaming", "npm", "node_modules", "supabase", "dist", "supabase.js");

function query(sql) {
  const r = spawnSync(process.execPath, [SUPABASE_JS, "db", "query", "--linked", "--output-format", "json", sql], {
    encoding: "utf8",
    timeout: 180_000,
    windowsHide: true,
  });
  if (r.status !== 0) {
    throw new Error("supabase db query fallito (" + (r.error ? r.error.message : "status " + r.status) + "):\n" + (r.stdout || "").slice(0, 2000) + (r.stderr || ""));
  }
  const out = r.stdout || "";
  // JSON potrebbe avere righe di progresso davanti: parte dal primo "[".
  const start = out.indexOf("[");
  if (start < 0) throw new Error("output non-JSON: " + out.slice(0, 300));
  return JSON.parse(out.slice(start));
}

const TABELLE = [
  "pagamenti_sessioni",
  "ordini",
  "ordini_righe",
  "prodotti",
  "prodotto_varianti",
  "negozi",
  "negozio_metodi_spedizione",
];

const out = [];
out.push("-- ═══════════════════════════════════════════════════════════════");
out.push("-- BACKUP PRE-MIGRATION P0-P3 — favrminotoawoxhehshh (Production)");
out.push("-- Generato: " + new Date().toISOString() + " — SOLO LETTURA (Management API)");
out.push("-- ═══════════════════════════════════════════════════════════════");

// ── 1. Funzioni public ─────────────────────────────────────────────────────
const funcs = query(
  `select p.oid::regprocedure::text as firma, pg_get_functiondef(p.oid) as def
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    order by p.proname, p.oid::regprocedure::text`
);
out.push("\n\n-- ── 1. FUNZIONI PUBLIC (" + funcs.length + ") ──");
for (const f of funcs) {
  out.push("\n-- DEFINIZIONE: " + f.firma);
  out.push(f.def + ";");
}

// ── 2. Colonne + default ───────────────────────────────────────────────────
out.push("\n\n-- ── 2. COLONNE TABELLE ──");
for (const t of TABELLE) {
  const cols = query(
    `select a.attname as col,
            pg_catalog.format_type(a.atttypid, a.atttypmod) as tipo,
            not a.attnotnull as nullable,
            pg_get_expr(d.adbin, d.adrelid) as default_expr
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where n.nspname = 'public' and c.relname = '${t}' and a.attnum > 0 and not a.attisdropped
      order by a.attnum`
  );
  out.push(`\n-- TABELLA public.${t} (${cols.length} colonne)`);
  for (const c of cols) {
    const def = c.default_expr ? ` DEFAULT ${c.default_expr}` : "";
    out.push(`--   ${c.col} ${c.tipo}${c.nullable ? "" : " NOT NULL"}${def}`);
  }
}

// ── 3. Indici ──────────────────────────────────────────────────────────────
out.push("\n\n-- ── 3. INDICI ──");
for (const t of TABELLE) {
  const idxs = query(
    `select i.relname as nome, pg_get_indexdef(ix.indexrelid) as def
       from pg_index ix
       join pg_class i on i.oid = ix.indexrelid
       join pg_class c on c.oid = ix.indrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = '${t}'
      order by i.relname`
  );
  out.push(`\n-- INDICI public.${t} (${idxs.length})`);
  for (const i of idxs) out.push(i.def + ";");
}

// ── 4. Vincoli ─────────────────────────────────────────────────────────────
out.push("\n\n-- ── 4. VINCOLI ──");
for (const t of TABELLE) {
  const cons = query(
    `select con.conname as nome, pg_get_constraintdef(con.oid) as def
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = '${t}'
      order by con.conname`
  );
  out.push(`\n-- VINCOLI public.${t} (${cons.length})`);
  for (const c of cons) out.push(`--   ${c.nome}: ${c.def}`);
}

// ── 5. RLS + policy pagamenti_sessioni ─────────────────────────────────────
const rls = query(
  `select c.relrowsecurity as rls_on, c.relforcerowsecurity as rls_force
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relname='pagamenti_sessioni'`
);
out.push("\n\n-- ── 5. RLS pagamenti_sessioni ──");
out.push(`--   rls_on=${rls[0]?.rls_on}  rls_force=${rls[0]?.rls_force}`);
const pols = query(
  `select policyname, cmd, permissive, roles, qual, with_check
     from pg_policies where schemaname='public' and tablename='pagamenti_sessioni'
     order by policyname`
);
out.push(`--   policy (${pols.length})`);
for (const p of pols) {
  out.push(`--     ${p.polname} cmd=${p.cmd} permissive=${p.permissive} roles=${p.roles} qual=${p.qual ?? "NULL"} check=${p.with_check ?? "NULL"}`);
}

// ── 6. Conteggi snapshot ───────────────────────────────────────────────────
out.push("\n\n-- ── 6. CONTEGGI SNAPSHOT (marcatore) ──");
const counts = {};
for (const t of TABELLE) {
  try {
    const r = query(`select count(*) as n from public.${t}`);
    counts[t] = Number(r[0].n);
    out.push(`--   ${t}: ${r[0].n}`);
  } catch {
    counts[t] = null;
    out.push(`--   ${t}: (non accessibile)`);
  }
}

const content = out.join("\n");
const dir = join(process.cwd(), "backups");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const file = join(dir, `pre-migration-p0-p3-${stamp}.sql`);
writeFileSync(file, content, "utf8");
writeFileSync(file.replace(".sql", ".json"), JSON.stringify({ generato: new Date().toISOString(), funzioni: funcs.length, conteggi: counts }, null, 2), "utf8");

console.log(`Backup scritto: ${file}`);
console.log(`  funzioni: ${funcs.length}`);
console.log("  conteggi:", JSON.stringify(counts));
console.log("  bytes:", content.length);