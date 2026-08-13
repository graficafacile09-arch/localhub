/**
 * CAP / COMUNI / PROVINCE — fonte dati e query (client).
 *
 * Dati: `public/data/comuni.json` — dataset open "comuni-json"
 * (github.com/matteocontrini/comuni-json, ISTAT + CAP, licenza MIT).
 * Il file è servito staticamente e caricato UNA volta (cache in memoria),
 * quindi non appesantisce il bundle JS: viene richiesto solo quando l'utente
 * interagisce con i campi CAP/città.
 *
 * Per aggiornare il dataset basta sostituire `public/data/comuni.json` con
 * una versione più recente dello stesso formato: nessuna modifica al codice.
 */

export type Comune = {
  /** Nome del comune (es. "Castrovillari"). */
  nome: string;
  /** Nome della provincia (es. "Cosenza"). */
  provincia: string;
  /** Sigla provincia (es. "CS"). */
  sigla: string;
  /** Nome della regione (es. "Calabria"). */
  regione: string;
  /** CAP associati (uno o più). */
  cap: string[];
  /** Codice catastale (es. "C349"). */
  codiceCatastale: string;
};

const URL_DATASET = "/data/comuni.json";

let cache: Comune[] | null = null;
let caricamento: Promise<Comune[]> | null = null;

type RigaDataset = {
  nome?: string;
  provincia?: { nome?: string } | null;
  sigla?: string;
  regione?: { nome?: string } | null;
  cap?: unknown;
  codiceCatastale?: string;
};

function normalizza(raw: RigaDataset[]): Comune[] {
  return raw
    .filter((c) => c && typeof c.nome === "string")
    .map((c) => ({
      nome: c.nome as string,
      provincia: c.provincia?.nome ?? "",
      sigla: c.sigla ?? "",
      regione: c.regione?.nome ?? "",
      cap: Array.isArray(c.cap) ? c.cap.filter((v): v is string => typeof v === "string") : [],
      codiceCatastale: c.codiceCatastale ?? "",
    }));
}

export async function caricaComuni(): Promise<Comune[]> {
  if (cache) return cache;
  if (!caricamento) {
    caricamento = fetch(URL_DATASET)
      .then((res) => {
        if (!res.ok) throw new Error(`Dataset comuni non disponibile (${res.status})`);
        return res.json() as Promise<RigaDataset[]>;
      })
      .then((raw) => {
        cache = normalizza(raw);
        return cache;
      })
      .catch((err) => {
        caricamento = null;
        throw err;
      });
  }
  return caricamento;
}

/**
 * Numero massimo di risultati per la RICERCA PER NOME (autocomplete città):
 * limitato per non affogare il dropdown quando si digita poco (es. "ca").
 * Il CAP invece NON ha limiti: un CAP può avere molti comuni e vanno mostrati
 * tutti.
 */
const LIMITE_RICERCA_COMUNE = 30;

/**
 * Comuni il cui CAP inizia con il prefisso digitato (es. "870" → tutti i comuni
 * del comprensorio 870xx). Restituisce TUTTE le combinazioni CAP+comune
 * presenti nel dataset (nessun troncamento): per un CAP completo (5 cifre) è
 * il match esatto su `cap`. Ordina per CAP crescente.
 */
export async function comuniPerCap(prefisso: string): Promise<Comune[]> {
  const p = prefisso.trim();
  if (p.length < 2) return [];
  const comuni = await caricaComuni();
  return comuni
    .filter((c) => c.cap.some((cap) => cap.startsWith(p)))
    .sort((a, b) => (a.cap[0] ?? "").localeCompare(b.cap[0] ?? ""));
}

/**
 * Ricerca comuni per nome (autocomplete città): match per inclusione su nome
 * o provincia. Priorità: match esatto → nomi che iniziano col termine → resto
 * (ordinamento alfabetico it). Il match esatto non viene MAI troncato via.
 */
export async function ricercaComuni(termine: string): Promise<Comune[]> {
  const t = termine.trim().toLowerCase();
  if (t.length < 2) return [];
  const comuni = await caricaComuni();
  const filtrati = comuni.filter(
    (c) => c.nome.toLowerCase().includes(t) || c.provincia.toLowerCase().includes(t)
  );
  filtrati.sort((a, b) => {
    const aNome = a.nome.toLowerCase();
    const bNome = b.nome.toLowerCase();
    if (aNome === t) return -1;
    if (bNome === t) return 1;
    const aInizia = aNome.startsWith(t) ? 0 : 1;
    const bInizia = bNome.startsWith(t) ? 0 : 1;
    if (aInizia !== bInizia) return aInizia - bInizia;
    return a.nome.localeCompare(b.nome, "it");
  });
  return filtrati.slice(0, LIMITE_RICERCA_COMUNE);
}

/** Etichetta provincia compatta (es. "Cosenza (CS)"). */
export function etichettaProvincia(comune: Comune): string {
  return comune.sigla ? `${comune.provincia} (${comune.sigla})` : comune.provincia;
}

/**
 * Restituisce i CAP di un comune per nome (match esatto, case-insensitive).
 * Utile quando si parte dalla città: i CAP disponibili vanno nel dropdown CAP.
 */
export async function capDelComune(nomeComune: string): Promise<string[]> {
  const nome = nomeComune.trim().toLowerCase();
  if (!nome) return [];
  const comuni = await caricaComuni();
  const comune = comuni.find((c) => c.nome.toLowerCase() === nome);
  return comune ? comune.cap : [];
}
