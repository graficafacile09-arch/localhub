/**
 * Test RECLAMI ORDINE — NESSUNA chiamata reale a Supabase/ntfy/Resend.
 *
 * Esegue i test su lib/ordine-reclami.ts con RPC/db/fetch FAKE:
 *   - macchina a stati (transizioni + azioni venditore);
 *   - creaReclamoOrdine: successo, duplicato (giaEsistente), RPC business
 *     error (FORBIDDEN), errore infrastrutturale (SAVE_FAILED);
 *   - aggiornaStatoReclamoVenditore: ownership rifiutata, transizione
 *     non consentita, successo, no-op stesso stato;
 *   - getReclamiVenditore: ownership false → [], true → lista mappata;
 *   - notificaReclamoNtfy: topic venditore + topic admin (se configurato),
 *     MAI throw (best-effort).
 *
 * Esecuzione: npx tsx scripts/test-ordine-reclami.ts
 */

import {
  aggiornaStatoReclamoVenditore,
  azioniReclamoDisponibili,
  costruisciMessaggioReclamoNtfy,
  creaReclamoOrdine,
  ETICHETTA_TIPO_RECLAMO,
  ETICHETTE_STATO_RECLAMO,
  formattaDataOraReclamo,
  getReclamiVenditore,
  notificaReclamoNtfy,
  transizioneReclamoConsentita,
  type ReclamoOrdine,
  type StatoReclamo,
} from "../lib/ordine-reclami";

const ORDINE_ID = "11111111-1111-1111-1111-111111111111";
const NEGOZIO_ID = "22222222-2222-2222-2222-222222222222";
const CLIENTE_ID = "33333333-3333-3333-3333-333333333333";
const MERCHANT_ID = "44444444-4444-4444-4444-444444444444";
const RECLAMO_ID = "55555555-5555-5555-5555-555555555555";

function reclamoRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: RECLAMO_ID,
    ordine_id: ORDINE_ID,
    negozio_id: NEGOZIO_ID,
    cliente_user_id: CLIENTE_ID,
    cliente_nome: "Mario Rossi",
    cliente_email: "mario@example.it",
    cliente_telefono: "3331234567",
    tipo: "ordine_non_arrivato",
    messaggio: "Non è arrivato nulla",
    stato: "aperto",
    created_at: "2026-08-10T10:00:00.000Z",
    updated_at: "2026-08-10T10:00:00.000Z",
    gestito_at: null,
    gestito_da: null,
    gestito_nota: null,
    ...over,
  };
}

/** FakeQuery: risponde a from("...").select().eq().in().order() per le letture. */
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
    return { data: this.result, error: null };
  }
  then(resolve: (value: { data: unknown; error: null }) => void) {
    resolve({ data: this.result, error: null });
  }
}

/** DB FAKE per le letture (from → FakeQuery). */
function fakeDb(righe: unknown[]) {
  return {
    from(tabella: string) {
      return new FakeQuery(righe);
    },
  };
}

/** DB FAKE per le notifiche: ordini → singolo oggetto (maybeSingle). */
function fakeDbOrdine(ordine: Record<string, unknown> | null) {
  return {
    from(tabella: string) {
      if (tabella === "ordini") return new FakeQuery(ordine);
      return new FakeQuery([]);
    },
  };
}

/** Ordine tipico per le notifiche (numero leggibile, stato, cliente). */
function ordineNotifica(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    numero: "LH-000043",
    negozio_nome: "Salus Farma",
    stato: "in_preparazione",
    annullato_motivo: null,
    annullato_nota: null,
    cliente_nome: "Mario",
    cliente_cognome: "Rossi",
    ...over,
  };
}

/** Fetch FAKE per ntfy: registra le chiamate (url, title, body) e risponde 200. */
function fakeFetch(registro: Array<{ url: string; title: string; tags: string; body: string }>) {
  return async (input: URL | RequestInfo, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = new TextDecoder().decode(init?.body as Uint8Array);
    registro.push({
      url: String(input),
      title: headers["X-Title"] ?? "",
      tags: headers["X-Tags"] ?? "",
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
  saveEnv.NTFY_ADMIN_TOPIC = process.env.NTFY_ADMIN_TOPIC;
  process.env.NTFY_ENABLED = "true";
  process.env.NTFY_SERVER_URL = "https://ntfy.sh";
  process.env.NTFY_ORDERS_TOPIC = "incitta-ordini-test";
  delete process.env.NTFY_ADMIN_TOPIC;
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

  // ── T1: macchina a stati ─────────────────────────────────────────────────────
  console.log("\n[T1] Macchina a stati reclamo");
  check("aperto → in_gestione", transizioneReclamoConsentita("aperto", "in_gestione"));
  check("aperto → risolto", transizioneReclamoConsentita("aperto", "risolto"));
  check("aperto → chiuso", transizioneReclamoConsentita("aperto", "chiuso"));
  check("in_gestione → risolto", transizioneReclamoConsentita("in_gestione", "risolto"));
  check("in_gestione → chiuso", transizioneReclamoConsentita("in_gestione", "chiuso"));
  check("risolto → chiuso", transizioneReclamoConsentita("risolto", "chiuso"));
  check("stesso stato → no-op consentito", transizioneReclamoConsentita("chiuso", "chiuso"));
  check("chiuso → aperto NON consentito", !transizioneReclamoConsentita("chiuso", "aperto"));
  check("risolto → in_gestione NON consentito", !transizioneReclamoConsentita("risolto", "in_gestione"));
  check("chiuso → risolto NON consentito", !transizioneReclamoConsentita("chiuso", "risolto"));
  check("aperto → aperto no-op", transizioneReclamoConsentita("aperto", "aperto"));

  const azioniAperto = azioniReclamoDisponibili("aperto");
  check("aperto → 3 azioni", azioniAperto.length === 3, String(azioniAperto.length));
  check("aperto → 'Prendi in carico'", azioniAperto.some((a) => a.stato === "in_gestione"));
  check("chiuso → nessuna azione", azioniReclamoDisponibili("chiuso").length === 0);

  // ── T2: creaReclamoOrdine — successo ─────────────────────────────────────────
  console.log("\n[T2] Crea reclamo con successo (RPC ok)");
  setNtfyEnv();
  {
    const chiamateRpc: Array<{ fn: string; params: Record<string, unknown> }> = [];
    const registroFetch: Array<{ url: string; title: string; tags: string; body: string }> = [];
    const esito = await creaReclamoOrdine(CLIENTE_ID, ORDINE_ID, { messaggio: "Non è arrivato nulla" }, {
      rpc: async (fn, params) => {
        chiamateRpc.push({ fn, params });
        return { data: { ok: true, giaEsistente: false, reclamo: reclamoRow() }, error: null };
      },
      db: fakeDbOrdine(ordineNotifica()),
      fetchImpl: fakeFetch(registroFetch),
    });
    check("ok = true", esito.ok === true, JSON.stringify(esito));
    if (esito.ok) {
      check("giaEsistente = false", esito.giaEsistente === false);
      check("reclamo mappato (stato aperto)", esito.reclamo.stato === "aperto");
      check("reclamo mappato (tipo)", esito.reclamo.tipo === "ordine_non_arrivato");
      check("reclamo mappato (cliente)", esito.reclamo.clienteNome === "Mario Rossi");
      check("RPC chiamata con cliente_user_id sessione", chiamateRpc[0]?.params.p_cliente_user_id === CLIENTE_ID);
      check("notifica ntfy venditore inviata", registroFetch.length === 1, String(registroFetch.length));
      check("notifica verso topic venditore", registroFetch[0]?.url.includes("incitta-ordini-test"));
      check("notifica ha titolo reclamo", registroFetch[0]?.title.includes("Reclamo ordine #LH-000043"));
      check("notifica contiene RECLAMO ORDINE", registroFetch[0]?.body.includes("🚨 RECLAMO ORDINE #LH-000043"));
      check("notifica contiene negozio", registroFetch[0]?.body.includes("🏪 Negozio: Salus Farma"));
      check("notifica contiene cliente", registroFetch[0]?.body.includes("👤 Cliente: Mario Rossi"));
      check("notifica contiene stato ordine", registroFetch[0]?.body.includes("⚠️ Stato ordine: Nuovo"));
      check("notifica contiene data reclamo", registroFetch[0]?.body.includes("📅 Data: 10/08/2026"));
      check("notifica contiene messaggio", registroFetch[0]?.body.includes("📝 Problema: Non è arrivato nulla"));
      check("notifica contiene link gestione", registroFetch[0]?.body.includes("🔗 Gestisci reclamo:"));
      check("numero ordine LEGGIBILE usato", registroFetch[0]?.body.includes("🚨 RECLAMO ORDINE #LH-000043"));
      check("UUID presenti SOLO nel link (mai come numero ordine)", (registroFetch[0]?.body ?? "").split("\n").filter((l) => l.includes(ORDINE_ID) || l.includes(NEGOZIO_ID)).every((l) => l.trim().startsWith("https://")));
      check("notifica NON contiene riga Tipo", !registroFetch[0]?.body.includes("Tipo:"));
    }
  }

  // ── T3: duplicato → giaEsistente, nessuna seconda notifica ───────────────────
  console.log("\n[T3] Reclamo duplicato → giaEsistente, nessuna notifica");
  {
    const registroFetch: Array<{ url: string; title: string; tags: string; body: string }> = [];
    const esito = await creaReclamoOrdine(CLIENTE_ID, ORDINE_ID, { messaggio: "di nuovo" }, {
      rpc: async () => ({ data: { ok: true, giaEsistente: true, reclamo: reclamoRow() }, error: null }),
      db: fakeDbOrdine(ordineNotifica()),
      fetchImpl: fakeFetch(registroFetch),
    });
    check("ok = true", esito.ok === true);
    if (esito.ok) check("giaEsistente = true", esito.giaEsistente === true);
    check("nessuna notifica duplicata", registroFetch.length === 0, String(registroFetch.length));
  }

  // ── T4: RPC business error → mappato ─────────────────────────────────────────
  console.log("\n[T4] RPC FORBIDDEN → errore mappato");
  {
    const esito = await creaReclamoOrdine(CLIENTE_ID, ORDINE_ID, {}, {
      rpc: async () => ({
        data: { ok: false, codice: "FORBIDDEN", messaggio: "Non puoi segnalare un ordine altrui." },
        error: null,
      }),
    });
    check("ok = false", esito.ok === false);
    if (!esito.ok) {
      check("codice = FORBIDDEN", esito.codice === "FORBIDDEN");
      check("status = 403", esito.status === 403);
    }
  }

  // ── T5: errore infrastrutturale → SAVE_FAILED 500 ────────────────────────────
  console.log("\n[T5] RPC errore infrastrutturale → SAVE_FAILED 500");
  {
    const esito = await creaReclamoOrdine(CLIENTE_ID, ORDINE_ID, {}, {
      rpc: async () => ({ data: null, error: { message: "network down" } }),
    });
    check("ok = false", esito.ok === false);
    if (!esito.ok) check("status = 500", esito.status === 500);
  }

  // ── T6: cambio stato venditore — ownership rifiutata ─────────────────────────
  console.log("\n[T6] Cambio stato reclamo — ownership rifiutata");
  {
    let rpcChiamata = false;
    const esito = await aggiornaStatoReclamoVenditore(
      MERCHANT_ID, NEGOZIO_ID, RECLAMO_ID, "in_gestione", null,
      {
        puòGestire: false,
        rpc: async () => {
          rpcChiamata = true;
          return { data: null, error: null };
        },
      }
    );
    check("ok = false", esito.ok === false);
    if (!esito.ok) check("codice = FORBIDDEN", esito.codice === "FORBIDDEN");
    check("RPC NON chiamata", !rpcChiamata);
  }

  // ── T7: cambio stato — successo ──────────────────────────────────────────────
  console.log("\n[T7] Cambio stato reclamo — successo");
  {
    const esito = await aggiornaStatoReclamoVenditore(
      MERCHANT_ID, NEGOZIO_ID, RECLAMO_ID, "risolto", "Risolto con il cliente",
      {
        puòGestire: true,
        rpc: async () => ({
          data: { ok: true, cambiato: true, reclamo: reclamoRow({ stato: "risolto" }) },
          error: null,
        }),
      }
    );
    check("ok = true", esito.ok === true);
    if (esito.ok) {
      check("cambiato = true", esito.cambiato === true);
      check("stato = risolto", esito.reclamo?.stato === "risolto");
    }
  }

  // ── T8: transizione non consentita → 409 ─────────────────────────────────────
  console.log("\n[T8] Transizione non consentita → 409");
  {
    const esito = await aggiornaStatoReclamoVenditore(
      MERCHANT_ID, NEGOZIO_ID, RECLAMO_ID, "aperto", null,
      {
        puòGestire: true,
        rpc: async () => ({
          data: { ok: false, codice: "TRANSIZIONE_NON_CONSENTITA", messaggio: "Transizione non consentita." },
          error: null,
        }),
      }
    );
    check("ok = false", esito.ok === false);
    if (!esito.ok) check("status = 409", esito.status === 409);
  }

  // ── T9: stesso stato → no-op idempotente ─────────────────────────────────────
  console.log("\n[T9] Stesso stato → no-op idempotente");
  {
    const esito = await aggiornaStatoReclamoVenditore(
      MERCHANT_ID, NEGOZIO_ID, RECLAMO_ID, "chiuso", null,
      {
        puòGestire: true,
        rpc: async () => ({ data: { ok: true, cambiato: false, reclamo: reclamoRow({ stato: "chiuso" }) }, error: null }),
      }
    );
    check("ok = true", esito.ok === true);
    if (esito.ok) check("cambiato = false", esito.cambiato === false);
  }

  // ── T10: getReclamiVenditore — ownership false → [] ──────────────────────────
  console.log("\n[T10] Lista reclami venditore — ownership false → []");
  {
    const lista = await getReclamiVenditore(MERCHANT_ID, NEGOZIO_ID, ORDINE_ID, { puòGestire: false });
    check("lista vuota", lista.length === 0);
  }

  // ── T11: getReclamiVenditore — ownership true → lista mappata ────────────────
  console.log("\n[T11] Lista reclami venditore — ownership true");
  {
    const lista = await getReclamiVenditore(MERCHANT_ID, NEGOZIO_ID, ORDINE_ID, {
      puòGestire: true,
      client: fakeDb([reclamoRow(), reclamoRow({ id: "r2", stato: "risolto" })]),
    });
    check("2 reclami", lista.length === 2, String(lista.length));
    check("stati mappati", lista[0]?.stato === "aperto" && lista[1]?.stato === "risolto");
    check("tipo mappato", lista[0]?.tipo === "ordine_non_arrivato");
  }

  // ── T12: costruisciMessaggioReclamoNtfy (formato richiesto) ──────────────────
  console.log("\n[T12] Messaggio ntfy reclamo (formato richiesto)");
  {
    const corpo = costruisciMessaggioReclamoNtfy({
      numero: "LH-000043",
      negozioNome: "Salus Farma",
      clienteNome: "Mario Rossi",
      statoOrdine: "Nuovo",
      motivoAnnullamento: null,
      notaAnnullamento: null,
      dataOra: "10/08/2026 12:00",
      messaggio: "Non è arrivato nulla",
      linkOrdine: "https://www.incitta.online/merchant/x/ordini/y",
    });
    check("contiene 🚨 RECLAMO ORDINE #LH-000043", corpo.includes("🚨 RECLAMO ORDINE #LH-000043"));
    check("contiene 🏪 Negozio", corpo.includes("🏪 Negozio: Salus Farma"));
    check("contiene 👤 Cliente", corpo.includes("👤 Cliente: Mario Rossi"));
    check("contiene ⚠️ Stato ordine", corpo.includes("⚠️ Stato ordine: Nuovo"));
    check("contiene 📝 Problema", corpo.includes("📝 Problema: Non è arrivato nulla"));
    check("contiene 📅 Data", corpo.includes("📅 Data: 10/08/2026 12:00"));
    check("contiene 🔗 Gestisci reclamo su riga dedicata", corpo.includes("🔗 Gestisci reclamo:\nhttps://www.incitta.online/merchant/x/ordini/y"));
    check("NON contiene riga Tipo", !corpo.includes("Tipo:"));
    check("numero leggibile nel titolo (mai UUID)", corpo.includes("#LH-000043") && !corpo.includes(ORDINE_ID));
  }

  // ── T12b: ordine ANNULLATO → stato esplicito + motivo + nota ─────────────────
  console.log("\n[T12b] Messaggio ntfy reclamo su ordine ANNULLATO");
  {
    const corpo = costruisciMessaggioReclamoNtfy({
      numero: "LH-000043",
      negozioNome: "Salus Farma",
      clienteNome: "Mario Rossi",
      statoOrdine: "ANNULLATO",
      motivoAnnullamento: "Prodotto non disponibile",
      notaAnnullamento: "Esaurito in magazzino",
      dataOra: "10/08/2026 12:00",
      messaggio: "Non è arrivato nulla",
      linkOrdine: "https://www.incitta.online/merchant/x/ordini/y",
    });
    check("stato ANNULLATO esplicito", corpo.includes("⚠️ Stato ordine: ANNULLATO"));
    check("motivo presente", corpo.includes("📌 Motivo: Prodotto non disponibile"));
    check("nota presente", corpo.includes("📌 Nota: Esaurito in magazzino"));
  }

  // ── T12c: formattaDataOraReclamo (fuso Europe/Rome, deterministico) ─────────
  console.log("\n[T12c] formattaDataOraReclamo");
  {
    check("ISO → GG/MM/AAAA HH:MM Roma", formattaDataOraReclamo("2026-08-10T10:00:00.000Z") === "10/08/2026 12:00");
    check("null → ''", formattaDataOraReclamo(null) === "");
    check("data invalida → fallback stringa", formattaDataOraReclamo("non-una-data") === "non-una-data");
  }

  // ── T13: notificaReclamoNtfy — admin topic configurato → 2 invii ─────────────
  console.log("\n[T13] Notifica reclamo — venditore + admin (NTFY_ADMIN_TOPIC)");
  {
    process.env.NTFY_ADMIN_TOPIC = "incitta-admin-test";
    const registroFetch: Array<{ url: string; title: string; tags: string; body: string }> = [];
    await notificaReclamoNtfy(
      {
        id: RECLAMO_ID, ordineId: ORDINE_ID, negozioId: NEGOZIO_ID, clienteUserId: CLIENTE_ID,
        clienteNome: "Mario Rossi", clienteEmail: "mario@example.it", clienteTelefono: "3331234567",
        tipo: "ordine_non_arrivato", messaggio: "Non è arrivato nulla", stato: "aperto",
        createdAt: "2026-08-10T10:00:00.000Z", updatedAt: "2026-08-10T10:00:00.000Z",
        gestitoAt: null, gestitoDa: null, gestitoNota: null,
      } satisfies ReclamoOrdine,
      {
        db: fakeDbOrdine(ordineNotifica()),
        fetchImpl: fakeFetch(registroFetch),
      }
    );
    check("2 invii (venditore + admin)", registroFetch.length === 2, String(registroFetch.length));
    check("invio admin verso topic admin", registroFetch.some((r) => r.url.includes("incitta-admin-test")));
    check("titolo admin contiene [ADMIN]", registroFetch.some((r) => r.title.includes("[ADMIN]")));
    check("messaggio con stato ordine", registroFetch.every((r) => r.body.includes("⚠️ Stato ordine: Nuovo")));
    check("UUID solo nel link", registroFetch.every((r) => r.body.split("\n").filter((l) => l.includes(ORDINE_ID)).every((l) => l.trim().startsWith("https://"))));
  }

  // ── T14: notifica MAI throw anche con db che fallisce ────────────────────────
  console.log("\n[T14] Notifica best-effort: db/fetch KO → nessuna eccezione");
  {
    let lanciato = false;
    try {
      await notificaReclamoNtfy(
        {
          id: RECLAMO_ID, ordineId: ORDINE_ID, negozioId: NEGOZIO_ID, clienteUserId: CLIENTE_ID,
          clienteNome: "Mario Rossi", clienteEmail: null, clienteTelefono: null,
          tipo: "ordine_non_arrivato", messaggio: null, stato: "aperto",
          createdAt: "2026-08-10T10:00:00.000Z", updatedAt: "2026-08-10T10:00:00.000Z",
          gestitoAt: null, gestitoDa: null, gestitoNota: null,
        } satisfies ReclamoOrdine,
        {
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
    } catch {
      lanciato = true;
    }
    check("nessuna eccezione", !lanciato);
  }

  // ── T15: etichette ───────────────────────────────────────────────────────────
  console.log("\n[T15] Etichette stati e tipo");
  check("ETICHETTE_STATO_RECLAMO.aperto = Aperto", ETICHETTE_STATO_RECLAMO.aperto === "Aperto");
  check(
    "ETICHETTA_TIPO_RECLAMO = Ordine non arrivato",
    ETICHETTA_TIPO_RECLAMO.ordine_non_arrivato === "Ordine non arrivato"
  );

  // ── T16: errore ntfy NON fa fallire la creazione del reclamo ────────────────
  console.log("\n[T16] Notifica KO durante la creazione → reclamo comunque creato");
  {
    const esito = await creaReclamoOrdine(CLIENTE_ID, ORDINE_ID, { messaggio: "Problema" }, {
      rpc: async () => ({
        data: { ok: true, giaEsistente: false, reclamo: reclamoRow() },
        error: null,
      }),
      // DB delle notifiche rotto + fetch che lancia: la notifica NON può
      // impedire la creazione (il reclamo è già salvato dalla RPC).
      db: {
        from() {
          throw new Error("db down");
        },
      },
      fetchImpl: async () => {
        throw new Error("rete down");
      },
    });
    check("ok = true (reclamo creato nonostante ntfy KO)", esito.ok === true, JSON.stringify(esito));
    if (esito.ok) check("giaEsistente = false", esito.giaEsistente === false);
  }

  // ── T17: nome cliente con fallback sull'ordine ───────────────────────────────
  console.log("\n[T17] Cliente dal fallback ordine (snapshot reclamo vuoto)");
  delete process.env.NTFY_ADMIN_TOPIC; // solo venditore: 1 invio atteso
  {
    const registroFetch: Array<{ url: string; title: string; tags: string; body: string }> = [];
    await notificaReclamoNtfy(
      {
        id: RECLAMO_ID, ordineId: ORDINE_ID, negozioId: NEGOZIO_ID, clienteUserId: CLIENTE_ID,
        clienteNome: "", clienteEmail: null, clienteTelefono: null,
        tipo: "ordine_non_arrivato", messaggio: null, stato: "aperto",
        createdAt: "2026-08-10T10:00:00.000Z", updatedAt: "2026-08-10T10:00:00.000Z",
        gestitoAt: null, gestitoDa: null, gestitoNota: null,
      } satisfies ReclamoOrdine,
      {
        db: fakeDbOrdine(ordineNotifica({ stato: "cancellato", annullato_motivo: "prodotto_non_disponibile", annullato_nota: "Esaurito" })),
        fetchImpl: fakeFetch(registroFetch),
      }
    );
    check("1 invio", registroFetch.length === 1, String(registroFetch.length));
    check("nome cliente dal fallback ordine", registroFetch[0]?.body.includes("👤 Cliente: Mario Rossi"));
    check("stato ANNULLATO esplicito", registroFetch[0]?.body.includes("⚠️ Stato ordine: ANNULLATO"));
    check("motivo con etichetta leggibile", registroFetch[0]?.body.includes("📌 Motivo: Prodotto non disponibile"));
    check("nota annullamento presente", registroFetch[0]?.body.includes("📌 Nota: Esaurito"));
  }

  restoreEnv();

  // ── Riepilogo ────────────────────────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`ORDINE RECLAMI TEST: ${passati} passati, ${falliti} falliti`);
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
