/**
 * Test SERVIZIO ORDINI AREA CLIENTE — NESSUNA chiamata reale a Supabase.
 *
 * Esegue i test su lib/cliente/ordini.ts (getOrdiniCliente, getOrdineCliente,
 * recuperaOrdiniGuest) e su costruisciPayloadOrdine di lib/cliente/orders.ts
 * con un client Supabase FAKE che registra i filtri applicati.
 *
 * Copre:
 *   T1  cliente autenticato → clienteUserId nel payload (RPC);
 *   T2  guest → clienteUserId null (la RPC salva NULL);
 *   T3  getOrdiniCliente filtra per cliente_user_id e mappa i dati;
 *   T5  getOrdineCliente: ownership (eq id + eq cliente_user_id) e null se
 *       l'ordine non appartiene all'utente;
 *   T6  dettaglio mappa correttamente prodotti/totale/stato;
 *   T9  recuperaOrdiniGuest: match email (ILike) + telefono (eq);
 *   T10 recupero con dati errati → nessun ordine; escape dei wildcard.
 *
 * Esecuzione: npx tsx scripts/test-ordini-cliente.ts
 */

import { costruisciPayloadOrdine } from "../lib/cliente/orders";
import {
  getOrdineCliente,
  getOrdiniCliente,
  recuperaOrdiniGuest,
} from "../lib/cliente/ordini";

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
  is(col: string, val: unknown) {
    this.calls.push(`is:${col}=${String(val)}`);
    return this;
  }
  ilike(col: string, val: string) {
    this.calls.push(`ilike:${col}=${val}`);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.calls.push(`in:${col}=${vals.join(",")}`);
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

/** DB FAKE: restituisce risultati per tabella e registra le query eseguite. */
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
  id: "ord-A",
  numero: "LH-000043",
  stato: "in_preparazione",
  totale: 14.9,
  costo_spedizione: 0,
  created_at: "2026-08-16T10:00:00.000Z",
  modalita: "ritiro",
  negozio_id: "n1",
  negozio_nome: "Salus Farma",
  cliente_user_id: "user-1",
  cliente_email: "cliente@example.it",
  cliente_telefono: "3331234567",
  ritiro_data: "2026-08-20",
  ritiro_fascia: "10:00–11:00",
  spedizione_indirizzo: null,
  spedizione_cap: null,
  spedizione_citta: null,
  spedizione_provincia: null,
  spedizione_note: null,
  metodo_spedizione: null,
  metodo_pagamento: null,
  note: "Grazie",
};

const righeRow = [
  {
    id: "r1",
    ordine_id: "ord-A",
    prodotto_id: 12,
    nome_prodotto: "Crema viso",
    prezzo_unitario: 14.9,
    quantita: 1,
    immagine_url: null,
  },
];

const eventiRow = [
  {
    id: "e1",
    ordine_id: "ord-A",
    evento: "ordine_ricevuto",
    dettaglio: "Ordine ricevuto",
    motivo: null,
    nota: null,
    created_at: "2026-08-16T10:00:01.000Z",
  },
  {
    id: "e2",
    ordine_id: "ord-A",
    evento: "confermato",
    dettaglio: "Ordine confermato",
    motivo: null,
    nota: null,
    created_at: "2026-08-16T10:05:00.000Z",
  },
];

const ordineAnnullatoRow = {
  ...ordineRow,
  stato: "cancellato",
  annullato_motivo: "prodotto_non_disponibile",
  annullato_nota: "Esaurito in magazzino",
  annullato_at: "2026-08-16T12:00:00.000Z",
};

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

  // ── T1: payload autenticato → clienteUserId valorizzato ──────────────────────
  console.log("\n[T1] Ordine di cliente autenticato → clienteUserId nel payload");
  {
    const payload = costruisciPayloadOrdine({
      idempotencyKey: "key-1",
      prodottoId: "12",
      quantita: 1,
      modalita: "ritiro",
      cliente: { nome: "Mario", cognome: "Rossi", telefono: "3331234567" },
      clienteUserId: "11111111-1111-1111-1111-111111111111",
    });
    check(
      "clienteUserId valorizzato",
      payload.clienteUserId === "11111111-1111-1111-1111-111111111111",
      String(payload.clienteUserId)
    );
    check("altri campi invariati", payload.prodottoId === "12" && payload.modalita === "ritiro");
  }

  // ── T2: payload guest → clienteUserId null ────────────────────────────────────
  console.log("\n[T2] Ordine guest → clienteUserId null");
  {
    const payload = costruisciPayloadOrdine({
      idempotencyKey: "key-2",
      prodottoId: "12",
      quantita: 1,
      modalita: "ritiro",
      cliente: { nome: "Mario", cognome: "Rossi", telefono: "3331234567" },
    });
    check("clienteUserId = null", payload.clienteUserId === null, String(payload.clienteUserId));
  }

  // ── T3: lista ordini → filtro per utente + ordinamento + righe batch ────────
  console.log("\n[T3] getOrdiniCliente filtra per cliente_user_id");
  {
    const log: FakeQuery[] = [];
    const ordini = await getOrdiniCliente("user-1", fakeDb({ ordini: [ordineRow] }, log));
    check("1 ordine restituito", ordini.length === 1, String(ordini.length));
    check("filtro cliente_user_id applicato", log[0]?.calls.includes("eq:cliente_user_id=user-1"));
    check(
      "ordinamento per created_at",
      log[0]?.calls.some((c) => c.startsWith("order:created_at"))
    );
    check("numero mappato", ordini[0]?.numero === "LH-000043");
    check("negozio mappato", ordini[0]?.negozioNome === "Salus Farma");
    check("totale mappato", ordini[0]?.totale === 14.9);
    check("modalita mappata", ordini[0]?.modalita === "ritiro");
    check("stato mappato", ordini[0]?.stato === "in_preparazione");
    check("righe vuote quando la tabella non risponde", ordini[0]?.righe.length === 0, String(ordini[0]?.righe.length));
  }

  // ── T3b: lista ordini → righe caricate in un'unica query batch (nessun N+1) ──
  console.log("\n[T3b] getOrdiniCliente: righe in batch per la card");
  {
    const log: FakeQuery[] = [];
    const ordini = await getOrdiniCliente(
      "user-1",
      fakeDb({ ordini: [ordineRow], ordini_righe: righeRow }, log)
    );
    check("1 ordine restituito", ordini.length === 1, String(ordini.length));
    check("1 riga prodotto in lista", ordini[0]?.righe.length === 1, String(ordini[0]?.righe.length));
    check("nome prodotto in lista", ordini[0]?.righe[0]?.nomeProdotto === "Crema viso");
    check("prezzo unitario in lista", ordini[0]?.righe[0]?.prezzoUnitario === 14.9);
    check("quantità in lista", ordini[0]?.righe[0]?.quantita === 1);
    check(
      "query batch con in(ordine_id) applicata",
      log.some((q) => q.calls.some((c) => c.startsWith("in:ordine_id=")))
    );
    check("una sola query su ordini_righe", log.filter((q) => q.calls.includes("select") && q.calls.some((c) => c.startsWith("in:ordine_id="))).length === 1);
  }

  // ── T5: ownership dettaglio ──────────────────────────────────────────────────
  console.log("\n[T5] getOrdineCliente: ownership server-side");
  {
    const log: FakeQuery[] = [];
    // Ordine di un ALTRO utente: la query (id + cliente_user_id) non trova righe → null
    const ordine = await getOrdineCliente("user-2", "ord-A", fakeDb({ ordini: null }, log));
    check("ordine altrui → null", ordine === null, JSON.stringify(ordine));
    check("filtro id applicato", log[0]?.calls.includes("eq:id=ord-A"));
    check("filtro cliente_user_id applicato", log[0]?.calls.includes("eq:cliente_user_id=user-2"));
    check("usato maybeSingle", log[0]?.calls.includes("maybeSingle"));
  }

  // ── T6: dettaglio corretto (prodotti + eventi) ──────────────────────────────
  console.log("\n[T6] getOrdineCliente: dettaglio mappa prodotti/totale/stato/eventi");
  {
    const log: FakeQuery[] = [];
    const ordine = await getOrdineCliente(
      "user-1",
      "ord-A",
      fakeDb({ ordini: ordineRow, ordini_righe: righeRow, ordini_eventi: eventiRow }, log)
    );
    check("dettaglio restituito", ordine !== null);
    check("1 riga prodotto", ordine?.righe.length === 1, String(ordine?.righe.length));
    check("nome prodotto", ordine?.righe[0]?.nomeProdotto === "Crema viso");
    check("prezzo unitario", ordine?.righe[0]?.prezzoUnitario === 14.9);
    check("quantità", ordine?.righe[0]?.quantita === 1);
    check("totale", ordine?.totale === 14.9);
    check("stato", ordine?.stato === "in_preparazione");
    check("note", ordine?.note === "Grazie");
    check("data ritiro", ordine?.ritiroData === "2026-08-20");
    check("fascia ritiro", ordine?.ritiroFascia === "10:00–11:00");
    check("2 eventi caricati", ordine?.eventi.length === 2, String(ordine?.eventi.length));
    check("primo evento mappato", ordine?.eventi[0]?.evento === "ordine_ricevuto");
    check("secondo evento mappato", ordine?.eventi[1]?.dettaglio === "Ordine confermato");
  }

  // ── T6b: ordine ANNULLATO → motivo/nota/data annullamento mappati ────────────
  console.log("\n[T6b] getOrdineCliente: dettaglio ordine annullato");
  {
    const log: FakeQuery[] = [];
    const ordine = await getOrdineCliente(
      "user-1",
      "ord-A",
      fakeDb(
        {
          ordini: ordineAnnullatoRow,
          ordini_righe: righeRow,
          ordini_eventi: [{ ...eventiRow[0], evento: "cancellato", dettaglio: "Ordine annullato", motivo: "prodotto_non_disponibile", nota: "Esaurito in magazzino" }],
        },
        log
      )
    );
    check("stato cancellato", ordine?.stato === "cancellato");
    check("motivo annullamento mappato", ordine?.annullatoMotivo === "prodotto_non_disponibile");
    check("nota annullamento mappata", ordine?.annullatoNota === "Esaurito in magazzino");
    check("data annullamento mappata", ordine?.annullatoAt === "2026-08-16T12:00:00.000Z");
    check("evento annullato presente", ordine?.eventi[0]?.evento === "cancellato");
  }

  // ── T9: recupero guest ───────────────────────────────────────────────────────
  console.log("\n[T9] Recupero guest: email + telefono");
  {
    const log: FakeQuery[] = [];
    const ordini = await recuperaOrdiniGuest(
      "Cliente@Example.IT",
      "3331234567",
      fakeDb({ ordini: [ordineRow], ordini_righe: righeRow, ordini_eventi: eventiRow }, log)
    );
    check("ordine trovato", ordini.length === 1, String(ordini.length));
    check(
      "email minuscola nella ricerca",
      log[0]?.calls.includes("ilike:cliente_email=cliente@example.it")
    );
    check("telefono in eq", log[0]?.calls.includes("eq:cliente_telefono=3331234567"));
    check("righe caricate", ordini[0]?.righe.length === 1, String(ordini[0]?.righe.length));
    check("eventi guest caricati", ordini[0]?.eventi.length === 2, String(ordini[0]?.eventi.length));
  }

  // ── T10: dati errati → nessun ordine + escape wildcard ───────────────────────
  console.log("\n[T10] Recupero guest: dati errati / wildcard");
  {
    const log: FakeQuery[] = [];
    const ordini = await recuperaOrdiniGuest(
      "sconosciuto@example.it",
      "0000000000",
      fakeDb({ ordini: [], ordini_righe: [] }, log)
    );
    check("nessun ordine con dati errati", ordini.length === 0, String(ordini.length));

    // wildcard % e _ devono essere escapate, non interpretate come LIKE
    const log2: FakeQuery[] = [];
    await recuperaOrdiniGuest(
      "a%_b@example.it",
      "333",
      fakeDb({ ordini: [], ordini_righe: [] }, log2)
    );
    const ilike = log2[0]?.calls.find((c) => c.startsWith("ilike:"));
    check(
      "wildcard escapate nel pattern",
      typeof ilike === "string" && ilike.includes("\\%") && ilike.includes("\\_"),
      ilike
    );

    // email o telefono mancanti → nessuna query
    const log3: FakeQuery[] = [];
    await recuperaOrdiniGuest("", "333", fakeDb({ ordini: [], ordini_righe: [] }, log3));
    check("email vuota → nessuna query", log3.length === 0, String(log3.length));
  }

  // ── Riepilogo ────────────────────────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`ORDINI CLIENTE TEST: ${passati} passati, ${falliti} falliti`);
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
