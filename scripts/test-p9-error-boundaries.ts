import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
let passati = 0;
let falliti = 0;
const fallitiNomi: string[] = [];

function file(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function check(nome: string, condizione: boolean, dettaglio?: string) {
  if (condizione) {
    passati++;
    console.log(`  ✅ ${nome}`);
  } else {
    falliti++;
    fallitiNomi.push(nome);
    console.log(`  ❌ ${nome}${dettaglio ? ` → ${dettaglio}` : ""}`);
  }
}

function exists(path: string): boolean {
  return existsSync(join(ROOT, path));
}

function isClientBoundary(path: string): boolean {
  return /^\s*["']use client["'];/.test(file(path));
}

function hasRetry(path: string): boolean {
  const source = file(path);
  return source.includes("unstable_retry") && source.includes("onClick={unstable_retry}");
}

const globalError = file("app/global-error.tsx");
const boundaryFiles = [
  "app/global-error.tsx",
  "app/error.tsx",
  "app/(merchant)/merchant/error.tsx",
  "app/(amministratore)/amministratore/pagamenti/error.tsx",
];
const loadingFiles = [
  "app/(merchant)/merchant/loading.tsx",
  "app/(amministratore)/amministratore/pagamenti/loading.tsx",
];

console.log("\n=== P9 TEST: ERROR BOUNDARIES ===\n");

console.log("[1] Global boundary");
check("1a. app/global-error.tsx presente", exists("app/global-error.tsx"));
check("1b. global boundary è Client Component", isClientBoundary("app/global-error.tsx"));
check("1c. global boundary usa unstable_retry", hasRetry("app/global-error.tsx"));
check(
  "1d. global boundary non espone dettagli tecnici",
  !/(error\.message|error\.stack|error\.digest|\{\s*digest\s*\})/.test(globalError)
);

console.log("\n[2] Copertura route richiesta");
for (const path of loadingFiles) {
  check(`${path} presente`, exists(path));
}
for (const path of boundaryFiles) {
  check(`${path} presente`, exists(path));
  check(`${path} è Client Component`, isClientBoundary(path));
  check(`${path} contiene retry`, hasRetry(path));
  const source = file(path);
  check(
    `${path} non mostra dettagli tecnici`,
    !/(error\.message|error\.stack|error\.digest|\{\s*digest\s*\})/.test(source)
  );
}

console.log("\n[3] Boundary assistente AI");
const assistantError = file("app/(amministratore)/amministratore/assistente-ai/error.tsx");
check("3a. usa unstable_retry", assistantError.includes("unstable_retry"));
check("3b. non usa reset()", !assistantError.includes("reset"));
check(
  "3c. non mostra dettagli tecnici",
  !/(error\.message|error\.stack|error\.digest|\{\s*digest\s*\})/.test(assistantError)
);

console.log("\n[4] Server/client error leak");
const adminOrderPage = file("app/(amministratore)/amministratore/ordini/[ordineId]/page.tsx");
const guestOrdersPage = file("app/ordini/recupera/page.tsx");
check("4a. admin order page non renderizza errore interno", !adminOrderPage.includes("description={errore}"));
check("4b. recupero ordini non propaga direttamente error.message API", !guestOrdersPage.includes("json.error?.message"));

console.log("\n[5] API sanitization P9");
const apiChecks: Array<[string, string]> = [
  ["/api/search", "app/api/search/route.ts"],
  ["/api/ricerca-ai", "app/api/ricerca-ai/route.ts"],
  ["/api/assistente", "app/api/assistente/route.ts"],
  ["/api/categories", "app/api/categories/route.ts"],
  ["admin dashboard", "app/api/amministratore/dashboard/route.ts"],
  ["admin negozi", "app/api/amministratore/negozi/route.ts"],
  ["admin ordini", "app/api/amministratore/ordini/route.ts"],
  ["admin ordine dettaglio", "app/api/amministratore/ordini/[ordineId]/route.ts"],
  ["admin incassi", "app/api/amministratore/incassi/route.ts"],
  ["admin assistente AI", "app/api/amministratore/assistente-ai/route.ts"],
  ["merchant stores", "app/api/merchant/stores/route.ts"],
  ["merchant settings", "app/api/merchant/stores/[negozioId]/settings/route.ts"],
  ["merchant products", "app/api/merchant/stores/[negozioId]/products/route.ts"],
  ["merchant incassi", "app/api/merchant/stores/[negozioId]/incassi/route.ts"],
  ["merchant payout", "app/api/merchant/stores/[negozioId]/payout/route.ts"],
  ["merchant prenotazioni", "app/api/merchant/stores/[negozioId]/prenotazioni/route.ts"],
];
for (const [label, path] of apiChecks) {
  const source = file(path);
  check(
    `${label}: nessun ritorno diretto di error.message`,
    !/(return\s+[^\n]*(?:error|err|caught)\.message|return\s+apiError[\s\S]{0,180}\bmessage\b\s*,\s*5)/.test(source)
  );
  check(`${label}: messaggio pubblico generico presente`, /(Si è verificato un errore|Impossibile|Errore interno)/.test(source));
}

console.log("\n═══════════════════════════════════════════════════════");
console.log(`P9 TEST: ${passati} PASS / ${falliti} FAIL`);
if (falliti > 0) {
  console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
  process.exitCode = 1;
}
