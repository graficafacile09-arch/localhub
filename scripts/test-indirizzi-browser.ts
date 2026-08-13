/**
 * TEST BROWSER REALE — CAP / CITTÀ / PROVINCIA (LocalitaFields).
 *
 * Riproduce e verifica i due bug segnalati:
 *  BUG 1 — per un CAP devono comparire TUTTI i comuni associati nel dataset
 *          (niente troncamento artificiale a 12 risultati);
 *  BUG 2 — cliccando un comune nel dropdown, il valore deve essere REALMENTE
 *          assegnato al campo Città (e la provincia aggiornata).
 *
 * Copre anche: CAP a singolo comune (auto-compilazione), cambio comune,
 * cambio CAP, valori inviati al backend al submit (metodo bonifico).
 *
 * Uso: npx tsx scripts/test-indirizzi-browser.ts
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser, type Page } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGETTO = join(__dirname, "..");

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

function loadEnv() {
  try {
    const raw = readFileSync(join(PROGETTO, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const PORTA = Number(process.env.INDIRIZZI_PORT ?? 3182);
const BASE = `http://127.0.0.1:${PORTA}`;
let server: ChildProcess | null = null;

async function avviaServer(): Promise<void> {
  const log = createWriteStream(join(tmpdir(), "indirizzi-next-dev.log"), { flags: "w" });
  server = spawn("npx next dev -p " + PORTA + " --webpack", {
    cwd: PROGETTO,
    env: {
      ...process.env,
      PAYMENTS_ENCRYPTION_KEY: "chiave-indirizzi-test-0001",
      ORDINI_RATE_LIMIT_PER_MINUTE: "1000",
      ORDINI_RATE_LIMIT_PER_HOUR: "10000",
      RESEND_API_KEY: "",
      NODE_ENV: "development",
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("Server dev terminato. Vedi " + join(tmpdir(), "indirizzi-next-dev.log"));
    try {
      const res = await fetch(`${BASE}/api/cliente/ordini`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" },
        body: "{}",
      });
      if (res.status === 422) return console.log(`\nServer dev pronto su ${BASE}.\n`);
    } catch {}
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Server dev non pronto entro 240s.");
}

function fermaServer(): void {
  if (!server) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  } catch {}
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error("Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const db = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const ts = Date.now();
  const slug = `indirizzi-test-${ts}`;

  // Attese dal dataset: numero comuni per CAP multi-comune e dati di controllo.
  const dataset: any[] = JSON.parse(readFileSync(join(PROGETTO, "public/data/comuni.json"), "utf8"));
  const comuniPerCap24060 = dataset.filter((c) => c.cap.includes("24060")).map((c) => c.nome);
  const cassano = dataset.find((c) => c.nome === "Cassano all'Ionio");
  const castrovillari = dataset.find((c) => c.nome === "Castrovillari");
  console.log(`[DATI] CAP 24060 → ${comuniPerCap24060.length} comuni | Cassano: ${JSON.stringify(cassano?.cap)} | Castrovillari: ${JSON.stringify(castrovillari?.cap)}`);

  let browser: Browser | null = null;
  let negozioId = "";
  let prodottoId = "";

  try {
    // ── Setup: negozio demo + prodotto ────────────────────────────────────
    const { data: n } = await db
      .from("negozi")
      .insert({ nome: `Indirizzi Test ${ts}`, slug, attivo: true, is_demo: true })
      .select("id")
      .single();
    negozioId = String(n!.id);
    const { data: q } = await db
      .from("prodotti")
      .insert({ negozio_id: negozioId, nome: `Prodotto Indirizzi ${ts}`, slug: `prodotto-${ts}`, prezzo: 10.0, quantita_disponibile: 50, attivo: true, ha_varianti: false })
      .select("id")
      .single();
    prodottoId = String(q!.id);

    await avviaServer();
    browser = await chromium.launch({ headless: true });
    const page: Page = await browser.newPage();
    const postOrdini: Array<{ url: string; body: string }> = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/cliente/ordini") && !req.url().includes("/carrello")) {
        postOrdini.push({ url: req.url(), body: req.postData() ?? "" });
      }
    });

    await page.goto(`${BASE}/prodotto/prodotto-${ts}/acquista/spedizione`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.waitForSelector("#citta", { timeout: 30000 });

    // ── BUG 2: click sul comune → valore realmente assegnato ──────────────
    console.log("\n[T1] Bug 2 — click sul comune assegna il valore (Cassano all'Ionio)");
    {
      await page.locator("#citta").click();
      await page.locator("#citta").fill("Cass");
      await page.waitForTimeout(800);
      const visibili = await page.locator('[data-testid="opt-citta"]').count();
      check("1a. dropdown città aperto con risultati", visibili > 0, visibili);
      const optCassano = page.locator('[data-testid="opt-citta"]', { hasText: "Cassano all'Ionio" }).first();
      await optCassano.click();
      await page.waitForTimeout(400);
      const valoreCitta = await page.locator("#citta").inputValue();
      check("1b. click → campo Città valorizzato con 'Cassano all'Ionio'", valoreCitta === "Cassano all'Ionio", valoreCitta);
      const valoreProv = await page.locator('input[name="provincia"]').inputValue();
      check("1c. provincia (sigla) aggiornata a 'CS'", valoreProv === "CS", valoreProv);
      const capAssociato = await page.locator("#cap").inputValue();
      check("1d. CAP del comune compilato (87011)", capAssociato === (cassano?.cap?.[0] ?? "87011"), capAssociato);
      const provVisibile = await page.locator("#provincia").inputValue();
      check("1e. provincia visibile contiene 'Cosenza'", provVisibile.includes("Cosenza"), provVisibile);
    }

    // ── BUG 1: CAP multi-comune → TUTTI i comuni ──────────────────────────
    console.log("\n[T2] Bug 1 — CAP 24060 mostra TUTTI i comuni del dataset");
    {
      await page.locator("#cap").click();
      await page.locator("#cap").fill("24060");
      await page.waitForTimeout(800);
      const nOpzioni = await page.locator('[data-testid="opt-cap"]').count();
      check("2a. dropdown CAP mostra TUTTI i comuni (niente troncamento a 12)", nOpzioni === comuniPerCap24060.length, { nOpzioni, attesi: comuniPerCap24060.length });
      // click su un comune specifico del CAP
      const target = comuniPerCap24060[3];
      await page.locator('[data-testid="opt-cap"]', { hasText: target }).first().click();
      await page.waitForTimeout(400);
      const v = await page.locator("#citta").inputValue();
      check("2b. click sul comune del CAP → Città valorizzata", v === target, { v, target });
    }

    // ── CAP a singolo comune → auto-compilazione ──────────────────────────
    console.log("\n[T3] CAP 87012 → auto-compilazione città+provincia");
    {
      await page.locator("#cap").fill("87012");
      await page.waitForTimeout(800);
      const v = await page.locator("#citta").inputValue();
      check("3a. città auto-compilata 'Castrovillari'", v === "Castrovillari", v);
      const p = await page.locator('input[name="provincia"]').inputValue();
      check("3b. provincia auto-compilata 'CS'", p === "CS", p);
    }

    // ── Cambio CAP → i comuni disponibili cambiano ────────────────────────
    console.log("\n[T4] Cambio CAP → filtro comuni aggiornato (20121 → Milano auto-compilato)");
    {
      await page.locator("#cap").fill("20121");
      await page.waitForTimeout(800);
      // 20121 è un CAP di Milano: auto-compilazione + tendina CHIUSA (nessuna opzione stantia)
      const v = await page.locator("#citta").inputValue();
      check("4a. città auto-compilata 'Milano' dopo cambio CAP", v === "Milano", v);
      const nOpzioni = await page.locator('[data-testid="opt-cap"]').count();
      check("4b. tendina CAP chiusa (zero opzioni stantie)", nOpzioni === 0, nOpzioni);
    }

    // ── Submit reale: i valori selezionati vengono inviati ────────────────
    console.log("\n[T5] Submit → CAP/città/provincia inviati al backend");
    {
      await page.locator("#nome").fill("Mario");
      await page.locator("#cognome").fill("Test");
      await page.locator("#telefono").fill("3331234567");
      await page.locator("#email").fill("indirizzi-test@localhub.test");
      await page.locator("#indirizzo").fill("Via Test 1");
      // ri-seleziona Cassano all'Ionio via dropdown
      await page.locator("#citta").click();
      await page.locator("#citta").fill("Cass");
      await page.waitForTimeout(600);
      await page.locator('[data-testid="opt-citta"]', { hasText: "Cassano all'Ionio" }).first().click();
      await page.waitForTimeout(400);
      // selezione esplicita del metodo di pagamento bonifico
      await page.locator('input[name="pagamento"][value="bonifico"]').check();
      const bottone = page.getByRole("button", { name: /Procedi al pagamento/ });
      check("5a. pulsante abilitato dopo scelta metodo", !(await bottone.isDisabled()));
      await bottone.click();
      await page.waitForTimeout(3000);
      check("5b. esattamente 1 POST ordine", postOrdini.length === 1, postOrdini.length);
      if (postOrdini.length === 1) {
        const body = JSON.parse(postOrdini[0].body);
        const sped = body.spedizione ?? {};
        check("5c. citta inviata = 'Cassano all'Ionio'", sped.citta === "Cassano all'Ionio", sped.citta);
        check("5d. cap inviato = '87011'", sped.cap === "87011", sped.cap);
        check("5e. provincia inviata = 'CS'", sped.provincia === "CS", sped.provincia);
      }
      const { data: ordini } = await db
        .from("ordini")
        .select("spedizione_citta, spedizione_cap, spedizione_provincia")
        .eq("negozio_id", negozioId)
        .order("created_at", { ascending: false })
        .limit(1);
      const ord = ordini?.[0];
      check("5f. ordine salvato: spedizione_citta = Cassano all'Ionio", ord?.spedizione_citta === "Cassano all'Ionio", ord);
      check("5g. ordine salvato: spedizione_provincia = CS", ord?.spedizione_provincia === "CS", ord);
      check("5h. ordine salvato: spedizione_cap = 87011", ord?.spedizione_cap === "87011", ord);
    }

    await page.screenshot({ path: join(PROGETTO, "screenshots/indirizzi-t1.png"), fullPage: true }).catch(() => {});
    await page.close();
  } catch (err) {
    falliti++;
    fallitiNomi.push("ECCEZIONE");
    console.error("❌ ECCEZIONE:", err);
  } finally {
    fermaServer();
    if (browser) await browser.close().catch(() => {});
    try {
      if (negozioId) await db.from("negozi").delete().eq("id", negozioId);
      if (prodottoId) await db.from("prodotti").delete().eq("id", prodottoId);
      if (negozioId) await db.from("ordini").delete().eq("negozio_id", negozioId);
    } catch {}
  }

  console.log(`\nRISULTATO: ${passati} passati, ${falliti} falliti`);
  if (fallitiNomi.length) console.log("Falliti:", fallitiNomi.join(", "));
  process.exit(falliti > 0 ? 1 : 0);
}

main();
