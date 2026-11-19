/**
 * Hook ESM per i test RadiciScan (FASE 2B).
 *
 * Unica responsabilità: risolvere gli alias `@/...` e gli import relativi
 * senza estensione verso i file `.ts` del progetto, così `lib/radiscan/**`
 * è importabile da Node senza Next.
 *
 * Nessuno stub: se un modulo RadiciScan importasse per errore il percorso
 * venditori, il test lo caricherebbe davvero e i controlli di isolamento
 * fallirebbero. Non tocca il codice di produzione.
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RADICE = new URL("../../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
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
});
