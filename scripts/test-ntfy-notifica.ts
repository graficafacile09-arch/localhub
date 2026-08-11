/**
 * Test della notifica ntfy per nuovi ordini — NESSUNA chiamata reale a ntfy.
 *
 * Usa fetch MOCKATO e un DB finto, chiamando la VERA implementazione di
 * lib/notifiche/ntfy.ts (inviaNotificaNuovoOrdineNtfy /
 * inviaNotificaConfigurataNtfy / costruisciMessaggioNtfy).
 *
 *   T1  ENV configurate → payload/richiesta corretti
 *   T2  NTFY_ENABLED=false → skipped
 *   T3  ENV mancanti → skipped senza throw (ordine NON fallisce)
 *   T4  HTTP 200/2xx → sent
 *   T5  HTTP 400 → error ma nessun throw
 *   T6  HTTP 500 → error ma nessun throw
 *   T7  timeout → error ma nessun throw
 *   T8  ordine con più righe → riepilogo corretto senza perdere righe
 *   T9  ritiro → data/fascia corretti
 *   T10 spedizione → indirizzo corretto
 *   T11 valori mancanti → fallback sicuri, mai "undefined"/"null"
 *   T12 topic/server costruiti correttamente nell'URL
 *
 * Esecuzione: npx tsx scripts/test-ntfy-notifica.ts
 */
import {
  inviaNotificaNuovoOrdineNtfy,
  inviaNotificaConfigurataNtfy,
  inviaMessaggioNtfy,
  costruisciMessaggioNtfy,
  sanitizzaHeaderNtfy,
  type DatiOrdineNtfy,
  type ConfigNtfy,
} from "../lib/notifiche/ntfy";

let passati = 0;
let falliti = 0;
function ok(messaggio: string) {
  passati++;
  console.log(`  ✅ ${messaggio}`);
}
function ko(messaggio: string, dettaglio?: unknown) {
  falliti++;
  console.log(`  ❌ ${messaggio}`);
  if (dettaglio !== undefined) console.log(`     → ${JSON.stringify(dettaglio)}`);
}

// ─── Fixture ─────────────────────────────────────────────────────────────────

const ordineBase = {
  id: "ord-ntfy-1",
  numero: "LH-000123",
  totale: 12.9,
  modalita: "ritiro",
  negozio_id: "neg-1",
  negozio_nome: "Panificio Rossi",
  cliente_nome: "Mario",
  cliente_cognome: "Bianchi",
  cliente_telefono: "+39 333 1234567",
  ritiro_data: "15/08/2026",
  ritiro_fascia: "10:00–11:00",
  spedizione_indirizzo: null,
  spedizione_cap: null,
  spedizione_citta: null,
  spedizione_provincia: null,
  spedizione_note: null,
  note: "Chiamare al citofono",
};

function datiOrdine(over: Partial<DatiOrdineNtfy> = {}): DatiOrdineNtfy {
  return {
    numero: "LH-000123",
    negozioNome: "Panificio Rossi",
    totale: 12.9,
    modalita: "ritiro",
    clienteNome: "Mario",
    clienteCognome: "Bianchi",
    clienteTelefono: "+39 333 1234567",
    ritiroData: "15/08/2026",
    ritiroFascia: "10:00–11:00",
    spedizioneIndirizzo: null,
    spedizioneCap: null,
    spedizioneCitta: null,
    spedizioneProvincia: null,
    note: "Chiamare al citofono",
    righe: [{ nomeProdotto: "Pane Casereccio", quantita: 2 }],
    ...over,
  };
}

function configBase(over: Partial<ConfigNtfy> = {}): ConfigNtfy {
  return {
    enabled: true,
    serverUrl: "https://ntfy.sh",
    topic: "incitta-ordini-dm7k92x4",
    ...over,
  };
}

// ─── Mock fetch + fake DB ────────────────────────────────────────────────────

type RichiestaCatturata = { url: string; method: string; body: string; headers: Record<string, string> };

/**
 * Fetch mock STRETTO come il runtime Vercel/undici: valida ogni header come
 * ByteString (Latin-1) e lancia l'errore ESATTO di produzione se un carattere
 * supera 255. Riproduce fedelmente il bug "Cannot convert argument to a
 * ByteString ... greater than 255" del titolo con l'em dash (—, U+2014).
 */
function creaFetchMockStrict() {
  const richieste: RichiestaCatturata[] = [];
  const mock = (async (url: unknown, init?: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array; signal?: AbortSignal }) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    for (const [nome, valore] of Object.entries(headers)) {
      for (let i = 0; i < String(valore).length; i++) {
        const c = String(valore).charCodeAt(i);
        if (c > 255) {
          throw new Error(
            `Cannot convert argument to a ByteString because the character at index ${i} has a value of ${c} which is greater than 255.`
          );
        }
      }
    }
    const corpoDecodificato =
      typeof init?.body === "string"
        ? init.body
        : init?.body instanceof Uint8Array
          ? new TextDecoder("utf-8").decode(init.body)
          : "";
    richieste.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: corpoDecodificato,
      headers,
    });
    return new Response(JSON.stringify({ id: "msg-strict" }), { status: 200 });
  }) as typeof fetch;
  return { mock, richieste };
}

function creaFetchMock(opzioni: { status?: number; body?: string; abbandona?: boolean } = {}) {
  const richieste: RichiestaCatturata[] = [];
  const mock = (async (url: unknown, init?: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array; signal?: AbortSignal }) => {
    const corpoDecodificato =
      typeof init?.body === "string"
        ? init.body
        : init?.body instanceof Uint8Array
          ? new TextDecoder("utf-8").decode(init.body)
          : "";
    richieste.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: corpoDecodificato,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    if (opzioni.abbandona) {
      // Non risponde MAI: si interrompe solo via AbortController (timeout)
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }))
        );
      });
    }
    return new Response(opzioni.body ?? JSON.stringify({ id: "msg-ntfy-test" }), {
      status: opzioni.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { mock, richieste };
}

function fakeDb(ordine: unknown, righe: unknown[] = []) {
  const builder = (tabella: string) => {
    const risorsa = tabella === "ordini" ? ordine : null;
    const lista = tabella === "ordini_righe" ? righe : [];
    const b: any = {
      select: () => b,
      eq: () => b,
      order: () => b,
      single: async () => ({ data: risorsa ?? null, error: risorsa ? null : { message: "non trovato" } }),
      then: (resolve: (v: unknown) => void) => resolve({ data: lista, error: null }),
    };
    return b;
  };
  return { from: (t: string) => builder(t) };
}

// ─── Test ────────────────────────────────────────────────────────────────────

async function main() {
  // ── T1 + T12 ENV configurate → richiesta corretta (topic/server/headers) ──
  console.log("\n── T1 + T12 ENV configurate → payload corretto ──");
  process.env.NTFY_ENABLED = "true";
  process.env.NTFY_SERVER_URL = "https://ntfy.sh";
  process.env.NTFY_ORDERS_TOPIC = "incitta-ordini-dm7k92x4";
  const t1 = creaFetchMock();
  const esito1 = await inviaNotificaNuovoOrdineNtfy("ord-ntfy-1", {
    db: fakeDb(ordineBase, [{ nome_prodotto: "Pane Casereccio", quantita: 2 }]),
    fetchImpl: t1.mock,
  });
  if (esito1.stato === "sent" && esito1.messageId === "msg-ntfy-test" && t1.richieste.length === 1) {
    const req = t1.richieste[0];
    const urlOk = req.url === "https://ntfy.sh/incitta-ordini-dm7k92x4";
    const methodOk = req.method === "POST";
    const ctOk = (req.headers["Content-Type"] || "").toLowerCase() === "text/plain; charset=utf-8";
    const titleOk = req.headers["X-Title"] === "Nuovo ordine LH-000123";
    const prioOk = req.headers["X-Priority"] === "high";
    const tagsOk = req.headers["X-Tags"] === "shopping_cart";
    const bodyOk =
      req.body.includes("🛍️ NUOVO ORDINE #LH-000123") &&
      req.body.includes("🏪 Panificio Rossi") &&
      req.body.includes("• Pane Casereccio × 2") &&
      req.body.includes("💰 Totale: €12,90") &&
      req.body.includes("🚚 Modalità: Ritiro") &&
      req.body.includes("📅 Ritiro: 15/08/2026 — 10:00–11:00") &&
      req.body.includes("👤 Cliente: Mario Bianchi") &&
      req.body.includes("📞 Telefono: +39 333 1234567") &&
      req.body.includes("📝 Note: Chiamare al citofono");
    if (urlOk && methodOk && ctOk && titleOk && prioOk && tagsOk && bodyOk) {
      ok("T1+T12 richiesta ntfy corretta (URL topic, POST, Content-Type, titolo, priorità, tags, corpo)");
    } else {
      ko("T1+T12 richiesta ntfy", { req });
    }
  } else {
    ko("T1 invio", { esito1, richieste: t1.richieste.length });
  }

  // ── T2 NTFY_ENABLED=false → skipped ───────────────────────────────────────
  console.log("\n── T2 NTFY_ENABLED=false ──");
  process.env.NTFY_ENABLED = "false";
  const t2 = creaFetchMock();
  const esito2 = await inviaNotificaNuovoOrdineNtfy("ord-ntfy-1", {
    db: fakeDb(ordineBase, []),
    fetchImpl: t2.mock,
  });
  if (esito2.stato === "skipped" && esito2.motivo === "ntfy_disabilitato" && t2.richieste.length === 0) {
    ok("T2 skipped (ntfy disabilitato), nessuna chiamata");
  } else {
    ko("T2", { esito2, richieste: t2.richieste.length });
  }
  process.env.NTFY_ENABLED = "true";

  // ── T3 ENV mancanti → skipped senza throw (ordine NON fallisce) ───────────
  console.log("\n── T3 ENV mancanti ──");
  const vecchioTopic = process.env.NTFY_ORDERS_TOPIC;
  delete process.env.NTFY_ORDERS_TOPIC;
  const t3 = creaFetchMock();
  const esito3 = await inviaNotificaNuovoOrdineNtfy("ord-ntfy-1", {
    db: fakeDb(ordineBase, []),
    fetchImpl: t3.mock,
  });
  if (esito3.stato === "skipped" && esito3.motivo === "configurazione_mancante" && t3.richieste.length === 0) {
    ok("T3 skipped (configurazione mancante) senza throw");
  } else {
    ko("T3", { esito3, richieste: t3.richieste.length });
  }
  if (vecchioTopic !== undefined) process.env.NTFY_ORDERS_TOPIC = vecchioTopic;

  // ── T4 HTTP 200 → sent ────────────────────────────────────────────────────
  console.log("\n── T4 HTTP 200 → sent ──");
  const t4 = creaFetchMock({ status: 200, body: JSON.stringify({ id: "msg-200" }) });
  const esito4 = await inviaNotificaConfigurataNtfy(configBase(), datiOrdine(), t4.mock);
  if (esito4.stato === "sent" && esito4.messageId === "msg-200") ok("T4 HTTP 200 → sent");
  else ko("T4", { esito4 });

  // ── T5/T6 HTTP 400 e 500 → error ma nessun throw ──────────────────────────
  console.log("\n── T5 + T6 HTTP 400/500 ──");
  const t5 = creaFetchMock({ status: 400, body: "bad request" });
  const esito5 = await inviaNotificaConfigurataNtfy(configBase(), datiOrdine(), t5.mock);
  const t6 = creaFetchMock({ status: 500, body: "internal server error" });
  const esito6 = await inviaNotificaConfigurataNtfy(configBase(), datiOrdine(), t6.mock);
  if (esito5.stato === "error" && esito5.motivo === "ntfy_http_400" && esito6.stato === "error" && esito6.motivo === "ntfy_http_500") {
    ok("T5+T6 HTTP 400/500 → error senza throw");
  } else {
    ko("T5+T6", { esito5, esito6 });
  }

  // ── T7 timeout → error ma nessun throw ────────────────────────────────────
  console.log("\n── T7 timeout ──");
  const t7 = creaFetchMock({ abbandona: true });
  const esito7 = await inviaNotificaConfigurataNtfy(configBase({ timeoutMs: 80 }), datiOrdine(), t7.mock);
  if (esito7.stato === "error" && esito7.motivo === "timeout") ok("T7 timeout → error senza throw");
  else ko("T7", { esito7 });

  // ── T8 ordine con più righe → riepilogo senza perdere righe ───────────────
  console.log("\n── T8 ordine con più righe ──");
  const messaggio8 = costruisciMessaggioNtfy(
    datiOrdine({
      righe: [
        { nomeProdotto: "Pane Casereccio", quantita: 2 },
        { nomeProdotto: "Cornetti al Burro", quantita: 1 },
        { nomeProdotto: "Focaccia", quantita: 4 },
      ],
    })
  );
  const tieneTutte =
    messaggio8.includes("• Pane Casereccio × 2") &&
    messaggio8.includes("• Cornetti al Burro × 1") &&
    messaggio8.includes("• Focaccia × 4");
  if (tieneTutte && messaggio8.split("\n").filter((l) => l.startsWith("• ")).length === 3) {
    ok("T8 riepilogo multi-riga con tutti i prodotti");
  } else {
    ko("T8", { messaggio8 });
  }

  // ── T9 ritiro: data/fascia corretti ───────────────────────────────────────
  console.log("\n── T9 ritiro: data/fascia ──");
  const messaggio9 = costruisciMessaggioNtfy(
    datiOrdine({ ritiroData: "16/08/2026", ritiroFascia: "09:00–10:00" })
  );
  if (messaggio9.includes("📅 Ritiro: 16/08/2026 — 09:00–10:00") && messaggio9.includes("🚚 Modalità: Ritiro")) {
    ok("T9 data/fascia ritiro corretti nel messaggio");
  } else {
    ko("T9", { messaggio9 });
  }

  // ── T10 spedizione: indirizzo corretto ────────────────────────────────────
  console.log("\n── T10 spedizione: indirizzo ──");
  const messaggio10 = costruisciMessaggioNtfy(
    datiOrdine({
      modalita: "spedizione",
      ritiroData: null,
      ritiroFascia: null,
      spedizioneIndirizzo: "Via Roma 1",
      spedizioneCap: "87012",
      spedizioneCitta: "Castrovillari",
      spedizioneProvincia: "CS",
      note: "Consegnare dopo le 17:00",
    })
  );
  if (
    messaggio10.includes("🚚 Modalità: Spedizione") &&
    messaggio10.includes("📍 Indirizzo: Via Roma 1, 87012, Castrovillari, CS") &&
    !messaggio10.includes("📅 Ritiro")
  ) {
    ok("T10 indirizzo di spedizione composto correttamente");
  } else {
    ko("T10", { messaggio10 });
  }

  // ── T11 valori mancanti → fallback sicuri, mai "undefined"/"null" ─────────
  console.log("\n── T11 valori mancanti ──");
  const messaggio11 = costruisciMessaggioNtfy(
    datiOrdine({
      numero: "",
      negozioNome: "",
      clienteNome: "",
      clienteCognome: "",
      clienteTelefono: null,
      ritiroData: null,
      ritiroFascia: null,
      note: null,
      righe: [],
    })
  );
  const senzaUndefined =
    !messaggio11.includes("undefined") &&
    !messaggio11.includes("null") &&
    !messaggio11.includes("(null)");
  if (senzaUndefined && messaggio11.includes("—")) {
    ok("T11 assenti → fallback sicuri (—), mai undefined/null");
  } else {
    ko("T11", { messaggio11 });
  }

  // ── T13 sanitizzaHeaderNtfy: caratteri tipografici → ASCII ─────────────────
  console.log("\n── T13 sanitizzaHeaderNtfy (header ByteString-safe) ──");
  {
    const casi: Array<[string, string]> = [
      ["Risposta cliente — reclamo #LH-000071", "Risposta cliente - reclamo #LH-000071"],
      ["Virgolette “doppie” e ‘singole’", `Virgolette "doppie" e 'singole'`],
      ["En dash – ed ellissi …", "En dash - ed ellissi ..."],
      ["Con emoji 🔴 e accenti àèìòù", "Con emoji  e accenti "],
      ["Solo ascii ok", "Solo ascii ok"],
    ];
    let tuttiOk = true;
    for (const [input, atteso] of casi) {
      const output = sanitizzaHeaderNtfy(input);
      const soloAscii = Array.from(output).every((c) => c.charCodeAt(0) <= 127);
      if (output !== atteso || !soloAscii) {
        tuttiOk = false;
        ko(`T13 sanitizza(${JSON.stringify(input)})`, { atteso, output });
      }
    }
    if (tuttiOk) ok("T13 em dash/en dash/virgolette/ellissi/emoji → header ASCII");
  }

  // ── T14 scenario REALE: titolo con "—" (U+2014) → POST effettuato ──────────
  // Riproduce esattamente l'errore di produzione (fetch mock che valida gli
  // header come ByteString): PRIMA del fix lancia "...greater than 255" e la
  // notifica non parte; DOPO il fix il POST viene eseguito con X-Title ASCII.
  console.log("\n── T14 titolo con em dash (—) → richiesta costruita senza errore ──");
  {
    const t14 = creaFetchMockStrict();
    const esito14 = await inviaMessaggioNtfy(
      configBase(),
      {
        titolo: "Risposta cliente — reclamo #LH-000071",
        tags: "speech_balloon",
        priorita: "default",
        corpo: "🔴 RISPOSTA RECLAMO — InCittà\nCliente: Mario Rossi\nOrdine: #LH-000071",
      },
      "reclamo 2dff0d6a risposta",
      t14.mock
    );
    if (esito14.stato === "sent" && t14.richieste.length === 1) {
      const title = t14.richieste[0].headers["X-Title"] ?? "";
      const titleOk = title === "Risposta cliente - reclamo #LH-000071";
      const asciiOk = Array.from(title).every((c) => c.charCodeAt(0) <= 127);
      const bodyMantieneUnicode =
        t14.richieste[0].body.includes("🔴") && t14.richieste[0].body.includes("—");
      if (titleOk && asciiOk && bodyMantieneUnicode) {
        ok("T14 em dash nel titolo → header X-Title ASCII, POST eseguito, unicode nel BODY");
      } else {
        ko("T14", { esito14, headers: t14.richieste[0].headers, body: t14.richieste[0].body });
      }
    } else {
      ko("T14 invio con em dash", { esito14, richieste: t14.richieste.length });
    }
  }

  // ── T12b server con slash finale → URL senza doppi slash ──────────────────
  console.log("\n── T12b server con slash finale ──");
  const t12b = creaFetchMock();
  const esito12b = await inviaNotificaConfigurataNtfy(
    configBase({ serverUrl: "https://ntfy.sh/" }),
    datiOrdine(),
    t12b.mock
  );
  if (esito12b.stato === "sent" && t12b.richieste[0]?.url === "https://ntfy.sh/incitta-ordini-dm7k92x4") {
    ok("T12b URL senza doppi slash");
  } else {
    ko("T12b", { esito12b, url: t12b.richieste[0]?.url });
  }

  console.log(`\n─────────────────────────────`);
  console.log(`Totale: ${passati} passati, ${falliti} falliti`);
  if (falliti > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
