/**
 * NOTIZIE — SETUP DELLA NUOVA LINEA EDITORIALE (agricoltura calabrese).
 *
 * Allinea la tabella public.notizie_fonti alla whitelist di
 * lib/notizie/fonti.ts (stessi UUID e stesse query della migration
 * 20261114_notizie_agricoltura.sql):
 *   1. salva un backup completo di notizie_fonti e dell'elenco notizie in
 *      .backup-notizie-agricoltura-<data>/ (punto di ripristino);
 *   2. disattiva le vecchie fonti di cronaca locale (attiva = false, nessuna
 *      cancellazione);
 *   3. inserisce/aggiorna le fonti agricole.
 *
 * Idempotente: può essere rieseguito senza effetti collaterali.
 *
 * Uso:
 *   node --env-file-if-exists=.env.local scripts/notizie-agricoltura-setup.mjs
 *   node --env-file-if-exists=.env.local scripts/notizie-agricoltura-setup.mjs --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const dryRun = process.argv.includes("--dry-run");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Configurazione Supabase mancante (.env.local).");
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BASE_GOOGLE_NEWS =
  "https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=";

/** Query tematiche singole (le ricerche multi-OR rendono feed poveri). */
const DISCOVERY = [
  ["b0000000-0000-4000-8000-000000000002", "Google News · Agricoltura Calabria", "intitle:Calabria+agricoltura", "Agricoltura"],
  ["b0000000-0000-4000-8000-000000000003", "Google News · Olio e olivicoltura", "intitle:Calabria+olio", "Olio e olivicoltura"],
  ["b0000000-0000-4000-8000-000000000004", "Google News · Vino e viticoltura", "intitle:Calabria+vino", "Vino e viticoltura"],
  ["b0000000-0000-4000-8000-000000000005", "Google News · Agrumi e ortofrutta", "intitle:Calabria+agrumi", "Filiere e produzioni"],
  ["b0000000-0000-4000-8000-000000000006", "Google News · DOP e prodotti tipici", "intitle:Calabria+DOP", "Prodotti tipici e qualità"],
  ["b0000000-0000-4000-8000-000000000007", "Google News · CSR e sviluppo rurale", "intitle:Calabria+CSR", "Politiche agricole e finanziamenti"],
  ["b0000000-0000-4000-8000-000000000008", "Google News · PAC e finanziamenti agricoli", "intitle:Calabria+PAC", "Politiche agricole e finanziamenti"],
  ["b0000000-0000-4000-8000-000000000009", "Google News · Fiere agricole", "intitle:Calabria+fiera", "Eventi e fiere"],
  ["b0000000-0000-4000-8000-000000000010", "Google News · Sagre e manifestazioni", "intitle:Calabria+sagra", "Eventi e fiere"],
  ["b0000000-0000-4000-8000-000000000011", "Google News · Vinitaly e vino italiano", "intitle:Calabria+Vinitaly", "Eventi e fiere"],
  ["b0000000-0000-4000-8000-000000000012", "Google News · Export agroalimentare", "intitle:Calabria+export", "Mercati ed esportazioni"],
  ["b0000000-0000-4000-8000-000000000013", "Google News · ARSAC e ricerca agricola", "intitle:Calabria+ARSAC", "Innovazione e ricerca"],
  ["b0000000-0000-4000-8000-000000000014", "Google News · Innovazione e ricerca agricola", "intitle:Calabria+innovazione", "Innovazione e ricerca"],
  ["b0000000-0000-4000-8000-000000000015", "Google News · Biodiversità e territori", "intitle:Calabria+biodiversit%C3%A0", "Territori e biodiversità"],
  ["b0000000-0000-4000-8000-000000000016", "Google News · Parchi e aree protette", "intitle:Calabria+parco", "Territori e biodiversità"],
  ["b0000000-0000-4000-8000-000000000017", "Google News · Ortofrutta e produzioni", "intitle:Calabria+ortofrutta", "Filiere e produzioni"],
  ["b0000000-0000-4000-8000-000000000018", "Google News · Zootecnia e allevamenti", "intitle:Calabria+zootecnia", "Filiere e produzioni"],
  ["b0000000-0000-4000-8000-000000000019", "Google News · Agricoltura biologica", "intitle:Calabria+biologico", "Filiere e produzioni"],
  ["b0000000-0000-4000-8000-000000000020", "Google News · Prezzi e mercati agricoli", "intitle:Calabria+prezzi", "Mercati ed esportazioni"],
  ["b0000000-0000-4000-8000-000000000021", "Google News · Agroalimentare e mercati", "intitle:Calabria+agroalimentare", "Mercati ed esportazioni"],
  ["b0000000-0000-4000-8000-000000000022", "Google News · Agriturismo e territori rurali", "intitle:Calabria+agriturismo", "Territori e biodiversità"],
];

const FONTI_AGRICOLE = [
  {
    id: "b0000000-0000-4000-8000-000000000001",
    nome: "ARSAC Servizi in Agricoltura Calabria",
    tipo: "rss",
    url_feed: "https://www.arsacweb.it/feed/",
    url_lista: null,
    url_base: "https://www.arsacweb.it",
    categoria_default: "Agricoltura",
    attiva: true,
    frequenza_minuti: 720,
    scoperta: false,
  },
  {
    id: "a0000000-0000-4000-8000-000000000003",
    nome: "Regione Calabria",
    tipo: "rss",
    url_feed: "https://www.regione.calabria.it/feed/",
    url_lista: null,
    url_base: "https://www.regione.calabria.it",
    categoria_default: "Politiche agricole e finanziamenti",
    attiva: true,
    frequenza_minuti: 360,
    scoperta: false,
  },
  ...DISCOVERY.map(([id, nome, query, categoria]) => ({
    id,
    nome,
    tipo: "rss",
    url_feed: `${BASE_GOOGLE_NEWS}${query}`,
    url_lista: null,
    url_base: "https://news.google.com",
    categoria_default: categoria,
    attiva: true,
    frequenza_minuti: 240,
    scoperta: true,
  })),
];

const FONTI_DA_DISATTIVARE = [
  "a0000000-0000-4000-8000-000000000001", // Comune di Castrovillari
  "a0000000-0000-4000-8000-000000000002", // Provincia di Cosenza
  "a0000000-0000-4000-8000-000000000004", // Parco Nazionale del Pollino
  "a0000000-0000-4000-8000-000000000005", // Protezione Civile Calabria
  "a0000000-0000-4000-8000-000000000006", // Google News · Castrovillari
  "a0000000-0000-4000-8000-000000000007", // Google News · Castrovillari Comune
];

const cartellaBackup = path.join(
  process.cwd(),
  `.backup-notizie-agricoltura-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`
);

const { data: fontiPrima, error: erroreFonti } = await db
  .from("notizie_fonti")
  .select("*")
  .order("nome");

if (erroreFonti) {
  console.error("Lettura fonti fallita:", erroreFonti.message);
  process.exit(1);
}

const { data: notiziePrima, error: erroreNotizie } = await db
  .from("notizie")
  .select("id, fonte_id, source_name, published_at, category, stato")
  .order("published_at", { ascending: false });

if (erroreNotizie) {
  console.error("Lettura notizie fallita:", erroreNotizie.message);
  process.exit(1);
}

fs.mkdirSync(cartellaBackup, { recursive: true });
fs.writeFileSync(
  path.join(cartellaBackup, "notizie_fonti.json"),
  JSON.stringify(fontiPrima, null, 2)
);
fs.writeFileSync(
  path.join(cartellaBackup, "notizie-indice.json"),
  JSON.stringify(notiziePrima, null, 2)
);

console.log(`Backup in ${path.relative(process.cwd(), cartellaBackup)}`);
console.log(
  `Fonti attuali: ${fontiPrima.length} · notizie indicizzate: ${notiziePrima.length}`
);

if (dryRun) {
  console.log("DRY RUN: nessuna modifica al database.");
  for (const fonte of FONTI_AGRICOLE) {
    console.log(`  → ${fonte.nome} (${fonte.categoria_default})`);
  }
  process.exit(0);
}

const { error: erroreDisattiva } = await db
  .from("notizie_fonti")
  .update({ attiva: false })
  .in("id", FONTI_DA_DISATTIVARE);

if (erroreDisattiva) {
  console.error("Disattivazione fonti fallita:", erroreDisattiva.message);
  process.exit(1);
}

const { error: erroreUpsert } = await db
  .from("notizie_fonti")
  .upsert(FONTI_AGRICOLE, { onConflict: "id" });

if (erroreUpsert) {
  console.error("Inserimento fonti fallito:", erroreUpsert.message);
  process.exit(1);
}

const { data: dopo } = await db
  .from("notizie_fonti")
  .select("nome, attiva, scoperta, categoria_default, frequenza_minuti")
  .order("attiva", { ascending: false });

console.log("\nStato finale delle fonti:");
for (const fonte of dopo ?? []) {
  console.log(
    `  ${fonte.attiva ? "ON " : "off"} ${fonte.nome} · ${fonte.categoria_default} · ${fonte.frequenza_minuti} min`
  );
}
