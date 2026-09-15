/**
 * P6 — Registra nella history (supabase_migrations.schema_migrations) le 5
 * migration P0-P3 applicate manualmente a Production, con lo stesso formato
 * usato dal CLI (statements splittati, created_by null).
 *
 * Versione CLI: il nome deriva dal filename (primo file per versione).
 * Idempotente: on conflict (version) do nothing.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { join } from "node:path";

const SUPABASE_JS = join(os.homedir(), "AppData", "Roaming", "npm", "node_modules", "supabase", "dist", "supabase.js");

const MIGRAZIONI = [
  ["20261003", "payment_first_sessioni_schema", "20261003_payment_first_sessioni_schema.sql"],
  ["20261004", "p1_checkout_intento_crea", "20261004_p1_checkout_intento_crea.sql"],
  ["20261005", "p2_checkout_intento_conferma", "20261005_p2_checkout_intento_conferma.sql"],
  ["20261006", "p3_checkout_intento_scaduto", "20261006_p3_checkout_intento_scaduto.sql"],
  ["20261004", "p1_checkout_intento_annulla", "20261004_p1_checkout_intento_annulla.sql"],
];

function splitStatements(sql) {
  const parts = sql.split(/;\s*\r?\n/);
  return parts.map((p) => (p.trim() ? p.trim() + ";" : "")).filter(Boolean);
}

function runSql(sql) {
  const f = join(process.cwd(), "backups", "__record-history.sql");
  writeFileSync(f, sql, "utf8");
  const r = spawnSync(process.execPath, [SUPABASE_JS, "db", "query", "--linked", "-f", f], {
    encoding: "utf8",
    timeout: 180_000,
    windowsHide: true,
  });
  if (r.status !== 0) throw new Error((r.stdout || "") + (r.stderr || ""));
  return r.stdout || "";
}

// Verifica esistenza versioni
function queryJson(sql) {
  const r = spawnSync(process.execPath, [SUPABASE_JS, "db", "query", "--linked", "--output-format", "json", sql], {
    encoding: "utf8", timeout: 120_000, windowsHide: true,
  });
  if (r.status !== 0) throw new Error((r.stdout || "") + (r.stderr || ""));
  const out = r.stdout || "";
  const start = out.indexOf("[");
  return start >= 0 ? JSON.parse(out.slice(start)) : [];
}

const esistenti = queryJson("select version from supabase_migrations.schema_migrations where version in ('20261003','20261004','20261005','20261006');");
console.log("Versioni già in history:", esistenti.map((e) => e.version).join(", ") || "(nessuna)");

const values = [];
for (const [version, name, file] of MIGRAZIONI) {
  if (esistenti.some((e) => e.version === version)) {
    console.log(`SKIP ${version} (${name}): già in history`);
    continue;
  }
  const content = readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8");
  const stmts = splitStatements(content);
  const stmtsSql = stmts
    .map((s) => `$mig$${s}$mig$::text`)
    .join(", ");
  values.push(`('${version}', '${name}', array[${stmtsSql}]::text[], null, null)`);
}

if (values.length === 0) {
  console.log("Nessuna riga da inserire.");
  process.exit(0);
}

const sql = `insert into supabase_migrations.schema_migrations (version, name, statements, created_by, idempotency_key)\nvalues\n` + values.join(",\n") + `\non conflict (version) do nothing;`;
runSql(sql);
console.log("Inserite in history:", values.length, "righe:", values.map((v) => v.split("'")[1]).join(", "));