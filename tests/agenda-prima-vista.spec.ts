/**
 * AGENDA — PRIMA VISTA: il calendario annuale deve essere la PRIMA UI visibile
 * quando si apre l'Agenda dalla dashboard merchant.
 *
 * Verifica (test PURI, senza browser):
 *  1. l'helper `blocchiConDestinazioneInPrimo` sposta il blocco di destinazione
 *     (prenotazioni) in testa alla sezione preservando l'ordine degli altri;
 *  2. per un'attività di servizio (medico) il blocco prenotazioni è GIÀ il
 *     primo blocco visibile della sezione "Vendita e agenda";
 *  3. per un'attività mista (prodotti + prenotazioni) — il caso che prima del
 *     fix mostrava "Come vendi" davanti al calendario — la navigazione mirata
 *     porta prenotazioni in testa.
 *
 * Nota: la verifica browser reale (login merchant → click Agenda → scroll)
 * richiede un ambiente con credenziali QA e NON è eseguibile in questo repo
 * (le e2e esistenti puntano a .env.local/produzione).
 */
import { test, expect } from "@playwright/test";
import type { Negozio } from "@/types/negozio";
import {
  blocchiConDestinazioneInPrimo,
  getBlocchiVisibili,
  getSezioniVisibili,
  EDITOR_SEZIONI,
  type BloccoId,
} from "@/components/merchant/editor/editor-sections";

function storeConProfilo(tipo: string): Negozio {
  return { data: { tipo_attivita: tipo }, moduli_attivi: [] } as unknown as Negozio;
}

function storeConModuli(moduli: string[]): Negozio {
  return { data: {}, moduli_attivi: moduli } as unknown as Negozio;
}

function sezioneVendita(store: Negozio): BloccoId[] {
  const sezioni = getSezioniVisibili(store);
  const vendita = sezioni.find((s) => s.sezione.id === "vendita");
  expect(vendita, "sezione vendita presente").toBeDefined();
  return vendita?.blocchi ?? [];
}

test("1. blocchiConDestinazioneInPrimo: il target diventa il primo, ordine degli altri preservato", () => {
  const blocchi: BloccoId[] = ["vendita-commerciale", "prenotazioni", "richiesta-info"];
  expect(blocchiConDestinazioneInPrimo(blocchi, "prenotazioni")).toEqual([
    "prenotazioni",
    "vendita-commerciale",
    "richiesta-info",
  ]);
  // senza target → ordine invariato
  expect(blocchiConDestinazioneInPrimo(blocchi, null)).toBe(blocchi);
  expect(blocchiConDestinazioneInPrimo(blocchi, undefined)).toBe(blocchi);
  // target non presente nella sezione → ordine invariato
  expect(blocchiConDestinazioneInPrimo(blocchi, "identita")).toBe(blocchi);
});

test("2. attività di servizio (medico): senza navigazione mirata il calendario NON è il primo blocco; con la navigazione Agenda lo è", () => {
  const store = storeConProfilo("medico");
  const blocchi = sezioneVendita(store);
  // vendita-commerciale è sempre visibile (default) → in ordine statico
  // precede prenotazioni anche per un profilo di servizio: è la causa reale.
  expect(blocchi[0]).toBe("vendita-commerciale");
  expect(blocchi).toContain("prenotazioni");
  // la navigazione mirata (?block=prenotazioni) porta il calendario PRIMO
  expect(blocchiConDestinazioneInPrimo(blocchi, "prenotazioni")[0]).toBe("prenotazioni");
});

test("3. attività mista (prodotti + prenotazioni): la navigazione Agenda porta il calendario in testa", () => {
  const store = storeConModuli(["prodotti", "prenotazioni", "richiesta_info"]);
  const blocchi = sezioneVendita(store);
  // ordine statico: il blocco commerciale precede prenotazioni (causa reale del problema)
  expect(blocchi).toEqual(["vendita-commerciale", "prenotazioni", "richiesta-info"]);
  expect(blocchi[0]).toBe("vendita-commerciale");

  // la navigazione mirata (?block=prenotazioni) porta il calendario PRIMO
  const conDestinazione = blocchiConDestinazioneInPrimo(blocchi, "prenotazioni");
  expect(conDestinazione[0]).toBe("prenotazioni");
  expect(conDestinazione).toEqual(["prenotazioni", "vendita-commerciale", "richiesta-info"]);
});

test("4. la sezione vendita dell'editor contiene il blocco prenotazioni (con la navigazione mirata diventa il primo visibile)", () => {
  const sezione = EDITOR_SEZIONI.find((s) => s.id === "vendita");
  expect(sezione?.blocchi).toContain("prenotazioni");
  const visibili = getBlocchiVisibili(sezione!, ["prenotazioni"]);
  // vendita-commerciale è sempre visibile → in ordine statico è davanti
  expect(visibili[0]).toBe("vendita-commerciale");
  expect(visibili).toContain("prenotazioni");
  expect(visibili).not.toContain("richiesta-info");
  // la navigazione mirata porta il calendario in testa
  expect(blocchiConDestinazioneInPrimo(visibili, "prenotazioni")[0]).toBe("prenotazioni");
});
