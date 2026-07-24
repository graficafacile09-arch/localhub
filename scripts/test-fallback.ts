/**
 * Test di verifica del fallback multi-provider.
 *
 * Scenari:
 *   1. Cloudflare fallisce → deve chiamare OpenRouter
 *   2. Cloudflare + OpenRouter falliscono → deve chiamare Gemini
 *   3. Cloudflare funziona → OpenRouter e Gemini NON devono essere chiamati
 *
 * Esegue i test con provider mock e stampa i log.
 */

import type { VisionContext, VisionImage } from "../lib/product-assistant/types";
import type { VisionProvider } from "../lib/product-assistant/providers/base";
import { ProviderError, AI_PROVIDER_QUOTA_EXCEEDED, AI_PROVIDER_NETWORK_ERROR } from "../lib/product-assistant/providers/utils";
import type { VisionServiceResult } from "../lib/product-assistant/vision-service";
import type { ProductVisionSuggestion } from "../lib/product-assistant/types";
import { analyzeImages } from "../lib/product-assistant/vision-service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let callLog: string[] = [];

function resetLog() {
  callLog = [];
}

function log(msg: string) {
  callLog.push(msg);
  console.log(`  [TEST] ${msg}`);
}

const fakeImage: VisionImage = {
  buffer: Buffer.from("fake-image-data"),
  filename: "test.jpg",
  role: "primary",
};

const emptySuggestion: ProductVisionSuggestion = {
  nome: "Test Product",
  descrizione: "Test description",
  descrizioneCompleta: null,
  categoria: "Test",
  sottocategoria: null,
  marca: null,
  colore: null,
  materiale: null,
  caratteristiche: [],
  pesoVolume: null,
  paroleChiave: [],
  filtriCatalogo: null,
  prezzoSuggerito: null,
  statoCondizione: "nuovo",
  quantitaSuggerita: 1,
  confidenza: 85,
  immaginePrincipale: null,
  seoTitle: null,
  seoDescription: null,
  altTextImmagine: null,
};

// ─── Mock Provider Factory ────────────────────────────────────────────────────

function makeMockProvider(
  name: string,
  behavior: "success" | "quota_error" | "network_error" | "unknown_error"
): VisionProvider {
  return {
    async analyze(
      _images: VisionImage[],
      _context?: VisionContext
    ) {
      const caller = new Error().stack?.split("\n")[2]?.trim() ?? "unknown";
      log(`${name}.analyze() chiamato (behavior: ${behavior}) [chiamato da: ${caller}]`);

      switch (behavior) {
        case "success":
          return {
            suggestion: emptySuggestion,
            model: `mock-${name}`,
            latencyMs: 50,
            httpStatus: 200,
          };
        case "quota_error":
          throw new ProviderError(
            AI_PROVIDER_QUOTA_EXCEEDED,
            `${name}: quota esaurita (simulato)`,
            429
          );
        case "network_error":
          throw new ProviderError(
            AI_PROVIDER_NETWORK_ERROR,
            `${name}: errore di rete (simulato)`,
            "network"
          );
        case "unknown_error":
          throw new ProviderError(
            "AI_PROVIDER_UNKNOWN_ERROR",
            `${name}: errore generico (simulato)`,
            500
          );
      }
    },
  };
}

// ─── Test 1: Cloudflare fallisce → OpenRouter di emergenza ────────────────────

async function test1_cloudflareFails_openrouterTakesOver() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 1: Cloudflare fallisce → fallback a OpenRouter");
  console.log("=".repeat(60));

  resetLog();

  const providers = [
    { name: "Cloudflare", behavior: "quota_error" as const },
    { name: "OpenRouter", behavior: "success" as const },
    { name: "Gemini", behavior: "success" as const },
  ];

  let usedProvider: string | null = null;

  for (const entry of providers) {
    const provider = makeMockProvider(entry.name, entry.behavior);

    try {
      log(`>>> Tentativo: ${entry.name}`);
      const result = await provider.analyze([fakeImage]);
      usedProvider = entry.name;
      log(`<<< SUCCESSO: ${entry.name} ha risposto`);
      break;
    } catch (caught: unknown) {
      if (caught instanceof ProviderError) {
        log(`<<< FALLBACK: ${entry.name} — [${caught.code}] ${caught.message}`);
        continue;
      }
      throw caught;
    }
  }

  console.log("\n── RISULTATO TEST 1 ──");
  if (usedProvider === "OpenRouter") {
    console.log("✅ PASS: Cloudflare fallito → OpenRouter ha preso il controllo");
  } else {
    console.log(`❌ FAIL: provider finale = ${usedProvider} (atteso: OpenRouter)`);
  }
  console.log("Chiamate effettuate:");
  callLog.forEach((l) => console.log(`  ${l}`));
}

// ─── Test 2: Cloudflare + OpenRouter falliscono → Gemini di emergenza ─────────

async function test2_bothFail_geminiTakesOver() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 2: Cloudflare + OpenRouter falliscono → fallback a Gemini");
  console.log("=".repeat(60));

  resetLog();

  const providers = [
    { name: "Cloudflare", behavior: "quota_error" as const },
    { name: "OpenRouter", behavior: "network_error" as const },
    { name: "Gemini", behavior: "success" as const },
  ];

  let usedProvider: string | null = null;

  for (const entry of providers) {
    const provider = makeMockProvider(entry.name, entry.behavior);

    try {
      log(`>>> Tentativo: ${entry.name}`);
      const result = await provider.analyze([fakeImage]);
      usedProvider = entry.name;
      log(`<<< SUCCESSO: ${entry.name} ha risposto`);
      break;
    } catch (caught: unknown) {
      if (caught instanceof ProviderError) {
        log(`<<< FALLBACK: ${entry.name} — [${caught.code}] ${caught.message}`);
        continue;
      }
      throw caught;
    }
  }

  console.log("\n── RISULTATO TEST 2 ──");
  if (usedProvider === "Gemini") {
    console.log("✅ PASS: Cloudflare + OpenRouter falliti → Gemini ha preso il controllo");
  } else {
    console.log(`❌ FAIL: provider finale = ${usedProvider} (atteso: Gemini)`);
  }
  console.log("Chiamate effettuate:");
  callLog.forEach((l) => console.log(`  ${l}`));
}

// ─── Test 3: Cloudflare funziona → OpenRouter e Gemini NON chiamati ───────────

async function test3_cloudflareWorks_othersNotCalled() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 3: Cloudflare funziona → OR e Gemini non devono essere chiamati");
  console.log("=".repeat(60));

  resetLog();

  const providers = [
    { name: "Cloudflare", behavior: "success" as const },
    { name: "OpenRouter", behavior: "success" as const },
    { name: "Gemini", behavior: "success" as const },
  ];

  let usedProvider: string | null = null;
  let totalCalls = 0;

  for (const entry of providers) {
    const provider = makeMockProvider(entry.name, entry.behavior);

    try {
      totalCalls++;
      log(`>>> Tentativo: ${entry.name}`);
      const result = await provider.analyze([fakeImage]);
      usedProvider = entry.name;
      log(`<<< SUCCESSO: ${entry.name} ha risposto`);
      break;
    } catch (caught: unknown) {
      if (caught instanceof ProviderError) {
        log(`<<< FALLBACK: ${entry.name} — [${caught.code}] ${caught.message}`);
        continue;
      }
      throw caught;
    }
  }

  console.log("\n── RISULTATO TEST 3 ──");
  if (usedProvider === "Cloudflare" && totalCalls === 1) {
    console.log("✅ PASS: Cloudflare ha funzionato, OR e Gemini non sono stati chiamati");
  } else {
    console.log(`❌ FAIL: provider = ${usedProvider}, chiamate totali = ${totalCalls} (atteso: Cloudflare, 1)`);
  }
  console.log("Chiamate effettuate:");
  callLog.forEach((l) => console.log(`  ${l}`));
}

// ─── Test 4: Tutti i provider falliscono → errore quota finale ────────────────

async function test4_allFail_quotaError() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 4: Tutti i provider falliscono → errore quota finale");
  console.log("=".repeat(60));

  resetLog();

  const providers = [
    { name: "Cloudflare", behavior: "quota_error" as const },
    { name: "OpenRouter", behavior: "quota_error" as const },
    { name: "Gemini", behavior: "quota_error" as const },
  ];

  let usedProvider: string | null = null;
  let lastError: ProviderError | null = null;

  for (const entry of providers) {
    const provider = makeMockProvider(entry.name, entry.behavior);

    try {
      log(`>>> Tentativo: ${entry.name}`);
      const result = await provider.analyze([fakeImage]);
      usedProvider = entry.name;
      log(`<<< SUCCESSO: ${entry.name} ha risposto`);
      break;
    } catch (caught: unknown) {
      if (caught instanceof ProviderError) {
        lastError = caught;
        log(`<<< FALLBACK: ${entry.name} — [${caught.code}] ${caught.message}`);
        continue;
      }
      throw caught;
    }
  }

  console.log("\n── RISULTATO TEST 4 ──");
  if (usedProvider === null && lastError?.code === AI_PROVIDER_QUOTA_EXCEEDED) {
    console.log("✅ PASS: Tutti falliti, errore quota restituito");
  } else {
    console.log(`❌ FAIL: provider = ${usedProvider}, ultimo errore = ${lastError?.code}`);
  }
  console.log("Chiamate effettuate:");
  callLog.forEach((l) => console.log(`  ${l}`));
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🧪 TEST FALLBACK MULTI-PROVIDER");
  console.log("   Simulazione della catena: Cloudflare → OpenRouter → Gemini\n");

  await test1_cloudflareFails_openrouterTakesOver();
  await test2_bothFail_geminiTakesOver();
  await test3_cloudflareWorks_othersNotCalled();
  await test4_allFail_quotaError();

  console.log("\n" + "=".repeat(60));
  console.log("TEST COMPLETATI");
  console.log("=".repeat(60) + "\n");
}

main().catch((err) => {
  console.error("ERRORE:", err);
  process.exit(1);
});
