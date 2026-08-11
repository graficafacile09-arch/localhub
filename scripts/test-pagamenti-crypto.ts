/**
 * TEST CRYPTO + CONFIG PAGAMENTI — PURA, nessuna chiamata esterna.
 *
 * Verifica lib/pagamenti/crypto.ts:
 *   - cifratura/decifratura roundtrip (AES-256-GCM);
 *   - secret errato (chiave sbagliata → errore, fail-closed);
 *   - secret mancante (payload corrotto / chiave assente → errore);
 *   - has_secret (configurato / non configurato);
 *   - isolamento tra negozi (credenzialiPubbliche non espone mai secret);
 *   - allowlist provider/metodi;
 *   - i secret NON compaiono MAI nei dati pubblici restituiti.
 *
 * Esecuzione: npx tsx scripts/test-pagamenti-crypto.ts
 */

import {
  cifraSegreto,
  decifraSegreto,
  isSegretoCifrato,
  mascheraSegreto,
  credenzialiPubbliche,
  isProviderPagamentoValido,
  isMetodoPagamentoValido,
  PROVIDER_PAGAMENTO_VALIDI,
  METODI_PAGAMENTO_VALIDI,
} from "../lib/pagamenti/crypto";

let passati = 0;
let falliti = 0;
const fallitiNomi: string[] = [];

function check(nome: string, condizione: boolean, dettaglio?: unknown) {
  if (condizione) {
    passati++;
    console.log(`  PASS ${nome}`);
  } else {
    falliti++;
    fallitiNomi.push(nome);
    console.log(`  FAIL ${nome}${dettaglio !== undefined ? ` → ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

// La chiave viene passata esplicitamente nei test (mai letta da env).
const CHIAVE_TEST = "chiave-di-test-per-gli-unit-test-0123456789";

console.log("\n[T1] Cifratura/decifratura roundtrip");
{
  const segreto = "sk_live_abcd1234_segreto_klarna";
  const cifrato = cifraSegreto(segreto, CHIAVE_TEST);
  check("il cifrato è diverso dal plaintext", cifrato !== segreto);
  check("il cifrato ha formato v1 (prefisso)", cifrato.startsWith("v1:"));
  check("isSegretoCifrato true", isSegretoCifrato(cifrato) === true);
  const decifrato = decifraSegreto(cifrato, CHIAVE_TEST);
  check("roundtrip restituisce il plaintext", decifrato === segreto);
  check("due cifrature dello stesso valore differiscono (IV casuale)", cifraSegreto(segreto, CHIAVE_TEST) !== cifrato);
}

console.log("\n[T2] Secret errato (chiave sbagliata → fail-closed)");
{
  const cifrato = cifraSegreto("segreto-segreto", CHIAVE_TEST);
  let lanciato = false;
  try {
    decifraSegreto(cifrato, "chiave-SBAGLIATA");
  } catch {
    lanciato = true;
  }
  check("decifratura con chiave errata lancia", lanciato === true);
}

console.log("\n[T3] Secret mancante / payload non valido");
{
  let lanciato1 = false;
  try {
    decifraSegreto("non-è-un-payload-cifrato", CHIAVE_TEST);
  } catch {
    lanciato1 = true;
  }
  check("payload malformato lancia", lanciato1 === true);

  let lanciato2 = false;
  try {
    cifraSegreto("x", "");
  } catch {
    lanciato2 = true;
  }
  check("chiave vuota al salvataggio lancia (fail-closed)", lanciato2 === true);

  check("valore vuoto → isSegretoCifrato false", isSegretoCifrato(null) === false);
  check("undefined → isSegretoCifrato false", isSegretoCifrato(undefined) === false);
}

console.log("\n[T4] has_secret (configurato / non configurato)");
{
  const rigaConSecret = credenzialiPubbliche({
    provider: "klarna",
    attivo: true,
    test_mode: true,
    client_id: "merchant_123",
    secret_encrypted: cifraSegreto("shared_secret", CHIAVE_TEST),
    webhook_secret_encrypted: null,
  });
  check("con secret_encrypted → has_secret true", rigaConSecret?.has_secret === true);
  check("client_id pubblico valorizzato", rigaConSecret?.client_id === "merchant_123");

  const rigaWebhook = credenzialiPubbliche({
    provider: "scalapay",
    attivo: false,
    test_mode: false,
    client_id: null,
    secret_encrypted: null,
    webhook_secret_encrypted: cifraSegreto("hmac", CHIAVE_TEST),
  });
  check("solo webhook_secret → has_secret true", rigaWebhook?.has_secret === true);

  const rigaVuota = credenzialiPubbliche({
    provider: "paypal",
    attivo: false,
    test_mode: true,
    client_id: null,
    secret_encrypted: null,
    webhook_secret_encrypted: null,
  });
  check("nessun secret → has_secret false", rigaVuota?.has_secret === false);
  check("riga null → null", credenzialiPubbliche(null) === null);
}

console.log("\n[T5] Isolamento tra negozi: i secret NON sono mai nei dati pubblici");
{
  const riga = {
    provider: "stripe",
    attivo: true,
    test_mode: false,
    client_id: "pk_test_abc",
    secret_encrypted: cifraSegreto("sk_live_SUPER_SEGRETO", CHIAVE_TEST),
    webhook_secret_encrypted: cifraSegreto("whsec_SUPER_SEGRETO", CHIAVE_TEST),
  };
  const pubblici = credenzialiPubbliche(riga);
  check("credenzialiPubbliche restituisce dati", pubblici !== null);
  const chiavi = pubblici ? Object.keys(pubblici) : [];
  check("niente chiave 'secret_encrypted' nel risultato", !chiavi.includes("secret_encrypted"));
  check("niente chiave 'webhook_secret_encrypted' nel risultato", !chiavi.includes("webhook_secret_encrypted"));
  check("niente chiave 'secret' nel risultato", !chiavi.includes("secret"));
  check(
    "il plaintext NON compare nel JSON pubblici",
    !JSON.stringify(pubblici).includes("SUPER_SEGRETO")
  );
  check("has_secret true ma senza valore", pubblici?.has_secret === true && typeof pubblici.client_id === "string");
}

console.log("\n[T6] mascheraSegreto — mai in chiaro nei log");
{
  const mascherato = mascheraSegreto("sk_live_1234567890abcdef");
  check("il secret non compare nel valore mascherato", !mascherato.includes("sk_live_1234567890abcdef"));
  check("valore mascherato corto", mascherato.length > 0 && mascherato.length <= 8);
  check("null → '(non configurato)'", mascheraSegreto(null) === "(non configurato)");
}

console.log("\n[T7] Allowlist provider");
{
  for (const p of PROVIDER_PAGAMENTO_VALIDI) {
    check(`provider '${p}' valido`, isProviderPagamentoValido(p) === true);
  }
  check("provider 'klarna' valido", isProviderPagamentoValido("klarna") === true);
  check("provider 'stripe' valido", isProviderPagamentoValido("stripe") === true);
  check("provider 'bonifico' valido", isProviderPagamentoValido("bonifico") === true);
  check("provider 'mastercard' NON valido", isProviderPagamentoValido("mastercard") === false);
  check("provider 'adyen' NON valido", isProviderPagamentoValido("adyen") === false);
  check("provider undefined NON valido", isProviderPagamentoValido(undefined) === false);
}

console.log("\n[T8] Allowlist metodi");
{
  for (const m of METODI_PAGAMENTO_VALIDI) {
    check(`metodo '${m}' valido`, isMetodoPagamentoValido(m) === true);
  }
  check("metodo 'carta' valido", isMetodoPagamentoValido("carta") === true);
  check("metodo 'googlepay' NON valido", isMetodoPagamentoValido("googlepay") === false);
  check("metodo null NON valido", isMetodoPagamentoValido(null) === false);
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log(`CRYPTO PAGAMENTI TEST: ${passati} passati, ${falliti} falliti`);
if (falliti > 0) {
  console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
  process.exit(1);
}
console.log("TUTTI I TEST PASSATI ✓");
