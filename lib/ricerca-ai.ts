import { createClient } from "@supabase/supabase-js";
import { cercaNegoziDemo, espandiQueryConSinonimi } from "./negozi-demo";
import { calcolaPunteggioNegozio, filtraNegoziPerPertinenza } from "./ranking-negozi";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type NegozioRicerca = {
  id: string;
  nome: string;
  descrizione?: string | null;
  categoria?: string | null;
  indirizzo?: string | null;
  telefono?: string | null;
  immagine?: string | null;
};

export type ProdottoRicerca = {
  id: string;
  negozio_id: string;
  nome: string;
  descrizione: string | null;
  categoria: string | null;
  prezzo: number;
  negozio_nome: string;
  immagine_principale: string | null;
};

export type RisultatoRicercaAi = {
  risposta: string;
  negozi: NegozioRicerca[];
  prodotti: ProdottoRicerca[];
};

function pulisciRispostaAi(risposta: string): string {
  const sezioniVietate = [
    "considerazioni",
    "considerazione",
    "conclusione",
    "conclusioni",
    "nota finale",
    "note finali",
    "nota",
    "note",
    "premessa",
    "ragionamento",
    "ragionamenti",
    "processo",
    "spiegazione del processo",
  ];

  let saltaSezione = false;

  const righePulite = risposta
    .split("\n")
    .filter((riga) => {
      const testo = riga
        .toLowerCase()
        .replace(/[*#:_-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!testo) {
        saltaSezione = false;
        return true;
      }

      const contieneSezioneVietata = sezioniVietate.some(
        (sezione) =>
          testo === sezione ||
          testo.startsWith(`${sezione} `) ||
          testo.startsWith(`${sezione}:`)
      );

      if (contieneSezioneVietata) {
        saltaSezione = true;
        return false;
      }

      if (saltaSezione) {
        return false;
      }

      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return armonizzaMarkdownRispostaAi(righePulite);
}

function armonizzaMarkdownRispostaAi(risposta: string): string {
  let testo = risposta.replace(/\r/g, "").trim();

  testo = testo.replace(
    /^(Categoria|Indirizzo|Telefono|WhatsApp|Email|Sito Web|Sito web)\s*:/gim,
    "  - $1:"
  );

  testo = testo.replace(
    /^[-*]\s*(Categoria|Indirizzo|Telefono|WhatsApp|Email|Sito Web|Sito web)\s*:/gim,
    "  - $1:"
  );

  testo = testo.replace(/^##\s*attivit[aà]\s+consigliate/gim, "## Attivita consigliate");
  testo = testo.replace(/^##\s*suggerimento\s+rapido/gim, "## Suggerimento rapido");
  testo = testo.replace(/\n{3,}/g, "\n\n");

  if (!/^##\s+/m.test(testo) && /-\s+\*\*/.test(testo)) {
    testo = `## Attivita consigliate\n\n${testo}`;
  }

  return testo.trim();
}

// ─── Ricerca negozi per AI ───────────────────────────────────────────────────

async function cercaNegoziPerAi(query: string): Promise<NegozioRicerca[]> {
  const queryEspansa = espandiQueryConSinonimi(query);
  const terminiEspansi = Array.from(
    new Set(
      queryEspansa
        .split(/\s+/)
        .map((termine) => termine.trim())
        .filter(Boolean)
    )
  ).slice(0, 12);

  const filtriRicerca = (terminiEspansi.length > 0 ? terminiEspansi : [query.trim()])
    .flatMap((termine) => {
      const pulito = termine.replace(/[,%]/g, " ").trim();

      if (!pulito) {
        return [];
      }

      return [
        `nome.ilike.%${pulito}%`,
        `descrizione.ilike.%${pulito}%`,
        `categoria.ilike.%${pulito}%`,
        `servizi.ilike.%${pulito}%`,
        `parole_chiave.ilike.%${pulito}%`,
      ];
    })
    .join(",");

  const { data, error } = await supabase
    .from("negozi")
    .select("*")
    .or(filtriRicerca)
    .limit(10);

  const negoziDemo = cercaNegoziDemo(query);

  if (error) {
    console.error("Errore database Supabase:", error);
    return negoziDemo;
  }

  const unici = new Map<string, NegozioRicerca>();

  [...negoziDemo, ...(data ?? [])].forEach((negozio) => {
    if (!unici.has(negozio.id)) {
      unici.set(negozio.id, negozio);
    }
  });

  return filtraNegoziPerPertinenza(
    Array.from(unici.values()).filter(
      (negozio) => calcolaPunteggioNegozio(negozio, queryEspansa) > 0
    ),
    queryEspansa
  ).slice(0, 10);
}

// ─── Ricerca prodotti per AI ─────────────────────────────────────────────────

async function cercaProdottiPerAi(query: string): Promise<ProdottoRicerca[]> {
  const termini = Array.from(
    new Set(
      espandiQueryConSinonimi(query)
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean)
    )
  ).slice(0, 10);

  if (termini.length === 0) return [];

  const filtri = termini
    .flatMap((t) => {
      const p = t.replace(/[,%]/g, " ").trim();
      if (!p) return [];
      return [
        `nome.ilike.%${p}%`,
        `descrizione.ilike.%${p}%`,
        `categoria.ilike.%${p}%`,
        `marca.ilike.%${p}%`,
      ];
    })
    .join(",");

  const { data, error } = await supabase
    .from("prodotti")
    .select("id, negozio_id, nome, descrizione, categoria, prezzo, immagine_principale, negozi!inner(id, nome)")
    .eq("attivo", true)
    .or(filtri)
    .limit(10);

  if (error) return [];

  return (data ?? []).map((p: Record<string, unknown>) => ({
    id: p.id as string,
    negozio_id: p.negozio_id as string,
    nome: p.nome as string,
    descrizione: (p.descrizione as string) ?? null,
    categoria: (p.categoria as string) ?? null,
    prezzo: p.prezzo as number,
    negozio_nome: (p.negozi as { nome: string })?.nome ?? "",
    immagine_principale: (p.immagine_principale as string) ?? null,
  }));
}

// ─── Ricerca AI principale ───────────────────────────────────────────────────

export async function ricercaConAi(query: string): Promise<RisultatoRicercaAi> {
  const termine = query.trim();

  if (!termine) {
    return {
      risposta: "",
      negozi: [],
      prodotti: [],
    };
  }

  const [negozi, prodotti] = await Promise.all([
    cercaNegoziPerAi(termine),
    cercaProdottiPerAi(termine),
  ]);

  const contestoNegozi =
    negozi.length > 0
      ? negozi
          .map(
            (n) =>
              `- ${n.nome}: ${n.descrizione || "Nessuna descrizione"}. Indirizzo: ${n.indirizzo || "Non disponibile"}. Telefono: ${n.telefono || "Non disponibile"}.`
          )
          .join("\n")
      : "Nessun negozio specifico trovato nel database locale.";

  const contestoProdotti =
    prodotti.length > 0
      ? prodotti
          .map(
            (p) =>
              `- ${p.nome}: ${p.descrizione || "Nessuna descrizione"}. Prezzo: EUR ${p.prezzo}. Negozio: ${p.negozio_nome}. Categoria: ${p.categoria || "Non specificata"}.`
          )
          .join("\n")
      : "Nessun prodotto specifico trovato nel database locale.";

  const prompt = `Sei l'assistente virtuale di "InCitta", l'Amazon della citta. Il tuo compito e aiutare l'utente a trovare negozi e prodotti basandoti ESCLUSIVAMENTE sui dati del nostro database locale. NON usare internet. NON inventare attivita o prodotti inesistenti.

Query dell'utente: "${termine}"
Sinonimi e termini correlati utili: "${espandiQueryConSinonimi(termine)}"

Negozi disponibili nel database:
${contestoNegozi}

Prodotti disponibili nel database:
${contestoProdotti}

Istruzioni di risposta:
1. Se ci sono prodotti pertinenti, mostrali PRIMA con nome, prezzo e negozio di provenienza.
2. Se ci sono negozi pertinenti, mostrali DOPO i prodotti.
3. Se non ci sono risultati pertinenti, scrivi una risposta breve e utile SENZA inventare attivita o prodotti inesistenti.
4. USA IL MARKDOWN.
5. NON inserire considerazioni finali, note, conclusioni, premesse, spiegazioni del ragionamento.
6. NON parlare del tuo processo interno.
7. Struttura della risposta con prodotti:
## Prodotti trovati
- **Nome prodotto** - descrizione breve.
  - Prezzo: EUR ...
  - Negozio: ...
8. Struttura della risposta con negozi:
## Negozi consigliati
- **Nome negozio** - breve descrizione.
  - Indirizzo: ...
  - Telefono: ...
9. Puoi aggiungere una sezione finale:
## Suggerimento rapido
con una singola frase concreta.
10. Mantieni il testo breve, ordinato e focalizzato sui risultati utili per l'utente.`;

  const groqApiKey = process.env.GROQ_API_KEY;

  if (!groqApiKey) {
    throw new Error(
      "Chiave API Groq mancante. Aggiungi GROQ_API_KEY al file .env.local."
    );
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Errore Groq: ${errorText}`);
  }

  const resData = await response.json();
  const rispostaAI =
    resData.choices?.[0]?.message?.content ||
    "Non sono riuscito a generare una risposta.";

  return {
    risposta: pulisciRispostaAi(rispostaAI),
    negozi,
    prodotti,
  };
}
