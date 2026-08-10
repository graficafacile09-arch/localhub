/**
 * REGISTRAZIONE DOMINIO RESEND (fix email che non arriva).
 * Legge RESEND_API_KEY e RESEND_FROM_EMAIL dall'ambiente, estrae il dominio
 * del mittente e lo registra in Resend se assente, stampando i record DNS
 * da aggiungere per la verifica. Nessun segreto stampato.
 *
 * Uso:  RESEND_API_KEY=... RESEND_FROM_EMAIL=... node scripts/setup-resend-dominio.mjs
 */
const API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM_EMAIL ?? "";
if (!API_KEY) {
  console.error("RESEND_API_KEY mancante");
  process.exit(1);
}

function extractDomain(from) {
  let raw = from.trim();
  // "Nome <email@dominio>"
  const m = raw.match(/<([^>]+)>/);
  if (m) raw = m[1].trim();
  if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
  if (raw.startsWith("'") && raw.endsWith("'")) raw = raw.slice(1, -1);
  const at = raw.lastIndexOf("@");
  if (at === -1 || at === raw.length - 1) return null;
  return raw.slice(at + 1).toLowerCase();
}

async function api(path, opts = {}) {
  const res = await fetch(`https://api.resend.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const dominio = extractDomain(FROM);
  if (!dominio) {
    console.log("Impossibile estrarre il dominio da RESEND_FROM_EMAIL");
    process.exit(1);
  }
  console.log("Dominio mittente:", dominio);

  const list = await api("/domains");
  const existing = (list.json?.data ?? []).find((d) => String(d.name).toLowerCase() === dominio);
  if (existing) {
    console.log("Dominio già registrato. Stato:", existing.status);
    console.log("Se lo stato NON è 'verified', aggiungi i record DNS indicati dal pannello Resend.");
    process.exit(0);
  }

  console.log("Dominio non registrato → registro ora (regione eu-west-1)...");
  const created = await api("/domains", {
    method: "POST",
    body: JSON.stringify({ name: dominio, region: "eu-west-1" }),
  });

  if (created.status >= 400) {
    console.log("Errore registrazione:", created.status, created.json?.message ?? "");
    process.exit(1);
  }

  console.log("Registrato. Record DNS da aggiungere al registrar per verificare il dominio:");
  const records = created.json?.records ?? [];
  for (const r of records) {
    console.log(`  - ${r.type} ${r.name} valore: ${r.value}`);
  }
  console.log("\nDopo aver aggiunto il record DNS, la verifica avviene in automatico");
  console.log("(può richiedere da pochi minuti a 24-48h). Le email cominceranno a partire");
  console.log("solo a verifica completata.");
}

main().catch((err) => {
  console.error("Errore:", err?.message ?? err);
  process.exit(1);
});
