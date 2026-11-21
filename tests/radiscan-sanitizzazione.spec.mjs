/**
 * RADICISCAN — TEST LOCALI DELLA SANIFICAZIONE DIAGNOSTICA
 *
 * Nessuna rete, nessuna RPC reale, nessun database: `consumaQuota` riceve
 * una funzione RPC finta e i log vengono intercettati localmente. I valori
 * usati sono tutti sintetici.
 *
 * Limite noto: un token base64 senza padding sotto 14 caratteri (es.
 * "aGVsbG8") resta visibile, per non oscurare identificativi comuni.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { consumaQuota, creaChiaveQuotaAnonima } from "@/lib/radiscan/quote";

const CHIAVE = creaChiaveQuotaAnonima("203.0.113.7", "sale-di-test-lungo-16");

async function logErroreRpc(valore) {
  const log = [];
  const originale = console.error;
  let chiamate = 0;
  console.error = (...args) =>
    log.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  try {
    await assert.rejects(
      () =>
        consumaQuota({
          chiave: CHIAVE,
          modalita: "anonimo",
          rpc: async () => {
            chiamate += 1;
            return {
              data: null,
              error: {
                code: "PGRST500",
                message: valore,
                details: valore,
                hint: valore,
              },
            };
          },
        }),
      (errore) => errore.codice === "RADICSCAN_QUOTA_NON_DISPONIBILE"
    );
  } finally {
    console.error = originale;
  }

  assert.equal(chiamate, 1, "la diagnostica non deve introdurre una seconda RPC");
  const testo = log.join("\n");
  assert.ok(!testo.includes(CHIAVE), "la chiave quota non deve comparire nei log");
  return testo;
}

async function logEccezione(valore, nome = "Error") {
  const log = [];
  const originale = console.error;
  let chiamate = 0;
  console.error = (...args) =>
    log.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  try {
    await assert.rejects(
      () =>
        consumaQuota({
          chiave: CHIAVE,
          modalita: "anonimo",
          rpc: async () => {
            chiamate += 1;
            const errore = new Error(`errore: ${valore}`);
            errore.name = nome;
            throw errore;
          },
        }),
      (errore) => errore.codice === "RADICSCAN_QUOTA_NON_DISPONIBILE"
    );
  } finally {
    console.error = originale;
  }

  assert.equal(chiamate, 1, "la diagnostica non deve introdurre una seconda RPC");
  return log.join("\n");
}

test("sanificazione: IPv6 compresso, completo, link-local e IPv4-mapped", async () => {
  const casi = [
    ["compresso", "2001:db8::1", ["2001", "db8"]],
    ["completo", "2001:0db8:0000:0000:0000:0000:0000:0001", ["2001", "0db8", "0001"]],
    ["link-local", "fe80::1", ["fe80"]],
    ["ipv4-mapped", "::ffff:198.51.100.77", ["ffff", "198.51.100.77"]],
  ];

  for (const [nome, valore, frammenti] of casi) {
    const testo = await logErroreRpc(valore);
    assert.ok(!testo.includes(valore), `${nome}: indirizzo completo ancora visibile`);
    for (const frammento of frammenti) {
      assert.ok(!testo.includes(frammento), `${nome}: frammento ${frammento} ancora visibile`);
    }
    assert.match(testo, /\[ip redatto\]/, `${nome}: marcatore di redazione assente`);
  }
});

test("sanificazione: IPv6 tra parentesi e con punteggiatura non lascia parti", async () => {
  const casi = ["[2001:db8::1]", "2001:db8::1.", "2001:db8::1:"];

  for (const valore of casi) {
    const testo = await logErroreRpc(valore);
    assert.ok(!testo.includes("2001"), `${valore}: parte 2001 visibile`);
    assert.ok(!testo.includes("db8"), `${valore}: parte db8 visibile`);
    assert.match(testo, /\[ip redatto\]/, `${valore}: marcatore assente`);
  }
});

test("sanificazione: IPv6 con zone ID, parentesi e punteggiatura", async () => {
  const casi = [
    "fe80::1%eth0",
    "fe80::1%25eth0",
    "fe80::1%wlan0",
    "fe80::1%en0",
    "[fe80::1%eth0]",
    "[fe80::1%25eth0]",
    "fe80:0000:0000:0000:0000:0000:0000:0001%eth0",
    "::ffff:198.51.100.77",
    "::ffff:198.51.100.77%eth0",
  ];

  for (const valore of casi) {
    const testo = await logErroreRpc(valore);
    assert.ok(!testo.includes(valore), `${valore}: indirizzo completo ancora visibile`);
    for (const frammento of ["fe80", "eth0", "wlan0", "en0", "ffff", "198.51.100.77"]) {
      assert.ok(!testo.includes(frammento), `${valore}: frammento ${frammento} visibile`);
    }
    assert.match(testo, /\[ip redatto\]/, `${valore}: marcatore assente`);
  }

  const conTesto = await logErroreRpc("host=[fe80::1%eth0], contatto");
  assert.ok(!conTesto.includes("fe80"));
  assert.ok(!conTesto.includes("eth0"));
  assert.ok(conTesto.includes("host=[ip redatto], contatto"));
});

test("sanificazione: Error.name e messaggio delle eccezioni sono sanificati", async () => {
  const ip = await logEccezione("errore con 198.51.100.77", "fe80::1%eth0");
  assert.ok(!ip.includes("fe80"));
  assert.ok(!ip.includes("eth0"));
  assert.ok(!ip.includes("198.51.100.77"));
  assert.match(ip, /\[ip redatto\]/);

  const token = `sb_secret_${"A".repeat(24)}`;
  const segreto = await logEccezione(`errore ${token}`, `Errore ${token}`);
  assert.ok(!segreto.includes(token));
  assert.match(segreto, /\[chiave supabase redatta\]/);
});

test("sanificazione: IPv4 resta coperto", async () => {
  const valore = "198.51.100.77";
  const testo = await logErroreRpc(valore);
  assert.ok(!testo.includes(valore));
  assert.match(testo, /\[ip redatto\]/);
});

test("sanificazione: base64 breve con padding, senza padding e lungo", async () => {
  const casi = [
    ["padding", "aGVsbG8=", "[base64 redatto]"],
    ["senza padding", "SGVsbG9Xb3JsZA", "[base64 redatto]"],
    ["lungo", "B".repeat(120), "[dato lungo redatto]"],
    ["immagine corta", "data:image/png;base64,AAAA", "[immagine redatta]"],
  ];

  for (const [nome, valore, marcatore] of casi) {
    const testo = await logErroreRpc(valore);
    assert.ok(!testo.includes(valore), `${nome}: payload ancora visibile`);
    assert.ok(testo.includes(marcatore), `${nome}: marcatore ${marcatore} assente`);
  }
});

test("sanificazione: parole, identificativi, orari e testo con due punti non vengono oscurati", async () => {
  const valori = [
    "Pecorino",
    "documenti",
    "Password1",
    "Password123456",
    "Documento2026A",
    "ABC12345",
    "fornitore_123",
    "2026-11-21T10:30:00Z",
    "12:30:45",
    "CAP:00123",
    "nota: bene: male",
  ];

  for (const valore of valori) {
    const testo = await logErroreRpc(valore);
    assert.ok(testo.includes(valore), `falso positivo su testo ordinario: ${valore}`);
  }
});

test("sanificazione: anche le eccezioni del client vengono ripulite", async () => {
  const testo = await logEccezione("2001:db8::1");
  assert.ok(!testo.includes("2001"));
  assert.ok(!testo.includes("db8"));
  assert.match(testo, /\[ip redatto\]/);
});
