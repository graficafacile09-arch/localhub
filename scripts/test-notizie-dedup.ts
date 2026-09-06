/**
 * TEST P1 — DEDUPLICAZIONE NOTIZIE
 *
 * Verifica la dedup robusta multi-chiave introdotta dal fix P1:
 *
 *   1. Unit (senza DB): normalizzazione URL, url_hash/ext_hash/
 *      titolo_fonte_hash, rimozione suffisso testata (" - ", " · ", " • ").
 *   2. PostgreSQL reale/ephemeral (Docker): applica le migration notizie +
 *      la migration P1, poi verifica:
 *      - stessa notizia due volte → una sola riga;
 *      - URL con parametri di tracking diversi → duplicato riconosciuto;
 *      - stesso articolo da due fonti → una sola riga;
 *      - titolo leggermente diverso con URL uguale → duplicato;
 *      - guid/URL mutati ma stessa testata+titolo (caso Google reale) →
 *        duplicato riconosciuto tramite titolo_fonte_hash;
 *      - notizie realmente diverse → inserite;
 *      - backfill first-wins: nessun vincolo violato, nessuna cancellazione;
 *      - concorrenza: due inserimenti paralleli → una sola riga;
 *      - accordo JS ↔ SQL degli hash (la migration deve produrre gli stessi
 *        valori del codice, per il backfill).
 *
 * Uso:
 *   docker run -d --name incitta-p1-pg -e POSTGRES_PASSWORD=test \
 *     -e POSTGRES_DB=incitta -p 5433:5432 postgres:16-alpine
 *   npx tsx scripts/test-notizie-dedup.ts
 *
 * Sovrascrivibile con P1_PG_URL (es. postgres://user:pass@host:port/db).
 * NON tocca mai il database remoto di produzione.
 */

import { readFileSync } from "node:fs";
// pg non ha tipi bundled (@types/pg non installato): il test è runtime-only.
// @ts-expect-error — modulo senza dichiarazione di tipi
import pg from "pg";
import {
  calcolaExtHash,
  calcolaTitoloFonteHash,
  calcolaUrlHash,
  normalizzaUrlCanonica,
  rimuoviSuffissoTestata,
} from "@/lib/notizie/dedup";
import { titoloSenzaSuffissoFonte, type VoceAcquisita } from "@/lib/notizie/acquisitori";
import { calcolaDedupHash, normalizzaVoce } from "@/lib/notizie/import";
import type { NotiziaNormalizzata } from "@/lib/notizie/types";
import { FONTI_ID } from "@/lib/notizie/fonti";

const { Client } = pg;

let passati = 0;
let falliti = 0;

function check(label: string, cond: boolean, dettaglio?: unknown) {
  if (cond) {
    passati++;
    console.log(`  ✅ ${label}`);
  } else {
    falliti++;
    console.log(`  ❌ ${label}${dettaglio !== undefined ? ` — ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

const PG_URL = process.env.P1_PG_URL ?? "postgres://postgres:test@localhost:5433/incitta";
const MARCA = `p1test${Date.now()}`;

/** Costruisce una notizia normalizzata esattamente come il job. */
function makeNotizia(p: {
  title: string;
  url: string;
  guid?: string | null;
  source?: string;
  fonteId?: string;
  data?: string | null;
}): NotiziaNormalizzata {
  const sourceName = p.source ?? "Fonte Test P1";
  const title = p.title;
  return {
    fonteId: p.fonteId ?? FONTI_ID.GOOGLE_NEWS_CV,
    sourceName,
    title,
    excerpt: null,
    originalUrl: p.url,
    externalId: p.guid ?? null,
    publishedAt: p.data ?? "2026-09-03T10:00:00.000Z",
    category: "Territorio",
    imageUrl: null,
    dedupHash: calcolaDedupHash(title),
    urlHash: calcolaUrlHash(p.url),
    extHash: calcolaExtHash(sourceName, p.guid ?? null),
    titoloFonteHash: calcolaTitoloFonteHash(sourceName, title),
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   1. UNIT TEST — normalizzazione e hash (nessun DB)
   ═══════════════════════════════════════════════════════════════════════ */
function unitTests() {
  console.log("\n=== 1. UNIT — normalizzazione URL ===\n");

  check(
    "tracking params rimossi",
    normalizzaUrlCanonica("https://esempio.it/notizia?utm_source=rss&utm_campaign=x&id=42") ===
      "https://esempio.it/notizia?id=42"
  );
  check(
    "parametro Google oc rimosso",
    normalizzaUrlCanonica("https://news.google.com/rss/articles/CBMiXXX?oc=5") ===
      "https://news.google.com/rss/articles/cbmixxx"
  );
  check(
    "fragment rimosso",
    normalizzaUrlCanonica("https://esempio.it/a?x=1#sezione") === "https://esempio.it/a?x=1"
  );
  check(
    "lowercase host e path",
    normalizzaUrlCanonica("HTTPS://Esempio.IT/Path/?a=1") === "https://esempio.it/path?a=1"
  );
  check(
    "slash finale rimosso",
    normalizzaUrlCanonica("https://esempio.it/notizia/") === "https://esempio.it/notizia"
  );
  check(
    "separatori collassati",
    normalizzaUrlCanonica("https://esempio.it/a?x=1&&y=2") === "https://esempio.it/a?x=1&y=2"
  );
  check(
    "tracking uppercase rimosso (case-insensitive)",
    normalizzaUrlCanonica("https://esempio.it/a?UTM_SOURCE=x&id=7") === "https://esempio.it/a?id=7"
  );

  console.log("\n=== 2. UNIT — hash ===\n");

  const u1 = calcolaUrlHash("https://esempio.it/a?utm_source=x&b=1");
  const u2 = calcolaUrlHash("https://esempio.it/a?b=1&utm_campaign=y");
  check("stessa URL con tracking diverso → stesso url_hash", u1 === u2);
  check("URL diverse → url_hash diversi", calcolaUrlHash("https://esempio.it/a") !== calcolaUrlHash("https://esempio.it/b"));

  const e1 = calcolaExtHash("LaC News24", "CBMiXXX");
  const e2 = calcolaExtHash("lac news24", "CBMiXXX");
  check("ext_hash case-insensitive sulla testata", e1 === e2);
  check("ext_hash null senza guid", calcolaExtHash("LaC News24", null) === null);
  check("ext_hash null con guid vuoto", calcolaExtHash("LaC News24", "  ") === null);

  const t1 = calcolaTitoloFonteHash(
    "LaC News24",
    "Poste, sanità e trasporti, il Pd di Castrovillari chiede conto alla filiera istituzionale · LaC News24"
  );
  const t2 = calcolaTitoloFonteHash(
    "LaC News24",
    "Poste, sanità e trasporti, il Pd di Castrovillari chiede conto alla filiera istituzionale"
  );
  check("stessa testata+notizia (suffisso '·') → stesso titolo_fonte_hash", t1 === t2);
  check(
    "titolo_fonte_hash diverso per testate diverse",
    calcolaTitoloFonteHash("LaC News24", "Il sindaco convoca il consiglio") !==
      calcolaTitoloFonteHash("quicosenza", "Il sindaco convoca il consiglio")
  );

  console.log("\n=== 3. UNIT — rimozione suffisso testata ===\n");

  check("suffisso ' - ' rimosso", titoloSenzaSuffissoFonte("Notizia - LaC News24", "LaC News24") === "Notizia");
  check("suffisso ' · ' rimosso", titoloSenzaSuffissoFonte("Notizia · LaC News24", "LaC News24") === "Notizia");
  check("suffisso ' • ' rimosso", titoloSenzaSuffissoFonte("Notizia • LaC News24", "LaC News24") === "Notizia");
  check(
    "nessun suffisso → invariato",
    titoloSenzaSuffissoFonte("Notizia importante", "LaC News24") === "Notizia importante"
  );
  check(
    "suffisso con testata punteggiata",
    titoloSenzaSuffissoFonte("Riapertura della filiale - rainews.it", "rainews.it") === "Riapertura della filiale"
  );
  check("rimuoviSuffissoTestata identico", rimuoviSuffissoTestata("A · Test Fonte P1", "Test Fonte P1") === "A");

  console.log("\n=== 4. UNIT — normalizzaVoce calcola le nuove chiavi ===\n");

  const voce: VoceAcquisita = {
    title: "Una notizia di prova · Test Fonte P1",
    url: "https://news.google.com/rss/articles/CBMiXXX?oc=5",
    excerpt: null,
    data: "2026-09-03T10:00:00.000Z",
    externalId: "CBMiXXX",
    source: "Test Fonte P1",
  };
  const n = normalizzaVoce(
    { id: FONTI_ID.GOOGLE_NEWS_CV, nome: "Google News · Castrovillari", tipo: "rss", urlFeed: null, urlLista: null, urlBase: "https://news.google.com", categoriaDefault: "Territorio", attiva: true, frequenzaMinuti: 60, scoperta: true },
    voce
  );
  check("urlHash presente", typeof n.urlHash === "string" && n.urlHash.length === 64);
  check("extHash presente", typeof n.extHash === "string" && n.extHash.length === 64);
  check("titoloFonteHash presente", typeof n.titoloFonteHash === "string" && n.titoloFonteHash.length === 64);
  check(
    "titoloFonteHash senza suffisso '·'",
    n.titoloFonteHash === calcolaTitoloFonteHash("Test Fonte P1", "Una notizia di prova")
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   2. POSTGRESQL REALE (ephemeral Docker) — migration + RPC + concorrenza
   ═══════════════════════════════════════════════════════════════════════ */

async function setupDb(client: pg.Client) {
  await client.query(`
    do $$ begin
      if not exists (select from pg_roles where rolname = 'anon') then execute 'create role anon nologin'; end if;
      if not exists (select from pg_roles where rolname = 'authenticated') then execute 'create role authenticated nologin'; end if;
      if not exists (select from pg_roles where rolname = 'service_role') then execute 'create role service_role nologin'; end if;
    end $$;
  `);
  for (const f of [
    "supabase/migrations/20260903_notizie_aggregatore.sql",
    "supabase/migrations/20260903_notizie_google_discovery.sql",
    "supabase/migrations/20261002_p1_notizie_deduplicazione.sql",
  ]) {
    await client.query(readFileSync(f, "utf8"));
  }
}

/** Inserisce via RPC (stessa chiamata del cron). */
async function inserisci(client: pg.Client, n: NotiziaNormalizzata): Promise<boolean> {
  const res = await client.query(
    `select public.notizie_inserisci(
       $1::uuid, $2::text, $3::text, $4::text, $5::text, $6::text, $7::timestamptz,
       $8::text, $9::text, $10::text, $11::text, $12::text, $13::text) as inserita`,
    [
      n.fonteId, n.sourceName, n.title, n.excerpt, n.originalUrl, n.externalId, n.publishedAt,
      n.category, n.imageUrl, n.dedupHash, n.urlHash, n.extHash, n.titoloFonteHash,
    ]
  );
  return res.rows[0].inserita === true;
}

async function conteggio(client: pg.Client, colonna: "url_hash" | "ext_hash" | "titolo_fonte_hash", valore: string): Promise<number> {
  const res = await client.query(
    `select count(*)::int as n from public.notizie where ${colonna} = $1`,
    [valore]
  );
  return res.rows[0].n;
}

async function dbTests(client: pg.Client) {
  console.log("\n=== 5. DB — stessa notizia due volte → una sola riga ===\n");

  const nA = makeNotizia({ title: `${MARCA} A — una tantum`, url: `https://esempio.it/articolo-a-${MARCA}`, guid: `guid-a-${MARCA}` });
  const r1 = await inserisci(client, nA);
  const r2 = await inserisci(client, nA);
  check("prima esecuzione inserisce (true)", r1 === true);
  check("seconda esecuzione NON inserisce (false)", r2 === false);
  check(
    "una sola riga",
    (await conteggio(client, "titolo_fonte_hash", nA.titoloFonteHash)) === 1
  );

  console.log("\n=== 6. DB — URL con tracking diversi → duplicato riconosciuto ===\n");

  const nB1 = makeNotizia({
    title: `${MARCA} B — url tracking`,
    url: `https://esempio.it/articolo-b-${MARCA}?utm_source=rss&utm_campaign=x`,
    guid: `guid-b1-${MARCA}`,
  });
  const nB2 = makeNotizia({
    title: `${MARCA} B — url tracking aggiornata`,
    url: `https://esempio.it/articolo-b-${MARCA}?utm_campaign=y&utm_medium=feed`,
    guid: `guid-b2-${MARCA}`,
  });
  check("stesso url_hash (tracking ignorato)", nB1.urlHash === nB2.urlHash);
  check("titolo_fonte_hash diverso (isola url_hash)", nB1.titoloFonteHash !== nB2.titoloFonteHash);
  const b1 = await inserisci(client, nB1);
  const b2 = await inserisci(client, nB2);
  check("primo inserito (true)", b1 === true);
  check("secondo bloccato da url_hash (false)", b2 === false);
  check("una sola riga per URL", (await conteggio(client, "url_hash", nB1.urlHash)) === 1);

  console.log("\n=== 7. DB — stesso articolo da due fonti → una sola riga ===\n");

  const nC1 = makeNotizia({
    fonteId: FONTI_ID.GOOGLE_NEWS_CV,
    source: "Testata C",
    title: `${MARCA} C — articolo da due fonti`,
    url: `https://esempio.it/articolo-c-${MARCA}/q1`,
    guid: `guid-c-${MARCA}`,
  });
  const nC2 = makeNotizia({
    fonteId: FONTI_ID.GOOGLE_NEWS_COMUNE,
    source: "Testata C",
    title: `${MARCA} C — articolo da due fonti (titolo lievemente diverso)`,
    url: `https://esempio.it/articolo-c-${MARCA}/q2`,
    guid: `guid-c-${MARCA}`,
  });
  check("stesso ext_hash (testata+guid)", nC1.extHash === nC2.extHash);
  check("url_hash diversi", nC1.urlHash !== nC2.urlHash);
  const c1 = await inserisci(client, nC1);
  const c2 = await inserisci(client, nC2);
  check("primo inserito (true)", c1 === true);
  check("secondo bloccato da ext_hash (false)", c2 === false);
  check("una sola riga per ext_hash", (await conteggio(client, "ext_hash", nC1.extHash!)) === 1);

  console.log("\n=== 8. DB — caso Google reale: guid+URL mutati, titolo quasi uguale ===\n");

  const nD1 = makeNotizia({
    source: "LaC News24 P1",
    title: `Poste, sanità e trasporti, il Pd di Castrovillari chiede conto alla filiera istituzionale ${MARCA} · LaC News24 P1`,
    url: `https://news.google.com/rss/articles/CBMiXXX1-${MARCA}`,
    guid: `CBMiXXX1-${MARCA}`,
  });
  const nD2 = makeNotizia({
    source: "LaC News24 P1",
    title: `Poste, sanità e trasporti, il Pd di Castrovillari chiede conto alla filiera istituzionale ${MARCA}`,
    url: `https://news.google.com/rss/articles/CBMiXXX1EXTRA-${MARCA}`,
    guid: `CBMiXXX1EXTRA-${MARCA}`,
  });
  check("stesso titolo_fonte_hash (suffisso rimosso)", nD1.titoloFonteHash === nD2.titoloFonteHash);
  check("url_hash diversi (guid/URL mutati)", nD1.urlHash !== nD2.urlHash);
  check("ext_hash diversi", nD1.extHash !== nD2.extHash);
  const d1 = await inserisci(client, nD1);
  const d2 = await inserisci(client, nD2);
  check("primo inserito (true)", d1 === true);
  check("secondo bloccato da titolo_fonte_hash (false)", d2 === false);
  check("una sola riga", (await conteggio(client, "titolo_fonte_hash", nD1.titoloFonteHash)) === 1);

  console.log("\n=== 9. DB — notizie realmente diverse → inserite ===\n");

  const nE1 = makeNotizia({ title: `${MARCA} E — prima notizia`, url: `https://esempio.it/e1-${MARCA}`, guid: `guid-e1-${MARCA}` });
  const nE2 = makeNotizia({ title: `${MARCA} E — seconda notizia`, url: `https://esempio.it/e2-${MARCA}`, guid: `guid-e2-${MARCA}` });
  const e1 = await inserisci(client, nE1);
  const e2 = await inserisci(client, nE2);
  check("prima inserita (true)", e1 === true);
  check("seconda inserita (true)", e2 === true);
}

async function agreementTest(client: pg.Client) {
  console.log("\n=== 10. ACCORDO JS ↔ SQL (backfill identico al codice) ===\n");

  const urls = [
    "https://news.google.com/rss/articles/CBMiXXX1?oc=5",
    "https://news.google.com/rss/articles/CBMiXXX1",
    "https://esempio.it/notizia?utm_source=rss&utm_medium=feed&id=42",
    "https://esempio.it/notizia?id=42&utm_campaign=x#fragment",
    "HTTPS://Esempio.IT/Path/?a=1&b=2",
    "https://esempio.it/a//b?x=1&&y=2",
    "https://esempio.it/finale",
  ];
  for (const u of urls) {
    const sqlNorm = await client.query(`select public._p1_normalizza_url($1) as v`, [u]);
    check(
      `normalizza_url JS==SQL: ${u.slice(0, 60)}`,
      sqlNorm.rows[0].v === normalizzaUrlCanonica(u),
      { sql: sqlNorm.rows[0].v, js: normalizzaUrlCanonica(u) }
    );
    const sqlHash = await client.query(
      `select encode(digest(public._p1_normalizza_url($1), 'sha256'), 'hex') as v`,
      [u]
    );
    check(`url_hash JS==SQL: ${u.slice(0, 60)}`, sqlHash.rows[0].v === calcolaUrlHash(u));
  }

  const coppie: Array<[string, string]> = [
    [
      "Poste, sanità e trasporti, il Pd di Castrovillari chiede conto alla filiera istituzionale · LaC News24",
      "LaC News24",
    ],
    [
      "Poste, sanità e trasporti, il Pd di Castrovillari chiede conto alla filiera istituzionale",
      "LaC News24",
    ],
    ["Castrovillari, grande successo per Civita…Nova 2026: la Civita torna a vivere - Calabria Diretta News", "Calabria Diretta News"],
    ["Operazione Master, il Gip di Castrovillari non convalida il fermo - rainews.it", "rainews.it"],
    ["Riapertura della filiale di Poste Italiane • Cosenza 2.0", "Cosenza 2.0"],
  ];
  for (const [title, src] of coppie) {
    const sqlHash = await client.query(
      `select encode(digest(
         lower(btrim($1)) || '|' || public._p1_normalizza_titolo(
           regexp_replace(lower($2), '\\s*(?:-|·|•)\\s*' || public._p1_escape_regex(lower(btrim($1))) || '\\s*$', '', 'i')
         ), 'sha256'), 'hex') as v`,
      [src, title]
    );
    check(`titolo_fonte_hash JS==SQL (${src.slice(0, 20)}): ${title.slice(0, 40)}`, sqlHash.rows[0].v === calcolaTitoloFonteHash(src, title));
  }

  const sqlExt = await client.query(
    `select encode(digest(lower(btrim($1)) || '|' || btrim($2), 'sha256'), 'hex') as v`,
    ["LaC News24", "CBMiXXX"]
  );
  check("ext_hash JS==SQL", sqlExt.rows[0].v === calcolaExtHash("LaC News24", "CBMiXXX"));
}

async function backfillTest(client: pg.Client) {
  console.log("\n=== 11. BACKFILL first-wins — nessuna cancellazione, nessun vincolo violato ===\n");

  // Due righe che rappresentano il vecchio duplicato (stessa testata+titolo,
  // guid/URL diversi) inserite DIRETTAMENTE, senza hash (come le righe pre-fix).
  const vecchia = makeNotizia({
    source: "Testata Backfill P1",
    title: `Notizia backfill duplicata ${MARCA} · Testata Backfill P1`,
    url: `https://esempio.it/backfill/v1-${MARCA}`,
    guid: `guid-bf-v1-${MARCA}`,
  });
  await client.query(
    `insert into public.notizie
       (fonte_id, source_name, title, excerpt, original_url, external_id, published_at,
        category, image_url, dedup_hash, url_hash, ext_hash, titolo_fonte_hash, stato, created_at)
     values
       ($1::uuid, $2, $3, null, $4, $5, $6::timestamptz, $7, null, $8, null, null, null, 'published', now() - interval '1 day'),
       ($1::uuid, $2, $9, null, $10, $11, $6::timestamptz, $7, null, $12, null, null, null, 'published', now())`,
    [
      vecchia.fonteId, vecchia.sourceName, vecchia.title, vecchia.originalUrl, vecchia.externalId,
      vecchia.publishedAt, vecchia.category, vecchia.dedupHash,
      `Notizia backfill duplicata ${MARCA}`,
      `https://esempio.it/backfill/v2-${MARCA}`, `guid-bf-v2-${MARCA}`,
      calcolaDedupHash(`Notizia backfill duplicata ${MARCA}`),
    ]
  );

  // Riesegue il blocco di backfill della migration P1.
  const migrazione = readFileSync("supabase/migrations/20261002_p1_notizie_deduplicazione.sql", "utf8");
  const bloccoBackfill = migrazione.match(/do \$\$[\s\S]*?\$\$;/)?.[0];
  if (!bloccoBackfill) {
    check("backfill DO block estratto dalla migration", false);
    return;
  }
  check("backfill DO block estratto dalla migration", true);
  await client.query(bloccoBackfill);

  const res = await client.query(
    `select id, titolo_fonte_hash, url_hash, created_at
     from public.notizie
     where title like $1
     order by created_at asc`,
    [`%backfill duplicata ${MARCA}%`]
  );
  check("entrambe le righe ancora presenti (nessuna cancellazione)", res.rows.length === 2);
  const [r1, r2] = res.rows;
  check("prima riga (più vecchia) ha il titolo_fonte_hash", Boolean(r1.titolo_fonte_hash) && r1.titolo_fonte_hash === vecchia.titoloFonteHash);
  check("seconda riga (duplicato) resta senza titolo_fonte_hash (first-wins)", r2.titolo_fonte_hash === null);

  const idx = await client.query(
    `select indexname from pg_indexes where tablename = 'notizie' and indexname like 'notizie_%_hash_key' order by indexname`
  );
  check(
    "indici UNIQUE parziali presenti (dedup_hash + i 3 nuovi)",
    idx.rows.map((r: { indexname: string }) => r.indexname).join(",") ===
      "notizie_dedup_hash_key,notizie_ext_hash_key,notizie_titolo_fonte_hash_key,notizie_url_hash_key"
  );
}

async function concurrencyTest(client: pg.Client) {
  console.log("\n=== 12. CONCORRENZA — due cron paralleli → una sola riga ===\n");

  const n = makeNotizia({
    title: `${MARCA} CONC — notizia concorrente`,
    url: `https://esempio.it/concorrente-${MARCA}`,
    guid: `guid-conc-${MARCA}`,
  });
  const sql = `select public.notizie_inserisci(
    $1::uuid, $2::text, $3::text, $4::text, $5::text, $6::text, $7::timestamptz,
    $8::text, $9::text, $10::text, $11::text, $12::text, $13::text) as inserita`;
  const params = [
    n.fonteId, n.sourceName, n.title, n.excerpt, n.originalUrl, n.externalId, n.publishedAt,
    n.category, n.imageUrl, n.dedupHash, n.urlHash, n.extHash, n.titoloFonteHash,
  ];

  // Due connessioni separate in autocommit: replica esattamente due esecuzioni
  // concorrenti del cron (ognuna col proprio client). Il secondo INSERT si
  // blocca sul vincolo UNIQUE finché il primo committa (autocommit) e poi
  // viene scartato da ON CONFLICT DO NOTHING → nessun deadlock, una sola riga.
  const c1 = new Client({ connectionString: PG_URL });
  const c2 = new Client({ connectionString: PG_URL });
  await c1.connect();
  await c2.connect();
  try {
    const p1 = c1.query(sql, params); // non attendiamo: parte subito
    const p2 = c2.query(sql, params); // si bloccherà sul vincolo UNIQUE
    const [r1, r2] = await Promise.all([p1, p2]);

    const totale = await conteggio(client, "titolo_fonte_hash", n.titoloFonteHash);
    check("una sola riga nonostante due inserimenti concorrenti", totale === 1, { totale });
    const booleani = [r1.rows[0].inserita, r2.rows[0].inserita].filter(Boolean).length;
    check("esattamente un inserimento riuscito (true+false)", booleani === 1, { r1: r1.rows[0].inserita, r2: r2.rows[0].inserita });
  } finally {
    await c1.end();
    await c2.end();
  }
}

async function main() {
  unitTests();

  let client: pg.Client | null = null;
  try {
    client = new Client({ connectionString: PG_URL });
    await client.connect();
    console.log(`\n[DB] connesso a PostgreSQL locale/ephemeral (${PG_URL.split("@")[1] ?? PG_URL})`);
    await setupDb(client);
    await dbTests(client);
    await agreementTest(client);
    await backfillTest(client);
    await concurrencyTest(client);
  } catch (err) {
    falliti++;
    console.error("\n❌ PostgreSQL non disponibile o test DB falliti:", (err as Error).message);
    console.error("   Avvia il container con:\n   docker run -d --name incitta-p1-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=incitta -p 5433:5432 postgres:16-alpine");
  } finally {
    if (client) await client.end().catch(() => undefined);
  }

  console.log(`\nRISULTATO: ${passati} PASS / ${falliti} FAIL\n`);
  if (falliti > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Errore durante l'esecuzione dei test:", e);
  process.exit(1);
});