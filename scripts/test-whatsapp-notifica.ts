/**
 * Test della notifica WhatsApp (FASE 2) — NESSUNA chiamata reale a Meta.
 *
 * Usa fetch MOCKATO e un DB finto, chiamando la VERA implementazione di
 * lib/notifiche/whatsapp.ts (inviaNotificaNuovoOrdine / inviaNotificaConfigurata
 * / costruisciPayloadTemplate / normalizzaNumeroWhatsApp).
 *
 *   T1  ordine valido + configurato + accetta_whatsapp=true → richiesta Meta corretta
 *   T2  accetta_whatsapp=false → nessuna chiamata Meta
 *   T3  whatsapp vuoto + telefono presente → usato il telefono
 *   T4  whatsapp e telefono vuoti → skipped
 *   T5  WHATSAPP_ENABLED=false → skipped
 *   T6  token/ENV mancanti → ordine NON fallisce (skipped)
 *   T7  Meta HTTP 400 → ordine NON fallisce
 *   T8  Meta HTTP 500 → ordine NON fallisce
 *   T9  Meta timeout → ordine NON fallisce
 *   T10 ordine con più righe → payload corretto senza perdere righe
 *   T11 numero italiano normalizzato correttamente
 *   T12 nessun token/segreto nei log
 *
 * Esecuzione: npx tsx scripts/test-whatsapp-notifica.ts
 */
import { normalizzaNumeroWhatsApp } from "../lib/telefono";
import {
  inviaNotificaNuovoOrdine,
  inviaNotificaConfigurata,
  costruisciPayloadTemplate,
  TEMPLATE_NOME,
  TEMPLATE_LINGUA,
  type DatiOrdineNotifica,
  type ConfigWhatsApp,
} from "../lib/notifiche/whatsapp";

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
  id: "ord-1",
  numero: "LH-000001",
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
};

function datiOrdine(over: Partial<DatiOrdineNotifica> = {}): DatiOrdineNotifica {
  return {
    numero: "LH-000001",
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
    righe: [{ nomeProdotto: "Pane Casereccio", quantita: 2 }],
    ...over,
  };
}

function configBase(over: Partial<ConfigWhatsApp> = {}): ConfigWhatsApp {
  return {
    enabled: true,
    accessToken: "tok-segreto-test-123",
    phoneNumberId: "123456789",
    apiVersion: "v23.0",
    accettaWhatsapp: true,
    numeroDestinatario: "+39 333 1234567",
    ...over,
  };
}

// ─── Mock fetch + fake DB ────────────────────────────────────────────────────

type RichiestaCatturata = { url: string; method: string; body: any; headers: Record<string, string> };

function creaFetchMock(opzioni: { status?: number; body?: string; abbandona?: boolean } = {}) {
  const richieste: RichiestaCatturata[] = [];
  const mock = (async (url: unknown, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => {
    richieste.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body) : null,
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
    return new Response(opzioni.body ?? JSON.stringify({ messages: [{ id: "wamid.TEST" }] }), {
      status: opzioni.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { mock, richieste };
}

function fakeDb(ordine: unknown, negozio: unknown, righe: unknown[] = []) {
  const builder = (tabella: string) => {
    const risorsa = tabella === "ordini" ? ordine : tabella === "negozi" ? negozio : null;
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
  // T11 normalizzazione numero (prima, senza DB/fetch)
  console.log("\n── T11 normalizzazione numero italiano ──");
  const casi11: Array<[string, string]> = [
    ["+39 333 123 4567", "393331234567"],
    ["333 1234567", "393331234567"],
    ["+39.333-123(4567)", "393331234567"],
    ["", ""],
  ];
  let ok11 = true;
  for (const [input, atteso] of casi11) {
    const ris = normalizzaNumeroWhatsApp(input);
    if (ris !== atteso) {
      ok11 = false;
      console.log(`     → ${JSON.stringify(input)} → ${JSON.stringify(ris)} (atteso ${JSON.stringify(atteso)})`);
    }
  }
  ok11 ? ok("T11 numeri italiani normalizzati correttamente (E.164 senza +, prefisso 39)") : ko("T11");

  // ── T1 ordine valido → richiesta Meta corretta ─────────────────────────────
  console.log("\n── T1 ordine valido + configurato ──");
  process.env.WHATSAPP_ENABLED = "true";
  process.env.WHATSAPP_ACCESS_TOKEN = "tok-segreto-test-123";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
  process.env.WHATSAPP_API_VERSION = "v23.0";
  const t1 = creaFetchMock();
  const esito1 = await inviaNotificaNuovoOrdine("ord-1", {
    db: fakeDb(ordineBase, { whatsapp: "+39 333 1234567", telefono: null, accetta_whatsapp: true }, [
      { nome_prodotto: "Pane Casereccio", quantita: 2 },
    ]),
    fetchImpl: t1.mock,
  });
  if (esito1.stato === "inviata" && esito1.messageId === "wamid.TEST" && t1.richieste.length === 1) {
    const req = t1.richieste[0];
    const urlOk = req.url === "https://graph.facebook.com/v23.0/123456789/messages";
    const bodyOk =
      req.body?.messaging_product === "whatsapp" &&
      req.body?.to === "393331234567" &&
      req.body?.type === "template" &&
      req.body?.template?.name === TEMPLATE_NOME &&
      req.body?.template?.language?.code === TEMPLATE_LINGUA &&
      req.body?.template?.components?.[0]?.parameters?.[0]?.text === "LH-000001" &&
      req.body?.template?.components?.[0]?.parameters?.[1]?.text === "Panificio Rossi" &&
      req.body?.template?.components?.[0]?.parameters?.[3]?.text === "12,90" &&
      req.body?.template?.components?.[0]?.parameters?.[4]?.text === "Ritiro in negozio" &&
      req.body?.template?.components?.[0]?.parameters?.[5]?.text === "Mario Bianchi" &&
      req.body?.template?.components?.[0]?.parameters?.[6]?.text === "+39 333 1234567" &&
      req.body?.template?.components?.[0]?.parameters?.[7]?.text === "Ritiro: 15/08/2026 — 10:00–11:00";
    const authOk = req.headers?.Authorization === "Bearer tok-segreto-test-123";
    if (urlOk && bodyOk && authOk) ok("T1 payload/URL/Authorization corretti e notifica inviata");
    else ko("T1 richiesta Meta", { url: req.url, body: req.body, headers: req.headers });
  } else {
    ko("T1 invio", { esito1, richieste: t1.richieste.length });
  }

  // ── T2 accetta_whatsapp=false ──────────────────────────────────────────────
  console.log("\n── T2 accetta_whatsapp=false ──");
  const t2 = creaFetchMock();
  const esito2 = await inviaNotificaNuovoOrdine("ord-1", {
    db: fakeDb(ordineBase, { whatsapp: "+39 333 1234567", telefono: null, accetta_whatsapp: false }),
    fetchImpl: t2.mock,
  });
  if (esito2.stato === "skipped" && t2.richieste.length === 0) ok("T2 nessuna chiamata Meta (skipped)");
  else ko("T2", { esito2, richieste: t2.richieste.length });

  // ── T3 whatsapp vuoto → telefono ───────────────────────────────────────────
  console.log("\n── T3 fallback telefono ──");
  const t3 = creaFetchMock();
  const esito3 = await inviaNotificaNuovoOrdine("ord-1", {
    db: fakeDb(ordineBase, { whatsapp: "", telefono: "+39 340 0000000", accetta_whatsapp: true }),
    fetchImpl: t3.mock,
  });
  const to3 = t3.richieste[0]?.body?.to;
  if (esito3.stato === "inviata" && to3 === "393400000000") ok(`T3 usato il telefono del negozio (to=${to3})`);
  else ko("T3", { esito3, to3, richieste: t3.richieste.length });

  // ── T4 entrambi vuoti ──────────────────────────────────────────────────────
  console.log("\n── T4 nessun numero ──");
  const t4 = creaFetchMock();
  const esito4 = await inviaNotificaNuovoOrdine("ord-1", {
    db: fakeDb(ordineBase, { whatsapp: null, telefono: null, accetta_whatsapp: true }),
    fetchImpl: t4.mock,
  });
  if (esito4.stato === "skipped" && t4.richieste.length === 0) ok("T4 skipped senza chiamate Meta");
  else ko("T4", { esito4, richieste: t4.richieste.length });

  // ── T5 WHATSAPP_ENABLED=false ──────────────────────────────────────────────
  console.log("\n── T5 WHATSAPP_ENABLED=false ──");
  process.env.WHATSAPP_ENABLED = "false";
  const t5 = creaFetchMock();
  const esito5 = await inviaNotificaNuovoOrdine("ord-1", {
    db: fakeDb(ordineBase, { whatsapp: "+39 333 1234567", telefono: null, accetta_whatsapp: true }),
    fetchImpl: t5.mock,
  });
  if (esito5.stato === "skipped" && t5.richieste.length === 0) ok("T5 skipped (whatsapp disabilitato)");
  else ko("T5", { esito5, richieste: t5.richieste.length });
  process.env.WHATSAPP_ENABLED = "true";

  // ── T6 ENV mancanti → l'ordine NON fallisce ────────────────────────────────
  console.log("\n── T6 ENV mancanti ──");
  const vecchioToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const vecchioId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  const t6 = creaFetchMock();
  const esito6 = await inviaNotificaNuovoOrdine("ord-1", {
    db: fakeDb(ordineBase, { whatsapp: "+39 333 1234567", telefono: null, accetta_whatsapp: true }),
    fetchImpl: t6.mock,
  });
  if (esito6.stato === "skipped" && t6.richieste.length === 0) ok("T6 skipped (configurazione mancante) senza throw");
  else ko("T6", { esito6, richieste: t6.richieste.length });
  if (vecchioToken !== undefined) process.env.WHATSAPP_ACCESS_TOKEN = vecchioToken;
  if (vecchioId !== undefined) process.env.WHATSAPP_PHONE_NUMBER_ID = vecchioId;

  // ── T7/T8/T12 Meta 400 e 500 → ordine NON fallisce + log senza token ──────
  console.log("\n── T7 + T8 + T12 Meta 400/500 e log puliti ──");
  const logCatturati: string[] = [];
  const consoleOriginale = console.error;
  console.error = (...args: unknown[]) => {
    logCatturati.push(args.map(String).join(" "));
  };
  let esito7: Awaited<ReturnType<typeof inviaNotificaConfigurata>>;
  let esito8: Awaited<ReturnType<typeof inviaNotificaConfigurata>>;
  try {
    const t7 = creaFetchMock({ status: 400, body: JSON.stringify({ error: { code: 131047, message: "Template non approvato" } }) });
    esito7 = await inviaNotificaConfigurata(configBase(), datiOrdine(), t7.mock);
    const t8 = creaFetchMock({ status: 500, body: "internal server error" });
    esito8 = await inviaNotificaConfigurata(configBase(), datiOrdine(), t8.mock);
  } finally {
    console.error = consoleOriginale;
  }
  const tokenNeiLog = logCatturati.some((l) => l.includes("tok-segreto-test-123"));
  if (
    esito7.stato === "errore" &&
    esito8.stato === "errore" &&
    logCatturati.some((l) => l.includes("131047")) &&
    logCatturati.some((l) => l.includes("HTTP 500")) &&
    !tokenNeiLog
  ) {
    ok("T7+T8 Meta 400/500 → errore senza throw, log con codice/HTTP e SENZA token");
  } else {
    ko("T7+T8+T12", { esito7, esito8, logCatturati, tokenNeiLog });
  }

  // ── T9 timeout ─────────────────────────────────────────────────────────────
  console.log("\n── T9 timeout ──");
  const t9 = creaFetchMock({ abbandona: true });
  const logT9: string[] = [];
  console.error = (...args: unknown[]) => {
    logT9.push(args.map(String).join(" "));
  };
  let esito9: Awaited<ReturnType<typeof inviaNotificaConfigurata>>;
  try {
    esito9 = await inviaNotificaConfigurata(configBase({ timeoutMs: 80 }), datiOrdine(), t9.mock);
  } finally {
    console.error = consoleOriginale;
  }
  if (esito9.stato === "errore" && esito9.motivo === "timeout" && logT9.some((l) => l.includes("timeout"))) {
    ok("T9 timeout → errore senza throw e loggato");
  } else {
    ko("T9", { esito9, logT9 });
  }

  // ── T10 più righe ──────────────────────────────────────────────────────────
  console.log("\n── T10 ordine con più righe ──");
  const payload10 = costruisciPayloadTemplate(
    datiOrdine({
      righe: [
        { nomeProdotto: "Pane Casereccio", quantita: 2 },
        { nomeProdotto: "Cornetti al Burro", quantita: 1 },
        { nomeProdotto: "Focaccia", quantita: 4 },
      ],
    }),
    "393331234567"
  );
  const riepilogo10 = (payload10.template as any).components[0].parameters[2].text as string;
  const tieneTutte = riepilogo10.includes("• Pane Casereccio × 2") && riepilogo10.includes("• Cornetti al Burro × 1") && riepilogo10.includes("• Focaccia × 4");
  if (tieneTutte && riepilogo10.split("\n").length === 3) {
    ok("T10 riepilogo multi-riga con tutti i prodotti:\n" + riepilogo10.split("\n").map((l) => `       ${l}`).join("\n"));
  } else {
    ko("T10", { riepilogo10 });
  }

  // ── T10b spedizione (indirizzo) ────────────────────────────────────────────
  console.log("\n── T10b spedizione: indirizzo nel dettaglio consegna ──");
  const payloadSped = costruisciPayloadTemplate(
    datiOrdine({
      modalita: "spedizione",
      ritiroData: null,
      ritiroFascia: null,
      spedizioneIndirizzo: "Via Roma 1",
      spedizioneCap: "87012",
      spedizioneCitta: "Castrovillari",
      spedizioneProvincia: "CS",
    }),
    "393331234567"
  );
  const dettaglioSped = (payloadSped.template as any).components[0].parameters[7].text as string;
  const modSped = (payloadSped.template as any).components[0].parameters[4].text as string;
  if (dettaglioSped === "Spedizione a: Via Roma 1, 87012, Castrovillari, CS" && modSped === "Spedizione a domicilio") {
    ok("T10b indirizzo di spedizione composto correttamente");
  } else {
    ko("T10b", { dettaglioSped, modSped });
  }

  // ── T10c dati opzionali assenti → "—" mai "undefined"/"null" ──────────────
  console.log("\n── T10c dati opzionali assenti ──");
  const payloadSenza = costruisciPayloadTemplate(
    datiOrdine({ ritiroData: null, ritiroFascia: null, clienteTelefono: null }),
    "393331234567"
  );
  const parametriSenza = (payloadSenza.template as any).components[0].parameters.map((p: any) => p.text) as string[];
  const senzaUndefined = parametriSenza.every((t) => t !== "undefined" && t !== "null");
  const dettaglioSenza = parametriSenza[7];
  if (senzaUndefined && dettaglioSenza === "—" && parametriSenza[6] === "—") {
    ok("T10c assenti → '—' (mai undefined/null)");
  } else {
    ko("T10c", { parametriSenza });
  }

  console.log(`\n─────────────────────────────`);
  console.log(`Totale: ${passati} passati, ${falliti} falliti`);
  if (falliti > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
