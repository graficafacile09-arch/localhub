import { expect, test } from "@playwright/test";

// ─── V7: LEAK TASSONOMICO "BENESSERE" ───────────────────────────────────────
//
// Il lemma generico "benessere" era condiviso tra il gruppo sinonimi `salute`
// e il gruppo `beauty` (e "salute" era il ponte analogo per "farmacia" verso
// la categoria generica "Salute e benessere"). Un negozio medico con categoria
// "Salute e benessere" (Dott. Bianchi Otorino) veniva così intercettato sia
// da "farmacia" sia da "tagliarmi i capelli" (falsi positivi).
//
// Il fix V7 è TASSONOMICO: i lemmi-ponte non fanno più parte dell'espansione
// AUTOMATICA dei sinonimi, ma restano sempre validi come termini ORIGINALI
// della query ("benessere"/"salute" espliciti continuano a cercare).
//
// Questi test sono DETERMINISTICI e senza DB: verificano espansioni e ranking
// (calcolaPunteggioNegozioConEspansione / filtraNegoziPerPertinenza) sugli
// stessi dati sintetici che replicano il dataset reale (9 negozi, unico
// profilo medico = Dott. Bianchi Otorino, nessuna farmacia reale).

import {
  espandiQueryConSinonimi,
  espandiQueryConSinonimiBase,
} from "../lib/ricerca-semantica";
import {
  concettiIntento,
  esclusioniNegazione,
} from "../lib/ricerca-intento";
import {
  calcolaPunteggioNegozioConEspansione,
  filtraNegoziPerPertinenzaConEspansione,
  terminiOriginali,
} from "../lib/ranking-negozi";
import { patternIlikeTolleranti } from "../lib/search-tollerante";

// ─── Helper ──────────────────────────────────────────────────────────────────

const token = (s: string) => s.split(/\s+/).filter(Boolean);

// Replica esatta del percorso di cercaNegozi (lib/negozi.ts):
//   espansa = `${concettiIntento(ricerca)} ${espandiQueryConSinonimi(ricerca)}`
function espansioneNegozi(query: string): string[] {
  return token(`${concettiIntento(query)} ${espandiQueryConSinonimi(query)}`);
}

type N = Record<string, unknown> & {
  id: string;
  nome?: string | null;
  categoria?: string | null;
  citta?: string | null;
  descrizione?: string | null;
  data?: Record<string, unknown> | null;
};

const n = (id: string, partial: Partial<N> = {}): N => ({
  id,
  nome: null,
  categoria: null,
  citta: null,
  descrizione: null,
  data: null,
  ...partial,
});

// Repliche del dataset reale (stesso profilo/categoria del DB di produzione).
const medico = n("med", {
  nome: "Dott. Bianchi Otorino",
  categoria: "Salute e benessere",
  citta: "Castrovillari",
  data: { tipo_attivita: "medico" },
});
const farmaciaReale = n("far", {
  nome: "Farmacia Centrale",
  categoria: "Farmacia",
  citta: "Castrovillari",
});
const hairDudu = n("hd", { nome: "Hair Dudu", categoria: "Parrucchiere", citta: "Castrovillari" });
const ladyBeauty = n("lb", {
  nome: "Lady beauty",
  categoria: "Estetica",
  citta: "Castrovillari",
  data: { tipo_attivita: "beauty" },
});
const baroneGioielli = n("bg", { nome: "Barone Gioielli", categoria: "Gioielleria", citta: "Castrovillari" });

// ─── A) farmacia ─────────────────────────────────────────────────────────────

test("A1 espansione 'farmacia': i ponti generici salute/benessere NON entrano", () => {
  const esp = espandiQueryConSinonimi("farmacia");
  // I termini specifici di farmacia/parafarmacia restano.
  expect(esp).toContain("farmacia");
  expect(esp).toContain("parafarmacia");
  expect(esp).toContain("medicinali");
  // Nessun ponte generico: una categoria "Salute e benessere" non deve bastare.
  expect(esp).not.toContain("benessere");
  expect(esp).not.toContain("salute");
});

test("A2 'farmacia' NON promuove un medico/otorino; conserva la farmacia reale", () => {
  const originali = terminiOriginali("farmacia");
  const espansi = espansioneNegozi("farmacia");
  // Il medico con categoria generica "Salute e benessere" non matchanu alcun termine → 0.
  expect(calcolaPunteggioNegozioConEspansione(medico, originali, espansi)).toBe(0);
  // La farmacia reale (nome/categoria "Farmacia") matchanu il termine originale → passa.
  expect(calcolaPunteggioNegozioConEspansione(farmaciaReale, originali, espansi)).toBeGreaterThan(0);
  const filtrati = filtraNegoziPerPertinenzaConEspansione(
    [medico, farmaciaReale],
    originali,
    espansi
  );
  expect(filtrati.map((s) => s.id)).toEqual(["far"]);
});

// ─── B) parrucchiere ─────────────────────────────────────────────────────────

test("B1 espansione 'parrucchiere': domini beauty intatti, nessun ponte", () => {
  const esp = espandiQueryConSinonimi("parrucchiere");
  expect(esp).toContain("parrucchiere");
  expect(esp).toContain("estetica");
  expect(esp).not.toContain("benessere");
});

test("B2 'parrucchiere': Hair Dudu e Lady beauty restano, il medico sparisce", () => {
  const originali = terminiOriginali("parrucchiere");
  const espansi = espansioneNegozi("parrucchiere");
  expect(calcolaPunteggioNegozioConEspansione(hairDudu, originali, espansi)).toBeGreaterThan(0);
  expect(calcolaPunteggioNegozioConEspansione(ladyBeauty, originali, espansi)).toBeGreaterThan(0);
  expect(calcolaPunteggioNegozioConEspansione(medico, originali, espansi)).toBe(0);
});

test("B3 prodotti 'parrucchiere': il sinonimo espanso 'taglio' resta (guardia V3 attiva), niente ponte", () => {
  const esp = espandiQueryConSinonimiBase("parrucchiere");
  // "taglio" resta nell'espansione prodotto: è prodottoRilevante() a escludere
  // la "Pizza Margherita al Taglio" (il sinonimo espanso vale solo nei campi
  // strutturati, mai nel nome libero). Il fix V7 non indebolisce quella guardia.
  expect(esp).toContain("taglio");
  expect(esp).not.toContain("benessere");
});

// ─── C) tagliarmi i capelli ──────────────────────────────────────────────────

test("C1 espansione 'tagliarmi i capelli': nessun ponte 'benessere'", () => {
  const esp = espandiQueryConSinonimi("tagliarmi i capelli");
  expect(esp).toContain("capelli");
  expect(esp).toContain("parrucchiere");
  expect(esp).not.toContain("benessere");
});

test("C2 'tagliarmi i capelli': beauty/parrucchiere presenti, Dott. Bianchi escluso", () => {
  const originali = terminiOriginali("tagliarmi i capelli");
  const espansi = espansioneNegozi("tagliarmi i capelli");
  expect(calcolaPunteggioNegozioConEspansione(ladyBeauty, originali, espansi)).toBeGreaterThan(0);
  expect(calcolaPunteggioNegozioConEspansione(hairDudu, originali, espansi)).toBeGreaterThan(0);
  expect(calcolaPunteggioNegozioConEspansione(medico, originali, espansi)).toBe(0);
});

// ─── D/E) percorso medico (NON rotto) ────────────────────────────────────────

test("D 'medico cardiologo': il profilo medico mantiene il vocabolario sanitario", () => {
  const esp = espandiQueryConSinonimi("medico cardiologo");
  expect(esp).toContain("medico");
  expect(esp).toContain("cardiologo");
  // "salute" resta nel PROFILO medico (dominio professionale sanitario): è
  // solo l'espansione COMMERCIO (gruppo farmacia) a non usarlo più come ponte.
  expect(esp).toContain("salute");
});

test("D2 'medico cardiologo': il profilo medico pertinente passa il ranking", () => {
  const originali = terminiOriginali("medico cardiologo");
  const espansi = espansioneNegozi("medico cardiologo");
  expect(calcolaPunteggioNegozioConEspansione(medico, originali, espansi)).toBeGreaterThan(0);
  const filtrati = filtraNegoziPerPertinenzaConEspansione([medico], originali, espansi);
  expect(filtrati.length).toBeGreaterThan(0);
});

test("E 'medico per il cuore': percorso cuore/cardiologia intatto", () => {
  const originali = terminiOriginali("medico per il cuore");
  const espansi = espansioneNegozi("medico per il cuore");
  expect(espansi).toContain("cardiologo");
  expect(espansi).toContain("cuore");
  expect(calcolaPunteggioNegozioConEspansione(medico, originali, espansi)).toBeGreaterThan(0);
  const filtrati = filtraNegoziPerPertinenzaConEspansione([medico], originali, espansi);
  expect(filtrati.length).toBeGreaterThan(0);
});

// ─── F) regalo non alimentare ────────────────────────────────────────────────

test("F 'regalo non alimentare': Barone Gioielli resta (negazione + intento intatti)", () => {
  // Vincolo negativo identico (il termine testa "alimentare").
  expect(esclusioniNegazione("regalo non alimentare")).toEqual(["alimentare"]);
  // L'espansione usata per escludere i food (gruppo alimentari) resta invariata.
  const espNegato = espandiQueryConSinonimi("alimentare");
  expect(espNegato).toContain("alimentari");
  expect(espNegato).toContain("panificio");
  // La gioielleria matchanu l'intento regalo (concetto gioielleria) e non viene toccata dal fix.
  const originali = terminiOriginali("regalo non alimentare");
  const espansi = espansioneNegozi("regalo non alimentare");
  expect(espansi).toContain("gioielleria");
  expect(calcolaPunteggioNegozioConEspansione(baroneGioielli, originali, espansi)).toBeGreaterThan(0);
});

// ─── G) regressioni V3/V4 ────────────────────────────────────────────────────

test("G1 V3: 'panifficio' resta coperto dai pattern fuzzy (rimozione carattere)", () => {
  expect(patternIlikeTolleranti("panifficio")).toContain("%panificio%");
});

test("G2 'pizza': espansione prodotti invariata (termine originale presente)", () => {
  expect(espandiQueryConSinonimiBase("pizza")).toContain("pizza");
});

test("G3 'prodotti tipici': concetti intento invariati", () => {
  expect(concettiIntento("prodotti tipici")).toMatch(/artigianato|tipico/);
});

test("G4 'mangiare pesce a Castrovillari': località e attività restano integre", () => {
  const esp = espandiQueryConSinonimi("mangiare pesce a Castrovillari");
  expect(esp).toContain("mangiare");
  expect(esp).toContain("castrovillari");
});

test("G5 'benessere'/'salute' espliciti restano disponibili come termini originali", () => {
  // Il fix rimuove i ponti SOLO dall'espansione automatica: una query esplicita
  // "benessere"/"salute" continua a cercare il termine (mai query vuota).
  expect(espandiQueryConSinonimi("benessere")).toContain("benessere");
  expect(espandiQueryConSinonimiBase("benessere")).toContain("benessere");
  expect(espandiQueryConSinonimi("salute")).toContain("salute");
  expect(espandiQueryConSinonimiBase("salute")).toContain("salute");
});
