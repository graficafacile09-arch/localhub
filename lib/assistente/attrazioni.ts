import { ATTRAZIONI_LUOGHI, ATTRAZIONI_EVENTI, ATTRAZIONI_DINTORNI } from "@/lib/attrazioni-data";

export type AttrazionePino = {
  nome: string;
  tipo: string;
  descrizione: string;
  queryMaps: string;
  url?: string;
  alias: string[];
};

const extra: Record<string, { alias?: string[]; url?: string }> = {
  "La Civita e il centro storico": { alias: ["la civita", "centro storico", "quartiere antico", "vicoli"] },
  "Civita": { alias: ["borgo arbëreshë", "arbereshe", "gole del raganello", "raganello"] },
  "Palazzo Varcasia": { url: "https://castrovillaricittafestival.it/contenuti/3479523/palazzo-varcasia", alias: ["varcasia", "corso garibaldi", "sede pd"] },
  "Parco Nazionale del Pollino": { alias: ["pollino", "trekking", "escursioni", "sentieri"] },
};

const tokensNome = (s: string) => s.toLowerCase().split(/[^a-zà-ù0-9]+/).filter((t) => t.length >= 3);
const CATALOGO: AttrazionePino[] = [
  ...ATTRAZIONI_LUOGHI.map((v) => ({ nome: v.nome, tipo: v.tipo, descrizione: v.descrizione, queryMaps: v.query, url: extra[v.nome]?.url, alias: [...new Set([v.nome, v.tipo, ...tokensNome(v.nome), ...(extra[v.nome]?.alias ?? [])])] })),
  ...ATTRAZIONI_EVENTI.map((v) => ({ nome: v.nome, tipo: "Eventi e festival", descrizione: v.descrizione + " " + v.periodo + ". Verifica le date sul sito dell'organizzatore.", queryMaps: v.nome + ", Castrovillari, Calabria", url: v.url, alias: [...new Set([v.nome, "evento", "festival", ...tokensNome(v.nome)])] })),
  ...ATTRAZIONI_DINTORNI.map((v) => ({ nome: v.nome, tipo: v.tipo, descrizione: v.descrizione, queryMaps: v.nome + ", Calabria", alias: [...new Set([v.nome, v.tipo, ...tokensNome(v.nome), ...(extra[v.nome]?.alias ?? [])])] })),
  { nome: "Sapori locali e prodotti tipici", tipo: "Gusto e territorio", descrizione: "La guida di InCittà invita a scoprire le tradizioni gastronomiche di Castrovillari e del Pollino, compresa la Cipolla Bianca. La vetrina Eccellenze Calabresi mostra i prodotti effettivamente pubblicati dai negozi.", queryMaps: "Prodotti tipici Castrovillari Calabria", alias: ["sapori locali", "prodotti tipici", "eccellenze calabresi", "cipolla bianca"] },
];

function normalizza(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function searchAttractions(query: string, limit = 6): AttrazionePino[] {
  const q = normalizza(query);
  if (!q) return [];
  const stop = new Set(["dove","cosa","quali","quale","visitare","vedere","consigli","consigliami","vorrei","posso","fare","sono","ci","nel","nella","della","delle","degli","per","una","uno","che","come","raggiungere","arrivare","andare","castrovillari"]);
  const tokens = q.split(/\s+/).filter((t) => t.length >= 3 && !stop.has(t));
  const broad = /\b(cosa vedere|luoghi da vedere|attrazioni|monumenti|visitare|dintorni|borghi|turismo|tour|itinerario)\b/.test(q);
  const ranked = CATALOGO.map((item) => {
    const fields = normalizza([item.nome,item.tipo,item.descrizione,...item.alias].join(" "));
    const words = new Set(fields.split(" "));
    let score = fields.includes(q) ? 10 : 0;
    for (const token of tokens) if (words.has(token)) score += 3;
    for (const alias of item.alias) if (normalizza(alias).length >= 4 && q.includes(normalizza(alias))) score += 7;
    if (broad && /dintorni|borgo|natura|passeggiate|storia|monumenti|cultura|architettura|evento|festival/i.test(item.tipo)) score += 2;
    return { item, score };
  }).filter((x) => x.score > 0).sort((a,b) => b.score-a.score);
  return ranked.slice(0, Math.max(1, Math.min(limit, 10))).map((x) => x.item);
}
