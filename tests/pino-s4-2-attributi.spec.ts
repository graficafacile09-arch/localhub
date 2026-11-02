import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ATTRIBUTI_DESCRITTIVI_PINO,
  attributiVuotiPino,
  estraiAttributiPino,
  estraiSoggettoPino,
} from "../lib/assistente/understanding";
import { filtraProdottiPerSoggettoUnico, soggettoPrincipalePino } from "../lib/assistente/tools";
import type { ProdottoRicerca } from "../lib/ricerca-ai";

// ─── S4.2: vocabolario unico degli attributi descrittivi ───────────────────
//
// Prima di S4.2 esistevano due elenchi: `understanding.ts` (colori, materiali,
// destinatari, provenienze) e `ATTRIBUTI_SOGGETTO_PINO` in `tools.ts` (colori,
// materiali, qualche taglia, genere). Ora la fonte è una sola:
// `ATTRIBUTI_DESCRITTIVI_PINO`, usata sia dall'estrazione sia dal gate del
// soggetto. Un attributo descrive ma non identifica: "borsa di pelle nera"
// resta una ricerca di borse.

function prodotto(
  nome: string,
  categoria: string | null = null,
  descrizione: string | null = null
): ProdottoRicerca {
  return {
    id: nome,
    negozio_id: "negozio-test",
    nome,
    descrizione,
    categoria,
    prezzo: 10,
    negozio_nome: "Negozio test",
    immagine_principale: null,
  };
}

test.describe("S4.2 — vocabolario canonico", () => {
  test("colori italiani e inglesi sono attributi canonici", () => {
    for (const parola of ["nero", "nera", "bianche", "black", "white", "silver"]) {
      expect(ATTRIBUTI_DESCRITTIVI_PINO.has(parola)).toBe(true);
    }
    expect(estraiAttributiPino("una borsa nera").colori).toEqual(["nero"]);
    expect(estraiAttributiPino("a black bag").colori).toEqual(["nero"]);
  });

  test("materiali italiani e inglesi sono attributi canonici", () => {
    for (const parola of ["pelle", "cuoio", "leather", "metallo", "wood", "alluminio", "tessuto"]) {
      expect(ATTRIBUTI_DESCRITTIVI_PINO.has(parola)).toBe(true);
    }
    expect(estraiAttributiPino("borsa di pelle").materiali).toEqual(["pelle"]);
    expect(estraiAttributiPino("a leather bag").materiali).toEqual(["pelle"]);
  });

  test("taglie: parole sempre riconosciute, valori solo dopo un marcatore", () => {
    for (const parola of ["piccola", "medio", "grande", "small", "large"]) {
      expect(ATTRIBUTI_DESCRITTIVI_PINO.has(parola)).toBe(true);
    }
    expect(estraiAttributiPino("pantaloni taglia media").taglie).toEqual(["medio"]);
    expect(estraiAttributiPino("maglietta taglia M").taglie).toEqual(["m"]);
    expect(estraiAttributiPino("maglietta taglia 42").taglie).toEqual(["42"]);
    expect(estraiAttributiPino("shoes size XL").taglie).toEqual(["xl"]);
    // "m" da solo non è una taglia: nessuna invenzione.
    expect(estraiAttributiPino("Cerco una borsa in pelle").taglie).toEqual([]);
    expect(estraiAttributiPino("I need a bag").taglie).toEqual([]);
  });

  test("genere e destinatari", () => {
    for (const parola of ["uomo", "donna", "unisex", "woman", "men"]) {
      expect(ATTRIBUTI_DESCRITTIVI_PINO.has(parola)).toBe(true);
    }
    const borsa = estraiAttributiPino("borsa nera da donna");
    expect(borsa.genere).toBe("donna");
    expect(borsa.destinatario).toBe("donna");
    expect(estraiAttributiPino("shoes for men").genere).toBe("uomo");
    expect(estraiAttributiPino("felpa unisex").genere).toBe("unisex");
    // Destinatario e genere restano distinti dal soggetto.
    expect(estraiAttributiPino("borsa per mia madre").destinatario).toBe("madre");
    expect(estraiAttributiPino("borsa per mia madre").genere).toBeNull();
  });

  test("nessun vocabolario duplicato in tools.ts", () => {
    const sorgente = readFileSync(join(process.cwd(), "lib", "assistente", "tools.ts"), "utf8");
    expect(sorgente).not.toContain("ATTRIBUTI_SOGGETTO_PINO");
    expect(sorgente).toContain('from "@/lib/assistente/understanding"');
    expect(sorgente).toContain("ATTRIBUTI_DESCRITTIVI_PINO");
  });
});

test.describe("S4.2 — soggetto distinto dagli attributi", () => {
  test("'borsa di pelle nera': soggetto borsa, attributi separati", () => {
    expect(estraiSoggettoPino("Cerco una borsa di pelle nera")).toBe("borsa");
    expect(soggettoPrincipalePino("borsa di pelle nera")).toBe("borsa");

    const attributi = estraiAttributiPino("Cerco una borsa di pelle nera");
    expect(attributi.materiali).toEqual(["pelle"]);
    expect(attributi.colori).toEqual(["nero"]);
    expect(attributi.destinatario).toBeNull();
  });

  test("'black leather bag': attributi inglesi, soggetto tradotto per il catalogo", () => {
    // `normalizzaQueryCatalogo` traduce i soggetti inglesi verso il catalogo
    // italiano; gli attributi restano attributi e non diventano soggetto.
    expect(estraiSoggettoPino("I need a black leather bag")).toBe("borsa");
    expect(estraiSoggettoPino("I need a black leather bag")).not.toBe("black");
    expect(soggettoPrincipalePino("black leather bag")).toBe("bag");

    const attributi = estraiAttributiPino("I need a black leather bag");
    expect(attributi.colori).toEqual(["nero"]);
    expect(attributi.materiali).toEqual(["pelle"]);
  });

  test("'borsa nera da donna': destinatario e attributi non diventano soggetto", () => {
    expect(estraiSoggettoPino("borsa nera da donna")).toBe("borsa");
    expect(soggettoPrincipalePino("borsa nera da donna")).toBe("borsa");
  });

  test("'maglietta taglia M': la taglia non è il soggetto", () => {
    expect(estraiSoggettoPino("maglietta taglia M")).toBe("maglietta");
    expect(soggettoPrincipalePino("maglietta taglia m")).toBe("maglietta");
    expect(soggettoPrincipalePino("taglia m maglietta")).toBe("maglietta");
  });

  test("richiesta senza attributi: contratto vuoto, nessuna invenzione", () => {
    expect(estraiAttributiPino("Cerco una borsa")).toEqual(attributiVuotiPino());
    expect(estraiAttributiPino("I need a bag").colori).toEqual([]);
    expect(estraiAttributiPino("Cerco qualcosa").taglie).toEqual([]);
    expect(estraiAttributiPino("Cerco qualcosa").genere).toBeNull();
  });
});

test.describe("S4.2 — il gate di pertinenza non regredisce", () => {
  test("'borsa nera' tiene la borsa e scarta la cintura", () => {
    const filtrati = filtraProdottiPerSoggettoUnico(
      [prodotto("Borsa in pelle nera"), prodotto("Cintura nera in pelle")],
      "borsa nera"
    );
    expect(filtrati.map((p) => p.nome)).toEqual(["Borsa in pelle nera"]);
  });

  test("'scarpe nere' non richiede che il colore sia descritto nel catalogo", () => {
    const filtrati = filtraProdottiPerSoggettoUnico(
      [prodotto("Scarpe da running"), prodotto("T-shirt nera")],
      "scarpe nere"
    );
    expect(filtrati.map((p) => p.nome)).toEqual(["Scarpe da running"]);
  });

  test("'maglietta taglia m' non usa la taglia come soggetto", () => {
    const filtrati = filtraProdottiPerSoggettoUnico(
      [prodotto("Maglietta in cotone"), prodotto("Borsa in pelle")],
      "maglietta taglia m"
    );
    expect(filtrati.map((p) => p.nome)).toEqual(["Maglietta in cotone"]);
  });

  test("'black leather bag': nessun attributo inglese diventa il soggetto", () => {
    const soggetto = soggettoPrincipalePino("black leather bag");
    expect(soggetto).toBe("bag");
    expect(ATTRIBUTI_DESCRITTIVI_PINO.has("black")).toBe(true);
    expect(ATTRIBUTI_DESCRITTIVI_PINO.has("leather")).toBe(true);
  });
});
