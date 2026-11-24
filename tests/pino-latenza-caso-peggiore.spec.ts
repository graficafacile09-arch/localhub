import { expect, test } from "@playwright/test";
import { chatConAssistente } from "@/lib/assistente";

// Caso peggiore: Gemini e Groq rispondono solo dopo 5 s. Il budget AI (8,5 s)
// deve chiudere il flusso prima del limite di 10 s della funzione Vercel Hobby.
const RITARDO_PROVIDER_MS = 60_000;
const LIMITE_TOTALE_MS = 9_500;

test.describe("Pino — latenza nel caso peggiore", () => {
  test("provider lenti: la risposta arriva entro il budget, valida", async () => {
    const fetchOriginale = globalThis.fetch;
    // Provider lenti che rispettano AbortSignal, come Groq e Gemini reali.
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!/generativelanguage|api\.groq\.com/.test(url)) {
        return Promise.resolve(new Response("{}", { status: 503 }));
      }
      return new Promise<Response>((risolvi, rifiuta) => {
        const timer = setTimeout(() => risolvi(new Response("{}", { status: 503 })), RITARDO_PROVIDER_MS);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          rifiuta(new DOMException("Aborted", "AbortError"));
        });
      });
    }) as typeof fetch;

    const chiavi = { GROQ_API_KEY: process.env.GROQ_API_KEY, GEMINI_API_KEY: process.env.GEMINI_API_KEY };
    process.env.GROQ_API_KEY = "chiave-test-latenza";
    process.env.GEMINI_API_KEY = "chiave-test-latenza";
    try {
      const inizio = Date.now();
      const risposta = await chatConAssistente([
        { role: "user", content: "Cerco un regalo per mia madre" },
      ]);
      const durataMs = Date.now() - inizio;

      console.info("[latenza-caso-peggiore] ms=" + durataMs);
      expect(durataMs).toBeLessThan(LIMITE_TOTALE_MS);
      expect(risposta.risposta.trim().length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = fetchOriginale;
      for (const [chiave, valore] of Object.entries(chiavi)) {
        if (valore === undefined) delete process.env[chiave];
        else process.env[chiave] = valore;
      }
    }
  });
});
