import { spawnSync } from "node:child_process";

// The regression suite validates deterministic local fallback behavior.
// Never let a build or test run consume the project's live Gemini quota.
const env = { ...process.env };
delete env.GEMINI_API_KEY;

const testFiles = [
  "tests/pino-altro-dedup-v11.spec.ts",
  "tests/pino-attrazioni.spec.ts",
  "tests/pino-budget-soft-search.spec.ts",
  "tests/pino-conversation-state-v10.spec.ts",
  "tests/pino-conversation-state.spec.ts",
  "tests/pino-domanda-aggregata.spec.ts",
  "tests/pino-intenti-locali.spec.ts",
  "tests/pino-memoria-semantica.spec.ts",
  "tests/pino-product-local-filters.spec.ts",
  "tests/pino-product-recall.spec.ts",
  "tests/pino-semantic-constraints.spec.ts",
  "tests/pino-v16-edge-cases.spec.ts",
];

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  command,
  ["playwright", "test", ...testFiles, "--workers=1", "--reporter=line"],
  {
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  }
);

if (result.error) {
  console.error("Impossibile avviare la suite di regressione Pino:", result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
