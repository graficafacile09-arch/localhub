/**
 * FASE 10 BLOCCO 2 — REFUND OPERATION DURABLE
 *
 * Esegue test reali contro il PostgreSQL Supabase locale disposable e contro
 * un mock HTTP Stripe locale. Nessun database remoto e nessun provider reale.
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GatewayStripe } from "../lib/pagamenti/stripe";
import type { CredenzialiGateway } from "../lib/pagamenti/types";

const CONTAINER = process.env.FASE10_DB_CONTAINER ?? "supabase_db_localhub";
const OWNER = "56608999-f500-4de1-bc82-933871ac825f";
const ORDER_1 = "b2000000-0000-4000-8000-000000000001";
const ORDER_2 = "b2000000-0000-4000-8000-000000000002";
const ORDER_3 = "b2000000-0000-4000-8000-000000000003";
const ORDER_4 = "b2000000-0000-4000-8000-000000000004";
const STORE_SLUG = "fase10-durable-store";

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

function assertSql(sql: string, label: string): void {
  try {
    psql(sql);
    check(label, true);
  } catch (error) {
    check(label, false, error instanceof Error ? error.message : String(error));
  }
}

function installMigration(): void {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260925_refund_operations.sql"),
    "utf8"
  );
  psql(migration);
}

function setupFixtures(): void {
  psql(`
    delete from public.pagamenti_rimborso_operazioni
      where ordine_id in ('${ORDER_1}', '${ORDER_2}', '${ORDER_3}', '${ORDER_4}');
    delete from public.ordini
      where id in ('${ORDER_1}', '${ORDER_2}', '${ORDER_3}', '${ORDER_4}');
    delete from public.negozi where slug = '${STORE_SLUG}';
    insert into public.negozi (nome, slug, attivo, is_demo, owner_user_id)
      values ('Fase 10 Durable Store', '${STORE_SLUG}', true, true, '${OWNER}');

    insert into public.ordini (
      id, idempotency_key, modalita, totale, negozio_id, negozio_nome,
      cliente_nome, cliente_cognome, payment_status, payment_provider,
      payment_id, payment_transaction_id, payment_amount, payment_currency,
      payment_refunded_amount
    )
    select '${ORDER_1}', 'fase10-durable-1', 'ritiro', 100.00, n.id, n.nome,
      'Refund', 'Test', 'paid', 'stripe', 'cs_durable_1', 'pi_original_1',
      100.00, 'EUR', 0.00
    from public.negozi n
    where n.owner_user_id = '${OWNER}'
    limit 1;

    insert into public.ordini (
      id, idempotency_key, modalita, totale, negozio_id, negozio_nome,
      cliente_nome, cliente_cognome, payment_status, payment_provider,
      payment_id, payment_transaction_id, payment_amount, payment_currency,
      payment_refunded_amount
    )
    select '${ORDER_2}', 'fase10-durable-2', 'ritiro', 50.00, n.id, n.nome,
      'Refund', 'Retry', 'paid', 'stripe', 'cs_durable_2', 'pi_original_2',
      50.00, 'EUR', 0.00
    from public.negozi n
    where n.owner_user_id = '${OWNER}'
    limit 1;

    insert into public.ordini (
      id, idempotency_key, modalita, totale, negozio_id, negozio_nome,
      cliente_nome, cliente_cognome, payment_status, payment_provider,
      payment_id, payment_transaction_id, payment_amount, payment_currency,
      payment_refunded_amount
    )
    select '${ORDER_3}', 'fase10-durable-3', 'ritiro', 40.00, n.id, n.nome,
      'Refund', 'Unknown', 'paid', 'stripe', 'cs_durable_3', 'pi_original_3',
      40.00, 'EUR', 0.00
    from public.negozi n
    where n.owner_user_id = '${OWNER}'
    limit 1;

    insert into public.ordini (
      id, idempotency_key, modalita, totale, negozio_id, negozio_nome,
      cliente_nome, cliente_cognome, payment_status, payment_provider,
      payment_id, payment_transaction_id, payment_amount, payment_currency,
      payment_refunded_amount
    )
    select '${ORDER_4}', 'fase10-durable-4', 'ritiro', 100.00, n.id, n.nome,
      'Refund', 'Concurrent', 'paid', 'stripe', 'cs_durable_4', 'pi_original_4',
      100.00, 'EUR', 0.00
    from public.negozi n
    where n.owner_user_id = '${OWNER}'
    limit 1;
  `);

  const count = Number(psql(
    `select count(*) from public.ordini where id in ('${ORDER_1}', '${ORDER_2}', '${ORDER_3}', '${ORDER_4}');`,
    ["-At"]
  ).trim());
  if (count !== 4) throw new Error(`fixture ordini mancanti: ${count}/4; OWNER=${OWNER}`);
}

function runDbLifecycleTests(): void {
  console.log("\n=== POSTGRESQL REALE — REFUND OPERATION LIFECYCLE ===\n");

  assertSql(`
    select public.pagamenti_rimborso_operazione_prepara(
      '${ORDER_1}', 30.00, '${OWNER}', 'refund-key-1'
    );
    do $$ declare r jsonb; op record; o record; begin
      select * into op from public.pagamenti_rimborso_operazioni where idempotency_key = 'refund-key-1';
      if op.id is null or op.stato <> 'pending' then raise exception 'operation non pending'; end if;
      select * into o from public.ordini where id = '${ORDER_1}';
      if o.payment_refunded_amount <> 0 or o.payment_status <> 'paid'
        or o.payment_transaction_id <> 'pi_original_1' then raise exception 'reservation ha mutato ordine'; end if;
    end $$;`, "operation creata prima del provider e reservation separata dall'ordine");

  assertSql(`
    do $$ declare a jsonb; b jsonb; begin
      select public.pagamenti_rimborso_operazione_prepara('${ORDER_1}', 30.00, '${OWNER}', 'refund-key-1') into a;
      select public.pagamenti_rimborso_operazione_prepara('${ORDER_1}', 30.00, '${OWNER}', 'refund-key-1') into b;
      if a->>'operazione_id' <> b->>'operazione_id' or a->>'idempotency_key' <> 'refund-key-1'
        or b->>'stato' <> 'pending' then raise exception 'retry non ha restituito la stessa operation'; end if;
    end $$;`, "stessa operation e stessa idempotency key al retry");

  assertSql(`
    do $$ declare c jsonb; s jsonb; o record; op record; begin
      select public.pagamenti_rimborso_operazione_claim(id) into c
        from public.pagamenti_rimborso_operazioni where idempotency_key = 'refund-key-1';
      if c->>'claimed' <> 'true' then raise exception 'claim iniziale fallito'; end if;
      select public.pagamenti_rimborso_operazione_completa(id, 're_durable_1') into s
        from public.pagamenti_rimborso_operazioni where idempotency_key = 'refund-key-1';
      if s->>'ok' <> 'true' or s->>'stato' <> 'succeeded' then raise exception 'complete fallita: %', s; end if;
      select * into o from public.ordini where id = '${ORDER_1}';
      select * into op from public.pagamenti_rimborso_operazioni where idempotency_key = 'refund-key-1';
      if o.payment_refunded_amount <> 30 or o.payment_status <> 'partially_refunded'
        or o.payment_transaction_id <> 'pi_original_1' or op.refund_id <> 're_durable_1' then raise exception 'complete incoerente'; end if;
    end $$;`, "claim + completion: refund ID operation, stato e importo cumulativo");

  assertSql(`
    do $$ declare a jsonb; b jsonb; begin
      select public.pagamenti_rimborso_operazione_prepara('${ORDER_1}', 30.00, '${OWNER}', 'refund-key-1') into a;
      select public.pagamenti_rimborso_operazione_claim((a->>'operazione_id')::uuid) into b;
      if a->>'stato' <> 'succeeded' or b->>'claimed' <> 'false' or b->>'refund_id' <> 're_durable_1'
        then raise exception 'retry succeeded ha richiamato operation'; end if;
    end $$;`, "operation succeeded: retry senza nuova esecuzione provider");

  assertSql(`
    do $$ declare p jsonb; c jsonb; begin
      select public.pagamenti_rimborso_operazione_prepara('${ORDER_1}', 20.00, '${OWNER}', 'refund-key-2') into p;
      select public.pagamenti_rimborso_operazione_claim((p->>'operazione_id')::uuid) into c;
      if c->>'claimed' <> 'true' then raise exception 'secondo claim fallito'; end if;
      perform public.pagamenti_rimborso_operazione_completa((p->>'operazione_id')::uuid, 're_durable_2');
      select public.pagamenti_rimborso_operazione_prepara('${ORDER_1}', 50.00, '${OWNER}', 'refund-key-3') into p;
      perform public.pagamenti_rimborso_operazione_claim((p->>'operazione_id')::uuid);
      perform public.pagamenti_rimborso_operazione_completa((p->>'operazione_id')::uuid, 're_durable_3');
      if (select payment_refunded_amount from public.ordini where id = '${ORDER_1}') <> 100
        or (select payment_status from public.ordini where id = '${ORDER_1}') <> 'refunded' then raise exception 'partial + total cumulative fallito'; end if;
    end $$;`, "partial refund + secondo partial + total refund cumulativo");

  assertSql(`
    do $$ declare r jsonb; begin
      select public.pagamenti_rimborso_operazione_prepara('${ORDER_1}', 1.00, '${OWNER}', 'refund-over') into r;
      if r->>'ok' <> 'false' or r->>'codice' <> 'RIMBORSO_NON_CONSENTITO' then raise exception 'over-refund non negato: %', r; end if;
    end $$;`, "over-refund negato dopo cumulativo completo");

  assertSql(`
    do $$ declare p jsonb; f jsonb; r jsonb; c jsonb; begin
      select public.pagamenti_rimborso_operazione_prepara('${ORDER_2}', 10.00, '${OWNER}', 'refund-failed') into p;
      perform public.pagamenti_rimborso_operazione_fallita((p->>'operazione_id')::uuid, 'failed', 'PROVIDER_4XX', 'failure before execution');
      select public.pagamenti_rimborso_operazione_prepara('${ORDER_2}', 10.00, '${OWNER}', 'refund-failed') into r;
      if r->>'operazione_id' <> p->>'operazione_id' or r->>'stato' <> 'failed' then raise exception 'failed retry non recuperabile'; end if;
      select public.pagamenti_rimborso_operazione_claim((r->>'operazione_id')::uuid) into c;
      if c->>'claimed' <> 'true' then raise exception 'failed operation non reclaimable'; end if;
      select public.pagamenti_rimborso_operazione_completa((r->>'operazione_id')::uuid, 're_retry_success') into f;
      if f->>'ok' <> 'true' then raise exception 'retry completion fallita: %', f; end if;
    end $$;`, "provider failure definitivo: operation recuperabile senza nuova key");

  assertSql(`
    do $$ declare p jsonb; f jsonb; r jsonb; begin
      select public.pagamenti_rimborso_operazione_prepara('${ORDER_3}', 12.00, '${OWNER}', 'refund-unknown') into p;
      perform public.pagamenti_rimborso_operazione_fallita((p->>'operazione_id')::uuid, 'reconciliation_required', 'PROVIDER_RESULT_UNKNOWN', 'timeout after provider execution');
      select public.pagamenti_rimborso_operazione_prepara('${ORDER_3}', 12.00, '${OWNER}', 'refund-unknown') into r;
      if r->>'stato' <> 'reconciliation_required' then raise exception 'unknown non riconoscibile'; end if;
      select public.pagamenti_rimborso_operazione_completa((r->>'operazione_id')::uuid, 're_reconciled') into f;
      if f->>'ok' <> 'true' or (select payment_refunded_amount from public.ordini where id = '${ORDER_3}') <> 12 then raise exception 'riconciliazione fallita: %', f; end if;
    end $$;`, "timeout/unknown: riconciliazione successiva senza doppio conteggio");
}

async function runConcurrencyTest(): Promise<void> {
  console.log("\n=== POSTGRESQL REALE — CONCORRENZA ===\n");
  const sql = (key: string) => `select public.pagamenti_rimborso_operazione_prepara('${ORDER_4}', 60.00, '${OWNER}', '${key}');`;
  const [a, b] = await Promise.all([psqlAsync(sql("concurrent-a")), psqlAsync(sql("concurrent-b"))]);
  check("due prepare concorrenti non falliscono", a.code === 0 && b.code === 0, { a: a.stderr, b: b.stderr });
  const activeCount = Number(psql(
    `select count(*) from public.pagamenti_rimborso_operazioni where ordine_id = '${ORDER_4}' and stato in ('pending','processing','reconciliation_required');`,
    ["-At"]
  ).trim());
  const operationCount = Number(psql(
    `select count(*) from public.pagamenti_rimborso_operazioni where ordine_id = '${ORDER_4}';`,
    ["-At"]
  ).trim());
  check("due refund concorrenti → una sola operation attiva", activeCount === 1 && operationCount === 1, { activeCount, operationCount });
  const original = psql(`select payment_transaction_id from public.ordini where id = '${ORDER_4}';`, ["-At"]).trim();
  check("concorrenza non muta PaymentIntent né payment_refunded_amount", original === "pi_original_4" && psql(`select payment_refunded_amount from public.ordini where id = '${ORDER_4}';`, ["-At"]).trim() === "0.00", original);
}

async function runStripeMockTests(): Promise<void> {
  console.log("\n=== STRIPE MOCK — IDEMPOTENCY + RECONCILIATION ===\n");
  const calls: Array<{ method: string; url: string; body: string; headers: Record<string, string> }> = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) headers[key] = String(value);
      calls.push({ method: req.method ?? "", url: req.url ?? "", body, headers });
      res.writeHead(200, { "content-type": "application/json" });
      if (req.method === "GET" && req.url?.includes("/v1/checkout/sessions/")) {
        res.end(JSON.stringify({ payment_intent: "pi_mock_original" }));
      } else if (req.method === "GET" && req.url?.startsWith("/v1/refunds")) {
        res.end(JSON.stringify({ object: "list", data: [{ id: "re_found", amount: 1250, status: "succeeded", metadata: { refund_operation_id: "op_mock" } }] }));
      } else {
        res.end(JSON.stringify({ id: "re_created", status: "succeeded" }));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const gateway = new GatewayStripe({ host: "127.0.0.1", port, protocol: "http" });
  const cred: CredenzialiGateway = { secret: "sk_test_local", testMode: true };
  try {
    await gateway.rimborsa("cs_mock", 12.5, cred, { idempotencyKey: "refund-key-stable", operationId: "op_mock" });
    const create = calls.find((call) => call.url.startsWith("/v1/refunds"));
    check("Stripe riceve Idempotency-Key stabile", create?.headers["idempotency-key"] === "refund-key-stable", create?.headers);
    const metadata = new URLSearchParams(create?.body ?? "");
    check("Stripe riceve operation ID nei metadata", metadata.get("metadata[refund_operation_id]") === "op_mock", create?.body);
    const found = await gateway.riconciliaRimborso!("cs_mock", 12.5, cred, "op_mock");
    check("refund esistente riconciliato senza nuova POST", found?.refundId === "re_found", calls.filter((call) => call.url.startsWith("/v1/refunds")).length);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function cleanup(): void {
  try {
    psql(`
      delete from public.pagamenti_rimborso_operazioni where ordine_id in ('${ORDER_1}', '${ORDER_2}', '${ORDER_3}', '${ORDER_4}');
      delete from public.ordini where id in ('${ORDER_1}', '${ORDER_2}', '${ORDER_3}', '${ORDER_4}');
      delete from public.negozi where slug = '${STORE_SLUG}';
    `);
  } catch {
    // Cleanup best-effort; the fixtures are confined to the disposable local DB.
  }
}

async function main(): Promise<void> {
  try {
    installMigration();
    setupFixtures();
    runDbLifecycleTests();
    await runConcurrencyTest();
    await runStripeMockTests();
  } catch (error) {
    check("setup/esecuzione refund durable", false, error instanceof Error ? error.message : String(error));
  } finally {
    cleanup();
  }
  console.log(`\nREFUND DURABLE: ${passati} PASS / ${falliti} FAIL`);
  process.exit(falliti === 0 ? 0 : 1);
}

void main();
