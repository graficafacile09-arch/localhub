/**
 * FASE 10 BLOCCO 3 — STEP 1 — TEST LIFECYCLE EVENTI WEBHOOK
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
  // Installa solo la migration dello step: il database locale deve già
  // contenere le tabelle della foundation e il lifecycle base.
  const hardeningMigration = readFileSync(
    "supabase/migrations/20261012_webhook_event_lifecycle_retry_hardening.sql",
    "utf8"
  );
  psql(hardeningMigration);
}

function cleanup(): void {
  try {
    psql(`delete from public.pagamenti_eventi where event_id like '${PREFIX}-%';`);
  } catch {
    // Best-effort cleanup; all rows are confined to the disposable local DB.
  }
}

function acquire(eventId: string, paymentId: string, payload = "{}", eventType = "test.event"): Record<string, unknown> {
  return json(`select public.pagamenti_evento_acquisisci('${eventId}', '${eventType}', null, null, '${paymentId}', '${payload}'::jsonb);`);
}

function finalize(eventId: string, success: boolean, attempt: number, errorMessage = "errore sintetico"): Record<string, unknown> {
  const errorSql = errorMessage === "null" ? "null" : `'${errorMessage}'`;
  return json(`select public.pagamenti_evento_finalizza('${eventId}', ${success ? "true" : "false"}, ${errorSql}, ${attempt});`);
}

function runLifecycle(): void {
  console.log("\n=== POSTGRESQL REALE — WEBHOOK EVENT LIFECYCLE ===\n");

  const created = acquire(EVENT_PROCESSED, "evt-processed", '{"case":"processed"}');
  check("nuovo event → NEW_EVENT", created.ok === true && created.esito === "NEW_EVENT");
  check("nuovo event parte dall'iniziale received", created.stato_iniziale === "received", created);
  check("nuovo event acquisito in processing", created.acquired === true && created.stato === "processing", created);
  check("nuovo event incrementa attempts a 1", created.attempts === 1, created);

  const finalized = finalize(EVENT_PROCESSED, true, 1);
  check("processing riuscito → processed", finalized.ok === true && finalized.esito === "PROCESSED" && finalized.stato === "processed", finalized);
  check("processed_at valorizzato", scalar(`select (processed_at is not null)::text from public.pagamenti_eventi where event_id = '${EVENT_PROCESSED}';`) === "true");

  const duplicate = acquire(EVENT_PROCESSED, "evt-processed", "{}");
  check("duplicate processed → DUPLICATE_PROCESSED/no-op", duplicate.ok === true && duplicate.esito === "DUPLICATE_PROCESSED" && duplicate.terminal === true, duplicate);
  check("duplicate processed non incrementa attempts", duplicate.attempts === 1, duplicate);

  const errored = acquire(EVENT_ERROR, "evt-error");
  check("evento errore iniziale acquisito", errored.esito === "NEW_EVENT" && errored.attempts === 1, errored);
  const failure = finalize(EVENT_ERROR, false, 1, "errore provider sintetico");
  check("failure processing → RETRYABLE_ERROR", failure.ok === true && failure.esito === "RETRYABLE_ERROR" && failure.stato === "error", failure);
  check("failure processing non marca processed", scalar(`select status from public.pagamenti_eventi where event_id = '${EVENT_ERROR}';`) === "error");
  const errorRetry = acquire(EVENT_ERROR, "evt-error");
  check("duplicate error → RETRYABLE_EXISTING", errorRetry.ok === true && errorRetry.esito === "RETRYABLE_EXISTING" && errorRetry.acquired === true, errorRetry);
  check("retry dopo error incrementa attempts", errorRetry.attempts === 2, errorRetry);
  const recovered = finalize(EVENT_ERROR, true, 2);
  check("retry dopo errore può arrivare a processed", recovered.ok === true && recovered.esito === "PROCESSED" && recovered.stato === "processed", recovered);

  psql(`insert into public.pagamenti_eventi (provider, event_id, event_type, payment_id, payload, status, attempts, processing_at) values ('stripe', '${EVENT_RECEIVED}', 'test.event', 'evt-received', '{}'::jsonb, 'received', 0, null);`);
  const receivedRetry = acquire(EVENT_RECEIVED, "evt-received");
  check("duplicate received → RETRYABLE_EXISTING", receivedRetry.ok === true && receivedRetry.esito === "RETRYABLE_EXISTING" && receivedRetry.acquired === true, receivedRetry);
  check("received retry incrementa attempts", receivedRetry.attempts === 1, receivedRetry);
  check("received retry può finalizzare", finalize(EVENT_RECEIVED, true, 1).esito === "PROCESSED");

  psql(`insert into public.pagamenti_eventi (provider, event_id, event_type, payment_id, payload, status, attempts, processing_at) values ('stripe', '${EVENT_STALE}', 'test.event', 'evt-stale', '{}'::jsonb, 'processing', 1, now() - interval '11 minutes');`);
  const staleRetry = acquire(EVENT_STALE, "evt-stale");
  check("processing stale → RETRYABLE_EXISTING/recovery", staleRetry.ok === true && staleRetry.esito === "RETRYABLE_EXISTING" && staleRetry.attempts === 2, staleRetry);
  check("stale attempt failure resta error/retryable", finalize(EVENT_STALE, false, 2, "failure retryable").esito === "RETRYABLE_ERROR");

  psql(`insert into public.pagamenti_eventi (provider, event_id, event_type, payment_id, payload, status, attempts, processing_at) values ('stripe', '${EVENT_LIVE}', 'test.event', 'evt-live', '{}'::jsonb, 'processing', 1, now());`);
  const liveDuplicate = acquire(EVENT_LIVE, "evt-live");
  check("processing live → IN_PROGRESS/no-op", liveDuplicate.ok === true && liveDuplicate.esito === "IN_PROGRESS" && liveDuplicate.acquired === false, liveDuplicate);
  check("processing live non incrementa attempts", liveDuplicate.attempts === 1, liveDuplicate);

  const invalid = json("select public.pagamenti_evento_acquisisci(null, 'test.event', null, null, null, '{}'::jsonb);");
  check("errore DB/validazione distinto da duplicate", invalid.ok === false && invalid.esito === "DATABASE_ERROR" && invalid.codice === "VALIDATION_ERROR", invalid);

  const staleFinalize = finalize(EVENT_LIVE, true, 0);
  check("finalizzazione non confermata non produce falso successo", staleFinalize.ok === false && staleFinalize.esito === "DATABASE_ERROR", staleFinalize);
}

async function runConcurrency(): Promise<void> {
  console.log("\n=== POSTGRESQL REALE — ACQUISIZIONE CONCORRENTE ===\n");
  const sql = `select public.pagamenti_evento_acquisisci('${EVENT_CONCURRENT}', 'test.concurrent', null, null, 'evt-concurrent', '{}'::jsonb);`;
  const [a, b] = await Promise.all([psqlAsync(sql), psqlAsync(sql)]);
  check("due consegne concorrenti completano senza errore", a.code === 0 && b.code === 0, { a: a.stderr, b: b.stderr });
  const rows = psql(`select status, attempts from public.pagamenti_eventi where event_id = '${EVENT_CONCURRENT}';`, ["-At"]).trim();
  const parts = rows.split("|");
  check("stesso event_id non crea seconda riga", scalar(`select count(*) from public.pagamenti_eventi where event_id = '${EVENT_CONCURRENT}';`) === "1");
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
