import { normalizzaTesto } from "./filtro";
import type { TipoContenuto } from "./types";

/**
 * CLASSIFICAZIONE EDITORIALE — deterministica, nessuna IA.
 *
 * Serve a due cose, entrambe calcolate da titolo ed estratto (nessun campo
 * aggiuntivo nel database, così l'archivio resta compatibile):
 *   1. attribuire a ogni contenuto la tipologia editoriale (notizia, evento,
 *      fiera, bollettino, opportunità) per l'etichetta discreta sulla scheda;
 *   2. ricavare data e luogo di svolgimento quando sono scritti in modo
 *      esplicito nel titolo o nell'estratto. Se non lo sono, i campi restano
 *      nulli: non viene mai inventata una data o una località.
 */

/** Etichette mostrate sulle schede. */
export const ETICHETTE_TIPO: Record<TipoContenuto, string> = {
  notizia: "Notizia",
  evento: "Evento",
  fiera: "Fiera",
  bollettino: "Bollettino",
  opportunita: "Opportunità",
};

/** Bollettini tecnici (agrometeo, fitosanitari, monitoraggi). */
const RE_BOLLETTINO =
  /bollettin|agrometeorolog|fitosanitar|previsioni meteo|monitoraggio|allerta meteo/i;

/** Fiere, saloni e manifestazioni fieristiche (anche estere). */
const RE_FIERA =
  /\bfier[ae]\b|salone internazionale|salone dell|\bexpo\b|vinitaly|tuttofood|\bcibus\b|macfrut|\beima\b|\bsial\b|vini ?italy|prowein|fruit logistica|anuga|sirma/i;

/** Eventi: convegni, incontri, degustazioni, sagre, giornate tecniche. */
const RE_EVENTO =
  /\bevent[oi]\b|convegno|seminario|webinar|\bcorso\b|giornata|incontro|workshop|presentazione|degustazione|\bsagra\b|festival|rassegna|manifestazione|appuntamento|open day|visita guidata|\btalk\b|assemblea|conferenza|tavola rotonda/i;

/** Opportunità: bandi, contributi, finanziamenti, concorsi. */
const RE_OPPORTUNITA =
  /\bband[oi]\b|avviso pubblico|finanziament|contribut|incentiv|agevolazion|graduatori|domanda di aiuto|\bconcorso\b|opportunit|candidatur|ammissione|misura\s+\d|riparto|risorse economiche/i;

/** Tipologia editoriale di un contenuto (ordine di priorità fisso). */
export function classificaTipoContenuto(
  title: string,
  excerpt?: string | null
): TipoContenuto {
  const testo = `${title} ${excerpt ?? ""}`;
  if (RE_BOLLETTINO.test(testo)) return "bollettino";
  if (RE_FIERA.test(testo)) return "fiera";
  if (RE_EVENTO.test(testo)) return "evento";
  if (RE_OPPORTUNITA.test(testo)) return "opportunita";
  return "notizia";
}

/* ═══════════════════════════════════════════════════════════════════════
   DATE E LUOGHI DEGLI EVENTI
   ═══════════════════════════════════════════════════════════════════════ */

const MESI: Record<string, number> = {
  gennaio: 0,
  febbraio: 1,
  marzo: 2,
  aprile: 3,
  maggio: 4,
  giugno: 5,
  luglio: 6,
  agosto: 7,
  settembre: 8,
  ottobre: 9,
  novembre: 10,
  dicembre: 11,
};

const NOMI_MESI = Object.keys(MESI).join("|");

/** Nomi dei mesi in italiano minuscolo (per la formattazione). */
const MESI_BREVI = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

/** Costruisce una data ISO solo se anno/mese/giorno formano una data reale. */
function dataIso(anno: number, mese: number, giorno: number): string | null {
  if (mese < 0 || mese > 11 || giorno < 1 || giorno > 31) return null;
  if (anno < 2000 || anno > 2100) return null;
  const d = new Date(Date.UTC(anno, mese, giorno));
  if (
    d.getUTCFullYear() !== anno ||
    d.getUTCMonth() !== mese ||
    d.getUTCDate() !== giorno
  ) {
    return null;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Luoghi riconosciuti: capoluoghi e comuni calabresi con produzione agricola
 * rilevante, più le città che ospitano le principali fiere nazionali ed
 * estere. L'elenco è volutamente esplicito: si preferisce non indicare un
 * luogo piuttosto che sbagliarlo.
 */
const LUOGHI: readonly string[] = [
  // Calabria
  "reggio calabria", "vibo valentia", "lamezia terme", "gioia tauro",
  "palmi", "tropea", "ricadi", "pizzo", "mileto", "nicotera", "rosarno",
  "polistena", "taurianova", "siderno", "locri", "gerace", "bovalino",
  "scilla", "bagnara calabra", "villa san giovanni", "condofuri", "melito di porto salvo",
  "brancaleone", "africo", "canolo", "ferruzzano", "caraffa del bianco",
  "san lucido", "paola", "fuscaldo", "guardia piemontese", "cetraro",
  "belvedere marittimo", "diamante", "scalea", "praia a mare", "santa maria del cedro",
  "orsomarso", "papasidero", "mormanno", "morano calabro", "castrovillari",
  "frascineto", "civita", "cerchiara di calabria", "cassano all'ionio",
  "villapiana", "trebisacce", "roseto capo spulico", "corigliano-rossano",
  "corigliano rossano", "corigliano", "rossano", "sibari", "terranova da sibari",
  "cariati", "cirò marina", "cirò", "crucoli", "strongoli", "crotone",
  "isola capo rizzuto", "petilia policastro", "mesoraca", "caccuri",
  "santa severina", "san giovanni in fiore", "spezzano albanese",
  "spezzano della sila", "acri", "san marco argentano", "montalto uffugo",
  "rende", "cosenza", "altomonte", "verbicaro", "amantea", "soverato",
  "squillace", "catanzaro", "catanzaro lido", "sellia marina", "botricello",
  "cropani", "soveria mannelli", "taverna", "serrastretta", "girifalco",
  "maida", "filadelfia", "monteleone di calabria", "serra san bruno",
  "sorianello", "mammola", "canicattì", "stilo", "bivongi", "pazzano",
  // Fiere e città nazionali/estere
  "verona", "milano", "bologna", "roma", "rimini", "ferrara", "parma",
  "genova", "torino", "firenze", "bari", "napoli", "palermo", "catania",
  "bolzano", "piacenza", "cremona", "pesaro", "senigallia", "vicenza",
  "longarone", "bergamo", "brescia", "mantova", "siena", "arezzo", "lucca",
  "viterbo", "perugia", "l'aquila", "salerno", "avellino", "benevento",
  "matera", "taranto", "lecce", "brindisi", "reggio emilia", "modena",
  "ravenna", "cesena", "forlì", "como", "trento", "udine", "trieste",
  "lubiana", "berlino", "parigi", "colonia", "madrid", "barcellona",
  "amsterdam", "londra", "new york", "tokyo", "shanghai", "dubai",
  "abu dhabi", "düsseldorf", "norimberga", "hannover", "bruxelles",
  "calabria",
];

/** Dal più lungo al più corto: "reggio calabria" prima di "calabria". */
const LUOGHI_ORDINATI = [...new Set(LUOGHI)].sort((a, b) => b.length - a.length);

const RE_LUOGO = new RegExp(
  `\\b(?:a|ad|presso|in|nel|nella|al|alla|da)\\s+(${LUOGHI_ORDINATI.map((l) =>
    l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  ).join("|")})\\b`,
  "i"
);

/** Luogo esplicitamente indicato nel testo, oppure null. */
function estraiLuogo(testo: string): string | null {
  const m = testo.match(RE_LUOGO);
  if (!m) return null;
  const trovato = m[1].toLowerCase();
  const canonico = LUOGHI_ORDINATI.find((l) => l === trovato);
  if (!canonico) return null;
  // Ripristina le iniziali maiuscole (es. "reggio calabria" → "Reggio Calabria").
  return canonico
    .split(" ")
    .map((parola) => parola.charAt(0).toUpperCase() + parola.slice(1))
    .join(" ");
}

/**
 * Estrae periodo e luogo di un evento dalle informazioni disponibili.
 * Riconosce: "dal 5 al 9 aprile 2027", "5–9 aprile 2027", "dal 30 marzo al
 * 2 aprile 2027", "12 marzo 2027", "12/03/2027". Senza anno esplicito non
 * viene ipotizzata alcuna data.
 */
export function estraiEvento(
  title: string,
  excerpt?: string | null
): { dataInizio: string | null; dataFine: string | null; luogo: string | null } {
  const testo = `${title}. ${excerpt ?? ""}`;
  let dataInizio: string | null = null;
  let dataFine: string | null = null;

  // "dal 30 marzo al 2 aprile 2027"
  const traMesi = testo.match(
    new RegExp(
      `(?:dal\\s+)?(\\d{1,2})\\s+(${NOMI_MESI})\\s+al\\s+(\\d{1,2})\\s+(${NOMI_MESI})\\s+(\\d{4})`,
      "i"
    )
  );
  if (traMesi) {
    const [, g1, m1, g2, m2, anno] = traMesi;
    dataInizio = dataIso(Number(anno), MESI[m1.toLowerCase()], Number(g1));
    dataFine = dataIso(Number(anno), MESI[m2.toLowerCase()], Number(g2));
  }

  // "5–9 aprile 2027" o "dal 5 al 9 aprile 2027"
  if (!dataInizio) {
    const stessoMese = testo.match(
      new RegExp(
        `(\\d{1,2})\\s*(?:-|–|—|al)\\s*(\\d{1,2})\\s+(${NOMI_MESI})\\s+(\\d{4})`,
        "i"
      )
    );
    if (stessoMese) {
      const [, g1, g2, mese, anno] = stessoMese;
      const meseIdx = MESI[mese.toLowerCase()];
      dataInizio = dataIso(Number(anno), meseIdx, Number(g1));
      dataFine = dataIso(Number(anno), meseIdx, Number(g2));
      if (dataInizio && dataFine && dataFine < dataInizio) dataFine = null;
    }
  }

  // "12 marzo 2027"
  if (!dataInizio) {
    const singola = testo.match(
      new RegExp(`(\\d{1,2})\\s+(${NOMI_MESI})\\s+(\\d{4})`, "i")
    );
    if (singola) {
      const [, giorno, mese, anno] = singola;
      dataInizio = dataIso(Number(anno), MESI[mese.toLowerCase()], Number(giorno));
    }
  }

  // "12/03/2027" o "12.03.2027"
  if (!dataInizio) {
    const numerica = testo.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
    if (numerica) {
      const [, giorno, mese, anno] = numerica;
      dataInizio = dataIso(Number(anno), Number(mese) - 1, Number(giorno));
    }
  }

  return { dataInizio, dataFine, luogo: estraiLuogo(testo) };
}

/** Formatta il periodo di un evento in italiano (es. "5–9 aprile 2027"). */
export function formattaPeriodoEvento(
  inizio: string,
  fine?: string | null
): string {
  const a = new Date(`${inizio}T00:00:00Z`);
  if (Number.isNaN(a.getTime())) return "";
  const b = fine ? new Date(`${fine}T00:00:00Z`) : null;
  if (b && !Number.isNaN(b.getTime()) && b.getTime() > a.getTime()) {
    if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) {
      return `${a.getUTCDate()}–${b.getUTCDate()} ${MESI_BREVI[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
    }
    return `${a.getUTCDate()} ${MESI_BREVI[a.getUTCMonth()]} – ${b.getUTCDate()} ${MESI_BREVI[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  }
  return `${a.getUTCDate()} ${MESI_BREVI[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
}

/** Normalizza un testo per la ricerca di parole chiave (riesportata). */
export const normalizzaPerClassificazione = normalizzaTesto;
