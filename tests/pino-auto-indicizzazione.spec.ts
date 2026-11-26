import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { messaggioConoscenzaNonTrovataPino, sezioniAttivePino } from "../lib/assistente/conoscenza-discorsiva";

const INDICE = "lib/conoscenza/indice-generato.ts";

function caricaIndice(): { percorso: string }[] {
  const testo = readFileSync(INDICE, "utf8");
  const json = testo.slice(testo.indexOf("{"), testo.lastIndexOf("}") + 1);
  return (JSON.parse(json).pagine as { percorso: string }[]);
}

test("lo script di sync genera un indice con le pagine pubbliche di app/", () => {
  execFileSync(process.execPath, ["scripts/sync-conoscenza-pino.mjs"], { stdio: "pipe" });
  expect(existsSync(INDICE)).toBe(true);
  const percorsi = (caricaIndice()).map((p) => p.percorso);
  for (const atteso of ["/faq", "/filiere", "/territorio", "/stagionalita", "/attrazioni"]) {
    expect(percorsi).toContain(atteso);
  }
});

test("l'indice esclude aree amministrative, cliente, API e route dinamiche", () => {
  const percorsi = (caricaIndice()).map((p) => p.percorso);
  expect(percorsi.some((p) => p.includes("amministratore") || p.includes("cliente"))).toBe(false);
  expect(percorsi.some((p) => p.includes("["))).toBe(false);
  expect(percorsi.some((p) => p.startsWith("/api"))).toBe(false);
});

test("il fallback elenca sezioni reali dall'indice, senza testi inventati", () => {
  const sezioni = sezioniAttivePino();
  expect(sezioni.length).toBeGreaterThan(0);
  const msg = messaggioConoscenzaNonTrovataPino("domanda strana", "it");
  expect(msg).toContain("sezioni del sito");
  expect(msg).toContain(sezioni[0].titolo);
});
