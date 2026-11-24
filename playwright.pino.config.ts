import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Le suite Pino sono OFFLINE: il planner usa il percorso locale deterministico.
// I worker ricevono anche l'hook Supabase finto usato dalla suite Node, così
// nessun test Playwright tenta connessioni a database reali o a endpoint esterni.
delete process.env.GROQ_API_KEY;
delete process.env.GEMINI_API_KEY;
process.env.NODE_OPTIONS = [
  process.env.NODE_OPTIONS,
  `--import=${pathToFileURL(resolve("tests/support/hook-pino.mjs")).href}`,
].filter(Boolean).join(" ");

/**
 * Configurazione dedicata alle suite Pino OFFLINE.
 *
 * Le suite `tests/pino-*.spec.ts` usano il runner di Playwright solo come
 * harness (`test`/`expect`): verificano funzioni pure dell'orchestratore, non
 * aprono pagine e non richiedono alcun browser né un deployment. Sono quindi
 * eseguibili in locale e in CI senza `playwright install` e senza rete.
 *
 * Sono escluse:
 * - `pino-widget.spec.ts`, che naviga l'app reale (`page.goto("/")`,
 *   `/checkout`, acquisto ospite) e resta coperta da `npm run test:e2e`
 *   contro un ambiente avviato;
 * - tutte le suite non Pino, che appartengono a `test:e2e`.
 *
 * La suite Node (`npm run test:pino`) resta separata e invariata, ed è
 * inclusa nella verifica CI `npm run verify:ci`.
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: /(^|[\\/])pino-[^\\/]*\.spec\.ts$/,
  testIgnore: /pino-widget\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : 4,
  reporter: [["list"]],
  use: { ...devices["Desktop Chrome"] },
});
