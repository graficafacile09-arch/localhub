/**
 * GESTIONE ORARI UNIVERSALE — TEST COMPORTAMENTALI.
 *
 * Test PURI (senza browser, via @playwright/test) della normalizzazione
 * delle fasce orarie (`normalizzaGiorno`/`normalizzaOrari`) e dei preset
 * automatici per profilo (`orariIniziali`). Verificano che il JSONB finale
 * sia sempre coerente: massimo 2 fasce, mai sovrapposte, mai duplicati,
 * mai intervalli impossibili.
 */
import { test, expect } from "@playwright/test";
import type { DaySchedule, Orari } from "@/types/negozio";
import {
  normalizzaGiorno,
  normalizzaOrari,
  orariIniziali,
  getPresetPerProfilo,
  ORARI_PRESETS,
  DEFAULT_HOURS,
  CLOSED_DAY,
  copiaSettimanaDalLunedi,
} from "@/lib/orari";
import { DAYS } from "@/types/negozio";

// ── helper ───────────────────────────────────────────────────────────────
function day(partial: Partial<DaySchedule> = {}): DaySchedule {
  return {
    chiuso: false,
    apertura1: "09:00",
    chiusura1: "13:00",
    apertura2: "15:00",
    chiusura2: "19:00",
    ...partial,
  };
}

const apertura = (s: DaySchedule) => [
  [s.apertura1, s.chiusura1],
  [s.apertura2, s.chiusura2],
];

test.describe("normalizzaGiorno — regole fascia singola", () => {
  test("giorno chiuso → CLOSED_DAY (fasce vuote)", () => {
    const r = normalizzaGiorno({ ...CLOSED_DAY, apertura1: "09:00", chiusura1: "20:00" });
    expect(r.chiuso).toBe(true);
    expect(r.apertura1).toBe("");
    expect(r.chiusura1).toBe("");
    expect(r.apertura2).toBe("");
    expect(r.chiusura2).toBe("");
  });

  test("una fascia → resta una sola, la seconda vuota", () => {
    const r = normalizzaGiorno(day({ chiusura2: "", apertura2: "" }));
    expect(r.apertura1).toBe("09:00");
    expect(r.chiusura1).toBe("13:00");
    expect(r.apertura2).toBe("");
    expect(r.chiusura2).toBe("");
  });

  test("fascia incompleta (solo apertura o solo chiusura) → scartata", () => {
    const r = normalizzaGiorno(
      day({ apertura1: "09:00", chiusura1: "13:00", apertura2: "15:00", chiusura2: "" })
    );
    // la seconda coppia è incompleta → resta solo la prima
    expect(r.apertura2).toBe("");
    expect(r.chiusura2).toBe("");
    expect(r.apertura1).toBe("09:00");
  });

  test("intervallo impossibile (apertura >= chiusura) → scartato", () => {
    const r = normalizzaGiorno(
      day({ apertura1: "13:00", chiusura1: "09:00", apertura2: "", chiusura2: "" })
    );
    expect(r.apertura1).toBe("");
    expect(r.chiusura1).toBe("");
  });

  test("giorno aperto senza fasce valide → aperto con fasce vuote (coerente con slot-generator)", () => {
    const r = normalizzaGiorno({ chiuso: false, apertura1: "", chiusura1: "", apertura2: "", chiusura2: "" });
    expect(r.chiuso).toBe(false);
    expect(r.apertura1).toBe("");
  });
});

test.describe("normalizzaGiorno — due fasce", () => {
  test("due fasce normali separate → entrambe conservate (con gap reale)", () => {
    const r = normalizzaGiorno(day());
    expect(apertura(r)).toEqual([
      ["09:00", "13:00"],
      ["15:00", "19:00"],
    ]);
  });

  test("fasce identiche → unificate in una sola", () => {
    const r = normalizzaGiorno(day({ apertura2: "09:00", chiusura2: "13:00" }));
    expect(r.apertura1).toBe("09:00");
    expect(r.chiusura1).toBe("13:00");
    expect(r.apertura2).toBe("");
    expect(r.chiusura2).toBe("");
  });

  test("fascia contenuta (09–20 + 15–19) → prevale la più ampia, niente duplicati", () => {
    const r = normalizzaGiorno(day({ chiusura1: "20:00", apertura2: "15:00", chiusura2: "19:00" }));
    expect(r.apertura1).toBe("09:00");
    expect(r.chiusura1).toBe("20:00");
    expect(r.apertura2).toBe("");
    expect(r.chiusura2).toBe("");
  });

  test("fascia contenuta (09–13 + 11–12) → scartata la interna", () => {
    const r = normalizzaGiorno(day({ apertura2: "11:00", chiusura2: "12:00" }));
    expect(r.apertura1).toBe("09:00");
    expect(r.chiusura1).toBe("13:00");
    expect(r.apertura2).toBe("");
  });

  test("fasce sovrapposte (09–20 + 18–22) → fuse in una fascia coerente", () => {
    const r = normalizzaGiorno(day({ chiusura1: "20:00", apertura2: "18:00", chiusura2: "22:00" }));
    expect(r.apertura1).toBe("09:00");
    expect(r.chiusura1).toBe("22:00");
    expect(r.apertura2).toBe("");
    expect(r.chiusura2).toBe("");
  });

  test("fasce consecutive (09–13 + 13–17) → consecutive senza duplicati", () => {
    const r = normalizzaGiorno(day({ apertura2: "13:00", chiusura2: "17:00" }));
    // fuse in 09–17: nessun doppione, intervallo contiguo
    expect(r.apertura1).toBe("09:00");
    expect(r.chiusura1).toBe("17:00");
    expect(r.apertura2).toBe("");
  });
});

test.describe("normalizzaOrari — intero JSONB", () => {
  test("mantiene solo le chiavi presenti (non aggiunge giorni mancanti)", () => {
    const o: Orari = { lunedì: day() };
    const r = normalizzaOrari(o);
    expect(Object.keys(r)).toEqual(["lunedì"]);
    expect(r["lunedì"]?.apertura2).toBe("15:00");
  });

  test("non altera i dati già validi di tutti i giorni (idempotente)", () => {
    const once = normalizzaOrari(DEFAULT_HOURS);
    const twice = normalizzaOrari(once);
    expect(once["lunedì"]?.apertura1).toBe("09:00");
    expect(once["domenica"]?.chiuso).toBe(true);
    expect(twice).toEqual(once); // normalizzare due volte = stesso risultato
  });

  test("input null/undefined → oggetto vuoto (mai crash)", () => {
    expect(normalizzaOrari(null)).toEqual({});
    expect(normalizzaOrari(undefined)).toEqual({});
  });
});

test.describe("preset automatico nuovo negozio — profilo attività", () => {
  test("medico parte col preset commerciale a doppia fascia (lun–ven, sab/dom chiusi)", () => {
    const o = orariIniziali(null, null, "medico");
    expect(o["lunedì"]?.apertura1).toBe("09:00");
    expect(o["lunedì"]?.chiusura1).toBe("13:00");
    expect(o["lunedì"]?.chiusura2).toBe("20:00"); // mattina+pomeriggio già compilati
    expect(o["sabato"]?.chiuso).toBe(true);
    expect(o["domenica"]?.chiuso).toBe(true);
  });

  test("estetista/parrucchiere (beauty) → stesso preset universalizzato del negozio (doppia fascia)", () => {
    const o = orariIniziali(null, null, "beauty");
    expect(o["lunedì"]?.apertura1).toBe("09:00");
    expect(o["lunedì"]?.chiusura1).toBe("13:00");
    expect(o["lunedì"]?.apertura2).toBe("16:00");
  });

  test("ristorante → preset ristorante", () => {
    const o = orariIniziali(null, null, "ristorante");
    expect(o["martedì"]?.apertura1).toBe("10:00");
    expect(o["lunedì"]?.chiuso).toBe(true);
  });

  test("negozio/e-commerce → negozio classico", () => {
    const o = orariIniziali(null, null, "ecommerce");
    expect(o["lunedì"]?.apertura1).toBe("09:00");
    expect(o["lunedì"]?.chiusura1).toBe("13:00");
  });

  test("agente immobiliare (immobiliare) → negozio classico", () => {
    const o = orariIniziali(null, null, "immobiliare");
    expect(o["lunedì"]?.apertura1).toBe("09:00");
  });

  test("architetto/ingegnere (professionista) → preset commerciale a doppia fascia", () => {
    const o = orariIniziali(null, null, "professionista");
    expect(o["lunedì"]?.chiusura1).toBe("13:00");
    expect(o["lunedì"]?.apertura2).toBe("16:00");
  });

  test("profilo sconosciuto → preset generale (DEFAULT_HOURS)", () => {
    const o = orariIniziali(null, null, "qualcosa-di-nuovo");
    expect(o["lunedì"]?.chiusura1).toBe("13:00");
    expect(o["domenica"]?.chiuso).toBe(true);
  });

  test("settimana sempre già compilata per ogni profilo (mai vuota)", () => {
    // Copre anche i profili cui l'utente allude colloquialmente:
    // estetista/parrucchiere→beauty, agente immobiliare→immobiliare,
    // architetto/ingegnere→professionista, negozio→ecommerce/alimentari.
    const profili = [
      "medico", "beauty", "ristorante", "ecommerce", "alimentari",
      "immobiliare", "professionista", "artigiano", "ricettivo", "altro",
    ];
    for (const p of profili) {
      const preset = getPresetPerProfilo(p);
      // profile sconosciuto → comunque preset generale DEFAULT_HOURS
      const o = orariIniziali(null, null, p);
      expect(preset ?? "generale").toBeDefined();
      // ogni profilo (o il default generale) produce una settimana popolata
      expect(DAYS.some((d) => !o[d]?.chiuso && o[d]?.apertura1)).toBe(true);
    }
  });

  test("gli orari GIÀ salvati non vengono mai sovrascritti (priorità)", () => {
    const salvati: Orari = {
      lunedì: { chiuso: false, apertura1: "07:00", chiusura1: "11:00", apertura2: "", chiusura2: "" },
    };
    const o = orariIniziali(salvati, null, "medico");
    expect(o["lunedì"]?.apertura1).toBe("07:00");
  });

  test("preset esplicito dell'utente → sostituisce la griglia", () => {
    const o = orariIniziali(null, "chiuso", "medico");
    expect(o["lunedì"]?.chiuso).toBe(true);
  });

  test("i preset sono settimane complete (chiavi = 7 giorni)", () => {
    for (const preset of Object.values(ORARI_PRESETS)) {
      expect(DAYS.every((d) => preset[d] && typeof preset[d].chiuso === "boolean")).toBe(true);
    }
  });
});

test.describe("modifica singolo giorno e copia dal lunedì", () => {
  test("la modifica di un singolo giorno non tocca gli altri (e la normalizzazione è per-giorno)", () => {
    const base = normalizzaOrari(DEFAULT_HOURS);
    // l'utente cambia SOLO il sabato → gli altri giorni restano identici
    const sabatoModificato = normalizzaGiorno({
      ...base["sabato"],
      apertura1: "08:00",
      chiusura1: "12:00",
      apertura2: "",
      chiusura2: "",
    });
    const result: Orari = { ...base, sabato: sabatoModificato };
    expect(result["lunedì"]).toEqual(normalizzaOrari(DEFAULT_HOURS)["lunedì"]);
    expect(result["sabato"]?.apertura1).toBe("08:00");
  });

  test("‘Copia dal lunedì’ replica su tutta la settimana (identico per ogni profilo)", () => {
    const lunedi: DaySchedule = {
      chiuso: false,
      apertura1: "08:30",
      chiusura1: "12:30",
      apertura2: "15:30",
      chiusura2: "19:30",
    };
    const settimana = copiaSettimanaDalLunedi({
      lunedì: lunedi,
      martedì: { chiuso: true, apertura1: "", chiusura1: "", apertura2: "", chiusura2: "" },
      domenica: { chiuso: true, apertura1: "", chiusura1: "", apertura2: "", chiusura2: "" },
    } as Orari);
    for (const d of DAYS) {
      expect(settimana[d]).toEqual(lunedi);
    }
    // il risultato è sempre coerente (normalizzabile senza sorprese)
    const normalizzata = normalizzaOrari(settimana);
    expect(normalizzata["domenica"]?.apertura1).toBe("08:30");
    expect(normalizzata["lunedì"]?.apertura2).toBe("15:30");
  });
});