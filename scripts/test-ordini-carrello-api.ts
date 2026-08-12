/**
 * F2.2 TEST — API CHECKOUT CARRELLO (server dev REALE + Supabase REALE).
 *
 * Avvia `next dev` su una porta dedicata e chiama la VERA route
 * POST /api/cliente/ordini/carrello (rate limit, sessione server-side,
 * pre-flight fail-closed, RPC atomiche) contro il DB reale:
 *
 *   T1  carrello mono-negozio (guest, spedizione, legacy+variante) → 201,
 *       totale server-side, snapshot, stock decrementato;
 *   T2  carrello multi-negozio (guest) → UN ordine per negozio, chiavi
 *       derivate checkoutKey+':'+negozioId, totale per negozio;
 *   T3  guest: cliente_user_id = NULL sul DB (in T1/T2);
 *   T4  utente AUTENTICATO (sessione reale via cookie) → cliente_user_id
 *       valorizzato SERVER-SIDE;
 *   T5  quantità/struttura invalide → 422 VALIDATION_ERROR, nessun ordine;
 *   T6  prodotto/variante non valido → 404/422, nessun ordine;
 *   T7  doppio checkout con la stessa checkoutKey → stessi ordini, un solo
 *       decremento di stock, nessun duplicato;
 *   T8  errore di UN negozio (scorte) → ordini degli altri negozi intatti;
 *   T9  metodo "carta" con negozio senza Stripe → 422 CARTA_NON_DISPONIBILE
 *       (fail-closed, nessun ordine);
 *   T10 regressione buy-now POST /api/cliente/ordini (mono-prodotto,
 *       idempotenza inclusa).
 *
 * La sessione Supabase viene creata con un utente di test REALE
 * (eliminato nel cleanup); il rate limit per IP viene evitato usando un
 * IP X-Forwarded-For dedicato per ogni chiamata. RESEND_API_KEY viene
 * svuotata nel processo del server dev per non inviare email reali.
 *
 * Uso: npx tsx scripts/test-ordini-carrello-api.ts
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { chiavePerNegozio } from "../lib/cliente/ordini-carrello";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGETTO = join(__dirname, "..");

function loadEnv() {
  try {
    const raw = readFileSync(join(PROGETTO, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
}

let passati = 0;
let falliti = 0;
const fallitiNomi: string[] = [];

function check(nome: string, condizione: boolean, dettaglio?: unknown) {
  if (condizione) {
    passati++;
    console.log(`  ✅ ${nome}`);
  } else {
    falliti++;
    fallitiNomi.push(nome);
    console.log(`  ❌ ${nome}${dettaglio !== undefined ? ` → ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

const fail = (msg: string): never => {
  throw new Error(msg);
};

// ════════════════════════════════════════════════════════════════════
// Server dev
// ════════════════════════════════════════════════════════════════════

const PORTA = Number(process.env.F22_PORT ?? 3137);
const BASE = `http://127.0.0.1:${PORTA}`;

let server: ChildProcess | null = null;

async function avviaServer(): Promise<void> {
  const log = createWriteStream(join(tmpdir(), "f22-next-dev.log"), { flags: "w" });
  server = spawn("npx next dev -p " + PORTA, {
    cwd: PROGETTO,
    env: {
      ...process.env,
      // Mai email reali durante i test (Next NON sovrascrive le env già set).
      RESEND_API_KEY: "",
      NODE_ENV: "development",
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);

  const deadline = Date.now() + 240_000;
  let pronto = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error("Server dev terminato inaspettatamente (exit " + server.exitCode + "). Vedi " + join(tmpdir(), "f22-next-dev.log"));
    }
    try {
      const res = await fetch(`${BASE}/api/cliente/ordini/carrello`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" },
        body: "{}",
      });
      // Route compilata e operativa → {} viene rifiutato con 422.
      if (res.status === 422) {
        pronto = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!pronto) {
    throw new Error("Server dev non pronto entro 240s. Vedi " + join(tmpdir(), "f22-next-dev.log"));
  }
  console.log(`\nServer dev pronto su ${BASE} (route compilata).\n`);
}

/**
 * Ferma il server dev uccidendo TUTTO l'albero dei processi (su Windows
 * kill() sul wrapper cmd/npx lascia il processo node orfano, che blocca
 * l'avvio di un nuovo dev server nella stessa directory).
 */
function fermaServer(): void {
  if (!server) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      server.kill("SIGTERM");
    }
  } catch {}
  server = null;
}

// ════════════════════════════════════════════════════════════════════
// Helpers HTTP
// ════════════════════════════════════════════════════════════════════

let ipCounter = 10;

function ipProva(): string {
  ipCounter += 1;
  return `10.0.0.${ipCounter}`;
}

type RispostaJson = {
  status: number;
  success: boolean;
  data?: {
    checkoutKey?: string;
    ordini?: any[];
    errori?: any[];
    ordine?: any;
    giaEsistente?: boolean;
  };
  error?: { code?: string; message?: string };
};

async function postJson(
  path: string,
  body: unknown,
  opts?: { ip?: string; cookie?: string }
): Promise<RispostaJson> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": opts?.ip ?? ipProva(),
  };
  if (opts?.cookie) headers.cookie = opts.cookie;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, ...(json ?? {}) };
}

// ════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceRole || !anonKey) {
    console.error("Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
    process.exit(1);
  }
  const db = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const ref = new URL(url).hostname.split(".")[0];

  const ts = Date.now();

  // ── Dati di test: 2 negozi + prodotti (legacy e con varianti) ──────────
  let negozioAId: string | null = null;
  let negozioBId: string | null = null;
  let pLegacy1: number | null = null; // 10.00, stock 50
  let pLegacy2: number | null = null; // 20.50, stock 30
  let pVariant: number | null = null; // ha_varianti=true (padre)
  let v1Id: string | null = null;     // variante M: 6.00, stock 10
  let v2Id: string | null = null;     // variante L: 5.50, stock 8
  let pAltro: number | null = null;   // negozio B: 3.00, stock 100

  // Stock attesi (aggiornati dopo ogni ordine riuscito).
  let stockL1 = 50;
  let stockL2 = 30;
  let stockVM = 10;
  let stockVL = 8;
  let stockPB = 100;

  const chiaviOrdini: string[] = []; // idempotency_key dei ordini creati (per cleanup)
  let utenteTestId: string | null = null;

  try {
    // ── Setup negozi e prodotti ──────────────────────────────────────────
    const { data: negozioA, error: errA } = await db
      .from("negozi")
      .insert({ nome: `F22-StoreA-${ts}`, slug: `f22-storea-${ts}`, attivo: true, is_demo: true })
      .select("id")
      .single();
    if (errA || !negozioA?.id) fail("Creazione negozio A fallita: " + (errA?.message ?? ""));
    negozioAId = String(negozioA!.id);

    const { data: negozioB, error: errB } = await db
      .from("negozi")
      .insert({ nome: `F22-StoreB-${ts}`, slug: `f22-storeb-${ts}`, attivo: true, is_demo: true })
      .select("id")
      .single();
    if (errB || !negozioB?.id) fail("Creazione negozio B fallita: " + (errB?.message ?? ""));
    negozioBId = String(negozioB!.id);

    const { data: p1 } = await db
      .from("prodotti")
      .insert({ negozio_id: negozioAId, nome: `F22-ProdottoLegacy1-${ts}`, prezzo: 10.0, quantita_disponibile: 50, attivo: true, ha_varianti: false })
      .select("id")
      .single();
    pLegacy1 = Number(p1!.id);
    const { data: p2 } = await db
      .from("prodotti")
      .insert({ negozio_id: negozioAId, nome: `F22-ProdottoLegacy2-${ts}`, prezzo: 20.5, quantita_disponibile: 30, attivo: true, ha_varianti: false })
      .select("id")
      .single();
    pLegacy2 = Number(p2!.id);
    const { data: pv } = await db
      .from("prodotti")
      .insert({ negozio_id: negozioAId, nome: `F22-ProdottoVarianti-${ts}`, prezzo: 5.0, quantita_disponibile: 0, attivo: true, ha_varianti: true })
      .select("id")
      .single();
    pVariant = Number(pv!.id);
    const { data: v1 } = await db
      .from("prodotto_varianti")
      .insert({ prodotto_id: pVariant, nome: "F22-Variante M", attributi: { taglia: "M" }, prezzo: 6.0, quantita_disponibile: 10, quantita_riservata: 0, attivo: true })
      .select("id")
      .single();
    v1Id = String(v1!.id);
    const { data: v2 } = await db
      .from("prodotto_varianti")
      .insert({ prodotto_id: pVariant, nome: "F22-Variante L", attributi: { taglia: "L" }, prezzo: 5.5, quantita_disponibile: 8, quantita_riservata: 0, attivo: true })
      .select("id")
      .single();
    v2Id = String(v2!.id);
    const { data: pB } = await db
      .from("prodotti")
      .insert({ negozio_id: negozioBId, nome: `F22-ProdottoNegozioB-${ts}`, prezzo: 3.0, quantita_disponibile: 100, attivo: true, ha_varianti: false })
      .select("id")
      .single();
    pAltro = Number(pB!.id);

    const ids = {
      pLegacy1: String(pLegacy1),
      pLegacy2: String(pLegacy2),
      pVariant: String(pVariant),
      v1: String(v1Id),
      v2: String(v2Id),
      pAltro: String(pAltro),
    };

    const baseCheckout = {
      modalita: "spedizione" as const,
      cliente: { nome: "Mario", cognome: "Rossi", telefono: "3331234567", email: "f22@localhub.test" },
      spedizione: {
        indirizzo: "Via Test 1",
        cap: "87100",
        citta: "Cosenza",
        provincia: "CS",
        metodoSpedizione: "standard" as const,
        metodoPagamento: "bonifico" as const,
      },
    };

    // ── Avvio server dev ─────────────────────────────────────────────────
    await avviaServer();

    // ── T1: carrello MONO-NEGOZIO (guest, spedizione, legacy + variante) ──
    console.log("\n[T1] Carrello mono-negozio (guest)");
    {
      const key = `f22-t1-${ts}`;
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: key,
        ...baseCheckout,
        righe: [
          { prodottoId: ids.pLegacy1, varianteId: null, quantita: 2 },
          { prodottoId: ids.pVariant, varianteId: ids.v1, quantita: 1 },
        ],
      });
      check("HTTP 201 (ordine nuovo)", esito.status === 201, esito.status);
      const ordini = esito.data?.ordini ?? [];
      check("1 ordine creato", ordini.length === 1, ordini);
      const ordine = ordini[0];
      check("ordineId valorizzato", typeof ordine?.ordineId === "string" && ordine.ordineId.length > 0, ordine);
      check("negozio risolto dal DB (A)", String(ordine?.negozioId) === negozioAId, ordine?.negozioId);
      check("numero ordine valorizzato", typeof ordine?.numero === "string" && ordine.numero.length > 0, ordine?.numero);
      check("stato = in_preparazione", ordine?.stato === "in_preparazione", ordine?.stato);
      check("payment_status = null (nessun pagamento avviato)", ordine?.paymentStatus == null, ordine?.paymentStatus);
      check("payment_provider = null", ordine?.paymentProvider == null, ordine?.paymentProvider);
      check("totale server-side = 31.90 (10×2 + 6×1 + 5.90)", Number(ordine?.totale) === 31.9, ordine?.totale);
      check("2 righe nello snapshot", Array.isArray(ordine?.righe) && ordine.righe.length === 2, ordine?.righe);
      const rigaV = ordine?.righe?.find((r: any) => String(r.prodottoId) === ids.pVariant);
      check("snapshot variante: prezzo 6.00 dal DB", Number(rigaV?.prezzoUnitario) === 6.0, rigaV?.prezzoUnitario);

      // DB: ordine con chiave derivata, guest, stock decrementato
      const chiaveA = chiavePerNegozio(key, negozioAId!);
      chiaviOrdini.push(chiaveA);
      const { data: ordineDb } = await db
        .from("ordini")
        .select("id, cliente_user_id")
        .eq("idempotency_key", chiaveA)
        .maybeSingle();
      check("ordine salvato con chiave derivata checkoutKey+':'+negozioId", Boolean(ordineDb?.id), ordineDb);
      check("T3a guest: cliente_user_id = NULL", ordineDb?.cliente_user_id == null, ordineDb?.cliente_user_id);

      stockL1 -= 2;
      stockVM -= 1;
      const { data: s1 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pLegacy1).single();
      const { data: sV } = await db.from("prodotto_varianti").select("quantita_disponibile").eq("id", v1Id).single();
      check(`stock legacy1 ${stockL1 + 2} → ${stockL1}`, Number(s1?.quantita_disponibile) === stockL1, s1?.quantita_disponibile);
      check(`stock variante M ${stockVM + 1} → ${stockVM}`, Number(sV?.quantita_disponibile) === stockVM, sV?.quantita_disponibile);
    }

    // ── T2: carrello MULTI-NEGOZIO (guest) ───────────────────────────────
    console.log("\n[T2] Carrello multi-negozio (guest): un ordine per negozio");
    {
      const key = `f22-t2-${ts}`;
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: key,
        ...baseCheckout,
        righe: [
          { prodottoId: ids.pLegacy2, varianteId: null, quantita: 1 }, // A
          { prodottoId: ids.pVariant, varianteId: ids.v2, quantita: 1 }, // A
          { prodottoId: ids.pAltro, varianteId: null, quantita: 2 }, // B (1 riga → crea_ordine legacy)
        ],
      });
      check("HTTP 201", esito.status === 201, esito.status);
      const ordini = esito.data?.ordini ?? [];
      check("2 ordini creati (uno per negozio)", ordini.length === 2, ordini);
      const ordineA = ordini.find((o: any) => String(o.negozioId) === negozioAId);
      const ordineB = ordini.find((o: any) => String(o.negozioId) === negozioBId);
      check("ordine negozio A presente", Boolean(ordineA), ordini);
      check("ordine negozio B presente", Boolean(ordineB), ordini);
      check("totale A = 31.90 (20.5×1 + 5.5×1 + 5.90)", ordineA && Number(ordineA.totale) === 31.9, ordineA?.totale);
      check("totale B = 11.90 (3×2 + 5.90, spedizione UNA volta)", ordineB && Number(ordineB.totale) === 11.9, ordineB?.totale);
      check("2 righe nell'ordine A", Array.isArray(ordineA?.righe) && ordineA.righe.length === 2, ordineA?.righe);
      check("1 riga nell'ordine B", Array.isArray(ordineB?.righe) && ordineB.righe.length === 1, ordineB?.righe);

      const chiaveA = chiavePerNegozio(key, negozioAId!);
      const chiaveB = chiavePerNegozio(key, negozioBId!);
      chiaviOrdini.push(chiaveA, chiaveB);
      const { data: oA } = await db.from("ordini").select("id, cliente_user_id").eq("idempotency_key", chiaveA).maybeSingle();
      const { data: oB } = await db.from("ordini").select("id, cliente_user_id").eq("idempotency_key", chiaveB).maybeSingle();
      check("ordine A con chiave derivata A", Boolean(oA?.id), oA);
      check("ordine B con chiave derivata B", Boolean(oB?.id), oB);
      check("T3b guest: cliente_user_id = NULL (entrambi)", oA?.cliente_user_id == null && oB?.cliente_user_id == null, { oA, oB });

      stockL2 -= 1;
      stockVL -= 1;
      stockPB -= 2;
      const { data: s2 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pLegacy2).single();
      const { data: sVL } = await db.from("prodotto_varianti").select("quantita_disponibile").eq("id", v2Id).single();
      const { data: sPB } = await db.from("prodotti").select("quantita_disponibile").eq("id", pAltro).single();
      check(`stock legacy2 ${stockL2 + 1} → ${stockL2}`, Number(s2?.quantita_disponibile) === stockL2, s2?.quantita_disponibile);
      check(`stock variante L ${stockVL + 1} → ${stockVL}`, Number(sVL?.quantita_disponibile) === stockVL, sVL?.quantita_disponibile);
      check(`stock prodotto B ${stockPB + 2} → ${stockPB}`, Number(sPB?.quantita_disponibile) === stockPB, sPB?.quantita_disponibile);
    }

    // ── T4: utente AUTENTICATO (sessione reale) ──────────────────────────
    console.log("\n[T4] Utente autenticato (sessione Supabase reale)");
    let cookie: string | null = null;
    {
      const emailUtente = `f22-user-${ts}@localhub.test`;
      const { data: creato, error: errCrea } = await db.auth.admin.createUser({
        email: emailUtente,
        password: "PasswordF22!2026",
        email_confirm: true,
      });
      if (errCrea || !creato?.user?.id) fail("Creazione utente di test fallita: " + (errCrea?.message ?? ""));
      // fail() lancia sempre → da qui creato.user.id è garantito non-null.
      utenteTestId = creato!.user!.id;

      const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: anonKey, "content-type": "application/json" },
        body: JSON.stringify({ email: emailUtente, password: "PasswordF22!2026" }),
      });
      const tok: any = await res.json();
      check("sign-in utente test ok", res.status === 200 && Boolean(tok.access_token), { status: res.status, msg: tok.msg });
      if (!tok.access_token) fail("Sign-in utente test fallito");
      const sessioneCookie = JSON.stringify({
        access_token: tok.access_token,
        refresh_token: tok.refresh_token,
        expires_at: tok.expires_at,
        expires_in: tok.expires_in,
        token_type: tok.token_type ?? "bearer",
      });
      // Formato ESATTO di @supabase/ssr (getItemAsync fa JSON.parse sul
      // valore): prefisso "base64-" + base64url(JSON).
      cookie = `sb-${ref}-auth-token=base64-${Buffer.from(sessioneCookie).toString("base64url")}`;

      const key = `f22-t4-${ts}`;
      const esito = await postJson(
        "/api/cliente/ordini/carrello",
        {
          checkoutKey: key,
          modalita: "ritiro",
          cliente: { nome: "Luigi", cognome: "Verdi", telefono: null, email: null },
          ritiro: { data: "2026-09-10", fascia: "10:00–11:00" },
          righe: [
            { prodottoId: ids.pLegacy1, varianteId: null, quantita: 1 },
            { prodottoId: ids.pLegacy2, varianteId: null, quantita: 1 },
          ],
        },
        { cookie }
      );
      check("HTTP 201 (utente autenticato)", esito.status === 201, esito.status);
      const ordini = esito.data?.ordini ?? [];
      check("1 ordine creato", ordini.length === 1, ordini);

      const chiaveA = chiavePerNegozio(key, negozioAId!);
      chiaviOrdini.push(chiaveA);
      const { data: ordineDb } = await db
        .from("ordini")
        .select("cliente_user_id")
        .eq("idempotency_key", chiaveA)
        .maybeSingle();
      check("cliente_user_id = utente della SESSIONE (server-side)", ordineDb?.cliente_user_id === utenteTestId, ordineDb?.cliente_user_id);

      stockL1 -= 1;
      stockL2 -= 1;
      const { data: s1 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pLegacy1).single();
      check(`stock legacy1 ${stockL1 + 1} → ${stockL1}`, Number(s1?.quantita_disponibile) === stockL1, s1?.quantita_disponibile);
    }

    // ── T5: quantità / struttura invalide → 422, nessun ordine ───────────
    console.log("\n[T5] Quantità e struttura invalide → 422 VALIDATION_ERROR");
    {
      const casi: { nome: string; body: unknown }[] = [
        { nome: "quantita 0", body: { checkoutKey: `f22-t5a-${ts}`, ...baseCheckout, righe: [{ prodottoId: ids.pLegacy1, varianteId: null, quantita: 0 }, { prodottoId: ids.pLegacy2, varianteId: null, quantita: 1 }] } },
        { nome: "quantita 100", body: { checkoutKey: `f22-t5b-${ts}`, ...baseCheckout, righe: [{ prodottoId: ids.pLegacy1, varianteId: null, quantita: 100 }, { prodottoId: ids.pLegacy2, varianteId: null, quantita: 1 }] } },
        { nome: "quantita 1.5", body: { checkoutKey: `f22-t5c-${ts}`, ...baseCheckout, righe: [{ prodottoId: ids.pLegacy1, varianteId: null, quantita: 1.5 }, { prodottoId: ids.pLegacy2, varianteId: null, quantita: 1 }] } },
        { nome: "checkoutKey vuota", body: { checkoutKey: "", ...baseCheckout, righe: [{ prodottoId: ids.pLegacy1, varianteId: null, quantita: 1 }, { prodottoId: ids.pLegacy2, varianteId: null, quantita: 1 }] } },
        { nome: "checkoutKey > 64", body: { checkoutKey: "x".repeat(65), ...baseCheckout, righe: [{ prodottoId: ids.pLegacy1, varianteId: null, quantita: 1 }, { prodottoId: ids.pLegacy2, varianteId: null, quantita: 1 }] } },
        { nome: "prodottoId non numerico", body: { checkoutKey: `f22-t5e-${ts}`, ...baseCheckout, righe: [{ prodottoId: "abc", varianteId: null, quantita: 1 }, { prodottoId: ids.pLegacy2, varianteId: null, quantita: 1 }] } },
      ];
      for (const c of casi) {
        const esito = await postJson("/api/cliente/ordini/carrello", c.body);
        check(`${c.nome} → 422 VALIDATION_ERROR`, esito.status === 422 && esito.error?.code === "VALIDATION_ERROR", { status: esito.status, code: esito.error?.code });
      }
      // Nessun ordine creato per le chiavi valide dei casi precedenti
      const { count } = await db
        .from("ordini")
        .select("id", { count: "exact", head: true })
        .like("idempotency_key", `f22-t5%-${ts}%`);
      check("nessun ordine creato dai casi T5", Number(count ?? 0) === 0, count);
    }

    // ── T5b: carrello con 1 sola riga (F2.5: il carrello può avere 1 solo
    //        prodotto) → 201, ordine creato via crea_ordine legacy ────────
    console.log("\n[T5b] Carrello con 1 sola riga → valido (F2.5)");
    {
      const key = `f22-t5b-${ts}`;
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: key,
        ...baseCheckout,
        righe: [{ prodottoId: ids.pLegacy1, varianteId: null, quantita: 1 }],
      });
      check("HTTP 201 (1 riga ora valida)", esito.status === 201, esito.status);
      const ordini = esito.data?.ordini ?? [];
      check("1 ordine creato", ordini.length === 1, ordini);
      check("1 riga nello snapshot", Array.isArray(ordini[0]?.righe) && ordini[0].righe.length === 1, ordini[0]?.righe);
      const chiaveA = chiavePerNegozio(key, negozioAId!);
      chiaviOrdini.push(chiaveA);
      stockL1 -= 1;
    }

    // ── T6: prodotto / variante non valido → nessun ordine ───────────────
    console.log("\n[T6] Prodotto/variante non valido");
    {
      const casi: { nome: string; body: unknown; atteso: number; codice: string }[] = [
        {
          nome: "prodotto inesistente → 404 PRODOTTO_NON_TROVATO",
          atteso: 404, codice: "PRODOTTO_NON_TROVATO",
          body: { checkoutKey: `f22-t6a-${ts}`, ...baseCheckout, righe: [{ prodottoId: "999999999999", varianteId: null, quantita: 1 }, { prodottoId: ids.pLegacy2, varianteId: null, quantita: 1 }] },
        },
        {
          nome: "legacy con varianteId spurio → 422 VARIANTE_NON_VALIDA",
          atteso: 422, codice: "VARIANTE_NON_VALIDA",
          body: { checkoutKey: `f22-t6b-${ts}`, ...baseCheckout, righe: [{ prodottoId: ids.pLegacy1, varianteId: ids.v1, quantita: 1 }, { prodottoId: ids.pLegacy2, varianteId: null, quantita: 1 }] },
        },
        {
          nome: "prodotto con varianti senza varianteId → 422 VARIANTE_OBBLIGATORIA",
          atteso: 422, codice: "VARIANTE_OBBLIGATORIA",
          body: { checkoutKey: `f22-t6c-${ts}`, ...baseCheckout, righe: [{ prodottoId: ids.pVariant, varianteId: null, quantita: 1 }, { prodottoId: ids.pLegacy2, varianteId: null, quantita: 1 }] },
        },
        {
          nome: "variante di ALTRO prodotto → 422 VARIANTE_NON_VALIDA",
          atteso: 422, codice: "VARIANTE_NON_VALIDA",
          // v2 appartiene a pVariant, non a pLegacy2 → mismatch nel pre-flight
          body: { checkoutKey: `f22-t6d-${ts}`, ...baseCheckout, righe: [{ prodottoId: ids.pLegacy2, varianteId: ids.v2, quantita: 1 }, { prodottoId: ids.pVariant, varianteId: ids.v1, quantita: 1 }] },
        },
      ];
      for (const c of casi) {
        const esito = await postJson("/api/cliente/ordini/carrello", c.body);
        check(c.nome, esito.status === c.atteso && esito.error?.code === c.codice, { status: esito.status, code: esito.error?.code, msg: esito.error?.message });
      }
      const { count } = await db
        .from("ordini")
        .select("id", { count: "exact", head: true })
        .like("idempotency_key", `f22-t6%-${ts}%`);
      check("nessun ordine creato dai casi T6", Number(count ?? 0) === 0, count);
    }

    // ── T7: doppio checkout con la stessa checkoutKey ────────────────────
    console.log("\n[T7] Idempotenza: stessa checkoutKey → stessi ordini, un solo decremento");
    {
      const key = `f22-t7-${ts}`;
      const body = {
        checkoutKey: key,
        ...baseCheckout,
        righe: [
          { prodottoId: ids.pLegacy1, varianteId: null, quantita: 1 },
          { prodottoId: ids.pLegacy2, varianteId: null, quantita: 1 },
        ],
      };
      const r1 = await postJson("/api/cliente/ordini/carrello", body);
      check("primo checkout → 201, non esistente", r1.status === 201 && r1.data?.ordini?.[0]?.giaEsistente === false, { status: r1.status, ordini: r1.data?.ordini });
      const primoId = r1.data?.ordini?.[0]?.ordineId;
      if (!primoId) fail("T7: primo checkout senza ordine");

      const r2 = await postJson("/api/cliente/ordini/carrello", body);
      check("secondo checkout → 200, giaEsistente=true", r2.status === 200 && r2.data?.ordini?.[0]?.giaEsistente === true, { status: r2.status, ordini: r2.data?.ordini });
      check("stesso ordine restituito", r2.data?.ordini?.[0]?.ordineId === primoId, r2.data?.ordini?.[0]?.ordineId);

      const chiaveA = chiavePerNegozio(key, negozioAId!);
      chiaviOrdini.push(chiaveA);
      const { count } = await db
        .from("ordini")
        .select("id", { count: "exact", head: true })
        .eq("idempotency_key", chiaveA);
      check("un solo ordine nel DB con la chiave derivata", Number(count ?? 0) === 1, count);

      stockL1 -= 1;
      stockL2 -= 1;
      const { data: s1 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pLegacy1).single();
      check(`stock legacy1 decrementato UNA volta (${stockL1 + 1} → ${stockL1})`, Number(s1?.quantita_disponibile) === stockL1, s1?.quantita_disponibile);
    }

    // ── T8: errore di un negozio senza corrompere gli altri ──────────────
    console.log("\n[T8] Errore di UN negozio (scorte) → ordini degli altri intatti");
    {
      const key = `f22-t8-${ts}`;
      // Stock del prodotto B portato a 2 per forzare SCORTE_INSUFFICIENTI
      // (quantità 5 è entro il limite 1-99 ma supera le 2 unità disponibili).
      await db.from("prodotti").update({ quantita_disponibile: 2 }).eq("id", pAltro);
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: key,
        ...baseCheckout,
        righe: [
          { prodottoId: ids.pLegacy1, varianteId: null, quantita: 1 }, // A: ok
          { prodottoId: ids.pLegacy2, varianteId: null, quantita: 1 }, // A: ok
          { prodottoId: ids.pAltro, varianteId: null, quantita: 5 }, // B: scorte insufficienti (2 disponibili)
        ],
      });
      // Ripristino stock B al valore atteso per i test successivi/cleanup.
      await db.from("prodotti").update({ quantita_disponibile: stockPB }).eq("id", pAltro);
      check("HTTP 201 (almeno un ordine nuovo)", esito.status === 201, esito.status);
      const ordini = esito.data?.ordini ?? [];
      const errori = esito.data?.errori ?? [];
      check("1 ordine creato (negozio A)", ordini.length === 1 && String(ordini[0]?.negozioId) === negozioAId, ordini);
      check("1 errore per il negozio B", errori.length === 1 && String(errori[0]?.negozioId) === negozioBId, errori);
      check("errore SCORTE_INSUFFICIENTI", errori[0]?.codice === "SCORTE_INSUFFICIENTI", errori[0]);
      check("errore isolato: nessun ordine parziale per B", (esito.data?.ordini ?? []).every((o: any) => String(o.negozioId) !== negozioBId), esito.data?.ordini);

      const chiaveA = chiavePerNegozio(key, negozioAId!);
      const chiaveB = chiavePerNegozio(key, negozioBId!);
      chiaviOrdini.push(chiaveA);
      const { data: oA } = await db.from("ordini").select("id").eq("idempotency_key", chiaveA).maybeSingle();
      const { data: oB } = await db.from("ordini").select("id").eq("idempotency_key", chiaveB).maybeSingle();
      check("ordine A creato", Boolean(oA?.id), oA);
      check("nessun ordine B (rollback RPC)", oB == null, oB);

      stockL1 -= 1;
      stockL2 -= 1;
      const { data: s1 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pLegacy1).single();
      const { data: sPB } = await db.from("prodotti").select("quantita_disponibile").eq("id", pAltro).single();
      check(`stock A decrementato (${stockL1 + 1} → ${stockL1})`, Number(s1?.quantita_disponibile) === stockL1, s1?.quantita_disponibile);
      check(`stock B INVARIATO (${stockPB})`, Number(sPB?.quantita_disponibile) === stockPB, sPB?.quantita_disponibile);
    }

    // ── T9: metodo carta con negozio senza Stripe → fail-closed ──────────
    console.log("\n[T9] Metodo 'carta' senza Stripe configurato → CARTA_NON_DISPONIBILE (fail-closed)");
    {
      const key = `f22-t9-${ts}`;
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: key,
        ...baseCheckout,
        spedizione: { ...baseCheckout.spedizione, metodoPagamento: "carta" },
        righe: [
          { prodottoId: ids.pLegacy1, varianteId: null, quantita: 1 },
          { prodottoId: ids.pLegacy2, varianteId: null, quantita: 1 },
        ],
      });
      check("HTTP 422 CARTA_NON_DISPONIBILE", esito.status === 422 && esito.error?.code === "CARTA_NON_DISPONIBILE", { status: esito.status, code: esito.error?.code });
      const chiaveA = chiavePerNegozio(key, negozioAId!);
      const { data: oA } = await db.from("ordini").select("id").eq("idempotency_key", chiaveA).maybeSingle();
      check("nessun ordine creato (fail-closed)", oA == null, oA);
    }

    // ── T10: regressione buy-now (route legacy invariata) ────────────────
    console.log("\n[T10] Regressione buy-now POST /api/cliente/ordini");
    {
      const key = `f22-bn-${ts}`;
      const body = {
        idempotencyKey: key,
        prodottoId: ids.pLegacy1,
        varianteId: null,
        quantita: 1,
        modalita: "spedizione",
        cliente: { nome: "Anna", cognome: "Bianchi", telefono: null, email: "f22-bn@localhub.test" },
        spedizione: {
          indirizzo: "Via Test 2",
          cap: "87100",
          citta: "Cosenza",
          provincia: "CS",
          metodoSpedizione: "standard",
          metodoPagamento: "bonifico",
        },
      };
      const r1 = await postJson("/api/cliente/ordini", body);
      check("buy-now → 201 con ordine", r1.status === 201 && Boolean(r1.data?.ordine?.id), { status: r1.status, ordine: r1.data?.ordine });
      const primoId = r1.data?.ordine?.id;
      if (!primoId) fail("T10: buy-now senza ordine");
      chiaviOrdini.push(key);

      const r2 = await postJson("/api/cliente/ordini", body);
      check("retry buy-now → 200 giaEsistente", r2.status === 200 && r2.data?.giaEsistente === true, { status: r2.status, giaEsistente: r2.data?.giaEsistente });
      check("stesso ordine restituito", r2.data?.ordine?.id === primoId, r2.data?.ordine?.id);

      const { count } = await db.from("ordini").select("id", { count: "exact", head: true }).eq("idempotency_key", key);
      check("un solo ordine buy-now nel DB", Number(count ?? 0) === 1, count);

      stockL1 -= 1;
      const { data: s1 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pLegacy1).single();
      check(`stock legacy1 decrementato UNA volta (${stockL1 + 1} → ${stockL1})`, Number(s1?.quantita_disponibile) === stockL1, s1?.quantita_disponibile);
    }

    // ── Riepilogo ─────────────────────────────────────────────────────────
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`API CARRELLO TEST: ${passati} passati, ${falliti} falliti`);
    if (falliti > 0) {
      console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    console.log("TUTTI I TEST PASSATI ✓");
  } finally {
    // ── CLEANUP COMPLETO ─────────────────────────────────────────────────
    console.log("\n── CLEANUP TEST F2.2 ──");
    // 1. Ordini di test (cascade su ordini_righe)
    if (chiaviOrdini.length > 0) {
      const { error: delOrdini } = await db.from("ordini").delete().in("idempotency_key", chiaviOrdini);
      console.log(`  Ordini eliminati: ${chiaviOrdini.length}${delOrdini ? " (ERRORE: " + delOrdini.message + ")" : ""}`);
    }
    // 1b. Sweep finale: ordini residui di QUESTO run (difesa in profondità:
    //     un test fallito potrebbe aver creato un ordine non tracciato — se
    //     restasse, bloccherebbe l'eliminazione dei prodotti per FK).
    {
      const { count: residui } = await db
        .from("ordini")
        .select("id", { count: "exact", head: true })
        .like("idempotency_key", `f22-%-${ts}%`);
      if (Number(residui ?? 0) > 0) {
        const { error: delResidui } = await db
          .from("ordini")
          .delete()
          .like("idempotency_key", `f22-%-${ts}%`);
        console.log(`  Sweep residui ordini: ${residui} eliminati${delResidui ? " (ERRORE: " + delResidui.message + ")" : ""}`);
      }
    }
    // 2. Ripristino stock ai valori iniziali
    if (pLegacy1 !== null) await db.from("prodotti").update({ quantita_disponibile: 50 }).eq("id", pLegacy1);
    if (pLegacy2 !== null) await db.from("prodotti").update({ quantita_disponibile: 30 }).eq("id", pLegacy2);
    if (pAltro !== null) await db.from("prodotti").update({ quantita_disponibile: 100 }).eq("id", pAltro);
    if (v1Id !== null) await db.from("prodotto_varianti").update({ quantita_disponibile: 10 }).eq("id", v1Id);
    if (v2Id !== null) await db.from("prodotto_varianti").update({ quantita_disponibile: 8 }).eq("id", v2Id);
    // 3. Varianti → prodotti → negozi
    if (pVariant !== null) {
      await db.from("prodotto_varianti").delete().eq("prodotto_id", pVariant);
      await db.from("prodotti").delete().eq("id", pVariant);
    }
    for (const id of [pLegacy1, pLegacy2, pAltro]) {
      if (id !== null) await db.from("prodotti").delete().eq("id", id);
    }
    for (const id of [negozioAId, negozioBId]) {
      if (id) await db.from("negozi").delete().eq("id", id);
    }
    // 4. Utente di test
    if (utenteTestId) {
      const { error: errDelUtente } = await db.auth.admin.deleteUser(utenteTestId);
      console.log(`  Utente di test eliminato${errDelUtente ? " (ERRORE: " + errDelUtente.message + ")" : ""}`);
    }
    // 5. Server dev (albero completo: evita processi orfani che bloccano
    //    l'avvio di un nuovo dev server nella stessa directory)
    fermaServer();
    console.log("  Server dev fermato.");
    console.log("  Dati di test F2.2 eliminati (negozi, prodotti, varianti, ordini, utente).");
  }
}

main().catch((e) => {
  console.error("Errore durante l'esecuzione del test:", e);
  process.exit(1);
});
