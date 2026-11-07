/**
 * Pino — regressioni dell'audit del 7 novembre 2026.
 *
 * Ogni test riproduce una frase che in produzione riceveva una risposta
 * sbagliata o inutilmente lenta. Il database è il client finto di
 * `tests/support/hook-pino.mjs`: nessuna rete, nessun modello.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { chatConAssistente } from "../lib/assistente/index.ts";
import {
  richiestaLinguaParlataPino,
  rilevaAzioneNonDisponibilePino,
  servizioNonCopertoPino,
} from "../lib/assistente/capacita.ts";
import {
  filtraNegoziNominatiPino,
  rilevaRichiestaInfoAttivitaPino,
} from "../lib/assistente/info-attivita.ts";
import {
  componiRispostaConteggioAttivitaPino,
  rilevaConteggioAttivitaPino,
} from "../lib/assistente/aggregata.ts";
import {
  messaggioPrezziPino,
  messaggioRestrizioneAlimentarePino,
} from "../lib/assistente/messaggi-pino.ts";
import { richiestaPrezzoSenzaSoggettoPino } from "../lib/assistente/understanding.ts";
import { calcolaEsitoTurnoPino } from "../lib/assistente/telemetria.ts";

globalThis.fetch = async (url) => {
  throw new Error(`rete disattivata nei test Pino: ${String(url)}`);
};

const u = (content) => ({ role: "user", content });

// ── 1. «Comprare» non è un ordine affidato a Pino ───────────────────────────

test("la richiesta di consiglio su dove comprare non è un ordine", () => {
  for (const frase of [
    "quale negozio mi consigli per comprare olio buono?",
    "dove posso comprare il pane?",
    "mi consigli un posto per comprare un regalo",
  ]) {
    assert.equal(rilevaAzioneNonDisponibilePino(frase), null, frase);
  }
});

test("l'ordine resta un ordine quando è chiesto a Pino", () => {
  for (const frase of [
    "puoi ordinare tu il pane?",
    "mi compri tu il vino?",
    "vorrei che tu comprassi il regalo",
    "compra per me una torta",
  ]) {
    assert.equal(rilevaAzioneNonDisponibilePino(frase), "ordine", frase);
  }
});

// ── 2. Servizi fuori catalogo dichiarati, non riciclati ────────────────────

test("i servizi civici fuori catalogo sono riconosciuti", () => {
  assert.equal(servizioNonCopertoPino("dove posso parcheggiare"), "parcheggio");
  assert.equal(servizioNonCopertoPino("c'è un bancomat qui vicino?"), "banca o sportello bancomat");
  assert.equal(servizioNonCopertoPino("a che ora passa l'autobus"), "trasporto pubblico");
  assert.equal(servizioNonCopertoPino("cerco un panificio"), null);
  assert.equal(servizioNonCopertoPino("vorrei un chilo di pane"), null);
});

test("«dove posso parcheggiare» non propone un negozio", async () => {
  const r = await chatConAssistente([u("dove posso parcheggiare")]);
  assert.match(r.risposta, /parcheggio/i);
  assert.equal(r.motivoUscita, "servizio_non_coperto");
  assert.deepEqual(r.negozi, []);
});

// ── 3. «È aperto?» è una domanda di stato ──────────────────────────────────

test("«è aperto?» attiva le informazioni dell'attività", () => {
  assert.equal(rilevaRichiestaInfoAttivitaPino("il Panificio Zini è aperto?"), "stato");
  assert.equal(rilevaRichiestaInfoAttivitaPino("is the bakery open?"), "stato");
  assert.equal(
    rilevaRichiestaInfoAttivitaPino("il panificio è aperto la domenica?"),
    "orari"
  );
});

test("la scheda nominata non si allarga a tutta la categoria", () => {
  const negozi = [
    { nome: "Panificio Zini", categoria: "Panificio" },
    { nome: "Panificio Monti", categoria: "Panificio" },
    { nome: "Forno Antico", categoria: "Panificio" },
  ];
  const filtrati = filtraNegoziNominatiPino(negozi, "il Panificio Zini è aperto?");
  assert.deepEqual(filtrati.map((n) => n.nome), ["Panificio Zini"]);
});

// ── 4. Conteggio di attività ───────────────────────────────────────────────

test("«quanti panifici» è un conteggio, non un elenco", () => {
  assert.deepEqual(rilevaConteggioAttivitaPino("quanti panifici ci sono?"), {
    termine: "panificio",
  });
  assert.deepEqual(rilevaConteggioAttivitaPino("quanti negozi ci sono in città?"), {
    termine: "negozio",
  });
  // Le farmacie restano sul percorso dei turni reali.
  assert.equal(rilevaConteggioAttivitaPino("quante farmacie sono aperte?"), null);
  assert.equal(rilevaConteggioAttivitaPino("quanti tipi di pasta ci sono?"), null);
});

test("il conteggio usa il numero e i nomi reali", () => {
  const it = componiRispostaConteggioAttivitaPino({
    termine: "panificio",
    totale: 3,
    nomi: ["Panificio Zini", "Panificio Monti", "Forno Antico"],
    lingua: "it",
  });
  assert.match(it, /\*\*3\*\* panifici/);
  assert.match(it, /Panificio Zini/);

  const en = componiRispostaConteggioAttivitaPino({
    termine: "panificio",
    totale: 3,
    nomi: ["Panificio Zini"],
    lingua: "en",
  });
  assert.match(en, /3\*\* bakeries/);
});

test("«quanti panifici» chiude il turno sul ramo conteggio", async () => {
  const r = await chatConAssistente([u("quanti panifici ci sono?")]);
  assert.equal(r.motivoUscita, "conteggio_attivita");
});

// ── 5. Inglese senza pezzi italiani ────────────────────────────────────────

test("la restrizione alimentare in inglese è tradotta", () => {
  const testo = messaggioRestrizioneAlimentarePino("en", "pane", "senza glutine");
  assert.match(testo, /bread/);
  assert.match(testo, /gluten-free/);
  assert.doesNotMatch(testo, /senza glutine|questo prodotto/);
});

test("«I need gluten free bread» non mescola le lingue", async () => {
  const r = await chatConAssistente([u("I need gluten free bread")]);
  assert.doesNotMatch(r.risposta, /questo prodotto|«senza glutine»/);
});

// ── 6. Prezzo: contesto e chiarimento rapido ───────────────────────────────

test("«quanto costa?» è riconosciuta come domanda senza soggetto", () => {
  for (const frase of ["quanto costa?", "quanto costano?", "how much is it?"]) {
    assert.equal(richiestaPrezzoSenzaSoggettoPino(frase), true, frase);
  }
  assert.equal(richiestaPrezzoSenzaSoggettoPino("quanto costa il vino?"), false);
});

test("«quanto costa?» senza contesto chiede il soggetto senza planner", async () => {
  const r = await chatConAssistente([u("quanto costa?")]);
  assert.equal(r.motivoUscita, "prezzo_senza_soggetto");
  assert.match(r.risposta, /quale prodotto|di quale prodotto/i);
});

test("i prezzi già recuperati sono formattati", () => {
  const testo = messaggioPrezziPino("it", "vino", [
    { nome: "Vino Magliocco", prezzo: "14.9", negozio_nome: "Enoteca" },
  ]);
  assert.match(testo, /Vino Magliocco/);
  assert.match(testo, /€14,90/);
});

// ── 7. Lingua parlata e telemetria ─────────────────────────────────────────

test("«parli inglese?» è una domanda sulla capacità", async () => {
  assert.equal(richiestaLinguaParlataPino("parli inglese?"), "en");
  const r = await chatConAssistente([u("parli inglese?")]);
  assert.equal(r.motivoUscita, "capacita_lingua");
  assert.match(r.risposta, /italiano e inglese/);
});

test("l'esito distingue una risposta deterministica da un vuoto", () => {
  assert.equal(calcolaEsitoTurnoPino({ motivo: "faq", negozi: 0, prodotti: 0 }), "ok");
  assert.equal(
    calcolaEsitoTurnoPino({ motivo: "servizio_non_coperto", negozi: 0, prodotti: 0 }),
    "ok"
  );
  assert.equal(calcolaEsitoTurnoPino({ motivo: "ricerca", negozi: 0, prodotti: 0 }), "vuoto");
  assert.equal(calcolaEsitoTurnoPino({ motivo: "ricerca", negozi: 1, prodotti: 0 }), "ok");
});
