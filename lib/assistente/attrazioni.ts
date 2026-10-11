/**
 * Catalogo testuale per Pino: luoghi, borghi ed eventi della guida /attrazioni.
 * Tenuto separato dalla UI così il recupero è deterministico e non dipende da Gemini.
 */
export type AttrazionePino = {
  nome: string;
  tipo: string;
  descrizione: string;
  queryMaps: string;
  url?: string;
  alias: string[];
};

const CATALOGO: AttrazionePino[] = [
  { nome: "Castello Aragonese", tipo: "Storia e monumenti", descrizione: "Riferimento storico di Castrovillari, da inserire in una passeggiata nel centro antico.", queryMaps: "Castello Aragonese Castrovillari", alias: ["castello", "castello aragonese", "monumento"] },
  { nome: "La Civita e il centro storico", tipo: "Passeggiate e centro storico", descrizione: "Nucleo antico di Castrovillari, con vicoli, passaggi, facciate e scorci per una passeggiata a piedi.", queryMaps: "La Civita centro storico quartiere antico Castrovillari Calabria", alias: ["civita", "centro storico", "quartiere antico", "vicoli", "centro antico"] },
  { nome: "Protoconvento Francescano – SiMuCCà", tipo: "Musei e cultura", descrizione: "Complesso culturale locale legato a mostre, collezioni e iniziative pubbliche.", queryMaps: "Protoconvento Francescano Castrovillari", alias: ["protoconvento", "simucca", "museo", "mostra", "musei"] },
  { nome: "Museo Archeologico", tipo: "Musei e cultura", descrizione: "Museo per conoscere le tracce delle comunità che hanno abitato il territorio nel passato.", queryMaps: "Museo Archeologico Castrovillari", alias: ["archeologia", "museo archeologico"] },
  { nome: "Teatro Sybaris", tipo: "Spettacoli", descrizione: "Teatro cittadino con programmazione di spettacoli, incontri e rassegne.", queryMaps: "Teatro Sybaris Castrovillari", alias: ["teatro", "spettacoli", "sybaris"] },
  { nome: "Biblioteca Civica Umberto Caldora", tipo: "Libri e archivi", descrizione: "Biblioteca civica legata a Palazzo Cappelli, interessante per libri e storia locale.", queryMaps: "Biblioteca Civica Umberto Caldora Castrovillari", alias: ["biblioteca", "libri", "umberto caldora", "palazzo cappelli"] },
  { nome: "Chiesa di San Giuseppe", tipo: "Chiese e arte", descrizione: "Chiesa inseribile in un itinerario a piedi tra le strade storiche di Castrovillari.", queryMaps: "Chiesa San Giuseppe Castrovillari", alias: ["chiesa", "san giuseppe"] },
  { nome: "Santa Maria delle Grazie", tipo: "Chiese e arte", descrizione: "Luogo di culto lungo l'area di Corso Garibaldi e le architetture del centro.", queryMaps: "Santa Maria delle Grazie Castrovillari", alias: ["chiesa", "corso garibaldi", "santa maria"] },
  { nome: "Palazzo Gallo", tipo: "Architettura", descrizione: "Edificio civile storico da osservare durante una passeggiata nel centro.", queryMaps: "Palazzo Gallo Castrovillari", alias: ["palazzo", "architettura"] },
  { nome: "Palazzo Cappelli", tipo: "Architettura e cultura", descrizione: "Palazzo storico collegato alla Biblioteca Civica Umberto Caldora.", queryMaps: "Palazzo Cappelli Castrovillari", alias: ["palazzo", "biblioteca"] },
  { nome: "Palazzo Varcasia", tipo: "Architettura", descrizione: "Palazzo storico di Castrovillari, lungo Corso Garibaldi; è una tappa da osservare dall'esterno durante un itinerario tra le architetture civili.", queryMaps: "Palazzo Varcasia, Corso Garibaldi, Castrovillari", url: "https://castrovillaricittafestival.it/contenuti/3479523/palazzo-varcasia", alias: ["varcasia", "palazzo varcasia", "corso garibaldi", "sede pd", "partito democratico"] },
  { nome: "Archivio di Stato – Sezione di Castrovillari", tipo: "Storia e archivi", descrizione: "Archivio per ricerche storiche e documentarie sul territorio.", queryMaps: "Archivio di Stato Sezione Castrovillari", alias: ["archivio", "archivio di stato", "genealogia", "documenti storici"] },
  { nome: "Morano Calabro", tipo: "Borgo storico nei dintorni", descrizione: "Borgo storico con stradine in salita, scorci panoramici e profilo dominato dal castello.", queryMaps: "Morano Calabro centro storico", alias: ["morano", "borgo", "borghi", "dintorni", "paesi vicini"] },
  { nome: "Civita", tipo: "Borgo e cultura arbëreshë", descrizione: "Borgo con identità arbëreshë, architettura e tradizioni proprie; nei dintorni si trova il paesaggio delle Gole del Raganello.", queryMaps: "Civita Calabria borgo", alias: ["civita", "arbëreshë", "arbëresh", "gole del raganello", "raganello"] },
  { nome: "Frascineto ed Eianina", tipo: "Cultura arbëreshë", descrizione: "Località per conoscere lingua, usanze, feste e patrimonio religioso arbëreshë del Pollino.", queryMaps: "Frascineto Eianina Calabria", alias: ["frascineto", "eianina", "arbëreshë", "tradizioni"] },
  { nome: "San Basile", tipo: "Tradizioni e cultura arbëreshë", descrizione: "Comune del territorio con tradizioni comunitarie arbëreshë e paesaggio collinare.", queryMaps: "San Basile Calabria", alias: ["san basile", "arbëreshë", "tradizioni"] },
  { nome: "Mormanno", tipo: "Borgo e natura", descrizione: "Borgo utile come base per esplorare il versante del Pollino e i paesaggi montani.", queryMaps: "Mormanno Calabria", alias: ["mormanno", "natura", "montagna"] },
  { nome: "Altomonte", tipo: "Arte e storia", descrizione: "Centro storico con vicoli, piazze e testimonianze artistiche.", queryMaps: "Altomonte centro storico", alias: ["altomonte", "arte", "storia"] },
  { nome: "Saracena", tipo: "Sapori e tradizioni", descrizione: "Località legata ai sapori del Pollino e alle produzioni gastronomiche locali.", queryMaps: "Saracena Calabria", alias: ["saracena", "enogastronomia", "sapori", "vino"] },
  { nome: "Parco Nazionale del Pollino", tipo: "Natura e attività all'aperto", descrizione: "Area protetta per escursioni, panorami, boschi e attività all'aperto; verificare sempre condizioni e regole dei percorsi.", queryMaps: "Parco Nazionale del Pollino", alias: ["pollino", "parco", "escursioni", "trekking", "natura", "montagna"] },
  { nome: "Carnevale di Castrovillari", tipo: "Evento e tradizione", descrizione: "Manifestazione cittadina con maschere, carri e gruppi folkloristici.", queryMaps: "Carnevale di Castrovillari", url: "https://www.carnevalecastrovillari.it/", alias: ["carnevale", "maschere", "folklore"] },
  { nome: "Primavera dei Teatri", tipo: "Festival teatrale", descrizione: "Festival dedicato alla scena contemporanea e alle compagnie teatrali.", queryMaps: "Primavera dei Teatri Castrovillari", url: "https://www.primaveradeiteatri.it/", alias: ["teatro", "festival", "primavera"] },
  { nome: "Estate Internazionale del Folklore", tipo: "Festival e musica", descrizione: "Rassegna di danza, musica e costumi tradizionali internazionali.", queryMaps: "Estate Internazionale del Folklore Castrovillari", url: "https://castrovillaricittafestival.it/eventi/2173811/estate-internazionale-folklore", alias: ["folklore", "danza", "musica", "festival"] },
  { nome: "Festival della Cipolla Bianca", tipo: "Enogastronomia", descrizione: "Festa dedicata alla Cipolla Bianca di Castrovillari e alle specialità del territorio.", queryMaps: "Festival Cipolla Bianca Castrovillari", url: "https://castrovillaricittafestival.it/contenuti/3529995/festival-cipolla-bianca-castrovillari", alias: ["cipolla bianca", "cibo", "sagra", "festival gastronomico"] },
];

function normalizza(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function searchAttractions(query: string, limit = 6): AttrazionePino[] {
  const q = normalizza(query);
  const tokens = q.split(/\s+/).filter((t) => t.length >= 3 && !["dove", "cosa", "quali", "quale", "visitare", "vedere", "consigli", "consigliami", "vorrei", "posso", "fare", "ci", "sono", "nel", "nella", "della", "delle", "degli", "per", "una", "uno", "che", "come", "raggiungere", "arrivare", "andare"].includes(t));
  const broad = /\b(cosa vedere|luoghi da vedere|attrazioni|monumenti|visitare|dintorni|borghi|turismo|turistico|tour|itinerario)\b/.test(q);
  const ranked = CATALOGO.map((item) => {
    const fields = normalizza([item.nome, item.tipo, item.descrizione, ...item.alias].join(" "));
    let score = 0;
    if (q && fields.includes(q)) score += 8;
    for (const token of tokens) if (fields.split(" ").includes(token)) score += 3;
    for (const alias of item.alias) if (q.includes(normalizza(alias))) score += 6;
    if (broad && /dintorni|borgo|natura|passeggiate|storia|monumenti|cultura|architettura|evento|festival/.test(normalizza(item.tipo))) score += 2;
    return { item, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  const results = ranked.slice(0, Math.max(1, Math.min(limit, 10))).map((x) => x.item);
  return results;
}
