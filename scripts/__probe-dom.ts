/**
 * PROBE DOM — schermata iniziale onboarding Stripe (passo telefono).
 * Identifica com'è fatto il controllo "Submit" (tag, tipo, visibilità, shadow DOM, iframe).
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGETTO = join(__dirname, "..");
const NEGOZIO_ID = "87283398-408e-4760-bb83-8061cce578a4";
const EMAIL = "commerciante-a.test@localhub.it";
const PASSWORD = "MerchantTest123!";
const PORTA = 3199;
const BASE = `http://127.0.0.1:${PORTA}`;

function loadEnv() {
  try {
    const raw = readFileSync(join(PROGETTO, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

let server: ReturnType<typeof spawn> | null = null;

async function main() {
  loadEnv();
  const stripeKey = process.env.COLLAUDO_STRIPE_KEY ?? "";
  if (!stripeKey.startsWith("sk_test_")) throw new Error("serve sk_test_");

  const log = createWriteStream(join(tmpdir(), "probe-dom-next-dev.log"), { flags: "w" });
  server = spawn(`npx next dev -p ${PORTA} --webpack`, {
    cwd: PROGETTO,
    env: {
      ...process.env,
      STRIPE_SECRET_KEY: stripeKey,
      NEXT_PUBLIC_SITE_URL: BASE,
      PAYMENTS_ENCRYPTION_KEY: "chiave-probe-dom-0001",
      RESEND_API_KEY: "",
      ORDINI_RATE_LIMIT_PER_MINUTE: "1000",
      ORDINI_RATE_LIMIT_PER_HOUR: "10000",
      NODE_ENV: "development",
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("server morto");
    try {
      if ((await fetch(`${BASE}/login`)).status === 200) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 3000));
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  await page.goto(`${BASE}/merchant/${NEGOZIO_ID}/pagamenti`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const pulsante = page.locator("button").filter({ hasText: /Riprendi onboarding|Crea o Collega il tuo conto Stripe/ });
  await pulsante.first().waitFor({ state: "visible", timeout: 60_000 });
  await pulsante.first().click();
  await page.waitForURL((u) => u.hostname === "connect.stripe.com", { timeout: 60_000 });
  await page.waitForTimeout(4000);

  console.log("URL:", page.url().slice(0, 80));

  // Conta i candidati con la locator esatta di cliccaAvanti.
  const candidati = page.locator("button:visible, input[type=submit]:visible, [role=button]:visible");
  console.log("candidati count (locator):", await candidati.count());
  const roleBtn = page.locator("[role=button]");
  console.log("[role=button] count:", await roleBtn.count());
  for (let i = 0; i < Math.min(await roleBtn.count(), 8); i++) {
    const t = await roleBtn.nth(i).innerText().catch(() => "");
    const vis = await roleBtn.nth(i).isVisible().catch(() => false);
    console.log(`  [${i}] testo="${t.slice(0, 30)}" visible=${vis}`);
  }

  // Click "Use test phone number" + Submit, poi dump schermata successiva.
  const useTest = page.locator("a", { hasText: "Use test phone number" }).first();
  if (await useTest.count()) {
    await useTest.click();
    await page.waitForTimeout(1500);
    console.log("clicked 'Use test phone number'");
  }
  const submit = page.locator("a[role=button]", { hasText: "Submit" }).first();
  console.log("submit count dopo use-test:", await submit.count(), "visible:", await submit.isVisible().catch(() => false));
  if (await submit.count()) {
    await submit.click();
    console.log("clicked Submit");
  } else {
    const tutti = page.locator("[role=button]");
    const n2 = await tutti.count();
    console.log("role=button count dopo use-test:", n2);
    for (let i = 0; i < Math.min(n2, 8); i++) {
      console.log(`  [${i}] testo="${((await tutti.nth(i).innerText().catch(() => "")) || "").slice(0, 30)}"`);
    }
  }
  await page.waitForTimeout(4000);
  const testo = await page.evaluate(() => document.body.innerText);
  console.log("\n── TESTO SCHERMATA DOPO SUBMIT (primi 1500) ──");
  console.log(testo.slice(0, 1500));
  await page.screenshot({ path: join(PROGETTO, "screenshots/probe-dopo-submit.png") }).catch(() => {});

  const dump = await page.evaluate(() => {
    const out: any = { iframes: [], bottoni: [], submit: [] };
    for (const f of document.querySelectorAll("iframe")) {
      out.iframes.push({ src: (f as HTMLIFrameElement).src?.slice(0, 80) });
    }
    for (const el of Array.from(document.querySelectorAll("button, input[type=submit], [role=button], a"))) {
      const r = el.getBoundingClientRect();
      const vis = r.width > 0 && r.height > 0;
      out.bottoni.push({
        tag: el.tagName,
        type: (el as HTMLInputElement).type ?? null,
        role: el.getAttribute("role"),
        testo: (el.textContent ?? "").trim().slice(0, 30),
        vis,
        w: Math.round(r.width),
      });
    }
    for (const el of Array.from(document.querySelectorAll("*"))) {
      if ((el.textContent ?? "").trim().toLowerCase().includes("submit")) {
        out.submit.push({
          tag: el.tagName,
          id: el.id,
          cls: (el.className as string | undefined)?.toString().slice(0, 60) ?? "",
          role: el.getAttribute("role"),
          html: el.outerHTML.slice(0, 220),
        });
      }
    }
    out.shadowHosts = Array.from(document.querySelectorAll("*")).filter((e) => e.shadowRoot).map((e) => e.tagName + "#" + e.id);
    return out;
  });

  console.log("IFRAME:", JSON.stringify(dump.iframes));
  console.log("SHADOW HOSTS:", JSON.stringify(dump.shadowHosts));
  console.log("BUTTONI/INPUT/A:", JSON.stringify(dump.bottoni.slice(0, 15), null, 1));
  console.log("ELEMENTI CON 'submit':", JSON.stringify(dump.submit.slice(0, 8), null, 1));

  await browser.close();
}

main()
  .catch((e) => {
    console.error("ERRORE:", e);
    process.exit(1);
  })
  .finally(() => {
    if (server) {
      try {
        if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
        else server.kill("SIGTERM");
      } catch {}
    }
  });
