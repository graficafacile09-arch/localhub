import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site";
import { TERRITORI, getTerritorio } from "@/lib/territori";
import { FILIERE_EDITORIALI, slugFiliera } from "@/lib/filiere-editoriali";
import { FAQ_PINO } from "@/lib/assistente/faq";
import { ATTRAZIONI_LUOGHI } from "@/lib/attrazioni-data";
import { CATEGORIE, NOMI_MESI, VOCI as VOCI_STAGIONALI } from "@/lib/stagionalita/calendario";
import { cercaContenutiPubblici } from "@/lib/contenuti-pubblici";
import { getNotiziePubbliche } from "@/lib/notizie-pubbliche";
import type { SezioneConoscenza } from "./tipi";
import { urlCanonico } from "./fonti";
import { suddividiTesto } from "./testo";

export type RisultatoConoscenza = {
  chiave: string;
  sezione: SezioneConoscenza;
  titolo: string;
  estratto: string;
  url: string;
};

const ESTRATTO_MAX = 320;

/**
 * Ricerca FTS italiana sull'archivio `pino_conoscenza`.
 * Restituisce solo voci attive: le rimosse non vengono mai mostrate.
 */
export async function cercaConoscenza(
  query: string,
  limit = 6
): Promise<RisultatoConoscenza[]> {
  const q = query.replace(/\s+/g, " ").trim();
  if (!q) return [];

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("pino_conoscenza")
    .select("chiave, sezione, fonte_url, titolo, contenuto")
    .eq("stato", "attivo")
    .textSearch("fts", q, { type: "websearch", config: "italian" })
    .limit(Math.min(Math.max(limit, 1), 8));

  if (error || !data) return [];

  return data.map((r) => ({
    chiave: r.chiave as string,
    sezione: r.sezione as SezioneConoscenza,
    titolo: r.titolo as string,
    estratto:
      (r.contenuto as string).length > ESTRATTO_MAX
        ? `${(r.contenuto as string).slice(0, ESTRATTO_MAX).trimEnd()}…`
        : (r.contenuto as string),
    url: urlCanonico(getSiteUrl(), r.fonte_url as string),
  }));
}

// ─── Indice locale dei testi del sito (RAG senza dipendenze esterne) ────────
//
// La FTS su `pino_conoscenza` funziona solo se la sincronizzazione è avvenuta e
// il database è raggiungibile. Per le domande informative serve una risposta
// anche senza database: gli stessi testi editoriali sono già compilati in
// `lib/`, quindi l'indice viene costruito in memoria a ogni processo e
// interrogato con un matching flessibile (radici, sinonimi, nessun AND rigido).

type DocumentoConoscenza = {
  chiave: string;
  sezione: SezioneConoscenza;
  titolo: string;
  /** Testo integrale: è quello che viene passato al modello come fonte. */
  testo: string;
  url: string;
};

/** Parole vuote: non identificano un argomento e falserebbero il punteggio. */
const PAROLE_VUOTE = new Set([
  "cos", "cosa", "che", "chi", "come", "quale", "quali", "quanto", "quanti",
  "parlami", "parla", "parlare", "spiegami", "spiega", "spiegare", "dimmi",
  "descrivi", "descrivi", "approfondisci", "storia", "significa", "vuol",
  "dire", "funziona", "essere", "sono", "sei", "era", "stato", "fare", "fanno",
  "della", "dello", "del", "dei", "degli", "delle", "dall", "dalla", "dalle",
  "nella", "nelle", "nello", "sulla", "sulle", "sullo", "alla", "alle", "allo",
  "agli", "negli", "sui", "sul", "tra", "fra", "per", "con", "senza", "anche",
  "questo", "questa", "questi", "queste", "quello", "quella", "molto", "poco",
  "più", "meno", "suo", "sua", "loro", "mio", "mia", "tuo", "tua",
  "the", "what", "who", "how", "why", "tell", "about", "and", "for", "with",
]);

/** Normalizza per il confronto: minuscole, senza accenti, solo lettere/cifre. */
function normalizzaConoscenza(testo: string): string {
  return testo
    .toLocaleLowerCase("it-IT")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenConoscenza(testo: string): string[] {
  return normalizzaConoscenza(testo)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !PAROLE_VUOTE.has(t));
}

/**
 * Radice grezza: sufficiente per far combaciare singolare/plurale e derivati
 * («parchi»/«parco», «filiere»/«filiera», «silano»/«sila»).
 */
function radiceConoscenza(token: string): string {
  if (token.length <= 4) return token;
  return token.slice(0, Math.max(4, Math.min(token.length, 6)));
}

/** Punteggio flessibile: nessun requisito che TUTTI i termini combacino. */
function punteggiaDocumento(doc: DocumentoConoscenza, termini: string[]): number {
  if (termini.length === 0) return 0;
  const tokenDoc = new Set(tokenConoscenza(`${doc.titolo} ${doc.testo}`));
  const tokenTitolo = new Set(tokenConoscenza(doc.titolo));
  let punteggio = 0;

  for (const termine of termini) {
    const radice = radiceConoscenza(termine);
    if (tokenTitolo.has(termine)) punteggio += 6;
    else if ([...tokenTitolo].some((t) => radiceConoscenza(t) === radice)) punteggio += 4;

    if (tokenDoc.has(termine)) punteggio += 3;
    else if ([...tokenDoc].some((t) => radiceConoscenza(t) === radice)) punteggio += 2;
  }
  return punteggio;
}

/**
 * Estratto ricco: il testo integrale quando è leggibile, altrimenti la finestra
 * di frasi con più termini cercati. Mai un titolo di tre parole.
 */
function estrattoRicco(doc: DocumentoConoscenza, termini: string[], massimo = 1400): string {
  const testo = doc.testo.replace(/\s+/g, " ").trim();
  if (testo.length <= massimo) return testo;

  const frasi = testo.split(/(?<=[.!?])\s+/);
  let migliore = 0;
  let punteggioMigliore = -1;
  frasi.forEach((frase, indice) => {
    const token = new Set(tokenConoscenza(frase));
    const punteggio = termini.filter((t) =>
      [...token].some((x) => radiceConoscenza(x) === radiceConoscenza(t))
    ).length;
    if (punteggio > punteggioMigliore) {
      punteggioMigliore = punteggio;
      migliore = indice;
    }
  });

  const scelte: string[] = [];
  let lunghezza = 0;
  for (let i = migliore; i < frasi.length; i++) {
    if (lunghezza + frasi[i].length > massimo && scelte.length > 0) break;
    scelte.push(frasi[i]);
    lunghezza += frasi[i].length + 1;
  }
  return scelte.join(" ").slice(0, massimo).trimEnd();
}

/**
 * Comuni collegati a un parco o a un'area: quando la domanda riguarda il parco,
 * i testi dei comuni (e i loro prodotti certificati) entrano tra le fonti.
 */
const COMUNI_PER_AREA: Record<string, string[]> = {
  pollino: ["rotonda", "castrovillari", "morano-calabro", "mormanno", "saracena", "civita"],
  sila: [],
  aspromonte: [],
};

/** I testi editoriali compilati nel repository. Costruiti una volta per processo. */
let indiceStatico: DocumentoConoscenza[] | null = null;

function documentiStatici(): DocumentoConoscenza[] {
  if (indiceStatico) return indiceStatico;
  const documenti: DocumentoConoscenza[] = [];

  // Parchi, aree e comuni: sommario, racconto integrale e riconoscimenti.
  for (const t of TERRITORI) {
    // Per un parco o un'area con comuni collegati, i prodotti certificati del
    // parco e dei suoi comuni entrano nello stesso documento del parco.
    const comuni = COMUNI_PER_AREA[t.slug] ?? [];
    const prodottiCertificati = [t.slug, ...comuni].flatMap((slug) => {
      const sorgente = getTerritorio(slug);
      return (sorgente?.prodotti ?? []).map(
        (p) => `${p.slug} (${p.riconoscimento}) — comune: ${sorgente?.nome ?? slug}`
      );
    });
    documenti.push({
      chiave: `territorio:${t.slug}`,
      sezione: "territorio",
      titolo: `${t.nome} (${t.gruppo})`,
      testo: [
        t.sommario,
        ...(t.racconto ?? []),
        ...t.riconoscimenti.map((r) => `${r.sigla}: ${r.descrizione}`),
        prodottiCertificati.length
          ? `Prodotti certificati (DOP, IGP, PAT) del ${t.nome} e dei comuni del parco: ${prodottiCertificati.join("; ")}.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
      url: `/territorio/${t.slug}`,
    });
  }

  // Le dieci filiere, con il testo editoriale completo della vetrina.
  for (const f of FILIERE_EDITORIALI) {
    documenti.push({
      chiave: `filiera:${f.nome}`,
      sezione: "filiera",
      titolo: f.nome,
      testo: [
        f.testo,
        ...f.paragrafi,
        `Territorio: ${f.territorio}.`,
        `Lavorazione: ${f.lavorazione.join(", ")}.`,
        `Stagionalità: ${f.stagionalita}.`,
        `Prodotti: ${f.prodotti.join(", ")}.`,
        f.riconoscimenti.length ? `Riconoscimenti: ${f.riconoscimenti.join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      url: `/filiere/${slugFiliera(f)}`,
    });
  }

  // Indice delle filiere: spiega che cosa raccoglie la sezione del sito.
  documenti.push({
    chiave: "filiera:indice",
    sezione: "filiera",
    titolo: "Le dieci filiere agroalimentari della Regione Calabria",
    testo: `Le filiere agroalimentari della Regione Calabria sono dieci: Radici Calabria le valorizza raccogliendo i prodotti tipici calabresi in dieci filiere agroalimentari: ${FILIERE_EDITORIALI.map(
      (f) => `${f.nome} (${f.territorio})`
    ).join("; ")}. Ogni filiera riunisce i prodotti del catalogo che appartengono allo stesso ciclo produttivo e ne racconta territorio, lavorazione e stagionalità.`,
    url: "/filiere",
  });

  FAQ_PINO.forEach((f, i) => {
    documenti.push({
      chiave: `faq:${i}`,
      sezione: "faq",
      titolo: f.domanda,
      testo: f.risposta,
      url: "/faq",
    });
  });

  for (const a of ATTRAZIONI_LUOGHI) {
    documenti.push({
      chiave: `attrazione:${a.nome}`,
      sezione: "attrazione",
      titolo: a.nome,
      testo: [a.tipo, a.descrizione].filter(Boolean).join(" "),
      url: "/attrazioni",
    });
  }

  for (const v of VOCI_STAGIONALI) {
    const mesi = v.mesi.map((m) => NOMI_MESI[m - 1]).join(", ");
    const categoria = CATEGORIE.find((c) => c.id === v.categoria)?.titolo ?? "";
    documenti.push({
      chiave: `stagionalita:${v.id}`,
      sezione: "stagionalita",
      titolo: v.nome,
      testo: [
        categoria,
        v.sintesi,
        `Mesi: ${mesi}.`,
        v.zone ? `Zone: ${v.zone}.` : "",
        v.nota ?? "",
      ]
        .filter(Boolean)
        .join(" "),
      url: "/stagionalita",
    });
  }

  indiceStatico = documenti;
  return documenti;
}

/** Pagine informative del sito: risposte fisse su funzionamento e regole. */
const PAGINE_INFORMATIVE: DocumentoConoscenza[] = [
  {
    chiave: "pagina:come-funziona",
    sezione: "pagina",
    titolo: "Come funziona Radici Calabria",
    testo:
      "Radici Calabria è la piattaforma locale della città: raccoglie le attività commerciali del territorio con negozi, prodotti e prezzi, offerte e promozioni, eventi, notizie e contenuti editoriali. Puoi cercare attività, confrontare prodotti, vedere orari e contatti e contattare i negozi. I prodotti e i servizi sono proposti dai singoli Venditori: il rapporto commerciale è tra Acquirente e Venditore, mentre la piattaforma mette a disposizione l'infrastruttura tecnologica. La ricerca si usa dalla homepage oppure navigando nelle sezioni Negozi, Offerte, Categorie, Territorio e Filiere.",
    url: "/faq",
  },
  {
    chiave: "pagina:territorio",
    sezione: "pagina",
    titolo: "La sezione Territorio",
    testo:
      "La sezione Territorio raccoglie i parchi, le aree territoriali e i comuni della Calabria, con il racconto del paesaggio, i riconoscimenti DOP, IGP e PAT dei prodotti e i collegamenti alle schede dei singoli luoghi.",
    url: "/territorio",
  },
  {
    chiave: "pagina:filiere",
    sezione: "pagina",
    titolo: "La sezione Filiere",
    testo:
      "La sezione Filiere mette in relazione i prodotti dei negozi con le dieci filiere agroalimentari calabresi, così ogni prodotto del catalogo è ricondotto al ciclo produttivo di appartenenza: olivicolo, agrumicolo, vitivinicolo, cerealicolo, zootecnico, carni e salumi, ortofrutticolo, liquirizia, fichi e dolciaria, ittico.",
    url: "/filiere",
  },
];

function documentiConoscenzaTutti(): DocumentoConoscenza[] {
  return [...documentiStatici(), ...PAGINE_INFORMATIVE];
}

function cercaNeiDocumenti(
  documenti: DocumentoConoscenza[],
  query: string,
  limit: number
): RisultatoConoscenza[] {
  const termini = tokenConoscenza(query);
  if (termini.length === 0) return [];

  const classificati = documenti
    .map((doc) => ({ doc, punteggio: punteggiaDocumento(doc, termini) }))
    .filter((voce) => voce.punteggio > 0);

  // Soglia relativa al risultato migliore: «Cos'è la Sila?» non deve tirare
  // dentro ogni testo che nomina la Sila di passaggio. Per le domande su un
  // solo argomento resta il documento (o i documenti) davvero pertinenti.
  const migliore = classificati.reduce((max, voce) => Math.max(max, voce.punteggio), 0);
  const soglia = Math.max(3, Math.ceil(migliore * 0.6));

  classificati.sort((a, b) => {
    // La voce di panoramica apre la risposta: «Parlami di filiera» deve partire
    // dall'insieme, non dalla prima scheda in ordine alfabetico.
    const indiceA = a.doc.chiave.endsWith(":indice") ? 0 : 1;
    const indiceB = b.doc.chiave.endsWith(":indice") ? 0 : 1;
    if (indiceA !== indiceB) return indiceA - indiceB;
    return b.punteggio - a.punteggio;
  });

  return classificati
    .filter((voce) => voce.punteggio >= soglia)
    .slice(0, Math.min(Math.max(limit, 1), 12))
    .map(({ doc }) => ({
      chiave: doc.chiave,
      sezione: doc.sezione,
      titolo: doc.titolo,
      estratto: estrattoRicco(doc, termini),
      url: doc.url,
    }));
}

/**
 * Ricerca sul solo corpus editoriale locale: stessa tokenizzazione, soglia
 * relativa e priorità dell'indice di `cercaConoscenzaSito`, ma senza archivio
 * `pino_conoscenza` e senza contenuti dinamici. È il confine deterministico
 * con cui i test verificano il ranking dei testi del sito, indipendente dal
 * database di produzione.
 */
export function cercaConoscenzaLocale(query: string, limit = 6): RisultatoConoscenza[] {
  const q = query.replace(/\s+/g, " ").trim();
  if (!q) return [];
  return cercaNeiDocumenti(documentiConoscenzaTutti(), q, limit);
}

/** Converte un URL assoluto in percorso relativo, per link interni coerenti. */
function percorsoRelativo(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, "") || "/";
}

/**
 * Letture live da Supabase (contenuti e notizie) con cache breve: un cambio
 * fatto nel database entra in Pino entro 60 secondi, senza redeploy. Le
 * chiavi includono query e limite, così ogni domanda ha il suo risultato.
 */
const CACHE_LIVE_SECONDI = 60;

/**
 * La cache di Next è caricata solo quando serve: fuori da Next (test Node puri)
 * le letture restano dirette, senza cache, e funzionano lo stesso.
 */
async function conCacheLive<T>(chiave: string[], leggi: () => Promise<T>): Promise<T> {
  try {
    const { unstable_cache } = await import("next/cache");
    return await unstable_cache(leggi, chiave, { revalidate: CACHE_LIVE_SECONDI })();
  } catch (errore) {
    if (errore instanceof Error && /next\/cache/.test(errore.message)) return leggi();
    throw errore;
  }
}

const contenutiLiveCache = (query: string, limit: number) =>
  conCacheLive(["pino-conoscenza-contenuti", query, String(limit)], () =>
    cercaContenutiPubblici(query, limit)
  );

const notizieLiveCache = (limit: number) =>
  conCacheLive(["pino-conoscenza-notizie", String(limit)], () => getNotiziePubbliche(limit));

async function contenutiDinamici(query: string, limit: number): Promise<RisultatoConoscenza[]> {
  const risultati: RisultatoConoscenza[] = [];
  try {
    const contenuti = await contenutiLiveCache(query, Math.min(limit, 4));
    for (const c of contenuti) {
      risultati.push({
        chiave: `contenuto:${c.slug}`,
        sezione: "contenuto",
        titolo: c.titolo,
        estratto: (c.riassunto?.trim() || c.corpo)
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 1400),
        url: `/contenuti/${c.slug}`,
      });
    }
  } catch {
    // Nessun database: restano i testi compilati nel repository.
  }
  try {
    const notizie = await notizieLiveCache(60);
    const termini = tokenConoscenza(query);
    for (const n of notizie) {
      const testo = `${n.title} ${n.excerpt ?? ""} ${n.category}`;
      const doc: DocumentoConoscenza = {
        chiave: `notizia:${n.id}`,
        sezione: "pagina",
        titolo: n.title,
        testo: n.excerpt ?? n.title,
        url: "/notizie",
      };
      if (punteggiaDocumento(doc, termini) > 0) {
        risultati.push({
          chiave: doc.chiave,
          sezione: "pagina",
          titolo: doc.titolo,
          estratto: doc.testo,
          url: doc.url,
        });
      }
      if (risultati.length >= limit) break;
    }
  } catch {
    // Come sopra: nessuna notizia disponibile non è un errore della risposta.
  }
  return risultati;
}

/**
 * Ricerca unificata dei contenuti testuali del sito, per le domande
 * informative di Pino: territorio, filiere, FAQ, attrazioni, stagionalità,
 * pagine informative, contenuti pubblicati e archivio `pino_conoscenza`.
 *
 * Non lancia mai: le fonti non raggiungibili vengono semplicemente saltate.
 * Restituisce estratti completi con il percorso della pagina di riferimento.
 */
export async function cercaConoscenzaSito(
  query: string,
  limit = 6
): Promise<RisultatoConoscenza[]> {
  const q = query.replace(/\s+/g, " ").trim();
  if (!q) return [];

  const locali = cercaConoscenzaLocale(q, limit);
  const [dinamici, archivio] = await Promise.all([
    contenutiDinamici(q, limit),
    cercaConoscenza(q, limit).catch(() => [] as RisultatoConoscenza[]),
  ]);

  const visti = new Set<string>();
  const uniti: RisultatoConoscenza[] = [];
  for (const voce of [
    ...locali,
    ...dinamici,
    ...archivio.map((r) => ({ ...r, url: percorsoRelativo(r.url) })),
  ]) {
    // Un documento locale completo vince sul blocco troncato dell'archivio.
    const chiaveDedup = `${voce.sezione}:${voce.url}:${voce.titolo}`;
    if (visti.has(chiaveDedup)) continue;
    visti.add(chiaveDedup);
    uniti.push(voce);
  }
  return uniti.slice(0, Math.min(Math.max(limit, 1), 12));
}

/** Espone il corpus locale per i test e per il conteggio delle fonti. */
export function fontiConoscenzaLocale(): { chiave: string; sezione: SezioneConoscenza; titolo: string; url: string }[] {
  return documentiConoscenzaTutti().map(({ chiave, sezione, titolo, url }) => ({
    chiave,
    sezione,
    titolo,
    url,
  }));
}
