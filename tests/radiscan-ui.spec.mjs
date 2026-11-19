/**
 * RADICISCAN — TEST DELL'INTERFACCIA (FASE 2D)
 *
 * Verificano la logica pura della UI (livelli, errori, validazione locale,
 * ridimensionamento, parsing) e l'isolamento dei sorgenti: nessun import da
 * Vision, Product Assistant, scan-log o rate limiter venditori.
 *
 * Comando:
 *   node --experimental-strip-types --import ./tests/support/hook-radiscan.mjs \
 *     --test tests/radiscan-ui.spec.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ui = await import("@/components/radiscan/logica");

const {
  ETICHETTE_GRUPPO,
  LATO_MASSIMO,
  MAX_FILE_ORIGINALE_BYTES,
  MAX_IMMAGINE_BYTES,
  calcolaLato,
  descriviQuota,
  estraiErrore,
  estraiRisposta,
  formattaAttesa,
  gruppoDaLivello,
  messaggioErrore,
  validaFileLocale,
} = ui;

const radice = (percorso) =>
  fileURLToPath(new URL(`../${percorso}`, import.meta.url));

const leggi = (percorso) => readFileSync(radice(percorso), "utf8");

function riconoscimento(override = {}) {
  return {
    prodotto: "Pecorino Crotonese",
    categoria: "Formaggi",
    denominazioneProposta: "Pecorino Crotonese DOP",
    territorioProposto: "Provincia di Crotone",
    schemaProposto: "DOP",
    indicatoriEtichetta: ["DOP"],
    confidenza: 80,
    note: null,
    incongruenzeRilevate: [],
    ...override,
  };
}

function esito(livello = "verificato", override = {}) {
  return {
    livello,
    riconoscimento: riconoscimento(),
    fonteId: null,
    denominazioneVerificata: null,
    verifica: {
      esito: "nessuna_denominazione",
      livello,
      fonte: null,
      denominazioneVerificata: null,
      motivazione: "Motivazione di prova.",
    },
    avvertenza: "RadiciScan non certifica l'autenticità di un prodotto.",
    versionePrompt: "radiscan-1.0.0",
    ...override,
  };
}

// ─── Livelli e etichette ───────────────────────────────────────────────────

test("UI: i quattro livelli finiscono nei quattro gruppi distinti", () => {
  assert.equal(gruppoDaLivello("verificato"), "verificato");
  assert.equal(gruppoDaLivello("coerente_non_verificato"), "non_documentato");
  assert.equal(gruppoDaLivello("non_verificato"), "non_verificato");
  assert.equal(gruppoDaLivello("incongruenza_possibile"), "incongruenza");
});

test("UI: le etichette distinguono verificato, non documentato e non verificato", () => {
  assert.match(ETICHETTE_GRUPPO.verificato.titolo, /verificata/i);
  assert.match(ETICHETTE_GRUPPO.non_documentato.titolo, /riscontro parziale/i);
  assert.match(ETICHETTE_GRUPPO.non_verificato.titolo, /non verificato/i);
  assert.match(ETICHETTE_GRUPPO.incongruenza.titolo, /incongruenza/i);

  for (const etichetta of Object.values(ETICHETTE_GRUPPO)) {
    assert.doesNotMatch(etichetta.titolo, /autentico|autentica|certificato/i);
    assert.doesNotMatch(etichetta.descrizione, /autentico|autentica|certificato/i);
  }
});

// ─── Validazione e ridimensionamento locale ────────────────────────────────

test("UI: formati e limiti locali coerenti con la route", () => {
  assert.equal(validaFileLocale({ type: "image/jpeg", size: 1024 }).ok, true);
  assert.equal(validaFileLocale({ type: "image/png", size: 1024 }).ok, true);
  assert.equal(validaFileLocale({ type: "image/webp", size: 1024 }).ok, true);
  assert.equal(validaFileLocale({ type: "image/jpg", size: 1024 }).ok, true);

  for (const tipo of ["image/gif", "image/heic", "application/pdf", ""]) {
    const esitoTipo = validaFileLocale({ type: tipo, size: 1024 });
    assert.equal(esitoTipo.ok, false, tipo);
    assert.match(esitoTipo.messaggio, /formato/i);
  }

  assert.equal(validaFileLocale({ type: "image/jpeg", size: 0 }).ok, false);
  assert.equal(
    validaFileLocale({ type: "image/jpeg", size: MAX_FILE_ORIGINALE_BYTES + 1 }).ok,
    false
  );
  assert.equal(
    validaFileLocale({ type: "image/jpeg", size: MAX_FILE_ORIGINALE_BYTES }).ok,
    true
  );
  assert.equal(
    validaFileLocale({ type: "image/jpeg", size: MAX_IMMAGINE_BYTES * 3 }).ok,
    true,
    "una foto da 9 MB deve essere ridimensionata, non rifiutata"
  );
});

test("UI: il ridimensionamento non ingrandisce e resta conservativo", () => {
  assert.deepEqual(calcolaLato(4000, 3000), { larghezza: 2400, altezza: 1800 });
  assert.deepEqual(calcolaLato(3000, 4000), { larghezza: 1800, altezza: 2400 });
  assert.deepEqual(calcolaLato(800, 600), { larghezza: 800, altezza: 600 });
  assert.deepEqual(calcolaLato(0, 600), { larghezza: 0, altezza: 0 });
  assert.ok(LATO_MASSIMO >= 2000, "il lato massimo deve privilegiare l'etichetta");
});

// ─── Messaggi e quota ──────────────────────────────────────────────────────

test("UI: attese leggibili in secondi, minuti e ore", () => {
  assert.equal(formattaAttesa(30), "30 secondi");
  assert.equal(formattaAttesa(90), "2 minuti");
  assert.equal(formattaAttesa(7200), "2 ore");
  assert.equal(formattaAttesa(0), "pochi secondi");
});

test("UI: errori pubblici mappati senza dettagli interni", () => {
  assert.match(
    messaggioErrore({ stato: 429, codice: "QUOTA_SUPERATA", riprovaSecondi: 90 }),
    /limite.*Riprova tra 2 minuti/i
  );
  assert.match(
    messaggioErrore({ stato: 413, codice: "IMMAGINE_TROPPO_GRANDE" }),
    /troppo grande/i
  );
  assert.match(
    messaggioErrore({ stato: 415, codice: "FORMATO_NON_SUPPORTATO" }),
    /formato non supportato/i
  );
  assert.match(
    messaggioErrore({ stato: 503, codice: "ANALISI_NON_DISPONIBILE" }),
    /non è disponibile/i
  );
  assert.match(
    messaggioErrore({ stato: 0, codice: "RETE" }),
    /non è stato possibile/i
  );

  const testo = messaggioErrore({
    stato: 500,
    codice: "ERRORE_INTERNO",
    messaggio: "stack trace segreto",
  });
  assert.doesNotMatch(testo, /stack trace segreto/i);
});

test("UI: errore e quota estratti solo se la forma è valida", () => {
  const errore = estraiErrore({
    success: false,
    errore: { codice: "QUOTA_SUPERATA", messaggio: "Limite." },
    quota: { usatiOggi: 100, limiteGiorno: 100, limiteMinuto: 10 },
  });

  assert.equal(errore.codice, "QUOTA_SUPERATA");
  assert.deepEqual(errore.quota, {
    usatiOggi: 100,
    limiteGiorno: 100,
    limiteMinuto: 10,
  });
  assert.match(descriviQuota(errore.quota), /100.*100.*10/);

  assert.equal(estraiErrore(null), null);
  assert.equal(estraiErrore({ success: false }), null);
  assert.equal(estraiErrore({ errore: "rotto" }), null);
  assert.equal(
    estraiErrore({ errore: { codice: "X" }, quota: { usatiOggi: "molti" } }).quota,
    undefined
  );
});

// ─── Risposta della route ──────────────────────────────────────────────────

test("UI: risposta valida letta, risposta malformata rifiutata", () => {
  const valida = estraiRisposta({
    success: true,
    esito: esito("verificato"),
    cache: true,
  });
  assert.equal(valida.esito.livello, "verificato");
  assert.equal(valida.cache, true);

  const senzaCache = estraiRisposta({ success: true, esito: esito("non_verificato") });
  assert.equal(senzaCache.cache, false);

  for (const nonValida of [
    null,
    {},
    { success: false, esito: esito() },
    { success: true },
    { success: true, esito: { livello: "inventato", riconoscimento: {}, verifica: {} } },
    { success: true, esito: { livello: "verificato", riconoscimento: null, verifica: {} } },
    { success: true, esito: { livello: "verificato", riconoscimento: {}, verifica: null } },
  ]) {
    assert.throws(() => estraiRisposta(nonValida));
  }
});

// ─── Isolamento dei sorgenti ───────────────────────────────────────────────

test("UI: nessun import da Vision, venditori o moduli server", () => {
  const sorgenti = [
    "components/radiscan/RadiciScanStudio.tsx",
    "components/radiscan/ScanRisultato.tsx",
    "components/radiscan/logica.ts",
    "app/prodotti/page.tsx",
  ];

  for (const percorso of sorgenti) {
    const sorgente = leggi(percorso);
    assert.doesNotMatch(sorgente, /@\/lib\/(vision-core|product-assistant|scan-log)/, percorso);
    assert.doesNotMatch(sorgente, /rate-limiter|rateLimiter/, percorso);
    assert.doesNotMatch(sorgente, /node:crypto|createAdminSupabaseClient/, percorso);
    assert.doesNotMatch(sorgente, /from\s+["']@\/lib\/radiscan["']/, percorso);
    assert.doesNotMatch(sorgente, /dangerouslySetInnerHTML/, percorso);
  }

  const risultato = leggi("components/radiscan/ScanRisultato.tsx");
  assert.match(risultato, /Prove documentali/);
  assert.match(risultato, /Ricerca non completata/);
  assert.match(risultato, /SchedaProva/);

  const studio = leggi("components/radiscan/RadiciScanStudio.tsx");
  assert.match(studio, /^"use client";/);
  assert.match(studio, /\/api\/radiscan\/analisi/);
  assert.match(studio, /credentials:\s*["']same-origin["']/);
  assert.doesNotMatch(studio, /["']Content-Type["']/);
  assert.doesNotMatch(studio, /process\.env/);

  const pagina = leggi("app/prodotti/page.tsx");
  assert.match(pagina, /RadiciScanStudio/);
  assert.match(pagina, /RadiciScan/);
  assert.doesNotMatch(pagina, /TerraQ/);
});
