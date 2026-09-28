import { expect, test } from "@playwright/test";

import {
  isLocalAssistantQuery,
  normalizzaRichiesta,
  pianoIntentoLocale,
} from "../lib/assistente/local-intents";

// ─── A. METEO ────────────────────────────────────────────────────────────────
// Regressione: "com'è il tempo" (con l'accento) NON deve sfuggire al
// riconoscimento locale, altrimenti la richiesta finisce nel motore catalogo e
// Pino risponde con prodotti assurdi (es. "filetti di cipolla").

const RICHIESTE_METEO = [
  "com'è il tempo",
  "com’è il tempo", // apostrofo tipografico
  "COM'È IL TEMPO",
  "com'e il tempo",
  "come è il tempo",
  "che tempo fa",
  "che tempo fa?",
  "meteo",
  "piove?",
  "pioverà",
  "quanti gradi ci sono",
  "che temperatura c'è",
];

for (const q of RICHIESTE_METEO) {
  test(`A meteo: "${q}" → tool getWeather`, () => {
    expect(pianoIntentoLocale(q)).toEqual({ tool: "getWeather" });
    expect(isLocalAssistantQuery(q)).toBe(true);
  });
}

// ─── B. FARMACIE: stato realmente richiesto ──────────────────────────────────

test("B1 'farmacia aperta adesso' → solo farmacie realmente aperte", () => {
  expect(pianoIntentoLocale("farmacia aperta adesso")).toEqual({
    tool: "searchPharmacies",
    stato: "aperte",
  });
  expect(pianoIntentoLocale("quale farmacia è aperta")).toEqual({
    tool: "searchPharmacies",
    stato: "aperte",
  });
});

test("B2 'farmacia di turno' → solo farmacie con turno valorizzato", () => {
  expect(pianoIntentoLocale("farmacia di turno")).toEqual({
    tool: "searchPharmacies",
    stato: "turno",
  });
  expect(pianoIntentoLocale("quale farmacia è di turno")).toEqual({
    tool: "searchPharmacies",
    stato: "turno",
  });
});

test("B3 sintomi → farmacia di turno", () => {
  for (const q of ["ho la febbre", "ho mal di gola", "ho il raffreddore", "ho la tosse"]) {
    expect(pianoIntentoLocale(q)).toEqual({ tool: "searchPharmacies", stato: "turno" });
  }
});

// ─── C. NESSUNA REGRESSIONE SULLE RICERCHE COMMERCIALI ───────────────────────

test("C1 ricerche commerciali vere: MAI rubate al catalogo", () => {
  const commerciali = [
    "farmacia",
    "parafarmacia Castrovillari",
    "cerco una pizzeria",
    "occhiali da sole",
    "divano grigio per il salotto",
    "parrucchiere uomo Castrovillari",
    "cerco una TV",
  ];
  for (const q of commerciali) {
    expect(pianoIntentoLocale(q), `"${q}" non è un intento locale`).toBeNull();
    expect(isLocalAssistantQuery(q)).toBe(false);
  }
});

// ─── D. NORMALIZZAZIONE ──────────────────────────────────────────────────────

test("D1 normalizzaRichiesta uniforma accenti, apostrofi e spazi", () => {
  expect(normalizzaRichiesta("Com'È  il  Tempo")).toBe("com'e il tempo");
  expect(normalizzaRichiesta("com’è il tempo")).toBe("com'e il tempo");
  expect(normalizzaRichiesta("  Pioverà?  ")).toBe("piovera?");
});

test("D2 query vuota → nessun intento", () => {
  expect(pianoIntentoLocale("")).toBeNull();
  expect(pianoIntentoLocale("   ")).toBeNull();
});
