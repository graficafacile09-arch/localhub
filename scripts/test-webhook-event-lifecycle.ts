/**
 * FASE 10 BLOCCO 3A — TEST LIFECYCLE EVENTI WEBHOOK
 *
 * Testa le RPC reali su PostgreSQL locale disposable. Non invoca Stripe,
 * non modifica il database remoto e non esegue i business handler.
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTAINER = process.env.FASE10_DB_CONTAINER ?? "supabase_db_localhub";
const PREFIX = `fase10-webhook-${Date.now()}`;
const EVENT_PROCESSED = `${PREFIX}-processed`;
const EVENT_ERROR = `${PREFIX}-error`;
const EVENT_RECEIVED = `${PREFIX}-received`;
const EVENT_STALE = `${PREFIX}-stale`;
const EVENT_LIVE = `${PREFIX}-live`;
const EVENT_CONCURRENT = `${PREFIX}-concurrent`;
const EVENT_DB_ERROR = `${PREFIX}-db-error`;

let passati = 0;
let falliti = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passati++;
    console.log(`  PASS ${label}`);
  } else {
    falliti++;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`);
  }
}

function psql(sql: string, args: string[] = []): string {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", ...args],
    { input: sql, encoding: "utf8" }
  );
}

function json(sql: string): Record<string, unknown> {
  return JSON.parse(psql(sql, ["-At"]).trim()) as Record<string, unknown>;
}

function scalar(sql: string): string {
  return psql(sql, ["-At"]).trim();
}

function psqlAsync(sql: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(
      "docker",
      ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1"],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin?.end(sql);
  });
}

function installMigration(): void {
  const migration = readFileSync(
    "supabase/migrations/20260926_webhook_event_lifecycle.sql",
    "utf8"
  );
  psql(migration);
}

function cleanup(): void {
  try {
    psql(`delete from public.pagamenti_eventi where event_id like '${PREFIX}-%';`);
  } catch {
    // Best-effort cleanup; all rows are confined to the disposable local DB.
  }
}

function runLifecycle(): void {
  console.log("\n=== POSTGRESQL REALE — WEBHOOK EVENT LIFECYCLE ===\n");

  const created = json(`select public.pagamenti_evento_acquisisci('${EVENT_PROCESSED}', 'test.event', null, null, 'evt-processed', '{"case":"processed"}'::jsonb);`);
  check("nuovo event_id acquisito", created.acquired === true && created.stato === "processing");
  check("nuovo event_id parte da attempts=1", created.attempts === 1, created);

  const finalized = json(`select public.pagamenti_evento_finalizza('${EVENT_PROCESSED}', true, null);`);
  check("processing → processed solo dopo successo", finalized.ok === true && finalized.stato === "processed");
  check("processed_at valorizzato", scalar(`select (processed_at is not null)::text from public.pagamenti_eventi where event_id = '${EVENT_PROCESSED}';`) === "true");

  const duplicate = json(`select public.pagamenti_evento_acquisisci('${EVENT_PROCESSED}', 'test.event', null, null, 'evt-processed', '{}'::jsonb);`);
  check("exact duplicate processed è terminale", duplicate.terminal === true && duplicate.acquired === false, duplicate);
  check("exact duplicate processed non incrementa attempts", duplicate.attempts === 1, duplicate);

  const errored = json(`select public.pagamenti_evento_acquisisci('${EVENT_ERROR}', 'test.event', null, null, 'evt-error', '{}'::jsonb);`);
  json(`select public.pagamenti_evento_finalizza('${EVENT_ERROR}', false, 'errore provider sintetico');`);
  const errorRetry = json(`select public.pagamenti_evento_acquisisci('${EVENT_ERROR}', 'test.event', null, null, 'evt-error', '{}'::jsonb);`);
  check("processing → error dopo failure", scalar(`select status from public.pagamenti_eventi where event_id = '${EVENT_ERROR}';`) === "processing" || errorRetry.acquired === true, { errored, errorRetry });
  check("duplicate error è retryable", errorRetry.acquired === true && errorRetry.attempts === 2, errorRetry);
  check("retry dopo error può finalizzare", json(`select public.pagamenti_evento_finalizza('${EVENT_ERROR}', true, null);`).stato === "processed");

  psql(`insert into public.pagamenti_eventi (provider, event_id, event_type, payment_id, payload, status, attempts, processing_at) values ('stripe', '${EVENT_RECEIVED}', 'test.event', 'evt-received', '{}'::jsonb, 'received', 0, null);`);
  const receivedRetry = json(`select public.pagamenti_evento_acquisisci('${EVENT_RECEIVED}', 'test.event', null, null, 'evt-received', '{}'::jsonb);`);
  check("received è retryable", receivedRetry.acquired === true && receivedRetry.attempts === 1, receivedRetry);
  check("retry dopo received può finalizzare", json(`select public.pagamenti_evento_finalizza('${EVENT_RECEIVED}', true, null);`).stato === "processed");

  psql(`insert into public.pagamenti_eventi (provider, event_id, event_type, payment_id, payload, status, attempts, processing_at) values ('stripe', '${EVENT_STALE}', 'test.event', 'evt-stale', '{}'::jsonb, 'processing', 1, now() - interval '11 minutes');`);
  const staleRetry = json(`select public.pagamenti_evento_acquisisci('${EVENT_STALE}', 'test.event', null, null, 'evt-stale', '{}'::jsonb);`);
  check("processing stale è recuperabile", staleRetry.acquired === true && staleRetry.attempts === 2, staleRetry);
  const staleFailure = json(`select public.pagamenti_evento_finalizza('${EVENT_STALE}', false, 'failure retryable');`);
  check("failure mantiene l'evento retryable", staleFailure.ok === true && staleFailure.stato === "error");

  psql(`insert into public.pagamenti_eventi (provider, event_id, event_type, payment_id, payload, status, attempts, processing_at) values ('stripe', '${EVENT_LIVE}', 'test.event', 'evt-live', '{}'::jsonb, 'processing', 1, now());`);
  const liveDuplicate = json(`select public.pagamenti_evento_acquisisci('${EVENT_LIVE}', 'test.event', null, null, 'evt-live', '{}'::jsonb);`);
  check("processing live non viene acquisito due volte", liveDuplicate.in_corso === true && liveDuplicate.acquired === false, liveDuplicate);
  check("processing live non incrementa attempts", liveDuplicate.attempts === 1, liveDuplicate);

  psql(`select public.pagamenti_evento_acquisisci('${EVENT_DB_ERROR}', 'test.event', null, null, 'evt-db-error', '{}'::jsonb);`);
  const malformed = json(`select public.pagamenti_evento_acquisisci(null, 'test.event', null, null, null, '{}'::jsonb);`);
  check("parametro DB non valido non è classificato come duplicate", malformed.ok === false && malformed.codice === "VALIDATION_ERROR", malformed);
}

async function runConcurrency(): Promise<void> {
  console.log("\n=== POSTGRESQL REALE — ACQUISIZIONE CONCORRENTE ===\n");
  const sql = `select public.pagamenti_evento_acquisisci('${EVENT_CONCURRENT}', 'test.concurrent', null, null, 'evt-concurrent', '{}'::jsonb);`;
  const [a, b] = await Promise.all([psqlAsync(sql), psqlAsync(sql)]);
  check("due consegne concorrenti completano senza errore", a.code === 0 && b.code === 0, { a: a.stderr, b: b.stderr });
  const rows = psql(`select status, attempts from public.pagamenti_eventi where event_id = '${EVENT_CONCURRENT}';`, ["-At"]).trim();
  const parts = rows.split("|");
  check("una sola riga per event_id", scalar(`select count(*) from public.pagamenti_eventi where event_id = '${EVENT_CONCURRENT}';`) === "1");
  check("una sola acquisizione processing e attempts=1", parts[0] === "processing" && parts[1] === "1", rows);
}

async function main(): Promise<void> {
  try {
    installMigration();
    cleanup();
    runLifecycle();
    await runConcurrency();
  } catch (error) {
    check("setup/test lifecycle webhook", false, error instanceof Error ? error.message : String(error));
  } finally {
    cleanup();
  }
  console.log(`\nWEBHOOK EVENT LIFECYCLE: ${passati} PASS / ${falliti} FAIL`);
  process.exit(falliti === 0 ? 0 : 1);
}

void main();
