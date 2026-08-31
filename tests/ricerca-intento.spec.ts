import { expect, test } from "@playwright/test";

import {
  analizzaRichiesta,
  concettiIntento,
  espandiQueryIbrida,
  haConcetti,
  type IntentoRicerca,
} from "../lib/ricerca-intento";

// ─── A. BISOGNI ──────────────────────────────────────────────────────────────

test("A1 'ho sete' → intento bere con concetti bevande/bar", () => {
  const r = analizzaRichiesta("ho sete");
  expect(r.tipo).toBe("bisogno");
  expect(r.intento).toBe("bere");
  expect(r.concetti.length).toBeGreaterThan(0);
  expect(concettiIntento("ho sete")).toMatch(/bevande|bar|caffetteria/i);
  // La query originale resta sempre presente (mai riscritta).
  expect(r.queryOriginale).toBe("ho sete");
});

test("A2 'ho fame' → intento mangiare", () => {
  const r = analizzaRichiesta("ho fame");
  expect(r.tipo).toBe("bisogno");
  expect(r.intento).toBe("mangiare");
  expect(r.concetti.length).toBeGreaterThan(0);
});

test("A3 'vorrei qualcosa da bere' → bere", () => {
  expect(analizzaRichiesta("vorrei qualcosa da bere").intento).toBe("bere");
});

test("A4 'voglio mangiare' → alimentazione (concetti presenti)", () => {
  const r = analizzaRichiesta("voglio mangiare");
  expect(r.tipo).toBe("bisogno");
  expect(r.intento).toBe("mangiare");
  expect(r.concetti.length).toBeGreaterThan(0);
});

test("A5 espansione additiva mantiene SEMPRE la query originale", () => {
  // La stringa ibrida deve contenere il testo originale + i concetti, mai meno.
  const ibrida = espandiQueryIbrida("ho sete");
  expect(ibrida.toLowerCase()).toContain("ho sete");
  expect(ibrida).toMatch(/bevande|bar|caffetteria/i);
});

// ─── B. REGALO ───────────────────────────────────────────────────────────────

test("B1 'devo fare un regalo' → intento regalo", () => {
  const r = analizzaRichiesta("devo fare un regalo");
  expect(r.tipo).toBe("bisogno");
  expect(r.intento).toBe("regalo");
  expect(r.concetti).toContain("artigianato");
});

test("B2 'cerco un regalo tipico calabrese' → regalo (tipico incluso)", () => {
  const r = analizzaRichiesta("cerco un regalo tipico calabrese");
  expect(r.intento).toBe("regalo");
  expect(r.concetti).toContain("artigianato");
  // La località/attributo rimane nel path (query non persa).
  expect(r.queryOriginale).toContain("calabrese");
});

// ─── C. SERVIZI ──────────────────────────────────────────────────────────────

test("C1 'voglio tagliarmi i capelli' → parrucchiere/barbiere", () => {
  const r = analizzaRichiesta("voglio tagliarmi i capelli");
  expect(r.tipo).toBe("bisogno");
  expect(r.intento).toBe("capelli");
  expect(concettiIntento("voglio tagliarmi i capelli")).toMatch(/parrucchiere|barbiere/i);
});

test("C2 'mi serve un medico' → medico", () => {
  const r = analizzaRichiesta("mi serve un medico");
  expect(r.tipo).toBe("bisogno");
  expect(r.intento).toBe("salute");
  expect(r.concetti).toContain("medico");
});

test("C3 'visita per il cuore' → cardiologia/cuore", () => {
  const r = analizzaRichiesta("visita per il cuore");
  expect(r.intento).toBe("cuore");
  expect(r.concetti).toContain("cardiologo");
});

// ─── D. RICERCA DIRETTA ─────────────────────────────────────────────────────

const DIRETTE = ["pizza", "parrucchiere", "farmacia", "scarpe", "medico cardiologo", "panificio", "bar"];

for (const q of DIRETTE) {
  test(`D query diretta '${q}' resta ESCLUSIVAMENTE una ricerca esplicita/veloce`, () => {
    const r = analizzaRichiesta(q);
    // Nessun bisogno "inventato": o resta esplicita, o i concetti NON restringono
    // (concettiIntento può essere non vuoto SOLO per 'medico cardiologo', che
    // resta comunque una parola reale cercabile).
    expect(r.tipo).toBe("esplicita");
    expect(r.concetti.length).toBe(0);
    expect(haConcetti(q)).toBe(false);
  });
}

// ─── E. REFUSI ───────────────────────────────────────────────────────────────

test("E refuso 'panifficio' resta una ricerca esplicita (il fuzzy la recupera)", () => {
  const r = analizzaRichiesta("panifficio");
  expect(r.tipo).toBe("esplicita");
  // nessun concetto inventato: the fuzzy/tollerante layer gestisce il refuso.
  expect(r.concetti.length).toBe(0);
});

// ─── F. LOCALITÀ ─────────────────────────────────────────────────────────────

test("F1 'pesce a Castrovillari' è ricerca esplicita con la città presente", () => {
  const r = analizzaRichiesta("pesce a Castrovillari");
  // nessun bisogno forzato; la query (con la città) va intera al retrieval.
  expect(r.tipo).toBe("esplicita");
  expect(r.queryOriginale.toLowerCase()).toContain("castrovillari");
});

test("F2 'negozio a Cosenza' → esplicita con Cosenza", () => {
  const r = analizzaRichiesta("negozio a Cosenza");
  expect(r.tipo).toBe("esplicita");
  expect(r.queryOriginale.toLowerCase()).toContain("cosenza");
});

// ─── G. AMBIGUITÀ ────────────────────────────────────────────────────────────

test("G 'qualcosa di bello' NON inventa una categoria", () => {
  const r = analizzaRichiesta("qualcosa di bello");
  expect(r.tipo).toBe("ambigua");
  expect(r.concetti.length).toBe(0);
});

test("G2 'boh' → ambigua senza concetti (zero invenzione)", () => {
  const r = analizzaRichiesta("boh");
  expect(r.concetti.length).toBe(0);
  expect(r.tipo).toBe("ambigua");
});

test("G3 'qualcosa di buono' → ambigua (non forza ristorante/pasticceria)", () => {
  const r = analizzaRichiesta("qualcosa di buono");
  expect(r.tipo).toBe("ambigua");
  expect(r.concetti.length).toBe(0);
});

// ─── H. FALLBACK / CASCADE ──────────────────────────────────────────────────

test("H 'ho sete' NON produce MAI una query vuota (guardia anti-regressione)", () => {
  // Se per ipotesi la comprensione desse zero risultati, la query originale
  // deve comunque esserci: concettiIntento è additivo e non svuota la stringa.
  const base = concettiIntento("ho sete");
  expect(base.trim()).not.toBe("");
  // E l'espansione ibrida mantiene SEMPRE la query originale al fronte.
  expect(espandiQueryIbrida("ho sete").length).toBeGreaterThan("ho sete".length);
});

test("H2 query sconosciuta: comprensione non introduce risultati inventati", () => {
  const r = analizzaRichiesta("zxqvklew");
  expect(r.tipo).toBe("esplicita");
  expect(r.concetti.length).toBe(0);
  expect(concettiIntento("zxqvklew")).toBe("");
});

// ─── I. GROUNDING ────────────────────────────────────────────────────────────

test("I nessun concetto mai generato per input non-bisogno (mai inventare negozi/prodotti)", () => {
  // La comprensione produce SOLO termini di ricerca (stringhe), mai nomi di
  // negozi/prodotti/prezzi: qui verifichiamo che non emerga alcun "risultato".
  const r = analizzaRichiesta("voglio una pizza");
  expect(Array.isArray(r.concetti)).toBe(true);
  // Non c'è alcun campo che rappresenti un risultato inventato.
  expect(Object.prototype.hasOwnProperty.call(r, "negozi")).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(r, "prodotti")).toBe(false);
});

// ─── Robustezza helpers ──────────────────────────────────────────────────────

test("confidenza: bisogno riconosciuto è alta o media, esplicita nulla", () => {
  expect(analizzaRichiesta("ho sete").confidence).toBeTruthy();
  const esplicita: IntentoRicerca = analizzaRichiesta("pizza");
  expect(esplicita.confidence).toBeNull();
});

test("concettiIntento per bisogno multiplo target: beve/bevanda/regalo", () => {
  expect(concettiIntento("devo fare un regalo")).toContain("regalo");
});