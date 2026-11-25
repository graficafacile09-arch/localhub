/**
 * Hook ESM per i test di contratto della route vision merchant
 * (FASE 0 RadiciScan, Opzione A).
 *
 * Caricato SOLO dal comando:
 *   node --experimental-strip-types --import ./tests/support/hook-vision.mjs \
 *     --test tests/vision-merchant-contract-unit.spec.mjs
 *
 * Fa tre cose, tutte nel processo di test:
 * - risolve gli alias `@/...` e gli import relativi senza estensione verso i
 *   file `.ts` del progetto (stesso schema di tests/support/hook-pino.mjs);
 * - espone la route vision con lo specifier `@vision-test/route`;
 * - sostituisce con stub in memoria le dipendenze che altrimenti
 *   richiederebbero Next, Supabase, rete o provider AI.
 *
 * Nessun modulo di produzione viene modificato. Nessuna connessione viene
 * aperta: gli stub registrano ogni tentativo in `spia`, così il test può
 * fallire se qualcuno prova a scrivere, chiamare una RPC, usare la cache o
 * contattare un provider.
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const RADICE = new URL("../../", import.meta.url);
const ROOT = fileURLToPath(RADICE);

const ROUTE_VISION = pathToFileURL(
  join(
    ROOT,
    "app",
    "api",
    "merchant",
    "stores",
    "[negozioId]",
    "products",
    "vision",
    "route.ts"
  )
).href;

/** specifier richiesto → URL del file reale o dello stub. */
const SOSTITUZIONI = {
  "@vision-test/route": ROUTE_VISION,
  "@vision-test/spia": "vision-test:spia",
  "next/server": "vision-test:next-server",
  "@/lib/auth/session-area": "vision-test:session-area",
  "@/lib/auth/session": "vision-test:session",
  "@/lib/merchant/data": "vision-test:merchant-data",
  "@/lib/rate-limiter": "vision-test:rate-limiter",
  "@/lib/scan-log": "vision-test:scan-log",
  "@/lib/product-assistant/vision-cache": "vision-test:vision-cache",
  "@/lib/product-assistant/providers/gemini": "vision-test:gemini",
  "@/lib/supabase/admin": "vision-test:supabase-admin",
};

const SORGENTE_SPIA = `
export const spia = (globalThis.__visionSpia ??= {
  authErrore: false,
  ownership: true,
  rateAllowed: true,
  requireApiArea: [],
  canManageStore: [],
  checkRateLimit: [],
  logScan: [],
  cacheLookup: [],
  cacheStore: [],
  provider: [],
  rpc: [],
  tabelle: [],
  scritture: [],
  getCurrentUser: [],
  fetch: [],
});

const LISTE = [
  "requireApiArea",
  "canManageStore",
  "checkRateLimit",
  "logScan",
  "cacheLookup",
  "cacheStore",
  "provider",
  "rpc",
  "tabelle",
  "scritture",
  "getCurrentUser",
];

export function azzeraSpia() {
  spia.authErrore = false;
  spia.ownership = true;
  spia.rateAllowed = true;
  for (const chiave of LISTE) spia[chiave].length = 0;
}
`;

const SORGENTE_NEXT_SERVER = `
export class NextResponse extends Response {
  static json(corpo, init) {
    return new Response(JSON.stringify(corpo), {
      status: init && typeof init.status === "number" ? init.status : 200,
      headers: Object.assign(
        { "content-type": "application/json" },
        (init && init.headers) || {}
      ),
    });
  }
}
`;

const SORGENTE_SESSION_AREA = `
import { spia } from "@vision-test/spia";
import { NextResponse } from "next/server";

export const AREA_COOKIE = "lh_area";

export async function requireApiArea(area) {
  spia.requireApiArea.push(area);
  if (spia.authErrore) {
    return {
      sessione: null,
      error: NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Devi effettuare l'accesso." } },
        { status: 401 }
      ),
    };
  }
  return {
    sessione: {
      user: { id: "utente-vision-test", email: "vision.test@localhub.it" },
      area,
      ruoli: ["merchant"],
      correzione: false,
    },
    error: null,
  };
}
`;

const SORGENTE_SESSION = `
import { spia } from "@vision-test/spia";

export async function getCurrentUser() {
  spia.getCurrentUser.push(true);
  return null;
}

export async function requireCurrentUser() {
  throw new Error("requireCurrentUser non deve essere chiamato in questo test");
}
`;

const SORGENTE_MERCHANT_DATA = `
import { spia } from "@vision-test/spia";

export async function canManageStore(userId, negozioId) {
  spia.canManageStore.push({ userId, negozioId });
  return spia.ownership;
}

export async function canManageStorePayments(userId, negozioId) {
  return canManageStore(userId, negozioId);
}
`;

const SORGENTE_RATE_LIMITER = `
import { spia } from "@vision-test/spia";

export const RATE_LIMIT_PROVIDER = "__rate_limit__";

export async function checkRateLimit(soggetto, opzioni) {
  spia.checkRateLimit.push({ soggetto, opzioni: opzioni ?? null });
  return spia.rateAllowed
    ? { allowed: true }
    : { allowed: false, retryAfter: 60, reason: "Troppe scansioni. Riprova tra poco." };
}
`;

const SORGENTE_SCAN_LOG = `
import { spia } from "@vision-test/spia";

export async function logScan(voce) {
  spia.logScan.push(voce);
}
`;

const SORGENTE_VISION_CACHE = `
import { spia } from "@vision-test/spia";

export async function checkImageCache(buffer) {
  spia.cacheLookup.push({ bytes: buffer ? buffer.length : 0 });
  return { hit: false };
}

export async function storeInCache(voce) {
  spia.cacheStore.push(voce);
  return { ok: true };
}
`;

const SORGENTE_GEMINI = `
import { spia } from "@vision-test/spia";

export async function callGeminiGeneration(apiKey, model, prompt, base64, mime) {
  spia.provider.push({ provider: "gemini", model, base64Length: String(base64).length, mime });
  throw new Error("Provider AI non consentito nei test di contratto");
}
`;

const SORGENTE_SUPABASE_ADMIN = `
import { spia } from "@vision-test/spia";

function client() {
  const api = {
    rpc(nome, parametri) {
      spia.rpc.push({ nome, parametri });
      return Promise.resolve({ data: [{ allowed: true }], error: null });
    },
    from(tabella) {
      spia.tabelle.push(tabella);
      const query = {
        select() { return query; },
        eq() { return query; },
        limit() { return query; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        insert(valori) {
          spia.scritture.push({ tabella, tipo: "insert", valori });
          return Promise.resolve({ data: null, error: null });
        },
        upsert(valori) {
          spia.scritture.push({ tabella, tipo: "upsert", valori });
          return Promise.resolve({ data: null, error: null });
        },
        update(valori) {
          spia.scritture.push({ tabella, tipo: "update", valori });
          return Promise.resolve({ data: null, error: null });
        },
        delete() {
          spia.scritture.push({ tabella, tipo: "delete" });
          return Promise.resolve({ data: null, error: null });
        },
        then(onFulfilled, onRejected) {
          return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
        },
      };
      return query;
    },
  };
  return api;
}

export function createAdminSupabaseClient() {
  return client();
}
`;

const SORGENTI = {
  "vision-test:spia": SORGENTE_SPIA,
  "vision-test:next-server": SORGENTE_NEXT_SERVER,
  "vision-test:session-area": SORGENTE_SESSION_AREA,
  "vision-test:session": SORGENTE_SESSION,
  "vision-test:merchant-data": SORGENTE_MERCHANT_DATA,
  "vision-test:rate-limiter": SORGENTE_RATE_LIMITER,
  "vision-test:scan-log": SORGENTE_SCAN_LOG,
  "vision-test:vision-cache": SORGENTE_VISION_CACHE,
  "vision-test:gemini": SORGENTE_GEMINI,
  "vision-test:supabase-admin": SORGENTE_SUPABASE_ADMIN,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const sostituto = SOSTITUZIONI[specifier];
    if (sostituto) return { url: sostituto, shortCircuit: true };

    if (specifier.startsWith("@/")) {
      const relativo = specifier.slice(2);
      for (const suffisso of [".ts", ".tsx", "/index.ts"]) {
        const url = new URL(relativo + suffisso, RADICE);
        if (existsSync(fileURLToPath(url))) {
          return { url: url.href, shortCircuit: true };
        }
      }
    }

    if (
      specifier.startsWith(".") &&
      !/\.[cm]?[jt]s$/.test(specifier) &&
      context.parentURL?.startsWith("file:")
    ) {
      const url = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(fileURLToPath(url))) {
        return { url: url.href, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const sorgente = SORGENTI[url];
    if (sorgente) {
      return { format: "module", shortCircuit: true, source: sorgente };
    }
    return nextLoad(url, context);
  },
});
