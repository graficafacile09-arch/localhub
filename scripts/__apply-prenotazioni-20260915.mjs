import { readFileSync } from "node:fs";
import pg from "pg";

const POOLER = readFileSync("C:/Users/denni/Desktop/localhub-deploy-6/supabase/.temp/pooler-url", "utf8").trim();
const SQL_FILE = "C:/Users/denni/Desktop/localhub-deploy-6/supabase/migrations/20260915_prenotazioni.sql";
const sql = readFileSync(SQL_FILE, "utf8");

const client = new pg.Client({ connectionString: POOLER, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("Connesso al DB remoto.");
  // Single transaction: se un qualsiasi statement fallisce, rollback totale.
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("MIGRATION APPLICATA OK (transazione committata).");
} catch (err) {
  try { await client.query("ROLLBACK"); } catch {}
  console.error("ERRORE durante l'applicazione — ROLLBACK eseguito.");
  console.error(String(err?.message ?? err).split("\n").slice(0, 6).join("\n"));
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
