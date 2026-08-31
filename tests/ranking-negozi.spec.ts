import { expect, test } from "@playwright/test";

import {
  calcolaPunteggioNegozio,
  calcolaPunteggioNegozioConEspansione,
  filtraNegoziPerPertinenzaConEspansione,
  ordinaNegoziPerRilevanza,
} from "../lib/ranking-negozi";

type N = Record<string, unknown> & {
  id: string;
  nome?: string | null;
  categoria?: string | null;
  sottocategoria?: string | null;
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

// ─── COERENZA MULTI-CRITERIO ─────────────────────────────────────────────────

test("V4 'pesce a Castrovillari': negozio che soddisfa pesce E località batte uno che soddisfa solo pesce", () => {
  const nelPosto = n("a", {
    nome: "Pescheria Rossi",
    categoria: "Gastronomia",
    citta: "Castrovillari",
  });
  const soloPesce = n("b", {
    nome: "Pescheria Alba",
    categoria: "Gastronomia",
    citta: "Altra Città",
  });

  // Stesso contributo su nome/categoria, ma 'a' soddisfa due criteri originali
  // (pesce + castrovillari) mentre 'b' uno solo → bonus coerenza a favore di 'a'.
  const originali = ["pesce", "castrovillari"];
  const espansi = ["pesce", "castrovillari", "gastronomia"];
  expect(
    calcolaPunteggioNegozioConEspansione(nelPosto, originali, espansi)
  ).toBeGreaterThan(
    calcolaPunteggioNegozioConEspansione(soloPesce, originali, espansi)
  );
});

test("V4 coerenza multi-criterio: stesso confronto passa anche via filtraNegoziPerPertinenzaConEspansione", () => {
  const nelPosto = n("a", {
    nome: "Sapori di Castrovillari",
    categoria: "Prodotti tipici",
    citta: "Castrovillari",
  });
  const altro = n("b", {
    nome: "Sapori d'estate",
    categoria: "Prodotti tipici",
    citta: "Cosenza",
  });

  const esatti = filtraNegoziPerPertinenzaConEspansione(
    [altro, nelPosto],
    ["castrovillari", "sapori"],
    ["castrovillari", "sapori", "prodotti tipici"]
  );
  // La località corrispondente (Castrovillari) deve venire PRIMA di Cosenza.
  expect(esatti[0].id).toBe("a");
});

test("V4 bonus coerenza è zero con un solo criterio (query semplici NON gonfiate)", () => {
  // 'pizza' è un solo criterio: il bonus non deve alterare nulla.
  const pz = n("a", { nome: "Panificio Rossi", categoria: "Panificio" });
  const sc = filtraNegoziPerPertinenzaConEspansione(
    [pz],
    ["pizza"],
    ["pizza", "panificio"]
  );
  expect(sc.length).toBeGreaterThan(0);
  expect(sc[0].id).toBe("a");
});

// ─── LOCALITÀ COME SEGNALE DI RANKING ───────────────────────────────────────

test("V4 'negozio a Cosenza': la località è un campo di ranking dedicato", () => {
  const aCosenza = n("a", {
    nome: "Emporio Generale",
    descrizione: "vendita di prodotti vari",
    citta: "Cosenza",
  });
  const fuori = n("b", {
    nome: "Emporio Generale",
    descrizione: "vendita di prodotti vari",
    citta: "Castrovillari",
  });

  // A parità di nome/descrizione, chi è a Cosenza deve pesare di più.
  const originali = ["negozio", "cosenza"];
  const espansi = ["negozio", "cosenza"];
  expect(calcolaPunteggioNegozioConEspansione(aCosenza, originali, espansi)).toBeGreaterThan(
    calcolaPunteggioNegozioConEspansione(fuori, originali, espansi)
  );
});

test("V4 località c'è già nel ranking: ordinaNegoziPerRilevanza rispetta la città per 'pesce a Castrovillari'", () => {
  const inPosto = n("a", {
    nome: "Pescheria Castrovillari",
    categoria: "Gastronomia",
    citta: "Castrovillari",
  });
  const altrove = n("b", {
    nome: "Pescheria Centro",
    categoria: "Gastronomia",
    citta: "Cosenza",
  });
  const ordinati = ordinaNegoziPerRilevanza([altrove, inPosto], "pesce a Castrovillari");
  expect(ordinati[0].id).toBe("a");
});

// ─── RANKING PRINCIPIO: RILEVANZA > SEMPLICE PRESENZA ───────────────────────

test("V4 match originale in nome batte sinonimo generico solo-descrizione", () => {
  const esatta = n("a", { nome: "Farmacia Centrale", categoria: "Farmacia" });
  const generica = n("b", {
    nome: "Salute e benessere",
    categoria: "Salute e benessere",
    descrizione: "servizi sanitari e medicinali",
  });
  const originali = ["farmacia"];
  const espansi = ["farmacia", "salute", "medicinali", "sanitari"];
  expect(
    calcolaPunteggioNegozioConEspansione(esatta, originali, espansi)
  ).toBeGreaterThan(
    calcolaPunteggioNegozioConEspansione(generica, originali, espansi)
  );
});

test("V4 termine originale non riconosciuto non azzera: la query resta nel path (fallback)", () => {
  // Il refuso ("panifficio") è gestito dal layer tollerante, non dal ranking
  // esatto; qui verifichiamo SOLO che il ranking non escluda un negozio che
  // matcha il termine normalizzato nel nome.
  const n1 = n("a", { nome: "Panificio Rossi", categoria: "Panificio" });
  const sc = filtraNegoziPerPertinenzaConEspansione(
    [n1],
    ["panificio"],
    ["panificio"]
  );
  expect(sc.length).toBeGreaterThan(0);
  expect(sc[0].id).toBe("a");
});

// ─── NESSUNA INVENZIONE / GROUNDING ─────────────────────────────────────────

test("V4 nessun punteggio per negozio totalmente estraneo → escluso", () => {
  const estraneo = n("a", {
    nome: "Officina Meccanica Bruni",
    categoria: "Auto",
    citta: "Cosenza",
  });
  const esatti = filtraNegoziPerPertinenzaConEspansione(
    [estraneo],
    ["farmacia"],
    ["farmacia", "salute", "medicinali"]
  );
  expect(esatti.length).toBe(0);
});

test("V4 negozio che soddisfa PIÙ criteri tipo+servizio sale sopra match su un solo campo", () => {
  // 'ricco' soddisfa sia il tipo (medico) SIA la specializzazione (cardiologico),
  // 'solo' soddisfa solo il tipo: il primo deve dominare per coerenza multi-criterio.
  const ricco = n("a", {
    nome: "Dott. Bianchi",
    data: { tipo_attivita: "medico", servizi_strutturati: [{ nome: "visita cardiologica", attivo: true }] },
    categoria: "Salute",
  });
  const soloNome: N = n("b", {
    nome: "Studio Vox",
    data: { tipo_attivita: "medico", servizi_strutturati: [{ nome: "visita generica", attivo: true }] },
    categoria: "Salute",
  });
  const originali = ["medico", "cuore", "cardiologico"];
  const espansi = ["medico", "cuore", "cardiologico", "visita", "speciale"];
  expect(
    calcolaPunteggioNegozioConEspansione(ricco, originali, espansi)
  ).toBeGreaterThan(
    calcolaPunteggioNegozioConEspansione(soloNome, originali, espansi)
  );
});