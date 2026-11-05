import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { getFarmacieTurnoCastrovillari, inTurnoFarmacia, parseFarmacieTurno } from "../lib/farmacie-turno";
import { searchPharmacies } from "../lib/assistente/tools";

// ─── Farmacie di turno: il turno non deve dipendere dal markup del link ─────
//
// Regressione reale (produzione 5/11/2026): la fonte dichiarava la farmacia di
// turno con la sola etichetta `TURNO` (`class="btorario fb cturno"`), ma la
// riga "Turno*:" e l'apertura non venivano estratte in tutte le varianti di
// markup servite ai runtime serverless. Il risultato era `turno: null` per
// tutte le farmacie, e Pino rispondeva "nessuna farmacia di turno" anche con
// una farmacia di turno presente.

const box = (nome: string, extra: string) =>
  '<div itemscope itemtype="https://schema.org/Pharmacy" class="farmacia-box">' +
  `<a href="/farmacia.asp?idf=1" title="FARMACIA ${nome}">` +
  `<span itemprop="name" class="pharmacyname">${nome}</span></a>` +
  '<div itemprop="address" itemscope itemtype="https://schema.org/PostalAddress">' +
  '<span class="address"><span itemprop="streetAddress">Via Roma, 1</span><br>' +
  '<span itemprop="addressLocality">87012 <b>CASTROVILLARI</b></span> ' +
  '(<span itemprop="addressRegion">CS</span>)</span><br>' +
  extra +
  "</div>";

const linkStato = (classe: string, etichetta: string) =>
  `<a href="/orariofarmacia.asp?idf=1" class="${classe}">${etichetta}</a><br>`;

const pagina = (...blocchi: string[]) => "<html><body>" + blocchi.join("") + "</body></html>";

test("markup reale: apertura e turno dal link class='orario'", () => {
  const html = pagina(
    box(
      "CATERINI-FILPO",
      linkStato("btorario fb cturno", "TURNO") +
        "<a href=\"orariofarmacia.asp?idf=1\" class='orario'>" +
        "Apertura: 8:30-13:00 e 16:00-21:00 <br>Turno*: Tutto il giorno fino a domani</a><br>"
    )
  );

  const [farmacia] = parseFarmacieTurno(html);
  expect(farmacia.apertura).toBe("8:30-13:00 e 16:00-21:00");
  expect(farmacia.turno).toBe("Tutto il giorno fino a domani");
  expect(farmacia.stato).toBe("turno");
});

test("variante con virgolette doppie e attributi riordinati", () => {
  const html = pagina(
    box(
      "GIANNONI",
      linkStato("btorario fb cturno", "TURNO") +
        '<a class="orario" href="orariofarmacia.asp?idf=1">' +
        "Apertura: 8:30-13:00<br>Tutto il giorno</a>"
    )
  );

  const [farmacia] = parseFarmacieTurno(html);
  expect(farmacia.apertura).toBe("8:30-13:00");
  expect(farmacia.stato).toBe("turno");
});

test("senza il link orario si legge il testo del blocco", () => {
  const html = pagina(
    box(
      "D'ATRI",
      linkStato("btorario fb cturno", "TURNO") +
        "<span>Apertura: 8:30-13:00</span><span>Turno: fino alle 8</span>"
    )
  );

  const [farmacia] = parseFarmacieTurno(html);
  expect(farmacia.apertura).toBe("8:30-13:00");
  expect(farmacia.turno).toBe("fino alle 8");
});

test("stato dal nome della classe anche senza etichetta", () => {
  const html = pagina(
    box("BLANDI", '<a class="btorario fb cturno"></a>') +
      box("CACCURI", '<a class="btorario fb cchiuso">CHIUSA</a>')
  );

  const [turno, chiusa] = parseFarmacieTurno(html);
  expect(turno.stato).toBe("turno");
  expect(chiusa.stato).toBe("chiusa");
});

test("inTurnoFarmacia: lo stato dichiarato è prova del turno", () => {
  expect(inTurnoFarmacia({ stato: "turno", turno: null })).toBe(true);
  expect(inTurnoFarmacia({ stato: null, turno: "Tutto il giorno" })).toBe(true);
  expect(inTurnoFarmacia({ stato: "chiusa", turno: null })).toBe(false);
});

// ─── Tool: la farmacia di turno deve essere restituita ──────────────────────

const conFonte = async (html: string, esegui: () => Promise<void>) => {
  const originale = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    text: async () => html,
  })) as unknown as typeof fetch;
  try {
    await esegui();
  } finally {
    globalThis.fetch = originale;
  }
};

const HTML_FONTE = pagina(
  box("CATERINI-FILPO", linkStato("btorario fb cturno", "TURNO")),
  box("GIANNONI", linkStato("btorario fb cchiuso", "CHIUSA"))
);

test("searchPharmacies('turno') trova la farmacia dichiarata di turno", async () => {
  await conFonte(HTML_FONTE, async () => {
    const farmacie = await searchPharmacies("turno", 8);
    expect(farmacie.map((f) => f.nome)).toEqual(["CATERINI-FILPO"]);
    expect(farmacie[0].stato).toBe("turno");
  });
});

test("searchPharmacies('aperte') non resta vuota: propone le farmacie di turno", async () => {
  await conFonte(HTML_FONTE, async () => {
    const farmacie = await searchPharmacies("aperte", 8);
    expect(farmacie.map((f) => f.nome)).toEqual(["CATERINI-FILPO"]);
  });
});

test("searchPharmacies('tutte') restituisce l'intero elenco", async () => {
  await conFonte(HTML_FONTE, async () => {
    const farmacie = await searchPharmacies("tutte", 8);
    expect(farmacie.map((f) => f.nome)).toEqual(["CATERINI-FILPO", "GIANNONI"]);
  });
});

test("il fast path delle professioni non intercetta le richieste di farmacie", () => {
  const sorgente = readFileSync(join(process.cwd(), "lib/assistente/index.ts"), "utf8").replace(/\r\n/g, "\n");
  // Il ramo "service" risponde dal catalogo negozi: deve restare fuori dal
  // percorso delle farmacie, altrimenti la fonte reale dei turni non viene mai
  // interrogata e Pino dice che le farmacie non esistono.
  expect(sorgente).toMatch(/analisi\.intent === "service"[\s\S]{0,500}?!pianoIntentoLocale\(domanda\)/);
});

test("la fonte reale produce almeno una farmacia con turno verificabile", async () => {
  const farmacie = await getFarmacieTurnoCastrovillari();
  if (farmacie.length === 0) test.skip(true, "fonte esterna non disponibile");
  expect(farmacie.some(inTurnoFarmacia) || farmacie.every((f) => f.stato === "chiusa")).toBe(true);
});
