// Genera lib/conoscenza/indice-generato.ts dalle pagine pubbliche di app/.
// Eseguito in prebuild: ogni pagina nuova o modificata entra nell'indice al deploy.
// Legge titolo e descrizione dal blocco `export const metadata` di ogni page.tsx.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RADICE = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const APP = join(RADICE, "app");
const USCITA = join(RADICE, "lib", "conoscenza", "indice-generato.ts");

// Cartelle non pubbliche: area amministrativa, clienti, merchant, auth, API.
const ESCLUSE = /(^|\/)(amministratore|cliente|merchant|\(auth\)|api|admin|assistant|checkout|carrello|ordini|preferiti|profilo|acquirenti|venditori|corriere|ritorno-stripe|logout-success|manutenzione|prodotto)(\/|$)/;

function trovaPagine(dir, out = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) trovaPagine(p, out);
    else if (nome === "page.tsx") out.push(p);
  }
  return out;
}

// Il layout aggiunge già il suffisso del sito con il template: lo rimuoviamo dai titoli.
const SUFFISSO_SITO = /\s*\|\s*Radici Calabria\s*$/;
function pulisciTitolo(titolo) {
  return titolo ? titolo.replace(SUFFISSO_SITO, "").trim() : titolo;
}

function leggiMetadata(testo) {
  const m = testo.match(/export const metadata[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!m) return null;
  const corpo = m[1];
  const stringa = (chiave) => {
    const r = corpo.match(new RegExp(`${chiave}:\\s*\\n?\\s*"([^"]*)"`));
    return r ? r[1] : null;
  };
  return { titolo: pulisciTitolo(stringa("title")), descrizione: stringa("description") };
}

const pagine = [];
for (const file of trovaPagine(APP).sort()) {
  const rel = relative(APP, file).split(sep).join("/");
  const percorsoDir = rel.replace(/\/?page\.tsx$/, "");
  if (ESCLUSE.test(rel)) continue;
  if (percorsoDir.includes("[")) continue; // route dinamiche: gestite dal DB
  const meta = leggiMetadata(readFileSync(file, "utf8"));
  if (!meta || !meta.titolo) continue;
  pagine.push({
    percorso: `/${percorsoDir}`.replace(/\/$/, "") || "/",
    titolo: meta.titolo,
    descrizione: meta.descrizione ?? "",
  });
}

const dati = { generatoIl: new Date().toISOString(), pagine };
writeFileSync(
  USCITA,
  `// Generato da scripts/sync-conoscenza-pino.mjs: non modificare a mano.\nexport const INDICE_GENERATO = ${JSON.stringify(dati, null, 2)} as const;\n`
);
console.log(`sync-conoscenza-pino: ${pagine.length} pagine indicizzate -> lib/conoscenza/indice-generato.ts`);
