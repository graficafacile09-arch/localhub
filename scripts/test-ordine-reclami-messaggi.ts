/**
 * Test COMUNICAZIONI RECLAMO — NESSUNA chiamata reale a Supabase/ntfy/Resend.
 *
 * Esegue i test su lib/ordine-reclami-messaggi.ts e sull'email del messaggio
 * (lib/cliente/ordine-email.ts) con RPC/db/fetch/inviaEmail FAKE:
 *   - validaCorpoMessaggio (puro);
 *   - aggiungiMessaggioVenditore: successo (+email con corpo), email KO →
 *     messaggio comunque salvato (best-effort), ownership rifiutata,
 *     corpo vuoto → 422, reclamo chiuso → 409;
 *   - aggiungiMessaggioCliente: successo (+ntfy best-effort), ntfy KO →
 *     messaggio comunque salvato;
 *   - getMessaggiReclamoCliente: reclamo NON proprio → []; proprio → lista;
 *   - getMessaggiReclamoVenditore: ownership false → [], reclamo di altro
 *     negozio → [], ok → lista mappata;
 *   - email: oggetto + HTML con numero, corpo e link al dettaglio cliente.
 *
 * Esecuzione: npx tsx scripts/test-ordine-reclami-messaggi.ts
 */

import {
  aggiungiMessaggioCliente,
  aggiungiMessaggioVenditore,
  getMessaggiReclamoCliente,
  getMessaggiReclamoVenditore,
  validaCorpoMessaggio,
} from "../lib/ordine-reclami-messaggi";
import {
  costruisciMessaggioRispostaClienteNtfy,
  type DatiRispostaClienteNtfy,
} from "../lib/ordine-reclami-stati";
import {
  costruisciHtmlMessaggioReclamo,
  costruisciOggettoMessaggioReclamo,
  costruisciHtmlRispostaClienteVenditore,
  costruisciOggettoRispostaClienteVenditore,
  inviaEmailMessaggioReclamo,
  inviaEmailRispostaClienteReclamo,
} from "../lib/cliente/ordine-email";

const ORDINE_ID = "11111111-1111-1111-1111-111111111111";
const NEGOZIO_ID = "22222222-2222-2222-2222-222222222222";
const CLIENTE_ID = "33333333-3333-3333-3333-333333333333";
const MERCHANT_ID = "44444444-4444-4444-4444-444444444444";
const RECLAMO_ID = "55555555-5555-5555-5555-555555555555";

function messaggioRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    reclamo_id: RECLAMO_ID,
    mittente: "venditore",
    mittente_nome: "Negozio QA",
    corpo: "Stiamo verificando, grazie per la segnalazione.",
    letto_at: null,
    created_at: "2026-08-10T12:00:00.000Z",
    ...over,
  };
}

/** FakeQuery: risponde a from("...").select().eq().maybeSingle()/order(). */
class FakeQuery {
  result: unknown;
  constructor(result: unknown) {
    this.result = result;
  }
  select() {
    return this;
  }
  eq() {
    return this;
  }
  in() {
    return this;
  }
  order() {
    return this;
  }
  maybeSingle() {
    return { data: this.result, error: null };
  }
  single() {
    return { data: this.result, error: null };
  }
  then(resolve: (value: { data: unknown; error: null }) => void) {
    resolve({ data: this.result, error: null });
  }
}

/** DB FAKE per tabella: ogni tabella restituisce il proprio dato. */
function fakeDbPerTabella(map: Record<string, unknown>) {
  return {
    from(tabella: string) {
      return new FakeQuery(map[tabella] ?? null);
    },
  };
}

/** Fetch FAKE per ntfy: registra le chiamate e risponde 200. */
function fakeFetch(registro: Array<{ url: string; title: string; body: string }>) {
  return async (input: URL | RequestInfo, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = new TextDecoder().decode(init?.body as Uint8Array);
    registro.push({
      url: String(input),
      title: headers["X-Title"] ?? "",
      body,
    });
    return new Response(JSON.stringify({ id: "msg-test" }), { status: 200 });
  };
}

const saveEnv: Record<string, string | undefined> = {};
function setNtfyEnv() {
  saveEnv.NTFY_ENABLED = process.env.NTFY_ENABLED;
  saveEnv.NTFY_SERVER_URL = process.env.NTFY_SERVER_URL;
  saveEnv.NTFY_ORDERS_TOPIC = process.env.NTFY_ORDERS_TOPIC;
  process.env.NTFY_ENABLED = "true";
  process.env.NTFY_SERVER_URL = "https://ntfy.sh";
  process.env.NTFY_ORDERS_TOPIC = "incitta-ordini-test";
}
function restoreEnv() {
  for (const [k, v] of Object.entries(saveEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

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

  // ── T1: validaCorpoMessaggio ────────────────────────────────────────────────
  console.log("\n[T1] validaCorpoMessaggio");
  check("testo valido", validaCorpoMessaggio("  ciao  ") === "ciao");
  check("spazi → null", validaCorpoMessaggio("   ") === null);
  check("non stringa → null", validaCorpoMessaggio(123) === null);
  check("troppo lungo → troncato", (validaCorpoMessaggio("x".repeat(5000)) ?? "").length === 2000);

  // ── T2: aggiungiMessaggioVenditore — successo + email con corpo ────────────
  console.log("\n[T2] Venditore scrive — successo + email best-effort");
  setNtfyEnv();
  {
    const chiamateRpc: Array<{ fn: string; params: Record<string, unknown> }> = [];
    const emailInviate: Array<{ reclamoId: string; corpo: string }> = [];
    const esito = await aggiungiMessaggioVenditore(
      MERCHANT_ID, NEGOZIO_ID, RECLAMO_ID, "Stiamo verificando, grazie.",
      {
        puòGestire: true,
        rpc: async (fn, params) => {
          chiamateRpc.push({ fn, params });
          return { data: { ok: true, messaggio: messaggioRow() }, error: null };
        },
        inviaEmail: async (reclamoId, corpo) => {
          emailInviate.push({ reclamoId, corpo });
          return { stato: "sent", motivo: "" };
        },
      }
    );
    check("ok = true", esito.ok === true, JSON.stringify(esito));
    if (esito.ok) {
      check("messaggio mappato (mittente venditore)", esito.messaggio.mittente === "venditore");
      check("messaggio mappato (corpo)", esito.messaggio.corpo.includes("verificando"));
      check("RPC chiamata con merchant della sessione", chiamateRpc[0]?.params.p_merchant_user_id === MERCHANT_ID);
      check("email inviata al salvataggio", emailInviate.length === 1, String(emailInviate.length));
      check("email con il CORPO del messaggio", emailInviate[0]?.corpo.includes("verificando"));
    }
  }

  // ── T3: venditore — email KO → messaggio comunque ok ────────────────────────
  console.log("\n[T3] Venditore scrive — email KO → messaggio comunque salvato");
  {
    const esito = await aggiungiMessaggioVenditore(
      MERCHANT_ID, NEGOZIO_ID, RECLAMO_ID, "Messaggio di prova",
      {
        puòGestire: true,
        rpc: async () => ({ data: { ok: true, messaggio: messaggioRow() }, error: null }),
        inviaEmail: async () => {
          throw new Error("Resend down");
        },
      }
    );
    check("ok = true (messaggio salvato nonostante email KO)", esito.ok === true, JSON.stringify(esito));
  }

  // ── T4: venditore — ownership rifiutata → 403, RPC non chiamata ────────────
  console.log("\n[T4] Venditore — ownership rifiutata");
  {
    let rpcChiamata = false;
    const esito = await aggiungiMessaggioVenditore(
      MERCHANT_ID, NEGOZIO_ID, RECLAMO_ID, "Messaggio",
      {
        puòGestire: false,
        rpc: async () => {
          rpcChiamata = true;
          return { data: null, error: null };
        },
      }
    );
    check("ok = false", esito.ok === false);
    if (!esito.ok) check("codice = FORBIDDEN (403)", esito.codice === "FORBIDDEN" && esito.status === 403);
    check("RPC NON chiamata", !rpcChiamata);
  }

  // ── T5: venditore — corpo vuoto → 422 ───────────────────────────────────────
  console.log("\n[T5] Venditore — corpo vuoto → VALIDATION_ERROR");
  {
    let rpcChiamata = false;
    const esito = await aggiungiMessaggioVenditore(
      MERCHANT_ID, NEGOZIO_ID, RECLAMO_ID, "   ",
      {
        puòGestire: true,
        rpc: async () => {
          rpcChiamata = true;
          return { data: null, error: null };
        },
      }
    );
    check("ok = false", esito.ok === false);
    if (!esito.ok) check("codice = VALIDATION_ERROR (422)", esito.codice === "VALIDATION_ERROR" && esito.status === 422);
    check("RPC NON chiamata", !rpcChiamata);
  }

  // ── T6: venditore — reclamo chiuso → 409 mappato ───────────────────────────
  console.log("\n[T6] Venditore — reclamo chiuso → RECLAMO_CHIUSO (409)");
  {
    const esito = await aggiungiMessaggioVenditore(
      MERCHANT_ID, NEGOZIO_ID, RECLAMO_ID, "Messaggio",
      {
        puòGestire: true,
        rpc: async () => ({
          data: { ok: false, codice: "RECLAMO_CHIUSO", messaggio: "Il reclamo è chiuso." },
          error: null,
        }),
      }
    );
    check("ok = false", esito.ok === false);
    if (!esito.ok) check("status = 409", esito.status === 409);
  }

  // ── T7: cliente — successo + ntfy COMPLETO al venditore ────────────────────
  console.log("\n[T7] Cliente risponde — successo + ntfy completo al venditore");
  {
    const registroFetch: Array<{ url: string; title: string; body: string }> = [];
    const emailVenditore: Array<{ reclamoId: string; corpo: string }> = [];
    const esito = await aggiungiMessaggioCliente(
      CLIENTE_ID, RECLAMO_ID, "Sì, aspetto conferma",
      {
        rpc: async () => ({ data: { ok: true, messaggio: messaggioRow({ mittente: "cliente", mittente_nome: "Mario Rossi", corpo: "Sì, aspetto conferma" }) }, error: null }),
        db: fakeDbPerTabella({
          ordine_reclami: { id: RECLAMO_ID, ordine_id: ORDINE_ID, negozio_id: NEGOZIO_ID, cliente_nome: "Mario Rossi", cliente_email: "mario@example.it" },
          ordini: { numero: "LH-000043", negozio_nome: "Salus Farma" },
          ordini_righe: [
            { prodotto_id: 12, nome_prodotto: "Integratore Vitamina C" },
          ],
          prodotti: [{ id: 12, slug: "integratore-vitamina-c" }],
        }),
        fetchImpl: fakeFetch(registroFetch),
        inviaEmailRisposta: async (reclamoId, corpo) => {
          emailVenditore.push({ reclamoId, corpo });
          return { stato: "sent", motivo: "" };
        },
      }
    );
    check("ok = true", esito.ok === true, JSON.stringify(esito));
    if (esito.ok) check("mittente = cliente", esito.messaggio.mittente === "cliente");
    check("notifica ntfy inviata", registroFetch.length === 1, String(registroFetch.length));
    check("notifica verso topic venditore", registroFetch[0]?.url.includes("incitta-ordini-test"));
    check("notifica NON è generica (intestazione richiesta)", registroFetch[0]?.body.includes("RISPOSTA RECLAMO — InCittà"));
    check("notifica con NOME CLIENTE", registroFetch[0]?.body.includes("Cliente: Mario Rossi"));
    check("notifica con CODICE ORDINE #LH", registroFetch[0]?.body.includes("Ordine: #LH-000043"));
    check("notifica con CODICE ARTICOLO (prodotto_id, non UUID)", registroFetch[0]?.body.includes("Articolo: 12"));
    check("notifica con NOME PRODOTTO", registroFetch[0]?.body.includes("Prodotto: Integratore Vitamina C"));
    check("notifica con la risposta del cliente", registroFetch[0]?.body.includes("Sì, aspetto conferma"));
    check("notifica con LINK ANNUNCIO pubblico", registroFetch[0]?.body.includes("/prodotto/integratore-vitamina-c"));
    check("notifica con LINK GESTIONE RECLAMO venditore", registroFetch[0]?.body.includes(`/merchant/${NEGOZIO_ID}/ordini/${ORDINE_ID}`));
    check("nessuna doppia slash", !registroFetch[0]?.body.includes("/merchant//ordini/"));
    check("nessun UUID come numero/codice", !registroFetch[0]?.body.includes(RECLAMO_ID));
    check("EMAIL al venditore inviata", emailVenditore.length === 1, String(emailVenditore.length));
    check("email al venditore con il corpo della risposta", emailVenditore[0]?.corpo.includes("aspetto conferma"));
  }

  // ── T7b: cliente — mappaMessaggio gestisce anche chiavi camelCase (RPC) ────
  console.log("\n[T7b] Cliente risponde — messaggio mappato da RPC (camelCase)");
  {
    const esito = await aggiungiMessaggioCliente(
      CLIENTE_ID, RECLAMO_ID, "Risposta",
      {
        rpc: async () => ({
          data: {
            ok: true,
            messaggio: {
              id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
              reclamoId: RECLAMO_ID,
              mittente: "cliente",
              mittenteNome: "Mario Rossi",
              corpo: "Risposta dal camelCase",
              lettoAt: null,
              createdAt: "2026-08-10T12:00:00.000Z",
            },
          },
          error: null,
        }),
        db: fakeDbPerTabella({
          ordine_reclami: { id: RECLAMO_ID, ordine_id: ORDINE_ID, negozio_id: NEGOZIO_ID },
          ordini: { numero: "LH-000043", negozio_nome: "Salus Farma" },
        }),
        fetchImpl: fakeFetch([]),
      }
    );
    check("ok = true", esito.ok === true, JSON.stringify(esito));
    if (esito.ok) {
      check("reclamoId valorizzato da chiave camelCase", esito.messaggio.reclamoId === RECLAMO_ID);
      check("mittenteNome valorizzato da chiave camelCase", esito.messaggio.mittenteNome === "Mario Rossi");
      check("createdAt valorizzato da chiave camelCase", esito.messaggio.createdAt.includes("2026-08-10"));
      check("corpo valorizzato", esito.messaggio.corpo.includes("camelCase"));
    }
  }

  // ── T8: cliente — ntfy KO → messaggio comunque salvato ─────────────────────
  console.log("\n[T8] Cliente risponde — ntfy KO → messaggio comunque salvato");
  {
    const esito = await aggiungiMessaggioCliente(
      CLIENTE_ID, RECLAMO_ID, "Risposta",
      {
        rpc: async () => ({ data: { ok: true, messaggio: messaggioRow({ mittente: "cliente" }) }, error: null }),
        db: {
          from() {
            throw new Error("db down");
          },
        },
        fetchImpl: async () => {
          throw new Error("rete down");
        },
      }
    );
    check("ok = true nonostante ntfy KO", esito.ok === true, JSON.stringify(esito));
  }

  // ── T8b: cliente — EMAIL al venditore KO → messaggio comunque salvato ──────
  console.log("\n[T8b] Cliente risponde — EMAIL venditore KO → messaggio comunque salvato");
  {
    const esito = await aggiungiMessaggioCliente(
      CLIENTE_ID, RECLAMO_ID, "Risposta",
      {
        rpc: async () => ({ data: { ok: true, messaggio: messaggioRow({ mittente: "cliente" }) }, error: null }),
        db: fakeDbPerTabella({
          ordine_reclami: { id: RECLAMO_ID, ordine_id: ORDINE_ID, negozio_id: NEGOZIO_ID },
          ordini: { numero: "LH-000043", negozio_nome: "Salus Farma" },
        }),
        fetchImpl: async () => new Response(JSON.stringify({ id: "x" }), { status: 200 }),
        inviaEmailRisposta: async () => {
          throw new Error("Resend down");
        },
      }
    );
    check("ok = true nonostante email venditore KO", esito.ok === true, JSON.stringify(esito));
  }

  // ── T9: getMessaggiReclamoCliente — reclamo NON proprio → [] ───────────────
  console.log("\n[T9] Lettura cliente — reclamo di altro cliente → []");
  {
    // getReclamiOrdineCliente restituisce [] → nessun messaggio esposto.
    const lista = await getMessaggiReclamoCliente(CLIENTE_ID, ORDINE_ID, RECLAMO_ID, {
      from(tabella: string) {
        if (tabella === "ordine_reclami") return new FakeQuery([]);
        return new FakeQuery([]);
      },
    } as never);
    check("lista vuota", lista.length === 0);
  }

  // ── T10: getMessaggiReclamoCliente — proprio → lista mappata ───────────────
  console.log("\n[T10] Lettura cliente — reclamo proprio → lista mappata");
  {
    const lista = await getMessaggiReclamoCliente(CLIENTE_ID, ORDINE_ID, RECLAMO_ID, {
      from(tabella: string) {
        if (tabella === "ordine_reclami") return new FakeQuery([{ id: RECLAMO_ID, ordine_id: ORDINE_ID, negozio_id: NEGOZIO_ID, cliente_user_id: CLIENTE_ID, cliente_nome: "Mario Rossi", cliente_email: "mario@example.it", cliente_telefono: null, tipo: "ordine_non_arrivato", messaggio: "Non è arrivato nulla", stato: "aperto", created_at: "2026-08-10T10:00:00.000Z", updated_at: "2026-08-10T10:00:00.000Z", gestito_at: null, gestito_da: null, gestito_nota: null }]);
        return new FakeQuery([messaggioRow(), messaggioRow({ id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", mittente: "cliente", mittente_nome: "Mario Rossi" })]);
      },
    } as never);
    check("2 messaggi", lista.length === 2, String(lista.length));
    check("ordinati per created_at (asc)", lista[0]?.mittente === "venditore" && lista[1]?.mittente === "cliente");
  }

  // ── T11: getMessaggiReclamoVenditore — ownership false → [] ────────────────
  console.log("\n[T11] Lettura venditore — ownership false → []");
  {
    const lista = await getMessaggiReclamoVenditore(MERCHANT_ID, NEGOZIO_ID, RECLAMO_ID, { puòGestire: false });
    check("lista vuota", lista.length === 0);
  }

  // ── T12: getMessaggiReclamoVenditore — reclamo di altro negozio → [] ───────
  console.log("\n[T12] Lettura venditore — reclamo di ALTRO negozio → []");
  {
    const lista = await getMessaggiReclamoVenditore(MERCHANT_ID, NEGOZIO_ID, RECLAMO_ID, {
      puòGestire: true,
      client: fakeDbPerTabella({ ordine_reclami: null, reclamo_comunicazioni: [messaggioRow()] }),
    });
    check("lista vuota (reclamo non del negozio)", lista.length === 0);
  }

  // ── T13: getMessaggiReclamoVenditore — ok → lista mappata ──────────────────
  console.log("\n[T13] Lettura venditore — ok → lista mappata");
  {
    const lista = await getMessaggiReclamoVenditore(MERCHANT_ID, NEGOZIO_ID, RECLAMO_ID, {
      puòGestire: true,
      client: fakeDbPerTabella({
        ordine_reclami: { id: RECLAMO_ID },
        reclamo_comunicazioni: [messaggioRow()],
      }),
    });
    check("1 messaggio", lista.length === 1, String(lista.length));
    check("mittente mappato", lista[0]?.mittente === "venditore");
    check("corpo mappato", lista[0]?.corpo.includes("verificando"));
  }

  // ── T14: email — oggetto e HTML COMPLETI (prodotto, codice, CTA) ───────────
  console.log("\n[T14] Email messaggio reclamo (oggetto + HTML completi)");
  {
    const oggetto = costruisciOggettoMessaggioReclamo("LH-000043", "Salus Farma");
    check("oggetto con numero ordine #LH", oggetto.includes("Ordine #LH-000043"));
    check("oggetto con negozio", oggetto.includes("Salus Farma"));
    check("oggetto parla del RECLAMO", oggetto.toLowerCase().includes("reclamo"));

    const html = costruisciHtmlMessaggioReclamo({
      reclamoId: RECLAMO_ID,
      ordineId: ORDINE_ID,
      numero: "LH-000043",
      negozioNome: "Salus Farma",
      clienteEmail: "mario@example.it",
      clienteNome: "Mario",
      mittenteNome: "Il negozio",
      corpo: "Stiamo verificando, grazie.",
      createdAt: "2026-08-10T12:00:00.000Z",
      prodotti: [
        { nomeProdotto: "Integratore Vitamina C", codiceArticolo: "12", urlAnnuncio: "https://www.incitta.online/prodotto/integratore-vitamina-c" },
      ],
      linkReclamo: `https://www.incitta.online/cliente/ordini/${ORDINE_ID}`,
    });
    check("html contiene il numero ordine #LH", html.includes("Ordine #LH-000043"));
    check("html contiene il corpo del messaggio", html.includes("Stiamo verificando, grazie."));
    check("html contiene il negozio", html.includes("Salus Farma"));
    check("html contiene il NOME PRODOTTO", html.includes("Integratore Vitamina C"));
    check("html contiene il CODICE ARTICOLO", html.includes("Codice articolo: 12"));
    check("html contiene il LINK ANNUNCIO pubblico", html.includes("/prodotto/integratore-vitamina-c"));
    check("html contiene il pulsante APRI IL RECLAMO", html.includes("APRI IL RECLAMO"));
    check("html contiene il link alla conversazione cliente", html.includes(`/cliente/ordini/${ORDINE_ID}`));
    check("html NON contiene l'UUID come numero", !html.includes(RECLAMO_ID));
  }

  // ── T14b: email — HTML con prodotti MULTIPLI (nessun dato nascosto) ────────
  console.log("\n[T14b] Email messaggio reclamo — più prodotti nell'ordine");
  {
    const html = costruisciHtmlMessaggioReclamo({
      reclamoId: RECLAMO_ID,
      ordineId: ORDINE_ID,
      numero: "LH-000043",
      negozioNome: "Salus Farma",
      clienteEmail: "mario@example.it",
      clienteNome: "Mario",
      mittenteNome: "Il negozio",
      corpo: "Stiamo verificando, grazie.",
      createdAt: "2026-08-10T12:00:00.000Z",
      prodotti: [
        { nomeProdotto: "Integratore Vitamina C", codiceArticolo: "12", urlAnnuncio: null },
        { nomeProdotto: "Omega 3", codiceArticolo: "15", urlAnnuncio: null },
      ],
      linkReclamo: `https://www.incitta.online/cliente/ordini/${ORDINE_ID}`,
    });
    check("html contiene il primo prodotto", html.includes("Integratore Vitamina C"));
    check("html contiene anche il secondo prodotto", html.includes("Omega 3"));
    check("html contiene il codice del secondo prodotto", html.includes("Codice articolo: 15"));
    check("html gestisce annuncio assente senza URL inventati", html.includes("Annuncio non disponibile") && !html.includes("/prodotto/null"));
  }

  // ── T15: email risposta cliente → VENDITORE (oggetto + HTML) ───────────────
  console.log("\n[T15] Email risposta cliente → VENDITORE (oggetto + HTML)");
  {
    const oggetto = costruisciOggettoRispostaClienteVenditore("LH-000043", "Salus Farma");
    check("oggetto con numero", oggetto.includes("LH-000043"));
    check("oggetto con negozio", oggetto.includes("Salus Farma"));
    check("oggetto indica la risposta del cliente", oggetto.toLowerCase().includes("cliente ha risposto"));

    const html = costruisciHtmlRispostaClienteVenditore({
      reclamoId: RECLAMO_ID,
      ordineId: ORDINE_ID,
      negozioId: NEGOZIO_ID,
      numero: "LH-000043",
      negozioNome: "Salus Farma",
      venditoreEmail: "negozio@salusfarma.it",
      clienteNome: "Mario Rossi",
      corpo: "Sì, aspetto conferma",
      createdAt: "2026-08-10T12:00:00.000Z",
      prodotti: [
        { nomeProdotto: "Integratore Vitamina C", codiceArticolo: "12", urlAnnuncio: "https://www.incitta.online/prodotto/integratore-vitamina-c" },
      ],
    });
    check("html contiene il numero ordine #LH", html.includes("Ordine #LH-000043"));
    check("html contiene il negozio", html.includes("Salus Farma"));
    check("html contiene la risposta del cliente", html.includes("Sì, aspetto conferma"));
    check("html contiene il nome del cliente", html.includes("Mario Rossi"));
    check("html contiene il NOME PRODOTTO", html.includes("Integratore Vitamina C"));
    check("html contiene il CODICE ARTICOLO", html.includes("Codice articolo: 12"));
    check("html contiene il LINK ANNUNCIO", html.includes("/prodotto/integratore-vitamina-c"));
    check("html contiene il link alla console venditore", html.includes(`/merchant/${NEGOZIO_ID}/ordini/${ORDINE_ID}`));
    check("html NON contiene l'UUID come numero", !html.includes(RECLAMO_ID));
    check("nessuna doppia slash nel link", !html.includes("/merchant//ordini/"));
  }

  // ── T14c: loader EMAIL al cliente — dati COMPLETI dal DB (fake) ────────────
  console.log("\n[T14c] inviaEmailMessaggioReclamo — loader con prodotto + link reclamo");
  {
    const datiRicevuti: Array<Record<string, unknown>> = [];
    const esito = await inviaEmailMessaggioReclamo(RECLAMO_ID, "Stiamo verificando, grazie.", "Salus Farma", {
      db: fakeDbPerTabella({
        ordine_reclami: { id: RECLAMO_ID, ordine_id: ORDINE_ID, negozio_id: NEGOZIO_ID, cliente_nome: "Mario Rossi", cliente_email: "mario@example.it" },
        ordini: { numero: "LH-000043", negozio_nome: "Salus Farma" },
        ordini_righe: [{ prodotto_id: 12, nome_prodotto: "Integratore Vitamina C" }],
        prodotti: [{ id: 12, slug: "integratore-vitamina-c" }],
      }),
      invia: async (dati) => {
        datiRicevuti.push(dati as unknown as Record<string, unknown>);
      },
    });
    check("T14c stato = sent", esito.stato === "sent", JSON.stringify(esito));
    check("T14c destinatario = email cliente", datiRicevuti[0]?.clienteEmail === "mario@example.it");
    check("T14c numero ordine dal DB", datiRicevuti[0]?.numero === "LH-000043");
    check("T14c link reclamo = pagina cliente", String(datiRicevuti[0]?.linkReclamo ?? "").includes(`/cliente/ordini/${ORDINE_ID}`));
    check("T14c prodotto con nome dal DB", String(JSON.stringify(datiRicevuti[0]?.prodotti ?? "")).includes("Integratore Vitamina C"));
    check("T14c prodotto con codice articolo dal DB", String(JSON.stringify(datiRicevuti[0]?.prodotti ?? "")).includes('"codiceArticolo":"12"'));
    check("T14c prodotto con link annuncio dal DB", String(JSON.stringify(datiRicevuti[0]?.prodotti ?? "")).includes("/prodotto/integratore-vitamina-c"));

    // Email KO → stato error, MAI throw (il messaggio resta salvato).
    const esitoErr = await inviaEmailMessaggioReclamo(RECLAMO_ID, "Test", undefined, {
      db: fakeDbPerTabella({
        ordine_reclami: { id: RECLAMO_ID, ordine_id: ORDINE_ID, negozio_id: NEGOZIO_ID, cliente_nome: "Mario Rossi", cliente_email: "mario@example.it" },
        ordini: { numero: "LH-000043", negozio_nome: "Salus Farma" },
      }),
      invia: async () => {
        throw new Error("Resend down");
      },
    });
    check("T14c email KO → stato error senza throw", esitoErr.stato === "error", JSON.stringify(esitoErr));
  }

  // ── T14d: builder puro ntfy risposta cliente (formato richiesto) ───────────
  console.log("\n[T14d] costruisciMessaggioRispostaClienteNtfy — formato richiesto");
  {
    const corpo = costruisciMessaggioRispostaClienteNtfy({
      numero: "LH-000043",
      clienteNome: "Mario Rossi",
      corpo: "Sì, aspetto conferma",
      dataOra: "10/08/2026 12:00",
      prodotti: [
        { codiceArticolo: "12", nomeProdotto: "Integratore Vitamina C", urlAnnuncio: "https://www.incitta.online/prodotto/integratore-vitamina-c" },
      ],
      linkReclamo: `https://www.incitta.online/merchant/${NEGOZIO_ID}/ordini/${ORDINE_ID}`,
    } as DatiRispostaClienteNtfy);
    check("ntfy intestazione richiesta", corpo.includes("🔴 RISPOSTA RECLAMO — InCittà"));
    check("ntfy nome cliente", corpo.includes("Cliente: Mario Rossi"));
    check("ntfy codice ordine #LH", corpo.includes("Ordine: #LH-000043"));
    check("ntfy codice articolo", corpo.includes("Articolo: 12"));
    check("ntfy nome prodotto", corpo.includes("Prodotto: Integratore Vitamina C"));
    check("ntfy messaggio", corpo.includes('"Sì, aspetto conferma"'));
    check("ntfy link annuncio", corpo.includes("/prodotto/integratore-vitamina-c"));
    check("ntfy link reclamo", corpo.includes(`/merchant/${NEGOZIO_ID}/ordini/${ORDINE_ID}`));
    check("ntfy nessun UUID", !corpo.includes(RECLAMO_ID));
  }

  // ── T16: loader email risposta → venditore (catena auth.users → email_negozio)
  console.log("\n[T16] Loader email risposta → VENDITORE (catena fallback)");
  {
    // T16a: owner trovato in auth.users → invia all'email dell'owner
    const inviateA: string[] = [];
    const esitoA = await inviaEmailRispostaClienteReclamo(RECLAMO_ID, "Risposta test", "Mario Rossi", {
      db: fakeDbPerTabella({
        ordine_reclami: { id: RECLAMO_ID, ordine_id: ORDINE_ID, negozio_id: NEGOZIO_ID, cliente_nome: "Mario Rossi" },
        ordini: { numero: "LH-000043", negozio_nome: "Salus Farma" },
        negozi: { owner_user_id: MERCHANT_ID, email_negozio: "info@salusfarma.it" },
        "auth.users": { email: "owner@salusfarma.it" },
      }),
      invia: async (dati) => {
        inviateA.push(dati.venditoreEmail);
      },
    });
    check("T16a stato = sent", esitoA.stato === "sent", JSON.stringify(esitoA));
    check("T16a destinatario = email OWNER (auth.users)", inviateA.length === 1 && inviateA[0] === "owner@salusfarma.it", String(inviateA));

    // T16b: owner assente → fallback email_negozio
    const inviateB: string[] = [];
    const esitoB = await inviaEmailRispostaClienteReclamo(RECLAMO_ID, "Risposta test", undefined, {
      db: fakeDbPerTabella({
        ordine_reclami: { id: RECLAMO_ID, ordine_id: ORDINE_ID, negozio_id: NEGOZIO_ID, cliente_nome: "Mario Rossi" },
        ordini: { numero: "LH-000043", negozio_nome: "Salus Farma" },
        negozi: { owner_user_id: null, email_negozio: "info@salusfarma.it" },
        "auth.users": null,
      }),
      invia: async (dati) => {
        inviateB.push(dati.venditoreEmail);
      },
    });
    check("T16b stato = sent", esitoB.stato === "sent", JSON.stringify(esitoB));
    check("T16b destinatario = fallback email_negozio", inviateB.length === 1 && inviateB[0] === "info@salusfarma.it", String(inviateB));

    // T16c: email venditore assente → skipped (mai un errore)
    const esitoC = await inviaEmailRispostaClienteReclamo(RECLAMO_ID, "Risposta test", undefined, {
      db: fakeDbPerTabella({
        ordine_reclami: { id: RECLAMO_ID, ordine_id: ORDINE_ID, negozio_id: NEGOZIO_ID, cliente_nome: "Mario Rossi" },
        ordini: { numero: "LH-000043", negozio_nome: "Salus Farma" },
        negozi: { owner_user_id: null, email_negozio: null },
        "auth.users": null,
      }),
    });
    check("T16c stato = skipped (email assente)", esitoC.stato === "skipped" && esitoC.motivo === "email_assente", JSON.stringify(esitoC));

    // T16d: invio Resend KO → error, MAI throw
    const esitoD = await inviaEmailRispostaClienteReclamo(RECLAMO_ID, "Risposta test", "Mario Rossi", {
      db: fakeDbPerTabella({
        ordine_reclami: { id: RECLAMO_ID, ordine_id: ORDINE_ID, negozio_id: NEGOZIO_ID, cliente_nome: "Mario Rossi" },
        ordini: { numero: "LH-000043", negozio_nome: "Salus Farma" },
        negozi: { owner_user_id: MERCHANT_ID, email_negozio: "info@salusfarma.it" },
        "auth.users": { email: "owner@salusfarma.it" },
      }),
      invia: async () => {
        throw new Error("Resend down");
      },
    });
    check("T16d stato = error (Resend KO), nessun throw", esitoD.stato === "error", JSON.stringify(esitoD));
  }

  restoreEnv();

  // ── Riepilogo ────────────────────────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`ORDINE RECLAMI MESSAGGI TEST: ${passati} passati, ${falliti} falliti`);
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
