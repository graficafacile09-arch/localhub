/**
 * AGENDA — TEST DI CLASSIFICAZIONE AUTOMATICA PER PROFILO/CATEGORIA.
 *
 * Verifica che l'Agenda (modulo `prenotazioni`) venga abilitata centralmente
 * dalla classificazione già esistente (profili attività / moduli_attivi) e NON
 * da `if categoria === "medico"` o elenchi paralleli di categorie sparse:
 *   - attività di servizio/prestazione  → AGENDA PRESENTE;
 *   - attività commerciale al dettaglio  → AGENDA ASSENTE.
 *
 * Test PURI (senza browser, via @playwright/test) del helper centralizzato
 * `attivitaHaAgenda` (lib/profili-attivita.ts) che prende come fonte
 * `getModuliAttiviNegozio` → `data.tipo_attivita` (profilo), altrimenti
 * `negozi.moduli_attivi`.
 */
import { test, expect } from "@playwright/test";
import {
  PROFILI_ATTIVITA,
  getProfiloAttivita,
  getProfiloPerTemplate,
  getModuliAttiviNegozio,
  attivitaHaAgenda,
} from "@/lib/profili-attivita";
import type { Negozio } from "@/types/negozio";

// ── helper ───────────────────────────────────────────────────────────────
/** Costruisce un Negozio minimo per i test di classificazione. */
function negozioCon(over: Partial<Pick<Negozio, "data" | "moduli_attivi">> = {}): Negozio {
  return {
    id: "negozio-test",
    slug: "negozio-test",
    nome: "NegoZio Test",
    ...(over as object),
  } as unknown as Negozio;
}

/** Negozio che ha il profilo impostato via data.tipo_attivita. */
function negozioConProfilo(profilo: string): Negozio {
  return negozioCon({ data: { tipo_attivita: profilo } });
}

/** Negozio senza profilo: decide SOLO da moduli_attivi salvati. */
function negozioConModuli(moduli: string[]): Negozio {
  return negozioCon({ moduli_attivi: moduli });
}

test.describe("profilo → il modulo prenotazioni/agenda è centralizzato nei profili", () => {
  test("i profili di servizio/prestazione abilitano l'Agenda (modulo prenotazioni)", () => {
    const conAgenda = ["medico", "beauty", "professionista", "immobiliare", "ricettivo", "artigiano", "ristorante"];
    for (const id of conAgenda) {
      const p = getProfiloAttivita(id);
      expect(p, `profilo ${id} esiste`).toBeDefined();
      expect(p?.moduli_attivi, `profilo ${id} contiene 'prenotazioni'`).toContain("prenotazioni");
      // e il negozio con quel profilo ha l'Agenda
      expect(attivitaHaAgenda(negozioConProfilo(id))).toBe(true);
    }
  });

  test("i profili commerciali al dettaglio NON hanno l'Agenda", () => {
    const senzaAgenda = ["ecommerce", "alimentari", "altro"];
    for (const id of senzaAgenda) {
      const p = getProfiloAttivita(id);
      expect(p, `profilo ${id} esiste`).toBeDefined();
      expect(p?.moduli_attivi, `profilo ${id} NON contiene 'prenotazioni'`).not.toContain("prenotazioni");
      expect(attivitaHaAgenda(negozioConProfilo(id))).toBe(false);
    }
  });

  test("tutti i profili dichiarati esistono (nessun id fantasma nel test)", () => {
    const ids = PROFILI_ATTIVITA.map((p) => p.id);
    for (const id of [
      "medico", "beauty", "professionista", "immobiliare", "ricettivo",
      "artigiano", "ristorante", "ecommerce", "alimentari", "altro",
    ]) {
      expect(ids, `id ${id} presente in PROFILI_ATTIVITA`).toContain(id);
    }
  });
});

test.describe("attivitaHaAgenda — casi categoria/template espliciti (regressione)", () => {
  test("panificio/pasticceria (profilo alimentari) → NESSUNA agenda", () => {
    expect(attivitaHaAgenda(negozioConProfilo("alimentari"))).toBe(false);
  });

  test("gioielleria/negozio al dettaglio (ecommerce) → NESSUNA agenda", () => {
    expect(attivitaHaAgenda(negozioConProfilo("ecommerce"))).toBe(false);
  });

  test("bar (template → alimentari) → NESSUNA agenda", () => {
    const bar = getProfiloPerTemplate("bar");
    expect(bar?.id).toBe("alimentari");
    expect(attivitaHaAgenda(negozioConProfilo("alimentari"))).toBe(false);
  });

  test("parrucchiere (template → beauty) → AGENDA", () => {
    const p = getProfiloPerTemplate("parrucchiere");
    expect(p?.id).toBe("beauty");
    expect(attivitaHaAgenda(negozioConProfilo("beauty"))).toBe(true);
  });

  test("professionista → AGENDA (architetto/ingegnere/fisioterapista consultano sulla base del profilo)", () => {
    expect(attivitaHaAgenda(negozioConProfilo("professionista"))).toBe(true);
  });

  test("medico → AGENDA", () => {
    expect(attivitaHaAgenda(negozioConProfilo("medico"))).toBe(true);
  });

  test("estetista/parrucchiere → AGENDA", () => {
    expect(attivitaHaAgenda(negozioConProfilo("beauty"))).toBe(true);
  });

  test("agente immobiliare (immobiliare) → AGENDA", () => {
    expect(attivitaHaAgenda(negozioConProfilo("immobiliare"))).toBe(true);
  });

  test("negozio senza profilo: dipende da moduli_attivi salvati", () => {
    // senza 'prenotazioni' → niente agenda (anche se ha orari)
    expect(attivitaHaAgenda(negozioConModuli(["orari", "prodotti", "pagamenti"]))).toBe(false);
    // con 'prenotazioni' → agenda attiva
    expect(attivitaHaAgenda(negozioConModuli(["orari", "prenotazioni"]))).toBe(true);
  });

  test("negozio null/undefined → false (mai crash)", () => {
    expect(attivitaHaAgenda(null)).toBe(false);
    expect(attivitaHaAgenda(undefined)).toBe(false);
  });
});

test.describe("getModuliAttiviNegozio — fonte unica della decisione", () => {
  test("il profilo via data.tipo_attivita è priorità 1", () => {
    // anche se moduli_attivi salvati NON contengono prenotazioni,
    // il profilo data.tipo_attivita decide (priorità 1)
    const store = negozioCon({
      data: { tipo_attivita: "medico" },
      moduli_attivi: ["informazioni", "orari", "prodotti"],
    });
    expect(attivitaHaAgenda(store)).toBe(true);
    expect(getModuliAttiviNegozio(store)).toContain("prenotazioni");
  });

  test("senza profilo → decide moduli_attivi salvati", () => {
    const store = negozioCon({ moduli_attivi: ["orari", "prodotti"] });
    expect(getModuliAttiviNegozio(store)).toEqual(["orari", "prodotti"]);
    expect(attivitaHaAgenda(store)).toBe(false);
  });

  test("senza profilo né moduli → null (comportamento esistente: tutti gli step)", () => {
    expect(getModuliAttiviNegozio(negozioCon({}))).toBeNull();
    expect(attivitaHaAgenda(negozioCon({}))).toBe(false);
  });
});