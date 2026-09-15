/**
 * FASE 13A — Test 1-4: Fixture setup/restore reliability
 *
 * Uses ONLY local Supabase: http://127.0.0.1:54321
 * No remote DB, no Stripe, no payments.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const LOCAL_URL = "http://127.0.0.1:54321";

// Get service role key from local Supabase
function getLocalKey() {
  const raw = execSync("supabase status -o env", { encoding: "utf8" });
  for (const line of raw.split("\n")) {
    const m = line.match(/^SERVICE_ROLE_KEY="?(.+?)"?\s*$/);
    if (m) return m[1];
  }
  throw new Error("Cannot find local SERVICE_ROLE_KEY");
}

const KEY = getLocalKey();
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(LOCAL_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const PREFIX_PRODOTTO = "Prodotto QA Fixture";
let passed = 0, failed = 0;

function assert(label, ok, detail = "") {
  if (ok) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label} ${detail}`); }
}

async function countQA() {
  const { data: p } = await db.from("prodotti").select("id").ilike("nome", `${PREFIX_PRODOTTO}%`);
  const { data: o } = await db.from("ordini").select("id").ilike("idempotency_key", "qa-fixture%");
  const { data: r } = await db.from("ordini_righe").select("id, ordine_id");
  const { data: pa } = await db.from("payout").select("id").ilike("idempotency_key", "qa-fixture%");
  // Filter order_rows that belong to QA orders
  const qaOrdIds = new Set((o ?? []).map((x) => x.id));
  const qaRows = (r ?? []).filter((x) => qaOrdIds.has(x.ordine_id));
  return { products: p?.length ?? 0, orders: o?.length ?? 0, orderRows: qaRows.length, payouts: pa?.length ?? 0 };
}

const LOCAL_ENV = Object.assign({}, process.env, {
  SUPABASE_URL: LOCAL_URL,
  SUPABASE_SERVICE_ROLE_KEY: KEY,
});

function runSetup() {
  execSync("node scripts/setup-qa-fixtures.mjs", {
    encoding: "utf8", stdio: "pipe", env: LOCAL_ENV
  });
}

function runRestore() {
  execSync("node scripts/setup-qa-fixtures.mjs --restore", {
    encoding: "utf8", stdio: "pipe", env: LOCAL_ENV
  });
}

async function countNonQA() {
  const { data: pa } = await db.from("payout").select("id").not("idempotency_key", "like", "qa-fixture%");
  const { data: o } = await db.from("ordini").select("id").not("idempotency_key", "like", "qa-fixture%");
  return { payouts: pa?.length ?? 0, orders: o?.length ?? 0 };
}

// ═══════════════════════════════════════════════════════════════════
console.log("\n══ TEST 1: clean → setup → verify → rerun → idempotent → restore → clean ══");

// Ensure clean baseline
let before = await countQA();
assert("baseline clean: 0 QA products", before.products === 0, `got ${before.products}`);
assert("baseline clean: 0 QA orders", before.orders === 0, `got ${before.orders}`);
assert("baseline clean: 0 QA order_rows", before.orderRows === 0, `got ${before.orderRows}`);
assert("baseline clean: 0 QA payouts", before.payouts === 0, `got ${before.payouts}`);

// Setup
runSetup();
let after = await countQA();
assert("after setup: 3 QA products", after.products === 3, `got ${after.products}`);
assert("after setup: 1 QA order", after.orders === 1, `got ${after.orders}`);
assert("after setup: 1 QA order_row", after.orderRows === 1, `got ${after.orderRows}`);
assert("after setup: 1 QA payout", after.payouts === 1, `got ${after.payouts}`);

// Rerun (idempotent)
runSetup();
let afterRerun = await countQA();
assert("after rerun: still 3 products", afterRerun.products === 3, `got ${afterRerun.products}`);
assert("after rerun: still 1 order", afterRerun.orders === 1, `got ${afterRerun.orders}`);
assert("after rerun: still 1 order_row", afterRerun.orderRows === 1, `got ${afterRerun.orderRows}`);
assert("after rerun: still 1 payout", afterRerun.payouts === 1, `got ${afterRerun.payouts}`);

// Restore
runRestore();
let afterRestore = await countQA();
assert("after restore: 0 QA products", afterRestore.products === 0, `got ${afterRestore.products}`);
assert("after restore: 0 QA orders", afterRestore.orders === 0, `got ${afterRestore.orders}`);
assert("after restore: 0 QA order_rows", afterRestore.orderRows === 0, `got ${afterRestore.orderRows}`);
assert("after restore: 0 QA payouts", afterRestore.payouts === 0, `got ${afterRestore.payouts}`);

// ═══════════════════════════════════════════════════════════════════
console.log("\n══ TEST 2: setup → restore → restore → second restore is no-op ══");

runSetup();
runRestore();
// Second restore should be no-op (no error, no crash)
try {
  runRestore();
  assert("second restore: no error", true);
} catch (e) {
  assert("second restore: no error", false, e.message?.slice(0, 100));
}
let test2 = await countQA();
assert("after double restore: 0 QA products", test2.products === 0, `got ${test2.products}`);
assert("after double restore: 0 QA orders", test2.orders === 0, `got ${test2.orders}`);
assert("after double restore: 0 QA order_rows", test2.orderRows === 0, `got ${test2.orderRows}`);
assert("after double restore: 0 QA payouts", test2.payouts === 0, `got ${test2.payouts}`);

// ═══════════════════════════════════════════════════════════════════
console.log("\n══ TEST 3: non-QA data preserved through setup/restore cycle ══");

let nonQABefore = await countNonQA();
runSetup();
let nonQADuring = await countNonQA();
runRestore();
let nonQAAfter = await countNonQA();

assert("non-QA orders preserved: same count", nonQABefore.orders === nonQADuring.orders && nonQADuring.orders === nonQAAfter.orders,
  `before=${nonQABefore.orders} during=${nonQADuring.orders} after=${nonQAAfter.orders}`);
assert("non-QA payouts preserved: same count", nonQABefore.payouts === nonQADuring.payouts && nonQADuring.payouts === nonQAAfter.payouts,
  `before=${nonQABefore.payouts} during=${nonQADuring.payouts} after=${nonQAAfter.payouts}`);

// Check "Fase 9 Local Store" is unchanged
const { data: f9Store } = await db.from("negozi").select("attivo, deleted_at").eq("nome", "Fase 9 Local Store").maybeSingle();
assert("Fase 9 Local Store unchanged", f9Store?.attivo === true && f9Store?.deleted_at === null);

// ═══════════════════════════════════════════════════════════════════
console.log("\n══ TEST 4: all fixture tables fully cleaned ══");

runSetup();
let test4before = await countQA();
assert("test4 setup: records created", test4before.products === 3 && test4before.orders === 1 && test4before.payouts === 1);

// Also check negozi are still active
const { data: qaStores } = await db.from("negozi").select("nome, attivo, deleted_at").in("nome", [
  "Negozio QA Commerciante A", "Negozio QA Commerciante B",
  "Negozio QA Commerciante C", "Negozio QA Commerciante D"
]);
const allActive = qaStores?.every((s) => s.attivo === true && s.deleted_at === null);
assert("test4: all 4 QA stores active", allActive && qaStores?.length === 4, `found ${qaStores?.length}`);

runRestore();
let test4after = await countQA();
assert("test4 restore: 0 products", test4after.products === 0, `got ${test4after.products}`);
assert("test4 restore: 0 orders", test4after.orders === 0, `got ${test4after.orders}`);
assert("test4 restore: 0 order_rows", test4after.orderRows === 0, `got ${test4after.orderRows}`);
assert("test4 restore: 0 payouts", test4after.payouts === 0, `got ${test4after.payouts}`);

// Stores still active after restore
const { data: qaStoresAfter } = await db.from("negozi").select("nome, attivo, deleted_at").in("nome", [
  "Negozio QA Commerciante A", "Negozio QA Commerciante B",
  "Negozio QA Commerciante C", "Negozio QA Commerciante D"
]);
const allActiveAfter = qaStoresAfter?.every((s) => s.attivo === true && s.deleted_at === null);
assert("test4: QA stores still active after restore", allActiveAfter && qaStoresAfter?.length === 4);

// ═══════════════════════════════════════════════════════════════════
console.log(`\n══ RESULTS: ${passed} passed, ${failed} failed ══`);
process.exit(failed > 0 ? 1 : 0);
