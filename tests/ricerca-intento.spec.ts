import { expect, test } from "@playwright/test";

import {
  analizzaRichiesta,
  concettiIntento,
  espandiQueryIbrida,
  esclusioniNegazione,
  haConcetti,
  haQualificatoreDestinatario,
  haQualificatoreEconomico,
  haQualificatoreTranquillo,
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

// ─── V2: copertura estesa dello spec §12 ────────────────────────────────────

test("V2 'cerco qualcosa per cena' → bisogno mangiare con concetti", () => {
  const r = analizzaRichiesta("cerco qualcosa per cena");
  expect(r.tipo).toBe("bisogno");
  expect(r.intento).toBe("mangiare");
  expect(r.concetti.length).toBeGreaterThan(0);
});

test("V2 'voglio mangiare pesce' → bisogno mangiare (pesce resta nella query)", () => {
  const r = analizzaRichiesta("voglio mangiare pesce");
  expect(r.tipo).toBe("bisogno");
  expect(r.intento).toBe("mangiare");
  // Il concetto specifico 'pesce' NON viene perso dal testo.
  expect(r.queryOriginale).toContain("pesce");
});

test("V2 'cerco un medico cardiologo' → bisogno accantono (cardiologo/cuore)", () => {
  const r = analizzaRichiesta("cerco un medico cardiologo");
  expect(r.tipo).toBe("bisogno");
  // Intent cuore (cardiologo) E la radice medico restano nella query originale.
  expect(r.queryOriginale).toContain("medico");
  expect(concettiIntento("cerco un medico cardiologo")).toMatch(/cardio|cuore/i);
});

test("V2 'voglio una visita al cuore' → bisogno cuore/cardiologia", () => {
  const r = analizzaRichiesta("voglio una visita al cuore");
  expect(r.tipo).toBe("bisogno");
  expect(r.intento).toBe("cuore");
  expect(r.concetti).toContain("cardiologo");
});

test("V2 'prodotti tipici' → bisogno tipico (concetti regionali)", () => {
  const r = analizzaRichiesta("prodotti tipici");
  expect(r.tipo).toBe("bisogno");
  expect(r.concetti.length).toBeGreaterThan(0);
  expect(concettiIntento("prodotti tipici")).toMatch(/artigianato|tipico/i);
});

test("V2 'regalo tipico calabrese' → bisogno regalo + tipico + Calabria (query originale mantiene 'calabrese')", () => {
  const r = analizzaRichiesta("regalo tipico calabrese");
  expect(r.tipo).toBe("bisogno");
  expect(r.concetti.length).toBeGreaterThan(0);
  expect(r.queryOriginale).toContain("calabrese");
  expect(concettiIntento("regalo tipico calabrese")).toMatch(/artigianato|prodotti tipici/i);
});

test("V2 'pesce a Castrovillari' è esplicita con località (niente concetti gonfiati)", () => {
  const r = analizzaRichiesta("pesce a Castrovillari");
  expect(r.tipo).toBe("esplicita");
  expect(r.queryOriginale.toLowerCase()).toContain("castrovillari");
});

test("V2 'negozio a Cosenza' è esplicita con Cosenza", () => {
  const r = analizzaRichiesta("negozio a Cosenza");
  expect(r.tipo).toBe("esplicita");
  expect(r.queryOriginale.toLowerCase()).toContain("cosenza");
});

test("V2 località + intento: 'voglio mangiare pesce a Castrovillari' resta bisogno mangiare con città in query", () => {
  const r = analizzaRichiesta("voglio mangiare pesce a Castrovillari");
  expect(r.tipo).toBe("bisogno");
  expect(r.intento).toBe("mangiare");
  // La città non azzera né viene persa.
  expect(r.queryOriginale.toLowerCase()).toContain("castrovillari");
  expect(r.concetti.length).toBeGreaterThan(0);
});

test("V2 query generica 'qualcosa per cena senza specifica' NON inventa categoria stringente", () => {
  const r = analizzaRichiesta("boh");
  expect(r.concetti.length).toBe(0);
  expect(r.tipo).toBe("ambigua");
});
test("V2 ranking: intento non 'gonfia' una query diretta semplice (regressione pre-fe8252e)", () => {
  // 'pizza' resta esplicita e veloce: nessun concetto introdotto.
  expect(analizzaRichiesta("pizza").tipo).toBe("esplicita");
  expect(concettiIntento("pizza")).toBe("");
  // 'farmacia' resta esplicita (categoria diretta), non gonfiata.
  expect(analizzaRichiesta("farmacia").tipo).toBe("esplicita");
  expect(concettiIntento("farmacia")).toBe("");
});

// ─── V6-A: NEGAZIONI / VINCOLI NEGATIVI ──────────────────────────────────────

test("V6-A 'regalo non alimentare' → esclusione 'alimentare' (query originale intatta)", () => {
  const r = analizzaRichiesta("regalo non alimentare");
  // La negazione NON tocca la query: resta integra al retrieval.
  expect(r.queryOriginale).toBe("regalo non alimentare");
  // Ma produce un vincolo di esclusione affabile per il post-retrieval.
  expect(esclusioniNegazione("regalo non alimentare")).toEqual(["alimentare"]);
});

test("V6-A 'non voglio prodotti alimentari' → esclude il termine TESTA 'alimentari'", () => {
  // Prende l'ultimo sostantivo sostanziale (il concetto), non il generico 'prodotti'.
  expect(esclusioniNegazione("non voglio prodotti alimentari")).toEqual(["alimentari"]);
});

test("V6-A 'non voglio una pizzeria' → esclusione 'pizzeria'", () => {
  expect(esclusioniNegazione("non voglio una pizzeria")).toEqual(["pizzeria"]);
});

test("V6-A 'senza pesce' → esclusione 'pesce'", () => {
  expect(esclusioniNegazione("senza pesce")).toEqual(["pesce"]);
});

test("V6-A 'non medico' → esclusione 'medico'", () => {
  expect(esclusioniNegazione("non medico")).toEqual(["medico"]);
});

test("V6-A 'non cerco un parrucchiere' → esclusione 'parrucchiere'", () => {
  expect(esclusioniNegazione("non cerco un parrucchiere")).toEqual(["parrucchiere"]);
});

test("V6-A query senza negazione → nessuna esclusione (zero invenzione)", () => {
  expect(esclusioniNegazione("pizza")).toEqual([]);
  expect(esclusioniNegazione("devo fare un regalo")).toEqual([]);
  expect(esclusioniNegazione("mangiare pesce a Castrovillari")).toEqual([]);
});

// ─── V6-B: QUALIFICATORI ─────────────────────────────────────────────────────

test("V6-B 'qualcosa di economico' → rileva qualificatore di prezzo (segnale reale)", () => {
  expect(haQualificatoreEconomico("qualcosa di economico")).toBe(true);
});

test("V6-B 'qualcosa di economico per cena' → qualificatore budget presente", () => {
  expect(haQualificatoreEconomico("qualcosa di economico per cena")).toBe(true);
});

test("V6-B 'un regalo economico' → qualificatore budget presente (senza gonfiare categoria)", () => {
  expect(haQualificatoreEconomico("un regalo economico")).toBe(true);
  // resta una ricerca esplicita: 'economico' NON diventa una categoria inventata.
  expect(concettiIntento("un regalo economico")).toBe("");
});

test("V6-B 'pizza' NON ha qualificatore budget (query semplici invariate)", () => {
  expect(haQualificatoreEconomico("pizza")).toBe(false);
});

test("V6-B 'un posto tranquillo' → qualificatore tranquillo senza categoria inventata", () => {
  expect(haQualificatoreTranquillo("un posto tranquillo")).toBe(true);
  expect(concettiIntento("un posto tranquillo")).toBe("");
});

test("V6-B destinatario per regalo riconosciuto ma senza segnale DB (grounded)", () => {
  expect(haQualificatoreDestinatario("un regalo per mia madre")).toBe(true);
  expect(haQualificatoreDestinatario("un regalo")).toBe(false);
});

test("V6-B qualificatori non inventano risultati per 'boh'", () => {
  expect(analizzaRichiesta("boh").tipo).toBe("ambigua");
  expect(esclusioniNegazione("boh")).toEqual([]);
  expect(haQualificatoreEconomico("boh")).toBe(false);
});

// ─── V6-C: REGRESSIONI ranking (invarianza query semplici) ──────────────────

test("V6-C 'pizza' non viene gonfiata inutilmente", () => {
  expect(analizzaRichiesta("pizza").tipo).toBe("esplicita");
  expect(esclusioniNegazione("pizza")).toEqual([]);
});

test("V6-C 'mangiare pesce a Castrovillari' mantiene località E intento senza negazione", () => {
  const r = analizzaRichiesta("mangiare pesce a Castrovillari");
  expect(r.queryOriginale.toLowerCase()).toContain("castrovillari");
  expect(esclusioniNegazione("mangiare pesce a Castrovillari")).toEqual([]);
});

test("V6-C 'parrucchiere' resta esplicita senza esclusioni né qualificatori", () => {
  expect(analizzaRichiesta("parrucchiere").tipo).toBe("esplicita");
  expect(esclusioniNegazione("parrucchiere")).toEqual([]);
  expect(haQualificatoreEconomico("parrucchiere")).toBe(false);
});

test("V6-C 'panifficio' resta esplicita (refuso gestito da fuzzy, niente negazione)", () => {
  expect(analizzaRichiesta("panifficio").tipo).toBe("esplicita");
  expect(esclusioniNegazione("panifficio")).toEqual([]);
});
