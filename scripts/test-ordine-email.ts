/**
 * Test EMAIL DI CONFERMA ORDINE — NESSUNA chiamata reale a Resend/Supabase.
 *
 * Esegue i test su lib/cliente/ordine-email.ts (costruisciHtmlConfermaOrdine,
 * costruisciOggettoOrdine, inviaEmailConfermaOrdine) con:
 *   - db FAKE (ordine + righe restituite senza toccare Supabase);
 *   - funzione `invia` FAKE al posto di Resend.
 *
 * Copre:
 *   T7  email inviata quando l'ordine ha una email valida (subject + html);
 *   T8  invio che fallisce → stato "error", MAI un'eccezione (l'ordine resta);
 *   T8b ordine senza email → skipped, nessun invio;
 *   T8c email non valida → skipped;
 *   T8d ordine non trovato → error controllato, mai throw.
 *
 * Esecuzione: npx tsx scripts/test-ordine-email.ts
 */

import {
  costruisciHtmlConfermaOrdine,
  costruisciHtmlStatoOrdine,
  costruisciOggettoOrdine,
  costruisciOggettoStatoOrdine,
  inviaEmailAggiornamentoStatoOrdine,
  inviaEmailConfermaOrdine,
  type DatiEmailOrdine,
} from "../lib/cliente/ordine-email";

type DatiOrdineRow = Record<string, unknown>;
type DatiRigaRow = Record<string, unknown>;

/** Query FAKE che registra le chiamate e restituisce il risultato prefissato. */
class FakeQuery {
  calls: string[] = [];
  result: unknown;
  constructor(result: unknown) {
    this.result = result;
  }
  select() {
    this.calls.push("select");
    return this;
  }
  eq(col: string, val: unknown) {
    this.calls.push(`eq:${col}=${String(val)}`);
    return this;
  }
  order(col: string) {
    this.calls.push(`order:${col}`);
    return this;
  }
  single() {
    this.calls.push("single");
    return { data: this.result, error: null };
  }
  then(resolve: (value: { data: unknown; error: null }) => void) {
    resolve({ data: this.result, error: null });
  }
}

/** DB FAKE: due tabelle preconfigurate (risultato ordine anche null). */
function fakeDb(ordine: unknown, righe: DatiRigaRow[]) {
  return {
    from(tabella: string) {
      if (tabella === "ordini") return new FakeQuery(ordine);
      return new FakeQuery(righe);
    },
  };
}

function ordineValido(over: Partial<DatiOrdineRow> = {}): DatiOrdineRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    numero: "LH-000043",
    stato: "in_preparazione",
    totale: 14.9,
    costo_spedizione: 0,
    created_at: "2026-08-16T10:00:00.000Z",
    modalita: "ritiro",
    negozio_nome: "Salus Farma",
    cliente_email: "cliente@example.it",
    cliente_telefono: "3331234567",
    ritiro_data: "2026-08-20",
    ritiro_fascia: "10:00–11:00",
    spedizione_indirizzo: null,
    spedizione_cap: null,
    spedizione_citta: null,
    spedizione_provincia: null,
    spedizione_note: null,
    note: "Grazie!",
    ...over,
  };
}

const rigaDefault: DatiRigaRow = {
  id: "r1",
  ordine_id: "11111111-1111-1111-1111-111111111111",
  nome_prodotto: "Crema viso",
  prezzo_unitario: 14.9,
  quantita: 1,
};

const ORDINE_ID = "11111111-1111-1111-1111-111111111111";

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

  // ── T7: email inviata con subject corretto e contenuto completo ──────────────
  console.log("\n[T7] Email inviata su ordine valido");
  {
    const inviato: { dati: DatiEmailOrdine | null } = { dati: null };
    const esito = await inviaEmailConfermaOrdine(ORDINE_ID, {
      db: fakeDb(ordineValido(), [rigaDefault]),
      invia: async (dati) => {
        inviato.dati = dati;
      },
    });

    check("stato = sent", esito.stato === "sent", JSON.stringify(esito));
    check("invia chiamato", inviato.dati !== null);
    check(
      "subject = 'Conferma ordine LH-000043 — InCittà'",
      inviato.dati?.numero === "LH-000043" &&
        costruisciOggettoOrdine(inviato.dati!) === "Conferma ordine LH-000043 — InCittà"
    );
    check("destinatario = email ordine", inviato.dati?.email === "cliente@example.it");
    const html = costruisciHtmlConfermaOrdine(inviato.dati!);
    check("html contiene numero ordine", html.includes("LH-000043"));
    check("html contiene negozio", html.includes("Salus Farma"));
    check("html contiene prodotto", html.includes("Crema viso"));
    check("html contiene totale", html.includes("14,90"));
    check("html contiene modalità ritiro", html.includes("Ritiro in negozio"));
    check("html contiene data ritiro", html.includes("2026-08-20"));
    check("html contiene link visualizza ordine", html.includes("/ordini/conferma/"));
    check("html NON contiene l'email completa", !html.includes("cliente@example.it"));
  }

  // ── T8: invio KO → stato error, MAI eccezione ───────────────────────────────
  console.log("\n[T8] Resend KO → email fallita ma nessuna eccezione");
  {
    let esito: Awaited<ReturnType<typeof inviaEmailConfermaOrdine>> = {
      stato: "error",
      motivo: "eccezione",
    };
    try {
      esito = await inviaEmailConfermaOrdine(ORDINE_ID, {
        db: fakeDb(ordineValido(), [rigaDefault]),
        invia: async () => {
          throw new Error("Resend: rate limited");
        },
      });
    } catch (err) {
      check("nessuna eccezione propagata", false, String(err));
    }
    check("stato = error (non throw)", esito.stato === "error", JSON.stringify(esito));
    check("motivo = invio_fallito", esito.stato === "error" && esito.motivo === "invio_fallito");
  }

  // ── T8b: ordine senza email → skipped, nessun invio ──────────────────────────
  console.log("\n[T8b] Ordine senza email → skipped");
  {
    let inviato = false;
    const esito = await inviaEmailConfermaOrdine(ORDINE_ID, {
      db: fakeDb(ordineValido({ cliente_email: null }), [rigaDefault]),
      invia: async () => {
        inviato = true;
      },
    });
    check("stato = skipped", esito.stato === "skipped", JSON.stringify(esito));
    check("invia NON chiamato", !inviato);
  }

  // ── T8c: email non valida → skipped ──────────────────────────────────────────
  console.log("\n[T8c] Email non valida → skipped");
  {
    const esito = await inviaEmailConfermaOrdine(ORDINE_ID, {
      db: fakeDb(ordineValido({ cliente_email: "non-una-email" }), [rigaDefault]),
      invia: async () => {},
    });
    check("stato = skipped", esito.stato === "skipped", JSON.stringify(esito));
  }

  // ── T8d: ordine non trovato → error controllato (mai throw) ──────────────────
  console.log("\n[T8d] Ordine non trovato → error controllato");
  {
    const esito = await inviaEmailConfermaOrdine("non-esiste", {
      db: fakeDb(null, []),
      invia: async () => {},
    });
    check(
      "stato = error, motivo ordine_non_trovato",
      esito.stato === "error" && esito.motivo === "ordine_non_trovato",
      JSON.stringify(esito)
    );
  }

  // ── T7b: spedizione → html contiene indirizzo e costo ────────────────────────
  console.log("\n[T7b] Spedizione → html contiene indirizzo e costo");
  {
    const datiSpedizione: DatiEmailOrdine = {
      id: "o1",
      numero: "LH-000056",
      stato: "in_preparazione",
      totale: 20.8,
      costoSpedizione: 5.9,
      createdAt: "2026-08-16T10:00:00.000Z",
      modalita: "spedizione",
      negozioNome: "Calzature Leo",
      email: "guest@example.it",
      ritiroData: null,
      ritiroFascia: null,
      spedizioneIndirizzo: "Via Roma 1",
      spedizioneCap: "87100",
      spedizioneCitta: "Cosenza",
      spedizioneProvincia: "CS",
      spedizioneNote: null,
      note: null,
      righe: [{ nomeProdotto: "Scarpe", prezzoUnitario: 14.9, quantita: 1 }],
    };
    const html = costruisciHtmlConfermaOrdine(datiSpedizione);
    check("html contiene indirizzo spedizione", html.includes("Via Roma 1, 87100, Cosenza, CS"));
    check("html contiene costo spedizione", html.includes("5,90"));
    check("html contiene 'Spedizione a domicilio'", html.includes("Spedizione a domicilio"));
  }

  // ── T17: EMAIL DI AGGIORNAMENTO STATO ────────────────────────────────────────
  console.log("\n[T17] Email aggiornamento stato: inviata per stati visibili");
  {
    const inviato: { payload: { dati: DatiEmailOrdine; stato: string; motivo: string | null; nota: string | null } | null } = { payload: null };
    const esito = await inviaEmailAggiornamentoStatoOrdine(ORDINE_ID, {
      db: fakeDb(ordineValido({ stato: "confermato" }), [rigaDefault]),
      invia: async (payload) => {
        inviato.payload = payload;
      },
    });
    check("stato = sent", esito.stato === "sent", JSON.stringify(esito));
    check("invia chiamato con stato confermato", inviato.payload?.stato === "confermato");
    check(
      "subject conferma = 'Ordine LH-000043 confermato — InCittà'",
      costruisciOggettoStatoOrdine("LH-000043", "confermato") === "Ordine LH-000043 confermato — InCittà"
    );
    check(
      "subject pronto = 'Il tuo ordine LH-000043 è pronto — InCittà'",
      costruisciOggettoStatoOrdine("LH-000043", "pronto") === "Il tuo ordine LH-000043 è pronto — InCittà"
    );
    check(
      "subject annullato = 'Ordine LH-000043 annullato — InCittà'",
      costruisciOggettoStatoOrdine("LH-000043", "cancellato") === "Ordine LH-000043 annullato — InCittà"
    );

    // HTML dell'annullamento include motivo + nota
    const htmlAnn = costruisciHtmlStatoOrdine(
      inviato.payload!.dati,
      "cancellato",
      "prodotto_non_disponibile",
      "Non abbiamo più questo articolo."
    );
    check("html annullamento contiene motivo", htmlAnn.includes("Prodotto non disponibile"));
    check("html annullamento contiene nota", htmlAnn.includes("Non abbiamo più questo articolo."));

    // Stati NON notificabili → skipped, nessun invio
    let inviato2 = false;
    const esito2 = await inviaEmailAggiornamentoStatoOrdine(ORDINE_ID, {
      db: fakeDb(ordineValido({ stato: "in_lavorazione" }), [rigaDefault]),
      invia: async () => {
        inviato2 = true;
      },
    });
    check("in_lavorazione → skipped", esito2.stato === "skipped", JSON.stringify(esito2));
    check("in_lavorazione → invia NON chiamato", !inviato2);
  }

  // ── T18: EMAIL STATO KO → stato restituito, MAI eccezione ────────────────────
  console.log("\n[T18] Email stato KO → error controllato (ordine/stato resta valido)");
  {
    let esito: Awaited<ReturnType<typeof inviaEmailAggiornamentoStatoOrdine>> = { stato: "error", motivo: "eccezione" };
    try {
      esito = await inviaEmailAggiornamentoStatoOrdine(ORDINE_ID, {
        db: fakeDb(ordineValido({ stato: "pronto" }), [rigaDefault]),
        invia: async () => {
          throw new Error("Resend: quota esaurita");
        },
      });
    } catch (err) {
      check("nessuna eccezione propagata", false, String(err));
    }
    check("stato = error (non throw)", esito.stato === "error", JSON.stringify(esito));

    // Email assente → skipped
    const esito2 = await inviaEmailAggiornamentoStatoOrdine(ORDINE_ID, {
      db: fakeDb(ordineValido({ stato: "pronto", cliente_email: null }), [rigaDefault]),
      invia: async () => {},
    });
    check("senza email → skipped", esito2.stato === "skipped", JSON.stringify(esito2));
  }

  // ── T19: EMAIL DI ANNULLAMENTO — motivo + nota dal DB nel payload inviato ────
  console.log("\n[T19] Email annullamento: motivo + nota presenti nel payload reale");
  {
    const inviato: { payload: { dati: DatiEmailOrdine; stato: string; motivo: string | null; nota: string | null } | null } = { payload: null };
    const esito = await inviaEmailAggiornamentoStatoOrdine(ORDINE_ID, {
      db: fakeDb(
        ordineValido({
          stato: "cancellato",
          annullato_motivo: "problema_spedizione",
          annullato_nota: "Il corriere non riesce a consegnare.",
          annullato_at: "2026-08-17T09:00:00.000Z",
        }),
        [rigaDefault]
      ),
      invia: async (payload) => {
        inviato.payload = payload;
      },
    });
    check("stato = sent", esito.stato === "sent", JSON.stringify(esito));
    check("stato del payload = cancellato", inviato.payload?.stato === "cancellato");
    check(
      "motivo estratto dal DB (problema_spedizione)",
      inviato.payload?.motivo === "problema_spedizione",
      String(inviato.payload?.motivo)
    );
    check(
      "nota estratta dal DB",
      inviato.payload?.nota === "Il corriere non riesce a consegnare.",
      String(inviato.payload?.nota)
    );
    const html = costruisciHtmlStatoOrdine(
      inviato.payload!.dati,
      "cancellato",
      inviato.payload!.motivo,
      inviato.payload!.nota
    );
    check("html contiene etichetta motivo", html.includes("Problema con la spedizione"));
    check("html contiene nota del venditore", html.includes("Il corriere non riesce a consegnare."));
    check("html contiene totale ordine", html.includes("14,90"));
    check("html contiene link visualizza ordine", html.includes("/ordini/conferma/"));

    // Ordine annullato SENZA email cliente → skipped (mai errore, mai throw).
    const esito2 = await inviaEmailAggiornamentoStatoOrdine(ORDINE_ID, {
      db: fakeDb(ordineValido({ stato: "cancellato", cliente_email: null }), [rigaDefault]),
      invia: async () => {},
    });
    check("annullato senza email → skipped", esito2.stato === "skipped", JSON.stringify(esito2));

    // Ordine annullato ma con Resend KO → error controllato (mai throw).
    let esito3: Awaited<ReturnType<typeof inviaEmailAggiornamentoStatoOrdine>> = { stato: "error", motivo: "eccezione" };
    try {
      esito3 = await inviaEmailAggiornamentoStatoOrdine(ORDINE_ID, {
        db: fakeDb(ordineValido({ stato: "cancellato" }), [rigaDefault]),
        invia: async () => {
          throw new Error("Resend: dominio mittente non verificato");
        },
      });
    } catch (err) {
      check("nessuna eccezione propagata", false, String(err));
    }
    check("Resend KO → stato error (ordine resta annullato)", esito3.stato === "error", JSON.stringify(esito3));
  }

  // ── Riepilogo ────────────────────────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`ORDINE EMAIL TEST: ${passati} passati, ${falliti} falliti`);
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
