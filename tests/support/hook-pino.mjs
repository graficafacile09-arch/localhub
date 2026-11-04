/**
 * Hook ESM per i test Pino (Fase 3).
 *
 * Serve a due cose, SOLO nel processo di test:
 * - risolve gli alias `@/...` e gli import relativi senza estensione verso i
 *   file `.ts` del progetto, così `memoria.ts` e `rate-limiter.ts` sono
 *   importabili da Node senza Next;
 * - sostituisce `@/lib/supabase/admin` e `@/lib/supabase/server` con un client
 *   finto che registra ogni chiamata: i test dimostrano che in modalità test
 *   non parte alcun upsert e nessuna RPC, senza rete e senza credenziali.
 *
 * Il client registra anche i filtri `gte`/`lte` con la tabella di provenienza:
 * così i test del budget possono verificare i limiti realmente inviati alla
 * query (prezzo minimo/massimo) senza un database.
 *
 * Non tocca il codice di produzione: è caricato solo da `npm run test:pino`.
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STUB_SUPABASE = "pino-test:supabase";
const RADICE = new URL("../../", import.meta.url);

const SORGENTE_FINTA = `
const spia = (globalThis.__pinoSpiaSupabase ??= {
  clientCreati: 0,
  rpc: [],
  tabelle: [],
  selezioni: [],
  filtri: [],
  upsert: [],
  altri: [],
});

function client() {
  spia.clientCreati += 1;
  let dati = [];
  const risultato = {
    get data() { return dati; },
    error: null,
    get count() { return dati.length; },
  };
  let tabella = null;
  const api = {
    select(colonne, opzioni) {
      spia.selezioni.push({ tabella, colonne, opzioni: opzioni ?? null });
      // I negozi attivi servono a cercaProdottiCore per interrogare i prodotti:
      // senza almeno un id la ricerca prodotti non parte e i filtri non
      // arriverebbero mai alla query.
      if (tabella === "negozi" && String(colonne).trim() === "id") {
        dati = [{ id: "negozio-test" }];
      }
      return api;
    },
    insert(valori) {
      spia.altri.push("insert");
      return Promise.resolve(risultato);
    },
    update(valori) {
      spia.altri.push("update");
      return Promise.resolve(risultato);
    },
    delete() {
      spia.altri.push("delete");
      return Promise.resolve(risultato);
    },
    upsert(valori, opzioni) {
      spia.upsert.push({ valori, opzioni });
      return Promise.resolve({ data: null, error: null });
    },
    in() { return api; },
    eq() { return api; },
    neq() { return api; },
    gt(colonna, valore) {
      spia.filtri.push({ tabella, tipo: "gt", colonna, valore });
      return api;
    },
    gte(colonna, valore) {
      spia.filtri.push({ tabella, tipo: "gte", colonna, valore });
      return api;
    },
    lt(colonna, valore) {
      spia.filtri.push({ tabella, tipo: "lt", colonna, valore });
      return api;
    },
    lte(colonna, valore) {
      spia.filtri.push({ tabella, tipo: "lte", colonna, valore });
      return api;
    },
    is() { return api; },
    or() { return api; },
    ilike() { return api; },
    textSearch() { return api; },
    filter() { return api; },
    contains() { return api; },
    overlaps() { return api; },
    range() { return api; },
    order() { return api; },
    limit() { return api; },
    then(onFulfilled, onRejected) {
      return Promise.resolve(risultato).then(onFulfilled, onRejected);
    },
  };

  return {
    rpc(nome, parametri) {
      spia.rpc.push({ nome, parametri });
      return Promise.resolve({ data: [{ allowed: true }], error: null });
    },
    from(nomeTabella) {
      spia.tabelle.push(nomeTabella);
      tabella = nomeTabella;
      return api;
    },
  };
}

export function createAdminSupabaseClient() {
  return client();
}

export async function createServerSupabaseClient() {
  return client();
}
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "@/lib/supabase/admin" ||
      specifier === "@/lib/supabase/server" ||
      /(^|\/)supabase\/(admin|server)$/.test(specifier)
    ) {
      return { url: STUB_SUPABASE, shortCircuit: true };
    }

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
    if (url === STUB_SUPABASE) {
      return { format: "module", shortCircuit: true, source: SORGENTE_FINTA };
    }
    return nextLoad(url, context);
  },
});
