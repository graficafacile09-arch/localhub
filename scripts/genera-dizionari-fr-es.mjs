/**
 * Genera `lib/i18n/dictionary-fr.ts`, `lib/i18n/dictionary-es.ts` e
 * `lib/i18n/dictionary-de.ts` a partire dalle chiavi italiane del dizionario
 * IT → EN.
 *
 * Il sito traduce i testi già renderizzati (vedi `lib/i18n/traduzione-dom.ts`),
 * quindi per ogni chiave italiana serve la versione francese, spagnola e
 * tedesca.
 * La traduzione avviene UNA VOLTA, qui, e il risultato viene committato: a
 * runtime non c'è nessuna chiamata di rete.
 *
 * Uso: node scripts/genera-dizionari-fr-es.mjs
 * La cache (`.traduzioni-fr-es.cache.json`) evita di ritradurre le voci già
 * fatte quando si aggiungono nuove stringhe al sito.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const CARTELLA = "lib/i18n";
const CACHE = ".traduzioni-fr-es.cache.json";
const DELIMITATORE = "\n@@@\n";

/** Carica un modulo TS del dizionario (import relativi risolti a mano). */
const moduli = new Map();
function carica(file) {
  const assoluto = path.resolve(file);
  if (moduli.has(assoluto)) return moduli.get(assoluto);

  const sorgente = fs.readFileSync(assoluto, "utf8");
  const js = ts.transpileModule(sorgente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;

  const modulo = { exports: {} };
  moduli.set(assoluto, modulo.exports);
  const req = (spec) => {
    const relativo = path.resolve(path.dirname(assoluto), spec);
    return carica(relativo.endsWith(".ts") ? relativo : `${relativo}.ts`);
  };
  new Function("exports", "require", "module", "__filename", "__dirname", js)(
    modulo.exports,
    req,
    modulo,
    assoluto,
    path.dirname(assoluto),
  );
  return modulo.exports;
}

const { DIZIONARIO } = carica(path.join(CARTELLA, "dictionary.ts"));
const chiavi = Object.keys(DIZIONARIO).filter((k) => /[A-Za-zÀ-ÿ]/.test(k));
console.log(`Voci da tradurre: ${chiavi.length} (${chiavi.join(" ").length} caratteri)`);

let cache = {};
try {
  if (fs.existsSync(CACHE)) cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));
} catch {
  console.warn("Cache illeggibile: si riparte da zero.");
}

/** Salvataggio atomico: nessun file a metà se il processo si interrompe. */
function salvaCache() {
  const temporaneo = `${CACHE}.tmp`;
  fs.writeFileSync(temporaneo, JSON.stringify(cache));
  fs.renameSync(temporaneo, CACHE);
}

/** Estrae la traduzione dalle due forme di risposta di Google. */
function estraiTesto(dati) {
  if (typeof dati === "string") return dati;
  if (Array.isArray(dati) && typeof dati[0] === "string") return dati[0];
  if (Array.isArray(dati) && Array.isArray(dati[0])) {
    return dati[0].map((pezzo) => (Array.isArray(pezzo) ? pezzo[0] ?? "" : String(pezzo ?? ""))).join("");
  }
  return "";
}

/** Traduce un blocco di testi, restituendo un array allineato (o null). */
async function traduciBlocco(testi, lingua) {
  const testo = testi.join(DELIMITATORE);
  const url = [
    `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=it&tl=${lingua}&q=${encodeURIComponent(testo)}`,
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=it&tl=${lingua}&dt=t&q=${encodeURIComponent(testo)}`,
  ];

  for (let tentativo = 1; tentativo <= 6; tentativo += 1) {
    for (const indirizzo of url) {
      try {
        const risposta = await fetch(indirizzo, {
          headers: { "User-Agent": "Mozilla/5.0 (radici-calabria traduzioni)" },
        });
        if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
        const unito = estraiTesto(await risposta.json());
        const parti = unito.split(/@@@/).map((s) => s.replace(/\s+/g, " ").trim());
        if (parti.length !== testi.length) {
          throw new Error(`allineamento ${parti.length}/${testi.length}`);
        }
        return parti;
      } catch (errore) {
        if (/HTTP 429/.test(errore.message)) {
          await new Promise((r) => setTimeout(r, 4000 * tentativo));
          continue;
        }
        if (indirizzo === url[url.length - 1] && tentativo === 6) {
          console.warn(`   blocco saltato: ${errore.message}`);
          return null;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 2000 * tentativo));
  }
  console.warn("   blocco saltato: tentativi esauriti");
  return null;
}

async function generaPer(lingua) {
  const daFare = chiavi.filter((k) => !cache[lingua]?.[k]);
  console.log(`\n── ${lingua.toUpperCase()}: ${daFare.length} voci mancanti`);

  // Blocchi brevi: l'endpoint gratuito accetta testi lunghi, ma blocchi piccoli
  // rendono l'allineamento verificabile e i ritentativi economici.
  const blocchi = [];
  let corrente = [];
  let caratteri = 0;
  for (const chiave of daFare) {
    if (corrente.length >= 8 || caratteri + chiave.length > 1200) {
      blocchi.push(corrente);
      corrente = [];
      caratteri = 0;
    }
    corrente.push(chiave);
    caratteri += chiave.length;
  }
  if (corrente.length) blocchi.push(corrente);

  let fatti = 0;
  let indice = 0;
  // Una richiesta alla volta: l'endpoint gratuito blocca (HTTP 429) se lo si
  // martella. Con la cache, riprendere è sempre possibile.
  const lavoratori = 2;
  await Promise.all(
    Array.from({ length: lavoratori }, async () => {
      while (indice < blocchi.length) {
        const mio = indice;
        indice += 1;
        const blocco = blocchi[mio];
        const tradotti = await traduciBlocco(blocco, lingua);
        if (!tradotti) continue;
        cache[lingua] = cache[lingua] ?? {};
        blocco.forEach((chiave, i) => {
          cache[lingua][chiave] = tradotti[i] ?? chiave;
        });
        fatti += blocco.length;
        if (mio % 10 === 0) {
          salvaCache();
          console.log(`   ${fatti}/${daFare.length}`);
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    }),
  );
  salvaCache();
}

// Riprende le traduzioni già presenti nei file generati: se un blocco è stato
// saltato (rate limit) o una voce è rimasta in italiano, viene rifatta qui.
for (const [lingua, nome] of [
  ["fr", "DIZIONARIO_FR"],
  ["es", "DIZIONARIO_ES"],
  ["de", "DIZIONARIO_DE"],
]) {
  const file = path.join(CARTELLA, `dictionary-${lingua}.ts`);
  if (!fs.existsSync(file)) continue;
  const modulo = carica(file);
  cache[lingua] = cache[lingua] ?? {};
  for (const [chiave, valore] of Object.entries(modulo[nome] ?? {})) {
    if (valore !== chiave) cache[lingua][chiave] = valore;
  }
}

await generaPer("fr");
await generaPer("es");
await generaPer("de");

for (const [lingua, nome] of [
  ["fr", "DIZIONARIO_FR"],
  ["es", "DIZIONARIO_ES"],
  ["de", "DIZIONARIO_DE"],
]) {
  const righe = chiavi.map((chiave) => {
    const valore = cache[lingua]?.[chiave] ?? chiave;
    return `  ${JSON.stringify(chiave)}: ${JSON.stringify(valore)},`;
  });
  const aggettivo = lingua === "fr" ? "francesi" : lingua === "es" ? "spagnole" : "tedesche";
  const contenuto = `/**\n * Traduzioni ${aggettivo} del sito.\n *\n * FILE GENERATO: non modificare a mano. Le chiavi sono i testi italiani\n * (normalizzati) e i valori la traduzione. Per rigenerarlo dopo aver aggiunto\n * stringhe al dizionario IT → EN:\n *   node scripts/genera-dizionari-fr-es.mjs\n */\nexport const ${nome}: Record<string, string> = {\n${righe.join("\n")}\n};\n`;
  fs.writeFileSync(path.join(CARTELLA, `dictionary-${lingua}.ts`), contenuto);
  console.log(`Scritto ${CARTELLA}/dictionary-${lingua}.ts (${righe.length} voci)`);
}

fs.rmSync(CACHE, { force: true });

// Controllo rapido: quante voci restano identiche all'italiano.
for (const lingua of ["fr", "es", "de"]) {
  const uguali = chiavi.filter((k) => cache[lingua]?.[k] === k).length;
  console.log(`${lingua}: ${uguali} voci invariate (sigle, nomi propri, ecc.)`);
}
