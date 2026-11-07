import { defineConfig, devices } from "@playwright/test";

// Le suite Pino sono OFFLINE per contratto (docs/pino-relazione-finale-20261105.md):
// senza GEMINI_API_KEY il planner usa il percorso locale deterministico, che è
// esattamente ciò che queste asserzioni verificano. In CI (Vercel) la chiave è
// presente nell'ambiente e il planner AI live rispondeva in modo diverso,
// facendo fallire l'intera build: qui la rimuoviamo prima di avviare i worker.
delete process.env.GEMINI_API_KEY;

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
 * La suite Node (`npm run test:pino`) resta separata e invariata, perché è
 * quella richiamata da `prebuild`.
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: /pino-.*\.spec\.ts$/,
  testIgnore: /pino-widget\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : 4,
  reporter: [["list"]],
  use: { ...devices["Desktop Chrome"] },
});
