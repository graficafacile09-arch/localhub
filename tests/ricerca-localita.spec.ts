import { expect, test } from "@playwright/test";

// ─── V8: VINCOLO LOCALITÀ ───────────────────────────────────────────────────
// La città nella query deve diventare un VINCOLO reale (p_citta della RPC) e
// NON una keyword. Questi test DETERMINISTICI coprono:
//   1. estraiCitta(): riconosce solo località note del lessico (mai una parola
//      geografica qualsiasi);
//   2. il token città viene rimosso dal ranking, così un negozio che ha la
//      città nel nome non domina una query di intento (es. "pizza a
//      Castrovillari") a scapito dell'attività realmente pertinente.

import { estraiCitta } from "../lib/localita";
import { calcolaPunteggioNegozioConEspansione } from "../lib/ranking-negozi";

// ─── 1. Riconoscimento località ──────────────────────────────────────────────

test("estraiCitta riconosce una località nota presente nel testo", () => {
  expect(estraiCitta("negozio a Cosenza")).toBe("cosenza");
  expect(estraiCitta("pizza a Castrovillari")).toBe("castrovillari");
  expect(estraiCitta("Castrovillari")).toBe("castrovillari");
  expect(estraiCitta("qualcosa a Castrovillari")).toBe("castrovillari");
  expect(estraiCitta("PIZZA A COSENZA")).toBe("cosenza"); // case/accenti
});

test("estraiCitta NON riconosce località assenti dal lessico (nessun filtro improvvisato)", () => {
  expect(estraiCitta("pizza")).toBeNull();
  expect(estraiCitta("parrucchiere")).toBeNull();
  expect(estraiCitta("ho fame")).toBeNull();
  expect(estraiCitta("prodotti tipici")).toBeNull();
  expect(estraiCitta("mangiare pesce")).toBeNull();
  // "Roma" non è nel lessico → nessun vincolo (non trasformiamo ogni parola
  // geografica in un filtro se non è realmente riconosciuta come località).
  expect(estraiCitta("negozio a Roma")).toBeNull();
  // "acri" è una parola comune italiana (amare) → NON deve diventare il comune Acri.
  expect(estraiCitta("olive acri")).toBeNull();
});

// ─── 2. Ranking senza il token città ─────────────────────────────────────────

test("ranking 'pizza a Castrovillari': con il token città rimosso, la rilevanza pizza vince sul negozio che ha la città nel nome", () => {
  const panificioPizza = {
    id: "pz",
    citta: null,
    data: null,
    nome: "Panificio Rossi",
    categoria: "Panificio",
    descrizione: "Pane, pizza e prodotti da forno",
    parole_chiave: ["pane", "pizza", "focaccia", "forno"],
  };
  const saporiSoloNome = {
    id: "sa",
    citta: "Castrovillari",
    data: null,
    nome: "Sapori di Castrovillari – DEMO",
    categoria: "Panificio",
    descrizione: "Prodotti tradizionali di Castrovillari",
    parole_chiave: ["dolci tipici", "ciotaredda"],
  };

  // Sia originali che espansi sono SOLO i termini di intento ("castrovillari"
  // rimosso dal ranking dal motore V8): un match sul nome non basta più.
  const originali = ["pizza"];
  const espansi = ["pizza"];
  expect(
    calcolaPunteggioNegozioConEspansione(panificioPizza, originali, espansi)
  ).toBeGreaterThan(
    calcolaPunteggioNegozioConEspansione(saporiSoloNome, originali, espansi)
  );
});

test("ranking: il token città PRESENTE nei termini gonfia il negozio che lo ha nel nome (motivo della rimozione)", () => {
  const saporiSoloNome = {
    id: "sa",
    citta: "Castrovillari",
    data: null,
    nome: "Sapori di Castrovillari – DEMO",
    categoria: "Panificio",
    descrizione: "Prodotti tradizionali di Castrovillari",
    parole_chiave: ["dolci tipici", "ciotaredda"],
  };
  // Con "castrovillari" ancora tra i termini, "Sapori di Castrovillari" guadagna
  // punti dal nome: è esattamente il doppio-peso che il motore V8 elimina.
  const senzaCitta = calcolaPunteggioNegozioConEspansione(saporiSoloNome, ["pizza"], ["pizza"]);
  const conCitta = calcolaPunteggioNegozioConEspansione(
    saporiSoloNome,
    ["pizza", "castrovillari"],
    ["pizza", "castrovillari"]
  );
  expect(conCitta).toBeGreaterThan(senzaCitta);
});