/**
 * TEST DINAMICO PAYMENT-FIRST — SOLO SUPABASE LOCALE.
 *
 * Il test recupera la service-role key esclusivamente da `supabase status -o env`
 * e usa sempre l'endpoint fisso http://127.0.0.1:54321. Non legge alcun file
 * .env e non usa provider di pagamento reali.
 *
 * Le FIXTURE (negozio + prodotto) sono create e rimosse via PostgreSQL locale
 * con ruolo `postgres`, tramite `docker exec` sul container Supabase locale
 * (meccanismo già usato da altri script del progetto, es.
 * scripts/test-webhook-refund-3d.ts). La connessione postgres serve SOLO per
 * le fixture: tutto il flusso commerciale resta sulle RPC reali via Supabase
 * locale con SERVICE_ROLE_KEY.
 *
 * Motivazione: in questo database locale il ruolo `service_role` ha bypassrls
 * ma NON possiede SELECT/INSERT/UPDATE/DELETE sulle tabelle business, quindi
 * ogni accesso PostgREST diretto fallisce con "permission denied". Il test NON
 * modifica GRANT/REVOKE, migration o RLS.
 *
 * Ripartizione obbligatoria:
 * - PostgreSQL locale (ruolo postgres): creazione/lettura fixture, cleanup e
 *   TUTTE le letture read-only usate per le asserzioni (prodotti,
 *   pagamenti_sessioni, ordini, ...).
 * - Supabase locale + SERVICE_ROLE: ESCLUSIVAMENTE le RPC commerciali reali
 *   (checkout_intento_crea, checkout_intento_conferma, checkout_intento_annulla,
 *   checkout_intento_scaduto). Nessuna INSERT/UPDATE/SELECT applicativa via API.
 */
import { execSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_DB_CONTAINER = "supabase_db_localhub";
const LOCAL_DB_NAME = "postgres";
const LOCAL_DB_USER = "postgres";
const FIXTURE_PREFIX = `payment-first-local-${Date.now()}-${randomUUID().slice(0, 8)}`;

type JsonObject = Record<string, any>;
type PaymentState = "paid" | "failed" | "canceled";

let passati = 0;
let falliti = 0;
const fallimenti: string[] = [];

function check(section: string, label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passati++;
    console.log(`  PASS ${section} — ${label}`);
  } else {
    falliti++;
    fallimenti.push(`${section} — ${label}`);
    console.log(`  FAIL ${section} — ${label}${detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`);
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} mancante`);
  }
  return value;
}

function localCredentials(): { url: string; serviceRoleKey: string } {
  // Il comando interroga solo la configurazione/runtime locale della CLI.
  // Nessun .env viene letto e la chiave non viene mai stampata.
  const output = execSync("npx --no-install supabase status -o env", {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0) {
      values.set(
        line.slice(0, separator),
        line.slice(separator + 1).replace(/^"(.*)"$/, "$1"),
      );
    }
  }
  const reportedUrl = requiredString(values.get("API_URL"), "API_URL locale").replace(/\/$/, "");
  if (reportedUrl !== LOCAL_URL) {
    throw new Error(`isolamento rifiutato: API_URL non locale (${reportedUrl})`);
  }
  return {
    url: LOCAL_URL,
    serviceRoleKey: requiredString(values.get("SERVICE_ROLE_KEY"), "SERVICE_ROLE_KEY locale"),
  };
}

/** Identificativo tecnico sicuro per SQL (solo cifre esadecimali, da randomUUID). */
function safeId(name: string): string {
  const id = name.replace(/[^0-9a-f]/gi, "").toLowerCase();
  if (id.length === 0) throw new Error(`identificativo fixture non sicuro: ${name}`);
  return id;
}

/**
 * Helper PostgreSQL LOCALE per le sole fixture.
 *
 * Usa `docker exec` sul container Supabase locale con il ruolo `postgres`:
 * nessuna password viene letta, inventata o stampata. L'SQL è passato via stdin.
 */
function localPostgres(): { sql(sqlText: string): string } {
  return {
    sql(sqlText: string): string {
      return execSync(
        [
          "docker", "exec", "-i", LOCAL_DB_CONTAINER,
          "psql", "-U", LOCAL_DB_USER, "-h", "127.0.0.1", "-d", LOCAL_DB_NAME,
          "-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-q",
        ].join(" "),
        { input: sqlText, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      );
    },
  };
}

/** Verifica tecnica della connessione: ruolo, database e host locale. */
function localPostgresSelfCheck(): { role: string; database: string; host: string } {
  const output = localPostgres().sql(
    "select current_user, current_database(), host(inet_server_addr());\n",
  );
  const row = output.split(/\r?\n/).find((line) => line.includes("|"));
  if (!row) throw new Error(`self-check PostgreSQL locale non leggibile: ${JSON.stringify(output)}`);
  const [role, database, host] = row.split("|").map((part) => part.trim());
  if (role !== "postgres") throw new Error(`ruolo PostgreSQL inatteso: ${role}`);
  if (database !== LOCAL_DB_NAME) throw new Error(`database PostgreSQL inatteso: ${database}`);
  if (host !== "127.0.0.1") throw new Error(`host PostgreSQL non locale: ${host}`);
  return { role, database, host };
}

/** Crea la fixture minima (negozio + prodotto) e conserva gli ID generati. */
function createFixtureViaPostgres(): { storeId: string; productId: number } {
  const storeSlug = `pf-${safeId(FIXTURE_PREFIX)}-store`;
  const result = localPostgres().sql(`
begin;
insert into public.negozi (nome, slug, attivo, email)
values ('${FIXTURE_PREFIX} store', '${storeSlug}', true, '${FIXTURE_PREFIX}@localhost.test')
returning id;
insert into public.prodotti (negozio_id, nome, prezzo, quantita_disponibile, quantita_riservata, attivo, disponibile)
select id, '${FIXTURE_PREFIX} product', 10, 1000, 0, true, true from public.negozi where slug = '${storeSlug}'
returning id;
commit;
`);
  // Output atteso (psql -q): una riga UUID (negozi.id) e una riga intera (prodotti.id).
  const rows = result
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const isValid = rows.length === 2 && uuidPattern.test(rows[0] ?? "") && /^\d+$/.test(rows[1] ?? "");
  if (!isValid) {
    throw new Error(`fixture PostgreSQL: output inatteso → ${JSON.stringify(result)}`);
  }
  return { storeId: rows[0] as string, productId: Number(rows[1]) };
}

/**
 * Rimuove ESCLUSIVAMENTE le righe della fixture (identificate dall'ID del
 * negozio creato dal test); nessun dato preesistente viene toccato.
 */
function cleanupFixtureViaPostgres(storeId: string): void {
  localPostgres().sql(`
begin;
delete from public.ordini where negozio_id = '${storeId}';
delete from public.pagamenti_sessioni where negozio_id = '${storeId}';
delete from public.prodotti where negozio_id = '${storeId}';
delete from public.negozi where id = '${storeId}';
commit;
`);
}

/**
 * Verifica tecnica della SOLA connessione PostgreSQL locale (ruolo postgres,
 * database locale) e della fixture minima (create/remove). NON esegue i casi
 * A-E né il flusso di pagamento. Attivabile con PF_LOCAL_PG_CHECK=1.
 */
function verifyLocalPostgresOnly(): void {
  console.log("[PG-CHECK] connessione PostgreSQL locale...");
  const self = localPostgresSelfCheck();
  if (self.role !== "postgres" || self.database !== LOCAL_DB_NAME || self.host !== "127.0.0.1") {
    throw new Error(`self-check fallito: ${JSON.stringify(self)}`);
  }
  console.log(`[PG-CHECK] PASS connessione (ruolo=${self.role}, db=${self.database}, host=${self.host})`);

  let storeId: string | null = null;
  try {
    const fixture = createFixtureViaPostgres();
    storeId = fixture.storeId;
    const productCount = localPostgres()
      .sql(`select count(*) from public.prodotti where negozio_id = '${storeId}';\n`)
      .trim();
    if (productCount !== "1") {
      throw new Error(`fixture prodotto non trovata (count=${productCount})`);
    }
    console.log(`[PG-CHECK] PASS fixture creata (negozio=${storeId}, prodotto=${fixture.productId})`);
  } finally {
    if (storeId) {
      cleanupFixtureViaPostgres(storeId);
      const remaining = localPostgres()
        .sql(`select count(*) from public.negozi where id = '${storeId}';\n`)
        .trim();
      if (remaining !== "0") {
        throw new Error(`cleanup incompleto (negozi residue=${remaining})`);
      }
      console.log("[PG-CHECK] PASS fixture rimossa");
    }
  }
}

async function assertNoError<T>(
  operation: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  label: string,
): Promise<T> {
  const { data, error } = await operation;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data as T;
}

/** Letterale SQL per bigint: accetta solo cifre. */
function sqlBigint(value: string): string {
  if (!/^\d+$/.test(value)) throw new Error(`id bigint non valido: ${value}`);
  return value;
}

/** Letterale SQL per uuid: accetta solo UUID esadecimali. */
function sqlUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`id uuid non valido: ${value}`);
  }
  return `'${value.toLowerCase()}'`;
}

/** Letterale SQL per testo via dollar-quoting (nessun escape manuale). */
function sqlTextValue(value: string): string {
  return `$pfq$${value}$pfq$`;
}

/**
 * SELECT read-only su PostgreSQL locale (SOLO per le asserzioni del test).
 * psql gira con -t -A: output posizionale, una riga per tupla, campi separati
 * da "|". I valori sono letterali validati/quotati (psql via stdin non supporta
 * binding $n): solo ID tecnici (UUID/bigint) e valori noti del test.
 * Le stringhe vuote sono NULL (convenzione psql -A).
 */
function pgSelect(sqlText: string, columns: string[]): JsonObject[] {
  const output = localPostgres().sql(`${sqlText.trim().replace(/;$/, "")};\n`);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const values = line.split("|");
      const row: JsonObject = {};
      columns.forEach((col, i) => {
        row[col] = values[i] === "" || values[i] === undefined ? null : values[i];
      });
      return row;
    });
}

/**
 * Lettura singola riga via PostgreSQL locale (ruolo postgres, read-only).
 * Sostituisce la lettura PostgREST: nel DB locale service_role non ha SELECT
 * sulle tabelle business. Stesso rigore di .single(): 0 o >1 righe = errore.
 */
function scalar<T extends JsonObject>(table: string, id: string, columns: string): T {
  const allowedTables = new Set(["prodotti", "pagamenti_sessioni", "negozi", "ordini", "ordini_righe"]);
  if (!allowedTables.has(table)) throw new Error(`lettura ${table}: tabella non consentita`);
  const cols = columns.split(",").map((c) => c.trim()).filter((c) => c.length > 0);
  const idLiteral = table === "prodotti" ? sqlBigint(id) : sqlUuid(id);
  const rows = pgSelect(`select ${cols.join(", ")} from public.${table} where id = ${idLiteral}`, cols);
  if (rows.length !== 1) throw new Error(`lettura ${table}: attesa 1 riga, trovate ${rows.length}`);
  return rows[0] as T;
}

/** Conteggio ordini del solo negozio fixture, via PostgreSQL locale (read-only). */
function orderCount(storeId: string): number {
  const rows = pgSelect(`select count(*) from public.ordini where negozio_id = ${sqlUuid(storeId)}`, ["count"]);
  if (rows.length !== 1) throw new Error(`conteggio ordini: attesa 1 riga, trovate ${rows.length}`);
  const parsed = Number(rows[0]?.count);
  if (!Number.isFinite(parsed)) throw new Error("conteggio ordini: risultato non valido");
  return parsed;
}

async function startPaymentMock(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/simulate") {
      response.statusCode = 404;
      response.end();
      return;
    }
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try {
        const input = JSON.parse(body) as { state?: PaymentState; paymentId?: string };
        if (!input.state || !["paid", "failed", "canceled"].includes(input.state)) {
          response.statusCode = 400;
          response.end(JSON.stringify({ ok: false }));
          return;
        }
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({
          ok: true,
          status: input.state,
          paymentId: input.paymentId ?? `${FIXTURE_PREFIX}-${input.state}`,
          transactionId: `${FIXTURE_PREFIX}-tx-${input.state}`,
          currency: "EUR",
        }));
      } catch {
        response.statusCode = 400;
        response.end(JSON.stringify({ ok: false }));
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("mock payment locale senza porta");
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function simulatePayment(baseUrl: string, state: PaymentState, paymentId: string): Promise<JsonObject> {
  const response = await fetch(`${baseUrl}/simulate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state, paymentId }),
  });
  if (!response.ok) throw new Error(`mock payment ${state}: HTTP ${response.status}`);
  return await response.json() as JsonObject;
}

async function createIntent(
  db: SupabaseClient,
  storeId: string,
  productId: number,
  suffix: string,
  quantity: number,
): Promise<JsonObject> {
  const data = await assertNoError(
    db.rpc("checkout_intento_crea", {
      p_payload: {
        checkoutKey: `${FIXTURE_PREFIX}-${suffix}`,
        provider: "stripe",
        modalita: "ritiro",
        clienteNome: "Test",
        clienteCognome: "Payment First",
        clienteEmail: `${FIXTURE_PREFIX}@localhost.test`,
        clienteTelefono: "0000000000",
        clienteIp: "127.0.0.1",
        metodoPagamento: "carta",
        negozioId: storeId,
        righe: [{ prodottoId: String(productId), quantita: quantity }],
      },
    }),
    `checkout_intento_crea ${suffix}`,
  );
  if (!data || data.ok !== true) {
    throw new Error(`checkout_intento_crea ${suffix} non riuscito: ${JSON.stringify(data)}`);
  }
  return data;
}

async function confirmIntent(
  db: SupabaseClient,
  sessionId: string,
  payment: JsonObject,
  amount: number,
): Promise<JsonObject> {
  const data = await assertNoError(
    db.rpc("checkout_intento_conferma", {
      p_sessione_id: sessionId,
      p_payment_id: payment.paymentId,
      p_transaction_id: payment.transactionId,
      p_importo: amount,
      p_valuta: payment.currency,
    }),
    `checkout_intento_conferma ${sessionId}`,
  );
  if (!data) throw new Error("checkout_intento_conferma ha restituito NULL");
  return data;
}

async function main(): Promise<void> {
  // Solo verifica tecnica connessione PostgreSQL + fixture (PF_LOCAL_PG_CHECK=1):
  // non esegue i casi A-E né il flusso di pagamento.
  if (process.env.PF_LOCAL_PG_CHECK === "1") {
    verifyLocalPostgresOnly();
    return;
  }

  const { url, serviceRoleKey } = localCredentials();
  const db = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const mock = await startPaymentMock();
  let storeId: string | null = null;
  let productId: number | null = null;

  console.log(`\nLOCAL CONFIG: ${LOCAL_URL}`);
  console.log(`LOCAL DB CONTAINER: ${LOCAL_DB_CONTAINER}`);
  const pgSelf = localPostgresSelfCheck();
  console.log(`LOCAL POSTGRES: db=${pgSelf.database} ruolo=${pgSelf.role} host=${pgSelf.host} — fixture + asserzioni (letture)`);
  console.log("MOCK PAYMENT: loopback-only HTTP server (nessun provider reale)\n");

  try {
    // Fixture minima via PostgreSQL locale (ruolo postgres): fixture e asserzioni;
    // le RPC commerciali restano sul client Supabase locale (SERVICE_ROLE).
    const fixture = createFixtureViaPostgres();
    storeId = fixture.storeId;
    productId = fixture.productId;

    // ── A: PAID → ordine creato ──────────────────────────────────────────
    console.log("\n[A] SUCCESSO");
    {
      const beforeProduct = scalar<JsonObject>("prodotti", String(productId), "quantita_disponibile, quantita_riservata");
      const beforeOrders = orderCount(storeId);
      const intent = await createIntent(db, storeId, productId, "success", 2);
      const sessionId = requiredString(intent.checkoutId, "checkoutId A");
      const duringProduct = scalar<JsonObject>("prodotti", String(productId), "quantita_disponibile, quantita_riservata");
      const duringSession = scalar<JsonObject>("pagamenti_sessioni", sessionId, "id, ordine_id, status, amount");
      check("A", "intento creato", intent.ok === true && intent.giaEsistente === false);
      check("A", "sessione creata senza ordine", duringSession.ordine_id === null && duringSession.status === "created", duringSession);
      check("A", "nessun ordine prima del pagamento", orderCount(storeId) === beforeOrders);
      check("A", "riserva incrementata senza vendita", Number(duringProduct.quantita_disponibile) === Number(beforeProduct.quantita_disponibile) && Number(duringProduct.quantita_riservata) === Number(beforeProduct.quantita_riservata) + 2, duringProduct);

      const payment = await simulatePayment(mock.baseUrl, "paid", `${FIXTURE_PREFIX}-payment-a`);
      const confirmed = await confirmIntent(db, sessionId, payment, Number(intent.totale));
      const afterSession = scalar<JsonObject>("pagamenti_sessioni", sessionId, "id, ordine_id, status, amount");
      const afterProduct = scalar<JsonObject>("prodotti", String(productId), "quantita_disponibile, quantita_riservata");
      const afterOrders = orderCount(storeId);
      check("A", "pagamento mock paid confermato", confirmed.ok === true && confirmed.giaEsistente === false, confirmed);
      check("A", "ordine creato solo dopo conferma", afterOrders === beforeOrders + 1 && afterSession.ordine_id !== null, { afterOrders, afterSession });
      check("A", "sessione paid e collegata", afterSession.status === "paid" && afterSession.ordine_id === confirmed.ordine?.id, afterSession);
      check("A", "riserva convertita in vendita", Number(afterProduct.quantita_disponibile) === Number(beforeProduct.quantita_disponibile) - 2 && Number(afterProduct.quantita_riservata) === Number(beforeProduct.quantita_riservata), afterProduct);
    }

    // ── B: FAILED → nessun ordine e nessuna vendita ──────────────────────
    console.log("\n[B] FAILED");
    {
      const beforeProduct = scalar<JsonObject>("prodotti", String(productId), "quantita_disponibile, quantita_riservata");
      const beforeOrders = orderCount(storeId);
      const intent = await createIntent(db, storeId, productId, "failed", 3);
      const sessionId = requiredString(intent.checkoutId, "checkoutId B");
      const payment = await simulatePayment(mock.baseUrl, "failed", `${FIXTURE_PREFIX}-payment-b`);
      check("B", "mock restituisce failed", payment.status === "failed");
      // Il percorso failed non invoca P2; lo stato failed è quello del provider.
      // Preparazione della FIXTURE (non è un'operazione commerciale né una RPC):
      // service_role non ha UPDATE su questo DB locale, quindi si usa la
      // connessione PostgreSQL locale già presente per le fixture.
      localPostgres().sql(
        `update public.pagamenti_sessioni set status = 'failed', payment_id = ${sqlTextValue(String(payment.paymentId))} where id = ${sqlUuid(sessionId)};\n`,
      );
      const afterProduct = scalar<JsonObject>("prodotti", String(productId), "quantita_disponibile, quantita_riservata");
      const afterSession = scalar<JsonObject>("pagamenti_sessioni", sessionId, "id, ordine_id, status");
      check("B", "nessuna conferma dell'intento", afterSession.status === "failed" && afterSession.ordine_id === null, afterSession);
      check("B", "nessun ordine commerciale", orderCount(storeId) === beforeOrders);
      check("B", "nessuna vendita dello stock", Number(afterProduct.quantita_disponibile) === Number(beforeProduct.quantita_disponibile), afterProduct);
    }

    // ── C: CANCELED → riserva rilasciata, nessun ordine ──────────────────
    console.log("\n[C] CANCELED");
    {
      const beforeProduct = scalar<JsonObject>("prodotti", String(productId), "quantita_disponibile, quantita_riservata");
      const beforeOrders = orderCount(storeId);
      const intent = await createIntent(db, storeId, productId, "canceled", 4);
      const sessionId = requiredString(intent.checkoutId, "checkoutId C");
      const reservedProduct = scalar<JsonObject>("prodotti", String(productId), "quantita_disponibile, quantita_riservata");
      const canceled = await assertNoError(db.rpc("checkout_intento_annulla", { p_checkout_id: sessionId }), "checkout_intento_annulla C");
      const afterSession = scalar<JsonObject>("pagamenti_sessioni", sessionId, "id, ordine_id, status");
      const afterProduct = scalar<JsonObject>("prodotti", String(productId), "quantita_disponibile, quantita_riservata");
      check("C", "intento/sessione iniziale senza ordine", reservedProduct.ordine_id === undefined && afterSession.ordine_id === null);
      check("C", "cancellazione DB riuscita", canceled.ok === true && canceled.annullato === true, canceled);
      check("C", "sessione nello stato expired previsto", afterSession.status === "expired", afterSession);
      check("C", "riserva rilasciata", Number(afterProduct.quantita_disponibile) === Number(beforeProduct.quantita_disponibile) && Number(afterProduct.quantita_riservata) === Number(beforeProduct.quantita_riservata), afterProduct);
      check("C", "nessun ordine commerciale", orderCount(storeId) === beforeOrders);
    }

    // ── D: EXPIRED/INCOMPLETE → riserva rilasciata, nessun ordine ─────────
    console.log("\n[D] EXPIRED");
    {
      const beforeProduct = scalar<JsonObject>("prodotti", String(productId), "quantita_disponibile, quantita_riservata");
      const beforeOrders = orderCount(storeId);
      const intent = await createIntent(db, storeId, productId, "expired", 5);
      const sessionId = requiredString(intent.checkoutId, "checkoutId D");
      const reservedProduct = scalar<JsonObject>("prodotti", String(productId), "quantita_disponibile, quantita_riservata");
      // Preparazione scadenza della FIXTURE (non è un'operazione commerciale):
      // via PostgreSQL locale, stesso effetto di expires_at = now() - 60s.
      localPostgres().sql(
        `update public.pagamenti_sessioni set expires_at = now() - interval '60 seconds' where id = ${sqlUuid(sessionId)};\n`,
      );
      const expired = await assertNoError(db.rpc("checkout_intento_scaduto", { p_sessione_id: sessionId }), "checkout_intento_scaduto D");
      const afterSession = scalar<JsonObject>("pagamenti_sessioni", sessionId, "id, ordine_id, status, expires_at");
      const afterProduct = scalar<JsonObject>("prodotti", String(productId), "quantita_disponibile, quantita_riservata");
      check("D", "riserva creata prima della scadenza", Number(reservedProduct.quantita_riservata) === Number(beforeProduct.quantita_riservata) + 5, reservedProduct);
      check("D", "scadenza DB riuscita", expired.ok === true && expired.cambiato === true, expired);
      check("D", "sessione expired", afterSession.status === "expired" && afterSession.ordine_id === null, afterSession);
      check("D", "riserva rilasciata senza vendita", Number(afterProduct.quantita_disponibile) === Number(beforeProduct.quantita_disponibile) && Number(afterProduct.quantita_riservata) === Number(beforeProduct.quantita_riservata), afterProduct);
      check("D", "nessun ordine commerciale", orderCount(storeId) === beforeOrders);
    }

    // ── E: doppia conferma → un solo ordine e una sola vendita ───────────
    console.log("\n[E] IDEMPOTENZA");
    {
      const beforeProduct = scalar<JsonObject>("prodotti", String(productId), "quantita_disponibile, quantita_riservata");
      const beforeOrders = orderCount(storeId);
      const intent = await createIntent(db, storeId, productId, "idempotence", 6);
      const sessionId = requiredString(intent.checkoutId, "checkoutId E");
      const payment = await simulatePayment(mock.baseUrl, "paid", `${FIXTURE_PREFIX}-payment-e`);
      const first = await confirmIntent(db, sessionId, payment, Number(intent.totale));
      const afterFirstProduct = scalar<JsonObject>("prodotti", String(productId), "quantita_disponibile, quantita_riservata");
      const afterFirstOrders = orderCount(storeId);
      const firstOrderId = requiredString(first.ordine?.id, "ordineId prima conferma E");
      const second = await confirmIntent(db, sessionId, payment, Number(intent.totale));
      const afterSecondProduct = scalar<JsonObject>("prodotti", String(productId), "quantita_disponibile, quantita_riservata");
      const afterSecondOrders = orderCount(storeId);
      const secondSession = scalar<JsonObject>("pagamenti_sessioni", sessionId, "id, ordine_id, status");
      check("E", "prima conferma crea un ordine", first.ok === true && afterFirstOrders === beforeOrders + 1, first);
      check("E", "seconda conferma è idempotente", second.ok === true && second.giaEsistente === true, second);
      check("E", "stesso ordine_id", second.ordine?.id === firstOrderId && secondSession.ordine_id === firstOrderId, { firstOrderId, second });
      check("E", "conteggio ordini invariato", afterSecondOrders === afterFirstOrders && afterSecondOrders === beforeOrders + 1, { afterFirstOrders, afterSecondOrders });
      check("E", "quantità venduta invariata", Number(afterSecondProduct.quantita_disponibile) === Number(afterFirstProduct.quantita_disponibile) && Number(afterSecondProduct.quantita_disponibile) === Number(beforeProduct.quantita_disponibile) - 6 && Number(afterSecondProduct.quantita_riservata) === Number(beforeProduct.quantita_riservata), afterSecondProduct);
    }
  } finally {
    // Cleanup ESCLUSIVAMENTE del negozio fixture appena creato (ID noto):
    // nessuna riga preesistente viene toccata. PostgreSQL locale, ruolo postgres.
    if (storeId) {
      try {
        cleanupFixtureViaPostgres(storeId);
      } catch (cleanupError) {
        console.error("Cleanup fixture fallito:", cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
      }
    }
    mock.server.close();
  }

  console.log(`\nPAYMENT-FIRST LOCAL: ${passati} PASS / ${falliti} FAIL`);
  if (falliti > 0) {
    console.log(`FALLIMENTI: ${fallimenti.join(", ")}`);
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error("PAYMENT-FIRST LOCAL — ERRORE FATALE:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
