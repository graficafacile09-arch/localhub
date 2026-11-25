import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const SORGENTE = readFileSync("lib/conoscenza/cerca.ts", "utf8");

test("le letture live di contenuti e notizie usano cache breve di 60 secondi", () => {
  expect(SORGENTE).toContain("unstable_cache");
  expect(SORGENTE).toMatch(/CACHE_LIVE_SECONDI\s*=\s*60/);
  expect(SORGENTE).toMatch(/revalidate:\s*CACHE_LIVE_SECONDI/);
  expect(SORGENTE).toContain("contenutiLiveCache(query, Math.min(limit, 4))");
  expect(SORGENTE).toContain("notizieLiveCache(60)");
  expect(SORGENTE).toContain("await import(\"next/cache\")");
});

test("un errore del database non blocca la ricerca: le fonti live sono saltate", () => {
  // contenutiDinamici e cercaConoscenza hanno ciascuno il proprio try/catch.
  const blocco = SORGENTE.slice(SORGENTE.indexOf("async function contenutiDinamici"));
  expect(blocco.indexOf("try {")).toBeGreaterThan(-1);
  expect(blocco.match(/catch \{/g)?.length).toBeGreaterThanOrEqual(2);
  expect(SORGENTE).toContain("cercaConoscenza(q, limit).catch(() => [] as RisultatoConoscenza[])");
});
