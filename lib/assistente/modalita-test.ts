/**
 * Pino — Modalità di collaudo locale (Fase 3).
 *
 * Interruttore esplicito `PINO_TEST_MODE=1` che disattiva le sole scritture di
 * apprendimento e il contatore condiviso del rate limiter, per collaudare Pino
 * in locale senza toccare i dati Supabase.
 *
 * Protezione fail-closed:
 * - vale solo con `PINO_TEST_MODE` esattamente `"1"`;
 * - è negata su qualunque runtime Vercel (`VERCEL`, `VERCEL_ENV`,
 *   `VERCEL_TARGET_ENV`), con precedenza al motivo "production";
 * - è negata con `NODE_ENV=production`;
 * - è negata quando `NODE_ENV` non è `development` o `test`: se l'ambiente non
 *   è identificabile con certezza, la modalità resta spenta e tutte le
 *   protezioni ordinarie (rate limiter, memoria) restano attive.
 *
 * Il modulo è puro: nessun import, nessun I/O.
 *
 * @module lib/assistente/modalita-test
 */

export const PINO_TEST_MODE_VAR = "PINO_TEST_MODE";

export type MotivoModalitaTestPino =
  | "attiva"
  | "interruttore_assente"
  | "produzione_vercel"
  | "runtime_vercel"
  | "produzione_node"
  | "ambiente_non_identificabile";

export type EsitoModalitaTestPino = {
  attiva: boolean;
  motivo: MotivoModalitaTestPino;
};

const AMBIENTI_LOCALI = new Set(["development", "test"]);

function normalizza(valore: unknown): string {
  return typeof valore === "string" ? valore.trim().toLowerCase() : "";
}

export function valutaModalitaTestPino(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): EsitoModalitaTestPino {
  if (env[PINO_TEST_MODE_VAR] !== "1") {
    return { attiva: false, motivo: "interruttore_assente" };
  }

  const vercelEnv = normalizza(env.VERCEL_ENV);
  const vercelTarget = normalizza(env.VERCEL_TARGET_ENV);

  if (vercelEnv === "production" || vercelTarget === "production") {
    return { attiva: false, motivo: "produzione_vercel" };
  }

  // Anche preview/development su Vercel sono esclusi: la modalità è locale.
  if (vercelEnv || vercelTarget || normalizza(env.VERCEL)) {
    return { attiva: false, motivo: "runtime_vercel" };
  }

  const nodeEnv = normalizza(env.NODE_ENV);
  if (nodeEnv === "production") {
    return { attiva: false, motivo: "produzione_node" };
  }

  if (!AMBIENTI_LOCALI.has(nodeEnv)) {
    return { attiva: false, motivo: "ambiente_non_identificabile" };
  }

  return { attiva: true, motivo: "attiva" };
}

export function modalitaTestPinoAttiva(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): boolean {
  return valutaModalitaTestPino(env).attiva;
}
