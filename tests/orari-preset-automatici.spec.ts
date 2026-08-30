/**
 * PRESET AUTOMATICI ORARI — test dell'AUTOCOMPLETAMENTO settimanale.
 *
 * Garantisce che un nuovo negozio/attività parta con la settimana GIÀ
 * COMPILATA (comprese ENTRAMBE le fasce mattina+pomeriggio dove il preset
 * prevede apertura spezzata), così il titolare deve solo correggere le
 * eccezioni. NON deve esistere un default "09:00–18:00 singola fascia"
 * quando il preset richiede doppia fascia.
 */
import { test, expect } from "@playwright/test";
import { DAYS } from "@/types/negozio";
import type { DaySchedule, Orari } from "@/types/negozio";
import {
  ORARI_PRESETS,
  getOrariPreset,
  orariIniziali,
  orariPerProfilo,
  PRESET_ORARI_PER_PROFILO,
  getPresetPerProfilo,
  normalizzaOrari,
  normalizzaGiorno,
  suggerisciSecondaFascia,
  copiaSettimanaDalLunedi,
  DEFAULT_HOURS,
} from "@/lib/orari";

const aperteDi = (o: Orari) => DAYS.filter((d) => !o[d]?.chiuso);
const haDoppia = (s: DaySchedule) => !!(s.apertura2 && s.chiusura2);

test.describe("preset — struttura completa della settimana", () => {
  test("ogni preset è una settimana completa di 7 giorni", () => {
    for (const preset of Object.values(ORARI_PRESETS)) {
      expect(DAYS.length).toBe(7);
      for (const d of DAYS) {
        expect(preset[d]).toBeDefined();
        expect(typeof preset[d]?.chiuso).toBe("boolean");
        expect(typeof preset[d]?.apertura1).toBe("string");
        expect(typeof preset[d]?.chiusura1).toBe("string");
      }
    }
  });

  test("negozio-classico → lun–ven 09–13 + 16–20, sab/dom chiusi", () => {
    const p = getOrariPreset("negozio-classico")!;
    for (const d of ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì"]) {
      const s = p[d]!;
      expect(s.chiuso).toBe(false);
      expect(s.apertura1).toBe("09:00");
      expect(s.chiusura1).toBe("13:00");
      // ENTRAMBE le fasce precompilate automaticamente
      expect(haDoppia(s)).toBe(true);
      expect(s.apertura2).toBe("16:00");
      expect(s.chiusura2).toBe("20:00");
    }
    expect(p["sabato"]!.chiuso).toBe(true);
    expect(p["domenica"]!.chiuso).toBe(true);
  });

  test("bar → lun–sab 07:30–13:00 + 15:30–20:00 (doppia fascia automatica)", () => {
    const p = getOrariPreset("bar")!;
    for (const d of aperteDi(p)) {
      expect(haDoppia(p[d]!)).toBe(true);
      expect(p[d]!.apertura1).toBe("07:30");
      expect(p[d]!.chiusura1).toBe("13:00");
      expect(p[d]!.apertura2).toBe("15:30");
      expect(p[d]!.chiusura2).toBe("20:00");
    }
    expect(p["domenica"]!.chiuso).toBe(true);
  });

  test("ristorante → mar–dom 10–14:30 + 18–23 (doppia fascia automatica), lun chiuso", () => {
    const p = getOrariPreset("ristorante")!;
    for (const d of aperteDi(p)) {
      expect(haDoppia(p[d]!)).toBe(true);
      expect(p[d]!.apertura1).toBe("10:00");
      expect(p[d]!.chiusura1).toBe("14:30");
      expect(p[d]!.apertura2).toBe("18:00");
      expect(p[d]!.chiusura2).toBe("23:00");
    }
    expect(p["lunedì"]!.chiuso).toBe(true);
  });

  test("apertura-continuata → lun–sab 09–20 a fascia UNICA (continua, niente pausa)", () => {
    const p = getOrariPreset("apertura-continuata")!;
    for (const d of aperteDi(p)) {
      expect(p[d]!.apertura1).toBe("09:00");
      expect(p[d]!.chiusura1).toBe("20:00");
      // continuità: nessuna seconda fascia → nessun rischio di sovrapposizione
      expect(haDoppia(p[d]!)).toBe(false);
    }
    expect(p["domenica"]!.chiuso).toBe(true);
  });

  test("default generale DEFAULT_HOURS → 09–13 + 15–19 per tutta la settimana (doppia fascia)", () => {
    for (const d of aperteDi(DEFAULT_HOURS)) {
      expect(haDoppia(DEFAULT_HOURS[d]!)).toBe(true);
      expect(DEFAULT_HOURS[d]!.apertura1).toBe("09:00");
      expect(DEFAULT_HOURS[d]!.chiusura1).toBe("13:00");
      expect(DEFAULT_HOURS[d]!.apertura2).toBe("15:00");
      expect(DEFAULT_HOURS[d]!.chiusura2).toBe("19:00");
    }
    expect(DEFAULT_HOURS["domenica"]!.chiuso).toBe(true);
  });

  test("RILEVANTE: non esiste nessun default unico 09:00–18:00 in tutta la settimana", () => {
    // Ogni preset aperto deve avere o una fascia più ampia (09–20/23) o DUE fasce.
    const tutti: Orari[] = [...Object.values(ORARI_PRESETS), DEFAULT_HOURS];
    for (const o of tutti) {
      for (const d of DAYS) {
        const s = o[d]!;
        if (s.chiuso) continue;
        const single = s.apertura1 === "09:00" && s.chiusura1 === "18:00" && !haDoppia(s);
        expect(single, `default 09:00–18:00 singola non consentito per ${d}`).toBe(false);
      }
    }
  });
});

test.describe("preset per profilo → settimana già compilata", () => {
  test("ogni profilo mappato parte con una settimana completa (nessun giorno vuoto)", () => {
    const profili = Object.keys(PRESET_ORARI_PER_PROFILO);
    expect(profili.length).toBeGreaterThan(0);
    for (const p of profili) {
      const o = orariIniziali(null, null, p);
      // ogni giorno o è chiuso o ha almeno la prima fascia compilata
      for (const d of DAYS) {
        const s = o[d];
        if (s?.chiuso) continue;
        expect(s?.apertura1, `${p}/${d} prima fascia`).toBeTruthy();
        expect(s?.chiusura1, `${p}/${d} prima chiusura`).toBeTruthy();
      }
      // almeno un giorno aperto (mai una settimana tutta chiusa per questi profili)
      expect(aperteDi(o).length).toBeGreaterThan(0);
    }
  });

  test("medico/estetista/parrucchiere/professionista/ricettivo → preset commerciale con ENTRAMBE le fasce precompilate (lun–ven, sab/dom chiusi)", () => {
    for (const p of ["medico", "beauty", "professionista", "ricettivo"]) {
      const o = orariIniziali(null, null, p);
      for (const d of aperteDi(o)) {
        expect(haDoppia(o[d]!), `${p}/${d} doppia fascia`).toBe(true);
        expect(o[d]!.apertura1).toBe("09:00");
        expect(o[d]!.chiusura1).toBe("13:00");
        expect(o[d]!.apertura2).toBe("16:00");
        expect(o[d]!.chiusura2).toBe("20:00");
      }
      expect(o["sabato"]!.chiuso).toBe(true);
      expect(o["domenica"]!.chiuso).toBe(true);
    }
  });

  test("negozio/alimentari/immobiliare/artigiano → preset negozio-classico con ENTRAMBE le fasce precompilate", () => {
    for (const p of ["ecommerce", "alimentari", "immobiliare", "artigiano"]) {
      const o = orariIniziali(null, null, p);
      for (const d of aperteDi(o)) {
        expect(haDoppia(o[d]!), `${p}/${d} doppia fascia`).toBe(true);
        expect(o[d]!.apertura2).toBe("16:00");
        expect(o[d]!.chiusura2).toBe("20:00");
      }
    }
  });

  test("ristorante → preset ristorante con doppia fascia su mar–dom", () => {
    const o = orariIniziali(null, null, "ristorante");
    for (const d of aperteDi(o)) {
      expect(haDoppia(o[d]!)).toBe(true);
    }
    expect(o["lunedì"]!.chiuso).toBe(true);
  });

  test("profilo sconosciuto → default generale 09–13 + 15–19 (doppia fascia, NON 09–18)", () => {
    const o = orariIniziali(null, null, "attivita-mista-sconosciuta");
    for (const d of aperteDi(o)) {
      expect(haDoppia(o[d]!)).toBe(true);
      expect(o[d]!.apertura1).toBe("09:00");
      expect(o[d]!.chiusura1).toBe("13:00");
      expect(o[d]!.apertura2).toBe("15:00");
      expect(o[d]!.chiusura2).toBe("19:00");
    }
  });

  test("orariPerProfilo (usata dal wizard) restituisce la stessa settimana completa", () => {
    for (const p of ["medico", "ecommerce", "ristorante", "altro"]) {
      const a = orariPerProfilo(null, p);
      const b = orariIniziali(null, null, p);
      expect(a).toEqual(b);
      expect(aperteDi(a).length).toBeGreaterThan(0);
    }
  });

  test("la settimana del profilo è semanticamente stabile dopo la normalizzazione (0 perdite)", () => {
    for (const p of Object.keys(PRESET_ORARI_PER_PROFILO)) {
      const o = orariIniziali(null, null, p);
      const n = normalizzaOrari(o);
      // niente finestre ridotte/eliminate per errori: la struttura resta
      for (const d of DAYS) {
        expect(n[d]?.chiuso).toBe(o[d]!.chiuso);
        expect(n[d]?.apertura1).toBe(o[d]!.apertura1);
        expect(n[d]?.chiusura1).toBe(o[d]!.chiusura1);
      }
    }
  });
});

test.describe("eccezioni del titolare (post-preset)", () => {
  test("la normalizzazione mantiene la doppia fascia valida (no merge ingiustificato)", () => {
    const lunedi = ORARI_PRESETS["negozio-classico"]["lunedì"];
    const n = normalizzaGiorno(lunedi);
    expect(n.apertura1).toBe("09:00");
    expect(n.chiusura1).toBe("13:00");
    expect(n.apertura2).toBe("16:00");
    expect(n.chiusura2).toBe("20:00");
  });

  test("giornata continuata → il pulsante seconda fascia propone una fascia NON sovrapposta", () => {
    const continua: DaySchedule = {
      chiuso: false,
      apertura1: "09:00",
      chiusura1: "20:00",
      apertura2: "",
      chiusura2: "",
    };
    const sugg = suggerisciSecondaFascia(continua);
    // parte ESATTAMENTE alla chiusura della prima (>= chiusura1) → mai sovrapposta
    expect(sugg.apertura2).toBe("20:00");
    const s = { ...continua, ...sugg };
    const n = normalizzaGiorno(s);
    // fasce adiacenti → fuse in una fascia contigua 09:00–23:00: coerente,
    // NESSUNA seconda fascia sovrapposta, nessun duplicato di inizio
    expect(n.apertura1).toBe("09:00");
    expect(n.chiusura1).toBe("23:00");
    expect(n.apertura2).toBe("");
  });

  test("'Copia dal lunedì' resta disponibile e replica l'intera settimana", () => {
    const lun = ORARI_PRESETS["negozio-classico"]["lunedì"];
    const copiato = copiaSettimanaDalLunedi(ORARI_PRESETS["negozio-classico"]);
    for (const d of DAYS) expect(copiato[d]).toEqual(lun);
  });

  test("i preset aperto+spezzato non generano mai fasce sovrapposte dopo la normalizzazione", () => {
    const presets = Object.values(ORARI_PRESETS);
    for (const p of presets) {
      const n = normalizzaOrari(p);
      for (const d of DAYS) {
        const s = n[d]!;
        if (s.chiuso) continue;
        // le due fasce (se esistono) non devono sovrapporsi
        if (haDoppia(s)) {
          expect(s.apertura2 >= s.chiusura1, `${d} seconda dopo chiusura prima`).toBe(true);
        }
      }
    }
  });
});