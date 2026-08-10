/**
 * VERIFICA REALE Resend in produzione (nessun segreto stampato).
 * Legge RESEND_API_KEY dall'ambiente (passata dal chiamante), chiama
 * l'API Resend e stampa SOLO informazioni non sensibili:
 *   - domini del progetto + stato verifica;
 *   - ultime email inviate (subject troncato, destinatario mascherato,
 *     evento di consegna).
 *
 * Uso:  RESEND_API_KEY=... node scripts/verifica-resend-prod.mjs
 */
const API_KEY = process.env.RESEND_API_KEY;
if (!API_KEY) {
  console.error("RESEND_API_KEY mancante");
  process.exit(1);
}

function mask(to) {
  const list = Array.isArray(to) ? to : [to];
  return list
    .map((v) => {
      const s = String(v ?? "");
      const at = s.indexOf("@");
      if (at <= 0) return "***";
      return s.slice(0, 2) + "***@" + s.slice(at + 1);
    })
    .join(", ");
}

async function call(path) {
  const res = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  console.log("=== VERIFICA CHIAVE ===");
  const ping = await call("/domains");
  console.log(`HTTP ${ping.status}: ${ping.status === 200 ? "chiave VALIDA" : "chiave NON valida (401 → credenziali errate o placeholder)"}`);

  if (ping.status !== 200) {
    console.log("\nImpossibile proseguire: la chiave non è valida. Controlla RESEND_API_KEY.");
    return;
  }

  console.log("\n=== DOMINI (stato verifica) ===");
  const domains = ping.json?.data ?? [];
  if (domains.length === 0) {
    console.log("Nessun dominio configurato → se il mittente non usa un dominio verificato, Resend rifiuta ogni invio.");
  }
  for (const d of domains) {
    console.log(`- ${d.name}: ${d.status}`);
  }

  console.log("\n=== ULTIME EMAIL (eventi consegna) ===");
  const em = await call("/emails?limit=50");
  if (em.status !== 200) {
    console.log(`HTTP ${em.status} — impossibile leggere gli invii.`);
    return;
  }
  const emails = em.json?.data ?? [];
  if (emails.length === 0) {
    console.log("Nessuna email inviata finora tramite questa chiave API (se la chiave è valida, ogni invio è stato rifiutato a monte).");
  }
  const bySubject = {};
  for (const e of emails) {
    const key = `${e.subject ?? "(senza oggetto)"} | ${e.last_event ?? "?"}`;
    bySubject[key] = (bySubject[key] ?? 0) + 1;
    console.log(
      `- [${(e.created_at ?? "?").slice(0, 10)}] ${(e.subject ?? "(senza oggetto)")
        .slice(0, 48)} | to=${mask(e.to)} | evento=${e.last_event ?? "?"} | id=${(e.id ?? "").slice(0, 8)}`
    );
  }
  console.log("\n=== RIEPILOGO EVENTI ===");
  for (const [k, n] of Object.entries(bySubject).sort((a, b) => b[1] - a[1])) {
    console.log(`${n}x  ${k}`);
  }

  // ── Invio REALE di prova (opzionale) ───────────────────────────────────────
  const arg = process.argv.find((a) => a.startsWith("--test="));
  if (arg) {
    const destinatario = arg.slice("--test=".length);
    const from = process.env.RESEND_FROM_EMAIL ?? "";
    console.log("\n=== INVIO REALE DI PROVA ===");
    if (!from) {
      console.log("RESEND_FROM_EMAIL non configurata: impossibile inviare.");
      return;
    }
    const test = await call("/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [destinatario],
        subject: `Test email InCittà — ${new Date().toISOString()}`,
        html: "<p>Email di prova InCittà — verifica configurazione Resend.</p>",
      }),
    });
    console.log(
      `HTTP ${test.status}: ${test.status === 200 ? "INVIATA ✅" : "RIFIUTATA ❌ " + (test.json?.message ?? "")}`
    );
    console.log(
      "Se rifiutata con un errore sul mittente (dominio non verificato), aggiungi il record DNS indicato " +
        "da Resend per il dominio e riprova."
    );
  }
}

main().catch((err) => {
  console.error("Errore:", err?.message ?? err);
  process.exit(1);
});
