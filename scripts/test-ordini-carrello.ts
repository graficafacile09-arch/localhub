/**
 * F2.1 TEST — RPC crea_ordine_carrello (multi-riga, DB REALE).
 *
 * Verifica contro il Supabase REALE la nuova RPC `public.crea_ordine_carrello`:
 *   T1  ordine multi-riga (2 prodotti legacy, spedizione) → ok, totale,
 *       snapshot, stock decrementato;
 *   T2  prodotti con e senza varianti (legacy + variante) → ok, variante_nome
 *       nello snapshot, stock della variante decrementato, aggregato padre;
 *   T3  stock insufficiente → SCORTE_INSUFFICIENTI, nessun ordine, nessun
 *       decremento (rollback);
 *   T4  rollback totale: riga A valida + riga B senza scorte → nessun ordine,
 *       stock della riga valida NON decrementato;
 *   T5  negozi diversi → NEGOZIO_DIVERSO, nessun ordine;
 *   T6  doppio checkout con la stessa idempotency key → giaEsistente, stesso
 *       ordine, stock decrementato UNA sola volta;
 *   T7  snapshot e totale server-side: prezzo_unitario/nome/immagine dal DB,
 *       totale = Σ(prezzo×qta) + spedizione (una volta);
 *   T8  ripristino compatibile con le funzioni esistenti: pending →
 *       pagamenti_ordine_scaduto → stock di TUTTE le righe ripristinato;
 *   T9  carrello con 1 sola riga → VALIDATION_ERROR (minimo 2).
 *
 * I dati di test (negozi, prodotti, varianti) sono creati con prefisso "F21-"
 * e CANCELLATI nel cleanup (ordini → ripristino stock → varianti → prodotti →
 * negozi). Uso: npx tsx scripts/test-ordini-carrello.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const raw = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
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

/** Payload della RPC crea_ordine_carrello (stesso naming del payload crea_ordine). */
type RigaCarrello = { prodottoId: string; varianteId?: string | null; quantita: number };
type PayloadCarrello = {
  idempotencyKey: string;
  modalita: "ritiro" | "spedizione";
  clienteNome: string;
  clienteCognome: string;
  clienteTelefono: string | null;
  clienteEmail: string | null;
  clienteUserId: string | null;
  clienteIp: string;
  ritiroData?: string | null;
  ritiroFascia?: string | null;
  spedizioneIndirizzo?: string | null;
  spedizioneCap?: string | null;
  spedizioneCitta?: string | null;
  spedizioneProvincia?: string | null;
  spedizioneNote?: string | null;
  // MOTORE TARIFFARIO (20260831): corriere + servizio (mai un prezzo dal client).
  spedizioneCarrier?: string | null;
  spedizioneServizio?: string | null;
  metodoPagamento?: string | null;
  note?: string | null;
  righe: RigaCarrello[];
};

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error("Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const db = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ts = Date.now();

  // ── 0. Dati di test: 2 negozi dedicati + prodotti (legacy e con varianti) ──
  let negozioAId: string | null = null;
  let negozioBId: string | null = null;
  let pLegacy1: number | null = null; // prezzo 10.00, stock 50
  let pLegacy2: number | null = null; // prezzo 20.50, stock 30
  let pVariant: number | null = null; // ha_varianti=true (padre)
  let v1Id: string | null = null;     // variante M: prezzo 6.00, stock 10
  let v2Id: string | null = null;     // variante L: prezzo 5.50, stock 8
  let pAltro: number | null = null;   // negozio B: prezzo 3.00, stock 100

  const ordiniCreati: string[] = [];

  const fail = (msg: string): never => {
    throw new Error(msg);
  };

  try {
    // Negozio A
    const { data: negozioA, error: errA } = await db
      .from("negozi")
      .insert({
        nome: `F21-StoreA-${ts}`,
        slug: `f21-storea-${ts}`,
        attivo: true,
        is_demo: true,
      })
      .select("id")
      .single();
    if (errA || !negozioA?.id) fail("Creazione negozio A fallita: " + (errA?.message ?? ""));
    negozioAId = String(negozioA!.id);

    // Negozio B (per il test NEGOZIO_DIVERSO)
    const { data: negozioB, error: errB } = await db
      .from("negozi")
      .insert({
        nome: `F21-StoreB-${ts}`,
        slug: `f21-storeb-${ts}`,
        attivo: true,
        is_demo: true,
      })
      .select("id")
      .single();
    if (errB || !negozioB?.id) fail("Creazione negozio B fallita: " + (errB?.message ?? ""));
    negozioBId = String(negozioB!.id);

    // Prodotti legacy in A
    const { data: p1, error: e1 } = await db
      .from("prodotti")
      .insert({ negozio_id: negozioAId, nome: `F21-ProdottoLegacy1-${ts}`, prezzo: 10.0, quantita_disponibile: 50, attivo: true, ha_varianti: false, peso_grammi: 500 })
      .select("id")
      .single();
    if (e1 || !p1) fail("Creazione prodotto legacy 1 fallita");
    pLegacy1 = Number(p1!.id);

    const { data: p2, error: e2 } = await db
      .from("prodotti")
      .insert({ negozio_id: negozioAId, nome: `F21-ProdottoLegacy2-${ts}`, prezzo: 20.5, quantita_disponibile: 30, attivo: true, ha_varianti: false, peso_grammi: 500 })
      .select("id")
      .single();
    if (e2 || !p2) fail("Creazione prodotto legacy 2 fallita");
    pLegacy2 = Number(p2!.id);

    // Prodotto con varianti (padre) + 2 varianti
    const { data: pv, error: ev } = await db
      .from("prodotti")
      .insert({ negozio_id: negozioAId, nome: `F21-ProdottoVarianti-${ts}`, prezzo: 5.0, quantita_disponibile: 0, attivo: true, ha_varianti: true, peso_grammi: 500 })
      .select("id")
      .single();
    if (ev || !pv) fail("Creazione prodotto con varianti fallita");
    pVariant = Number(pv!.id);

    const { data: v1, error: ve1 } = await db
      .from("prodotto_varianti")
      .insert({
        prodotto_id: pVariant,
        nome: "F21-Variante M",
        attributi: { taglia: "M" },
        prezzo: 6.0,
        quantita_disponibile: 10,
        quantita_riservata: 0,
        attivo: true,
      })
      .select("id")
      .single();
    if (ve1 || !v1) fail("Creazione variante M fallita");
    v1Id = String(v1!.id);

    const { data: v2, error: ve2 } = await db
      .from("prodotto_varianti")
      .insert({
        prodotto_id: pVariant,
        nome: "F21-Variante L",
        attributi: { taglia: "L" },
        prezzo: 5.5,
        quantita_disponibile: 8,
        quantita_riservata: 0,
        attivo: true,
      })
      .select("id")
      .single();
    if (ve2 || !v2) fail("Creazione variante L fallita");
    v2Id = String(v2!.id);

    // Prodotto in negozio B
    const { data: pB, error: eB } = await db
      .from("prodotti")
      .insert({ negozio_id: negozioBId, nome: `F21-ProdottoAltroNegozio-${ts}`, prezzo: 3.0, quantita_disponibile: 100, attivo: true, ha_varianti: false, peso_grammi: 500 })
      .select("id")
      .single();
    if (eB || !pB) fail("Creazione prodotto negozio B fallita");
    pAltro = Number(pB!.id);

    const ids = { pLegacy1: String(pLegacy1), pLegacy2: String(pLegacy2), pVariant: String(pVariant), v1: String(v1Id), v2: String(v2Id), pAltro: String(pAltro) };

    // ── T1: ordine multi-riga (2 legacy, spedizione standard) ────────────────
    console.log("\n[T1] Ordine multi-riga (2 prodotti legacy, spedizione standard)");
    {
      const key = `f21-t1-${ts}`;
      const payload: PayloadCarrello = {
        idempotencyKey: key,
        modalita: "spedizione",
        clienteNome: "Mario",
        clienteCognome: "Rossi",
        clienteTelefono: "3331234567",
        clienteEmail: "f21-t1@localhub.test",
        clienteUserId: null,
        clienteIp: "127.0.0.1",
        spedizioneIndirizzo: "Via Test 1",
        spedizioneCap: "87100",
        spedizioneCitta: "Cosenza",
        spedizioneProvincia: "CS",
        spedizioneNote: null,
        spedizioneCarrier: "poste_italiane",
        spedizioneServizio: "standard",
        metodoPagamento: "bonifico",
        note: null,
        righe: [
          { prodottoId: ids.pLegacy1, varianteId: null, quantita: 2 },
          { prodottoId: ids.pLegacy2, varianteId: null, quantita: 1 },
        ],
      };
      const { data, error } = await db.rpc("crea_ordine_carrello", { p_payload: payload });
      const esito = (data ?? null) as { ok?: boolean; giaEsistente?: boolean; ordine?: any; codice?: string; messaggio?: string } | null;
      check("RPC ok + ordine creato", !error && esito?.ok === true && esito?.giaEsistente === false && Boolean(esito?.ordine?.id), { error: error?.message, esito });
      if (error || esito?.ok !== true) fail("T1: crea_ordine_carrello fallita");
      const ordine = esito!.ordine!;
      ordiniCreati.push(String(ordine.id));

      // Totale server-side: 10.00×2 + 20.50×1 + 5.90 = 46.40
      check("totale server-side = 46.40 (Σ prezzo×qta + spedizione 5.90 una volta)", Number(ordine.totale) === 46.4, ordine.totale);
      check("2 righe nell'ordine", Array.isArray(ordine.righe) && ordine.righe.length === 2, ordine.righe);
      check("negozio unico (A)", String(ordine.negozioId) === negozioAId, ordine.negozioId);
      check("numero ordine valorizzato", typeof ordine.numero === "string" && ordine.numero.length > 0, ordine.numero);

      // Snapshot delle righe
      const riga1 = ordine.righe?.[0];
      const riga2 = ordine.righe?.[1];
      check("snapshot riga 1: prodottoId + nome", String(riga1?.prodottoId) === ids.pLegacy1 && String(riga1?.nomeProdotto ?? "").startsWith("F21-ProdottoLegacy1"), riga1);
      check("snapshot riga 1: prezzo unitario 10.00 dal DB", Number(riga1?.prezzoUnitario) === 10.0, riga1?.prezzoUnitario);
      check("snapshot riga 2: prezzo unitario 20.50 dal DB", Number(riga2?.prezzoUnitario) === 20.5, riga2?.prezzoUnitario);

      // Stock decrementato sul DB
      const { data: stock1 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pLegacy1).single();
      const { data: stock2 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pLegacy2).single();
      check("stock legacy1 50 → 48", Number(stock1?.quantita_disponibile) === 48, stock1?.quantita_disponibile);
      check("stock legacy2 30 → 29", Number(stock2?.quantita_disponibile) === 29, stock2?.quantita_disponibile);
    }

    // ── T2: prodotti con e senza varianti ────────────────────────────────────
    console.log("\n[T2] Mix prodotti legacy + variante");
    {
      const key = `f21-t2-${ts}`;
      const payload: PayloadCarrello = {
        idempotencyKey: key,
        modalita: "ritiro",
        clienteNome: "Luigi",
        clienteCognome: "Verdi",
        clienteTelefono: null,
        clienteEmail: null,
        clienteUserId: null,
        clienteIp: "127.0.0.1",
        ritiroData: "2026-09-01",
        ritiroFascia: "10:00–11:00",
        righe: [
          { prodottoId: ids.pLegacy1, varianteId: null, quantita: 1 },
          { prodottoId: ids.pVariant, varianteId: ids.v1, quantita: 2 },
        ],
      };
      const { data, error } = await db.rpc("crea_ordine_carrello", { p_payload: payload });
      const esito = (data ?? null) as { ok?: boolean; ordine?: any; codice?: string; messaggio?: string } | null;
      check("RPC ok (ritiro, legacy + variante)", !error && esito?.ok === true && Boolean(esito?.ordine?.id), { error: error?.message, esito });
      if (error || esito?.ok !== true) fail("T2: crea_ordine_carrello fallita");
      const ordine = esito!.ordine!;
      ordiniCreati.push(String(ordine.id));

      // Totale: 10.00×1 + 6.00×2 = 22.00 (ritiro: nessuna spedizione)
      check("totale server-side = 22.00 (prezzo VARIANTE 6.00 dal DB)", Number(ordine.totale) === 22.0, ordine.totale);
      check("2 righe nell'ordine", Array.isArray(ordine.righe) && ordine.righe.length === 2, ordine.righe);

      const rigaVariante = ordine.righe?.find((r: any) => String(r.prodottoId) === ids.pVariant);
      check("snapshot variante: prezzo 6.00 (variante, non padre)", Number(rigaVariante?.prezzoUnitario) === 6.0, rigaVariante?.prezzoUnitario);
      check("snapshot variante: nome prodotto padre", String(rigaVariante?.nomeProdotto ?? "").startsWith("F21-ProdottoVarianti"), rigaVariante?.nomeProdotto);

      // Stock della VARIANTE decrementato (10 → 8)
      const { data: vStock } = await db.from("prodotto_varianti").select("quantita_disponibile").eq("id", v1Id).single();
      check("stock variante M 10 → 8", Number(vStock?.quantita_disponibile) === 8, vStock?.quantita_disponibile);

      // Aggregato padre (trigger E1): 8 (M) + 8 (L) = 16
      const { data: pStock } = await db.from("prodotti").select("quantita_disponibile").eq("id", pVariant).single();
      check("aggregato padre (trigger E1) = 16", Number(pStock?.quantita_disponibile) === 16, pStock?.quantita_disponibile);
    }

    // ── T3: stock insufficiente → SCORTE_INSUFFICIENTI, nessun decremento ────
    console.log("\n[T3] Stock insufficiente");
    {
      const key = `f21-t3-${ts}`;
      const payload: PayloadCarrello = {
        idempotencyKey: key,
        modalita: "ritiro",
        clienteNome: "Anna",
        clienteCognome: "Bianchi",
        clienteTelefono: null,
        clienteEmail: null,
        clienteUserId: null,
        clienteIp: "127.0.0.1",
        righe: [
          { prodottoId: ids.pLegacy2, varianteId: null, quantita: 2 },   // 29 disponibili → ok
          { prodottoId: ids.pLegacy1, varianteId: null, quantita: 60 }, // 48 disponibili → KO (≤99, supera lo stock)
        ],
      };
      const { data, error } = await db.rpc("crea_ordine_carrello", { p_payload: payload });
      const esito = (data ?? null) as { ok?: boolean; codice?: string; messaggio?: string } | null;
      check("SCORTE_INSUFFICIENTI (no error RPC)", !error && esito?.ok === false && esito?.codice === "SCORTE_INSUFFICIENTI", { error: error?.message, esito });
      check("messaggio indica il prodotto", typeof esito?.messaggio === "string" && esito.messaggio.includes("F21-ProdottoLegacy1"), esito?.messaggio);

      // Nessun ordine creato
      const { data: ordine } = await db.from("ordini").select("id").eq("idempotency_key", key).maybeSingle();
      check("nessun ordine creato", ordine === null);

      // Nessun decremento: stock legacy2 resta 29 (riga valida NON decrementata)
      const { data: stock2 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pLegacy2).single();
      check("rollback: stock legacy2 invariato (29)", Number(stock2?.quantita_disponibile) === 29, stock2?.quantita_disponibile);
    }

    // ── T4: rollback totale (riga valida + riga senza scorte) ────────────────
    console.log("\n[T4] Rollback totale");
    {
      const key = `f21-t4-${ts}`;
      const payload: PayloadCarrello = {
        idempotencyKey: key,
        modalita: "spedizione",
        clienteNome: "Carlo",
        clienteCognome: "Neri",
        clienteTelefono: null,
        clienteEmail: null,
        clienteUserId: null,
        clienteIp: "127.0.0.1",
        spedizioneIndirizzo: "Via X 2",
        spedizioneCap: "00100",
        spedizioneCitta: "Roma",
        spedizioneProvincia: "RM",
        spedizioneCarrier: "poste_italiane",
        spedizioneServizio: "express",
        metodoPagamento: "bonifico",
        righe: [
          { prodottoId: ids.pLegacy2, varianteId: null, quantita: 1 },   // valida
          { prodottoId: ids.pVariant, varianteId: ids.v1, quantita: 60 }, // variante (8 disponibili) → KO (≤99)
        ],
      };
      const { data, error } = await db.rpc("crea_ordine_carrello", { p_payload: payload });
      const esito = (data ?? null) as { ok?: boolean; codice?: string; messaggio?: string } | null;
      check("SCORTE_INSUFFICIENTI sulla variante", !error && esito?.ok === false && esito?.codice === "SCORTE_INSUFFICIENTI", { error: error?.message, esito });

      const { data: ordine } = await db.from("ordini").select("id").eq("idempotency_key", key).maybeSingle();
      check("nessun ordine creato (rollback totale)", ordine === null);

      // Stock della riga VALIDA (legacy2) NON decrementato: resta 29
      const { data: stock2 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pLegacy2).single();
      check("rollback: stock riga valida invariato (29)", Number(stock2?.quantita_disponibile) === 29, stock2?.quantita_disponibile);
      // Stock della variante invariato (8)
      const { data: vStock } = await db.from("prodotto_varianti").select("quantita_disponibile").eq("id", v1Id).single();
      check("rollback: stock variante invariato (8)", Number(vStock?.quantita_disponibile) === 8, vStock?.quantita_disponibile);
      // Nessuna riga ordine orfana: le righe residue sui prodotti di test sono
      // SOLO quelle create dai test riusciti (T1=2, T2=2, T6=2, T7=3 → 9; le
      // righe di T8 appartengono all'ordine T8, anch'esso non ancora creato
      // qui). Al momento del T4 le righe accumulate sono T1(2)+T2(2)=4.
      const { count: righeCount } = await db
        .from("ordini_righe")
        .select("id", { count: "exact", head: true })
        .in("prodotto_id", [Number(pLegacy1), Number(pLegacy2), Number(pVariant)]);
      check("nessuna riga ordine orfana dal T4 (attese 4: T1+T2)", Number(righeCount ?? 0) === 4, righeCount);
    }

    // ── T5: negozi diversi → NEGOZIO_DIVERSO ─────────────────────────────────
    console.log("\n[T5] Negozi diversi → NEGOZIO_DIVERSO");
    {
      const key = `f21-t5-${ts}`;
      const payload: PayloadCarrello = {
        idempotencyKey: key,
        modalita: "ritiro",
        clienteNome: "Giulia",
        clienteCognome: "Gialli",
        clienteTelefono: null,
        clienteEmail: null,
        clienteUserId: null,
        clienteIp: "127.0.0.1",
        righe: [
          { prodottoId: ids.pLegacy1, varianteId: null, quantita: 1 }, // negozio A
          { prodottoId: ids.pAltro, varianteId: null, quantita: 1 },   // negozio B
        ],
      };
      const { data, error } = await db.rpc("crea_ordine_carrello", { p_payload: payload });
      const esito = (data ?? null) as { ok?: boolean; codice?: string; messaggio?: string } | null;
      check("NEGOZIO_DIVERSO", !error && esito?.ok === false && esito?.codice === "NEGOZIO_DIVERSO", { error: error?.message, esito });

      const { data: ordine } = await db.from("ordini").select("id").eq("idempotency_key", key).maybeSingle();
      check("nessun ordine creato", ordine === null);
    }

    // ── T6: doppio checkout con la stessa idempotency key ────────────────────
    console.log("\n[T6] Idempotenza (stessa chiave → stesso ordine, un solo decremento)");
    {
      const key = `f21-t6-${ts}`;
      const payload: PayloadCarrello = {
        idempotencyKey: key,
        modalita: "ritiro",
        clienteNome: "Marco",
        clienteCognome: "Blu",
        clienteTelefono: null,
        clienteEmail: null,
        clienteUserId: null,
        clienteIp: "127.0.0.1",
        righe: [
          { prodottoId: ids.pLegacy1, varianteId: null, quantita: 1 },
          { prodottoId: ids.pLegacy2, varianteId: null, quantita: 1 },
        ],
      };
      const r1 = await db.rpc("crea_ordine_carrello", { p_payload: payload });
      const e1 = (r1.data ?? null) as { ok?: boolean; giaEsistente?: boolean; ordine?: any } | null;
      check("primo checkout ok (non esistente)", !r1.error && e1?.ok === true && e1?.giaEsistente === false, e1);
      const ordineIdPrimo = e1?.ordine?.id ? String(e1.ordine.id) : null;
      if (!ordineIdPrimo) fail("T6: primo checkout senza ordine");
      // fail() lancia sempre → da qui ordineIdPrimo è garantito non-null.
      ordiniCreati.push(ordineIdPrimo!);

      // Secondo checkout stessa chiave
      const r2 = await db.rpc("crea_ordine_carrello", { p_payload: payload });
      const e2 = (r2.data ?? null) as { ok?: boolean; giaEsistente?: boolean; ordine?: any } | null;
      check("secondo checkout → giaEsistente=true", !r2.error && e2?.ok === true && e2?.giaEsistente === true, e2);
      check("stesso ordine restituito", e2?.ordine?.id ? String(e2.ordine.id) === ordineIdPrimo : false, e2?.ordine?.id);

      // Un solo ordine nel DB con quella chiave
      const { data: ordini } = await db.from("ordini").select("id").eq("idempotency_key", key);
      check("un solo ordine nel DB", Array.isArray(ordini) && ordini.length === 1, ordini);

      // Stock decrementato UNA sola volta: legacy1 era 48 (dopo T1 50-2 e T2 48-1=47?) — ricalcolo:
      // T1: 50→48; T2: 48→47; ora T6: 47→46. Un solo decremento → 46.
      const { data: stock1 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pLegacy1).single();
      check("stock legacy1 decrementato UNA sola volta (47 → 46)", Number(stock1?.quantita_disponibile) === 46, stock1?.quantita_disponibile);
    }

    // ── T7: snapshot e totale server-side (mai dal client) ───────────────────
    console.log("\n[T7] Snapshot e totale calcolati dal DB");
    {
      const key = `f21-t7-${ts}`;
      const payload: PayloadCarrello = {
        idempotencyKey: key,
        modalita: "spedizione",
        clienteNome: "Sara",
        clienteCognome: "Arancio",
        clienteTelefono: null,
        clienteEmail: null,
        clienteUserId: null,
        clienteIp: "127.0.0.1",
        spedizioneIndirizzo: "Via Y 3",
        spedizioneCap: "20100",
        spedizioneCitta: "Milano",
        spedizioneProvincia: "MI",
        spedizioneCarrier: "poste_italiane",
        spedizioneServizio: "express",
        metodoPagamento: "bonifico",
        righe: [
          { prodottoId: ids.pLegacy1, varianteId: null, quantita: 3 },  // 10.00×3 = 30.00
          { prodottoId: ids.pLegacy2, varianteId: null, quantita: 2 },  // 20.50×2 = 41.00
          { prodottoId: ids.pVariant, varianteId: ids.v2, quantita: 1 },// 5.50×1  =  5.50
        ],
      };
      const { data, error } = await db.rpc("crea_ordine_carrello", { p_payload: payload });
      const esito = (data ?? null) as { ok?: boolean; ordine?: any; codice?: string; messaggio?: string } | null;
      check("RPC ok (3 righe)", !error && esito?.ok === true && Boolean(esito?.ordine?.id), { error: error?.message, esito });
      if (error || esito?.ok !== true) fail("T7: crea_ordine_carrello fallita");
      const ordine = esito!.ordine!;
      ordiniCreati.push(String(ordine.id));

      // Totale: 30.00 + 41.00 + 5.50 + 7.70 (Poste Express 2-3kg, UNA volta) = 84.20
      check("totale = 84.20 (Σ + Poste Express 2-3kg 7.70 una volta)", Number(ordine.totale) === 84.2, ordine.totale);
      const { data: costoDb } = await db
        .from("ordini")
        .select("costo_spedizione")
        .eq("id", String(ordine.id))
        .single();
      check("costo_spedizione = 7.70 nel DB (una volta per ordine)", Number(costoDb?.costo_spedizione ?? 0) === 7.7, costoDb?.costo_spedizione);
      check("3 righe nell'ordine", Array.isArray(ordine.righe) && ordine.righe.length === 3, ordine.righe);

      const rigaL2 = ordine.righe?.find((r: any) => String(r.prodottoId) === ids.pLegacy2);
      check("snapshot prezzo legacy2 = 20.50 dal DB", Number(rigaL2?.prezzoUnitario) === 20.5, rigaL2?.prezzoUnitario);
      const rigaV2 = ordine.righe?.find((r: any) => String(r.prodottoId) === ids.pVariant);
      check("snapshot prezzo variante L = 5.50 (non il prezzo client)", Number(rigaV2?.prezzoUnitario) === 5.5, rigaV2?.prezzoUnitario);

      // verifica diretta sul DB (non solo sul json restituito)
      const { data: righeDb } = await db
        .from("ordini_righe")
        .select("prodotto_id, nome_prodotto, prezzo_unitario, quantita, variante_nome")
        .eq("ordine_id", String(ordine.id))
        .order("created_at", { ascending: true });
      check("3 righe nel DB", Array.isArray(righeDb) && righeDb.length === 3, righeDb);
      const rV2 = (righeDb ?? []).find((r: any) => String(r.prodotto_id) === ids.pVariant);
      check("variante_nome salvato ('F21-Variante L')", String(rV2?.variante_nome ?? "") === "F21-Variante L", rV2?.variante_nome);
      check("nome_prodotto snapshot nel DB", String(rV2?.nome_prodotto ?? "").startsWith("F21-ProdottoVarianti"), rV2?.nome_prodotto);
      check("prezzo_unitario variante nel DB = 5.50", Number(rV2?.prezzo_unitario) === 5.5, rV2?.prezzo_unitario);
      check("quantita variante nel DB = 1", Number(rV2?.quantita) === 1, rV2?.quantita);

      // Stock variante L: 8 → 7
      const { data: v2Stock } = await db.from("prodotto_varianti").select("quantita_disponibile").eq("id", v2Id).single();
      check("stock variante L 8 → 7", Number(v2Stock?.quantita_disponibile) === 7, v2Stock?.quantita_disponibile);
    }

    // ── T8: ripristino compatibile con le funzioni esistenti ─────────────────
    console.log("\n[T8] Ripristino stock tramite funzioni esistenti (scadenza pagamento)");
    {
      const key = `f21-t8-${ts}`;
      const payload: PayloadCarrello = {
        idempotencyKey: key,
        modalita: "spedizione",
        clienteNome: "Paolo",
        clienteCognome: "Viola",
        clienteTelefono: null,
        clienteEmail: null,
        clienteUserId: null,
        clienteIp: "127.0.0.1",
        spedizioneIndirizzo: "Via Z 4",
        spedizioneCap: "35100",
        spedizioneCitta: "Padova",
        spedizioneProvincia: "PD",
        spedizioneCarrier: "poste_italiane",
        spedizioneServizio: "standard",
        metodoPagamento: "carta",
        // Storia stock legacy1: 50 → T1(2)→48 → T2(1)→47 → T6(1)→46 → T7(3)→43.
        // T8 (qty 2) porta a 41 e la scadenza ripristina a 43.
        righe: [
          { prodottoId: ids.pLegacy1, varianteId: null, quantita: 2 }, // 43 → 41
          { prodottoId: ids.pVariant, varianteId: ids.v1, quantita: 1 }, // 8 → 7
        ],
      };
      const { data, error } = await db.rpc("crea_ordine_carrello", { p_payload: payload });
      const esito = (data ?? null) as { ok?: boolean; ordine?: any; codice?: string; messaggio?: string } | null;
      check("RPC ok", !error && esito?.ok === true && Boolean(esito?.ordine?.id), { error: error?.message, esito });
      if (error || esito?.ok !== true) fail("T8: crea_ordine_carrello fallita");
      const ordineId = String(esito!.ordine!.id);
      ordiniCreati.push(ordineId);

      // Stato pagamento → pending (funzione esistente F1)
      const { error: pendingErr } = await db.rpc("aggiorna_payment_status", {
        p_ordine_id: ordineId,
        p_nuovo_stato: "pending",
        p_payment_id: null,
        p_transaction_id: null,
        p_importo: null,
        p_valuta: null,
        p_expires_at: null,
      });
      check("aggiorna_payment_status → pending ok", !pendingErr, pendingErr?.message);

      // Scadenza pagamento (funzione esistente F1): ripristina stock di TUTTE le righe
      const { data: scaduto, error: scadErr } = await db.rpc("pagamenti_ordine_scaduto", { p_ordine_id: ordineId });
      const esitoScad = (scaduto ?? null) as { ok?: boolean; stato?: string } | null;
      check("pagamenti_ordine_scaduto ok (stato expired)", !scadErr && esitoScad?.ok === true && esitoScad?.stato === "expired", { error: scadErr?.message, esitoScad });

      // Ordine annullato con motivo di sistema
      const { data: ordineDb } = await db.from("ordini").select("stato, payment_status, annullato_motivo").eq("id", ordineId).single();
      check("ordine → cancellato (pagamento_scaduto)", ordineDb?.stato === "cancellato" && ordineDb?.annullato_motivo === "pagamento_scaduto", ordineDb);
      check("payment_status → expired", ordineDb?.payment_status === "expired", ordineDb?.payment_status);

      // Stock ripristinato: legacy1 41 → 43; variante M 7 → 8
      const { data: stock1 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pLegacy1).single();
      check("stock legacy1 ripristinato (41 → 43)", Number(stock1?.quantita_disponibile) === 43, stock1?.quantita_disponibile);
      const { data: vStock } = await db.from("prodotto_varianti").select("quantita_disponibile").eq("id", v1Id).single();
      check("stock variante M ripristinato (7 → 8)", Number(vStock?.quantita_disponibile) === 8, vStock?.quantita_disponibile);
      // Aggregato padre: 8 (M) + 7 (L) = 15
      const { data: pStock } = await db.from("prodotti").select("quantita_disponibile").eq("id", pVariant).single();
      check("aggregato padre ricalcolato (15)", Number(pStock?.quantita_disponibile) === 15, pStock?.quantita_disponibile);
    }

    // ── Validazione aggiuntiva: righe < 2 → VALIDATION_ERROR ─────────────────
    console.log("\n[T9] Carrello con 1 sola riga → VALIDATION_ERROR");
    {
      const key = `f21-t9-${ts}`;
      const payload: PayloadCarrello = {
        idempotencyKey: key,
        modalita: "ritiro",
        clienteNome: "Elena",
        clienteCognome: "Marrone",
        clienteTelefono: null,
        clienteEmail: null,
        clienteUserId: null,
        clienteIp: "127.0.0.1",
        righe: [{ prodottoId: ids.pLegacy1, varianteId: null, quantita: 1 }],
      };
      const { data, error } = await db.rpc("crea_ordine_carrello", { p_payload: payload });
      const esito = (data ?? null) as { ok?: boolean; codice?: string; messaggio?: string } | null;
      check("VALIDATION_ERROR (min 2 righe)", !error && esito?.ok === false && esito?.codice === "VALIDATION_ERROR", { error: error?.message, esito });
      const { data: ordine } = await db.from("ordini").select("id").eq("idempotency_key", key).maybeSingle();
      check("nessun ordine creato", ordine === null);
    }

    // ── Riepilogo finale ──────────────────────────────────────────────────────
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`ORDINI CARRELLO TEST: ${passati} passati, ${falliti} falliti`);
    if (falliti > 0) {
      console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
      process.exit(1);
    }
    console.log("TUTTI I TEST PASSATI ✓");
  } finally {
    // ── CLEANUP COMPLETO ─────────────────────────────────────────────────────
    console.log("\n── CLEANUP TEST F2.1 ──");
    // 1. Ordini di test (cascade su ordini_righe / pagamenti_sessioni)
    if (ordiniCreati.length > 0) {
      const { error: delOrdini } = await db.from("ordini").delete().in("id", ordiniCreati);
      console.log(`  Ordini eliminati: ${ordiniCreati.length}${delOrdini ? " (ERRORE: " + delOrdini.message + ")" : ""}`);
    }
    // 2. Ripristino stock ai valori iniziali (i delete degli ordini NON ripristinano stock)
    if (pLegacy1 !== null) {
      await db.from("prodotti").update({ quantita_disponibile: 50 }).eq("id", pLegacy1);
    }
    if (pLegacy2 !== null) {
      await db.from("prodotti").update({ quantita_disponibile: 30 }).eq("id", pLegacy2);
    }
    if (pAltro !== null) {
      await db.from("prodotti").update({ quantita_disponibile: 100 }).eq("id", pAltro);
    }
    if (v1Id !== null) {
      await db.from("prodotto_varianti").update({ quantita_disponibile: 10 }).eq("id", v1Id);
    }
    if (v2Id !== null) {
      await db.from("prodotto_varianti").update({ quantita_disponibile: 8 }).eq("id", v2Id);
    }
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
    console.log("  Dati di test F2.1 eliminati (negozi, prodotti, varianti, ordini).");
  }
}

main().catch((e) => {
  console.error("Errore durante l'esecuzione del test:", e);
  process.exit(1);
});
