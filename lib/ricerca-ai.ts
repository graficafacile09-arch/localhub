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

export type RisultatoRicercaAi = {
  risposta: string;
  negozi: NegozioRicerca[];
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

export async function ricercaConAi(query: string): Promise<RisultatoRicercaAi> {
  const termine = query.trim();

  if (!termine) {
    return {
      risposta: "",
      negozi: [],
    };
  }

  const negozi = await cercaNegoziPerAi(termine);

  const contestoNegozi =
    negozi.length > 0
      ? negozi
          .map(
            (n) =>
              `- ${n.nome}: ${n.descrizione || "Nessuna descrizione"}. Indirizzo: ${n.indirizzo || "Non disponibile"}. Telefono: ${n.telefono || "Non disponibile"}.`
          )
          .join("\n")
      : "Nessun negozio specifico trovato nel database locale.";

  const prompt = `Sei l'assistente virtuale di "Cerca in Citta". Il tuo compito e aiutare l'utente a trovare quello che cerca basandoti solo sui negozi del nostro database.

Query dell'utente: "${termine}"
Sinonimi e termini correlati utili: "${espandiQueryConSinonimi(termine)}"

Negozi disponibili nel database che corrispondono:
${contestoNegozi}

Istruzioni di risposta:
1. Se ci sono negozi pertinenti nel database, mostra solo risultati utili per l'utente con stile diretto e commerciale.
2. Se non ci sono negozi pertinenti nel database locale, scrivi una risposta breve e utile senza inventare attivita inesistenti.
3. USA IL MARKDOWN.
4. NON inserire considerazioni finali, note, conclusioni, premesse, spiegazioni del ragionamento, frasi come "in base ai dati", "ho analizzato", "ecco le mie considerazioni" o simili.
5. NON parlare del tuo processo interno.
6. NON aggiungere sezioni meta o editoriali.
7. Se trovi negozi pertinenti usa questa struttura:
## Attivita consigliate
- **Nome negozio** - breve descrizione utile.
  - Categoria: ...
  - Indirizzo: ...
  - Telefono: ...
8. Dopo l'elenco puoi aggiungere solo una sezione finale facoltativa:
## Suggerimento rapido
con una singola frase concreta per aiutare l'utente a scegliere meglio.
9. Mantieni il testo elegante, breve, ordinato e focalizzato solo sui risultati.
10. Se la query descrive un bisogno concreto o un problema (es. animale con zecche, auto da riparare, farmaci, arredare casa), proponi solo attivita coerenti con quel bisogno e NON elencare negozi fuori tema.`;

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
  };
}
