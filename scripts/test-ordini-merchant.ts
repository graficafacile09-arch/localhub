/**
 * Test MACCHINA A STATI + SERVIZIO ORDINI AREA VENDITORE —
 * NESSUNA chiamata reale a Supabase.
 *
 * Esegue test su lib/merchant/ordini-stati.ts (funzioni pure: transizioni,
 * azioni disponibili, filtri, priorità di ordinamento) e su
 * lib/merchant/ordini.ts (getOrdiniVenditore / getOrdineVenditore) con un
 * client Supabase FAKE.
 *
 * Copre:
 *   T4  NUOVO → CONFERMATO (transizione consentita);
 *   T5  CONFERMATO → IN_LAVORAZIONE;
 *   T6  IN_LAVORAZIONE → PRONTO;
 *   T7  PRONTO → COMPLETATO;
 *   T8  annullamento con conferma (azione distruttiva richiede motivo);
 *   T9  annullamento richiede motivo (la RPC lo impone; la UI richiede nota);
 *   T10 ordine annullato è terminale (nessuna transizione in uscita);
 *   T11 ordine completato è terminale;
 *   T14 retry stessa stato → no-op (idempotenza della macchina a stati);
 *   T1  getOrdiniVenditore filtra per negozio + ownership (canManageStore);
 *   T13 modifica con negozio altrui → rifiutata (canManageStore false);
 *   T15 getOrdineVenditore restituisce righe + eventi e filtra per id.
 *
 * Esecuzione: npx tsx scripts/test-ordini-merchant.ts
 */

import {
  azioniDisponibili,
  etichettaMotivoAnnullamento,
  isFiltroOrdini,
  isStatoOrdine,
  MOTIVI_ANNULLAMENTO,
  prioritaStato,
  statiPerFiltro,
  transizioneConsentita,
} from "../lib/merchant/ordini-stati";
import { getOrdineVenditore, getOrdiniVenditore } from "../lib/merchant/ordini";

/** Query FAKE che registra le chiamate e restituisce il risultato prefissato. */
class FakeQuery {
  calls: string[] = [];
  result: unknown;
  error: unknown = null;
  constructor(result: unknown, error: unknown = null) {
    this.result = result;
    this.error = error;
  }
  select() {
    this.calls.push("select");
    return this;
  }
  eq(col: string, val: unknown) {
    this.calls.push(`eq:${col}=${String(val)}`);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.calls.push(`in:${col}=${vals.join(",")}`);
    return this;
  }
  is(col: string, val: unknown) {
    this.calls.push(`is:${col}=${String(val)}`);
    return this;
  }
  order(col: string) {
    this.calls.push(`order:${col}`);
    return this;
  }
  maybeSingle() {
    this.calls.push("maybeSingle");
    return { data: this.result, error: this.error };
  }
  then(resolve: (value: { data: unknown; error: unknown }) => void) {
    resolve({ data: this.result, error: this.error });
  }
}

/** DB FAKE per il servizio ordini venditore. */
function fakeDb(risultati: Record<string, unknown>, queryLog: FakeQuery[]) {
  return {
    from(tabella: string) {
      const q = new FakeQuery(risultati[tabella] ?? null);
      queryLog.push(q);
      return q;
    },
  };
}

const ordineRow = {
  id: "ord-M",
  numero: "LH-000059",
  stato: "in_preparazione",
  totale: 29.9,
  costo_spedizione: 0,
  created_at: "2026-08-16T10:00:00.000Z",
  modalita: "ritiro",
  negozio_id: "negozio-proprio",
  negozio_nome: "Salus Farma",
  cliente_nome: "Mario",
  cliente_cognome: "Rossi",
  cliente_telefono: "3331234567",
  cliente_email: "cliente@example.it",
  ritiro_data: "2026-08-20",
  ritiro_fascia: "10:00–11:00",
  note: null,
  letto_at: null,
};

const righeRow = [
  {
    id: "r1",
    ordine_id: "ord-M",
    prodotto_id: 12,
    nome_prodotto: "Crema viso",
    prezzo_unitario: 29.9,
    quantita: 1,
    immagine_url: null,
  },
];

const eventiRow = [
  { id: "e1", ordine_id: "ord-M", evento: "ordine_ricevuto", dettaglio: "Ordine ricevuto", motivo: null, nota: null, created_at: "2026-08-16T10:00:00.000Z" },
];

// Il servizio accetta `opts.puòGestire` come override testabile: i test non
// toccano la query reale di ownership (nessuna chiamata a Supabase).

async function main() {
  let passati = 0;
  let falliti = 0;
  const errori: string[] = [];

  function check(nome: string, condizione: boolean, dettaglio?: string) {
    if (condizione) {
      passati++;
      console.log(`  PASS ${nome}`);
    } else {
      falliti++;
      errori.push(nome);
      console.log(`  FAIL ${nome} ${dettaglio ? "— " + dettaglio : ""}`);
    }
  }

  // ── T4–T7: transizioni progressive ────────────────────────────────────────
  console.log("\n[T4–T7] Transizioni progressive NUOVO→CONFERMATO→LAVORAZIONE→PRONTO→COMPLETATO");
  check("NUOVO → CONFERMATO", transizioneConsentita("in_preparazione", "confermato"));
  check("CONFERMATO → IN_LAVORAZIONE", transizioneConsentita("confermato", "in_lavorazione"));
  check("IN_LAVORAZIONE → PRONTO", transizioneConsentita("in_lavorazione", "pronto"));
  check("PRONTO → COMPLETATO", transizioneConsentita("pronto", "consegnato"));

  // ── T8/T9: annullamento ───────────────────────────────────────────────────
  console.log("\n[T8/T9] Annullamento: azione disponibile + motivo obbligatorio");
  const azioniNuovo = azioniDisponibili("in_preparazione");
  check(
    "NUOVO → azioni [Conferma, Annulla distruttivo]",
    azioniNuovo.length === 2 &&
      azioniNuovo.some((a) => a.stato === "confermato") &&
      azioniNuovo.some((a) => a.stato === "cancellato" && a.distruttiva),
    JSON.stringify(azioniNuovo.map((a) => a.stato))
  );
  check("annullamento consentito da NUOVO", transizioneConsentita("in_preparazione", "cancellato"));
  check("annullamento consentito da IN_LAVORAZIONE", transizioneConsentita("in_lavorazione", "cancellato"));
  check("annullamento consentito da PRONTO", transizioneConsentita("pronto", "cancellato"));
  check(
    "motivi rapidi presenti (6)",
    MOTIVI_ANNULLAMENTO.length === 6,
    String(MOTIVI_ANNULLAMENTO.length)
  );
  check(
    "motivo 'altro' richiede nota",
    MOTIVI_ANNULLAMENTO.find((m) => m.valore === "altro")?.richiedeNota === true
  );
  check(
    "etichetta motivo mappata",
    etichettaMotivoAnnullamento("prodotto_non_disponibile") === "Prodotto non disponibile"
  );

  // ── T10/T11: stati terminali ──────────────────────────────────────────────
  console.log("\n[T10/T11] Stati terminali: ANNULLATO e COMPLETATO non escono");
  check("cancellato → in_lavorazione BLOCCATA", !transizioneConsentita("cancellato", "in_lavorazione"));
  check("cancellato → confermato BLOCCATA", !transizioneConsentita("cancellato", "confermato"));
  check("consegnato → in_preparazione BLOCCATA", !transizioneConsentita("consegnato", "in_preparazione"));
  check("consegnato → cancellato BLOCCATA", !transizioneConsentita("consegnato", "cancellato"));
  check("consegnato → nessuna azione", azioniDisponibili("consegnato").length === 0);
  check("cancellato → nessuna azione", azioniDisponibili("cancellato").length === 0);
  check("completare un ordine annullato IMPOSSIBILE", !transizioneConsentita("cancellato", "consegnato"));

  // ── T14: idempotenza (stesso stato → no-op) ───────────────────────────────
  console.log("\n[T14] Idempotenza: stesso stato → no-op");
  check("NUOVO → NUOVO (retry) no-op", transizioneConsentita("in_preparazione", "in_preparazione"));
  check("PRONTO → PRONTO (retry) no-op", transizioneConsentita("pronto", "pronto"));

  // ── Filtri + priorità ─────────────────────────────────────────────────────
  console.log("\n[FILTRI] Filtri lista e priorità ordinamento");
  check("isFiltroOrdini('nuovi')", isFiltroOrdini("nuovi"));
  check("isFiltroOrdini('x') false", !isFiltroOrdini("x"));
  check("filtro nuovi → [in_preparazione]", statiPerFiltro("nuovi").join() === "in_preparazione");
  check(
    "filtro lavorazione → 3 stati",
    statiPerFiltro("lavorazione").length === 3,
    statiPerFiltro("lavorazione").join()
  );
  check("filtro tutti → []", statiPerFiltro("tutti").length === 0);
  check("isStatoOrdine('confermato')", isStatoOrdine("confermato"));
  check("isStatoOrdine('boh') false", !isStatoOrdine("boh"));
  check(
    "priorità: nuovo(0) < confermato(1)",
    prioritaStato("in_preparazione") < prioritaStato("confermato")
  );
  check(
    "priorità: completato(5) < annullato(6)",
    prioritaStato("consegnato") < prioritaStato("cancellato")
  );

  // ── T1/T13: lista ordini venditore + ownership ───────────────────────────
  console.log("\n[T1/T13] getOrdiniVenditore: filtro negozio + ownership");
  {
    const log: FakeQuery[] = [];
    const ordini = await getOrdiniVenditore("user-1", "negozio-proprio", "tutti", {
      client: fakeDb({ ordini: [ordineRow], ordini_righe: righeRow }, log),
      puòGestire: true,
    });
    check("1 ordine restituito", ordini.length === 1, String(ordini.length));
    check("filtro negozio_id applicato", log.some((q) => q.calls.includes("eq:negozio_id=negozio-proprio")));
    check("numero mappato", ordini[0]?.numero === "LH-000059");
    check("cliente mappato", ordini[0]?.clienteNome === "Mario" && ordini[0]?.clienteCognome === "Rossi");
    check("numero righe conteggiato", ordini[0]?.numeroRighe === 1, String(ordini[0]?.numeroRighe));
    check("non letto (letto_at null)", ordini[0]?.lettoAt === null);

    // Ownership negata → lista vuota senza query.
    const log2: FakeQuery[] = [];
    const vuoto = await getOrdiniVenditore("user-2", "negozio-altrui", "tutti", {
      client: fakeDb({ ordini: [] }, log2),
      puòGestire: false,
    });
    check("negozio altrui → lista vuota", vuoto.length === 0, String(vuoto.length));
    check("negozio altrui → nessuna query", log2.length === 0, String(log2.length));
  }

  // ── T15: dettaglio con righe + eventi ─────────────────────────────────────
  console.log("\n[T15] getOrdineVenditore: dettaglio con righe + eventi");
  {
    const log: FakeQuery[] = [];
    const ordine = await getOrdineVenditore("user-1", "negozio-proprio", "ord-M", {
      client: fakeDb({ ordini: ordineRow, ordini_righe: righeRow, ordini_eventi: eventiRow }, log),
      puòGestire: true,
    });
    check("dettaglio restituito", ordine !== null);
    check("filtro id + negozio", log.some((q) => q.calls.includes("eq:id=ord-M") && q.calls.includes("eq:negozio_id=negozio-proprio")));
    check("1 riga prodotto", ordine?.righe.length === 1, String(ordine?.righe.length));
    check("nome prodotto", ordine?.righe[0]?.nomeProdotto === "Crema viso");
    check("1 evento storico", ordine?.eventi.length === 1, String(ordine?.eventi.length));
    check("evento mappato", ordine?.eventi[0]?.evento === "ordine_ricevuto");
    check("email cliente", ordine?.clienteEmail === "cliente@example.it");
    check("data ritiro", ordine?.ritiroData === "2026-08-20");
  }

  // ── Riepilogo ─────────────────────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`ORDINI MERCHANT TEST: ${passati} passati, ${falliti} falliti`);
  if (falliti > 0) {
    console.log(`Falliti: ${errori.join(", ")}`);
    process.exit(1);
  }
  console.log("TUTTI I TEST PASSATI ✓");
}

main().catch((err) => {
  console.error("Errore imprevisto nel test:", err);
  process.exit(1);
});
