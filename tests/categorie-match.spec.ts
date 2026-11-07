import { expect, test } from "@playwright/test";

import { getConteggiNegoziPerCategoria } from "../lib/negozi";
import type { Categoria } from "../types/negozio";

// ─── Regressione: una categoria ufficiale non si allarga ai sinonimi ────────
// Il negozio "Dott. Bianchi Otorino" è salvato in "Salute e benessere", ma
// compariva anche in Beauty, Parafarmacia, Salute e in tutte le categorie il
// cui nome contiene la "e" (Ferramenta, Fiori e piante, ecc.) perché il
// matching condivideva il token "e" o i sinonimi "benessere"/"salute".

type EsitoFinto = { data?: unknown; error?: unknown };

type DbFinto = NonNullable<Parameters<typeof getConteggiNegoziPerCategoria>[2]>;

function dbFinto(): DbFinto {
  let tabella = "";
  const catena: Record<string, unknown> = {};
  catena.from = (nome: string) => {
    tabella = nome;
    return catena;
  };
  for (const passo of ["select", "eq", "in", "is", "order", "limit", "range"]) {
    catena[passo] = () => catena;
  }
  catena.then = (risolvi: (valore: EsitoFinto) => unknown) => {
    const corrente =
      tabella === "negozi"
        ? { data: [{ categoria: "Salute e benessere" }], error: null }
        : { data: [], error: null };
    return risolvi(corrente);
  };
  return catena as unknown as DbFinto;
}

const categoria = (id: string, slug: string, nome: string, sinonimi: string[] = []) =>
  ({ id, slug, nome, sinonimi, attivo: true }) as unknown as Categoria;

test("un negozio in 'Salute e benessere' non compare nelle categorie con sinonimi condivisi", async () => {
  const categorie = [
    categoria("cat-salute-benessere", "salute-e-benessere", "Salute e benessere", [
      "salute",
      "benessere",
      "wellness",
      "centro benessere",
      "spa",
    ]),
    categoria("cat-parafarmacia", "parafarmacia", "Parafarmacia", [
      "farmacia",
      "integratori",
      "benessere",
      "cosmetici",
      "sanitaria",
    ]),
    categoria("cat-beauty", "beauty", "Beauty", [
      "beauty",
      "bellezza",
      "parrucchiere",
      "estetista",
      "barbiere",
      "benessere",
    ]),
    categoria("cat-salute", "salute", "Salute", [
      "salute",
      "farmacia",
      "parafarmacia",
      "benessere",
    ]),
    categoria("cat-ferramenta", "ferramenta", "Ferramenta", [
      "utensili",
      "attrezzi",
      "ferramenta e utensileria",
      "bricolage",
    ]),
  ];

  const conteggi = await getConteggiNegoziPerCategoria(categorie, undefined, dbFinto());

  expect(conteggi.get("cat-salute-benessere")).toBe(1);
  expect(conteggi.get("cat-parafarmacia")).toBe(0);
  expect(conteggi.get("cat-beauty")).toBe(0);
  expect(conteggi.get("cat-salute")).toBe(0);
  expect(conteggi.get("cat-ferramenta")).toBe(0);
});
