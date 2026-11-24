/**
 * GOLDEN PROMPT — percorso venditori (FASE 0 RadiciScan).
 *
 * Congela il prompt usato dal riconoscimento prodotti dei venditori
 * (`buildVisionPrompt`, unico prompt attivo sulla route
 * `/api/merchant/stores/[negozioId]/products/vision`).
 *
 * Se questo test cambia, il comportamento del percorso venditori è cambiato:
 * va aggiornata la baseline SOLO dopo una decisione esplicita, mai per far
 * passare una modifica accidentale.
 *
 * Baseline registrata il 2026-11-18 su HEAD 02792575:
 *   prompt base          → 1206 byte  sha256 3e178489…
 *   prompt con negozio   → 1222 byte  sha256 2b6a4986…
 */
import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { buildVisionPrompt } from "../lib/product-assistant/prompts";

const PROMPT_SHA256 = "3e178489e57ba79a1e483e316ff9bba026513e09e8c9be2e7d73e071881d006e";
const PROMPT_BYTES = 1206;
const PROMPT_CONTEXT_SHA256 = "2b6a4986d68765138cb911b17284659850324513c3f54ad00c63ace56cf71629";
const PROMPT_CONTEXT_BYTES = 1222;

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

test.describe("Vision venditori — golden prompt", () => {
  test("il prompt base è byte-identico alla baseline", () => {
    const prompt = buildVisionPrompt();

    expect(sha256(prompt), "hash SHA-256 del prompt vision").toBe(PROMPT_SHA256);
    expect(Buffer.byteLength(prompt, "utf8"), "lunghezza in byte").toBe(PROMPT_BYTES);
  });

  test("il contesto negozio si aggiunge in coda senza toccare il corpo", () => {
    const base = buildVisionPrompt();
    const conNegozio = buildVisionPrompt({ negozioNome: "Prova" });

    expect(conNegozio).toBe(`${base} Negozio: Prova.`);
    expect(sha256(conNegozio), "hash del prompt con contesto").toBe(PROMPT_CONTEXT_SHA256);
    expect(Buffer.byteLength(conNegozio, "utf8")).toBe(PROMPT_CONTEXT_BYTES);
  });

  test("resta il prompt del catalogo venditori, distinto da RadiciScan", () => {
    const prompt = buildVisionPrompt();

    expect(prompt).toContain("Riconosci il prodotto nella foto");
    expect(prompt).not.toMatch(/RadiciScan|Radiscan|filiera|territorio|DOP|IGP/i);

    for (const campo of [
      '"nome"',
      '"categoria"',
      '"marca"',
      '"prezzo_suggerito"',
      '"descrizione"',
      '"confidenza"',
    ]) {
      expect(prompt, `campo schema ${campo}`).toContain(campo);
    }
  });
});
