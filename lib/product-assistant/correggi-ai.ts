import type { ProductCondition, ProductVisionSuggestion } from "./types";

// ─── Funzioni PURE per la funzione "Correggi con AI" ─────────────────────────
// Il draft del prodotto viene modificato SOLO in memoria (mai nel database):
// il salvataggio avviene esclusivamente tramite la normale pubblicazione.

export type CorrezioneCampo = {
  /** Etichetta italiana mostrata all'utente (es. "Colore"). */
  campo: string;
  /** Chiave tecnica del campo dentro ProductVisionSuggestion. */
  chiave: string;
  /** Valore prima della correzione (testo leggibile, "—" se vuoto). */
  prima: string;
  /** Valore dopo la correzione (testo leggibile, "—" se vuoto). */
  dopo: string;
};

type CampoDescrittore = {
  chiave: keyof ProductVisionSuggestion;
  etichetta: string;
  formatta: (s: ProductVisionSuggestion) => string;
};

// Descrittori di tutti i campi modificabili (escluso confidenza: metadata).
const CAMPI: CampoDescrittore[] = [
  { chiave: "nome", etichetta: "Nome", formatta: (s) => s.nome || "—" },
  { chiave: "descrizione", etichetta: "Descrizione breve", formatta: (s) => s.descrizione || "—" },
  { chiave: "descrizioneCompleta", etichetta: "Descrizione completa", formatta: (s) => s.descrizioneCompleta || "—" },
  { chiave: "categoria", etichetta: "Categoria", formatta: (s) => s.categoria || "—" },
  { chiave: "sottocategoria", etichetta: "Sottocategoria", formatta: (s) => s.sottocategoria || "—" },
  { chiave: "marca", etichetta: "Marca", formatta: (s) => s.marca || "—" },
  { chiave: "colore", etichetta: "Colore", formatta: (s) => s.colore || "—" },
  { chiave: "materiale", etichetta: "Materiale", formatta: (s) => s.materiale || "—" },
  { chiave: "paroleChiave", etichetta: "Parole chiave", formatta: (s) => s.paroleChiave.length ? s.paroleChiave.join(", ") : "—" },
  { chiave: "prezzoSuggerito", etichetta: "Prezzo", formatta: (s) => s.prezzoSuggerito != null ? `€${s.prezzoSuggerito.toFixed(2)}` : "—" },
  { chiave: "statoCondizione", etichetta: "Condizione", formatta: (s) => s.statoCondizione || "—" },
  { chiave: "quantitaSuggerita", etichetta: "Quantità", formatta: (s) => String(s.quantitaSuggerita) },
  { chiave: "caratteristiche", etichetta: "Caratteristiche", formatta: (s) => s.caratteristiche.length ? s.caratteristiche.join(", ") : "—" },
  { chiave: "pesoVolume", etichetta: "Peso / Volume", formatta: (s) => s.pesoVolume || "—" },
  { chiave: "seoTitle", etichetta: "Titolo SEO", formatta: (s) => s.seoTitle || "—" },
  { chiave: "seoDescription", etichetta: "Meta description", formatta: (s) => s.seoDescription || "—" },
  { chiave: "altTextImmagine", etichetta: "Alt text immagine", formatta: (s) => s.altTextImmagine || "—" },
  { chiave: "filtriCatalogo", etichetta: "Filtri catalogo", formatta: (s) => {
    if (!s.filtriCatalogo) return "—";
    const entries = Object.entries(s.filtriCatalogo);
    return entries.length ? entries.map(([k, v]) => `${k}: ${v}`).join(", ") : "—";
  } },
  { chiave: "formato", etichetta: "Formato", formatta: (s) => s.formato || "—" },
  { chiave: "tipoConfezione", etichetta: "Tipo confezione", formatta: (s) => s.tipoConfezione || "—" },
  { chiave: "codiceEan", etichetta: "Codice EAN", formatta: (s) => s.codiceEan || "—" },
  { chiave: "produttore", etichetta: "Produttore", formatta: (s) => s.produttore || "—" },
  { chiave: "ingredienti", etichetta: "Ingredienti", formatta: (s) => s.ingredienti.length ? s.ingredienti.join(", ") : "—" },
  { chiave: "allergeni", etichetta: "Allergeni", formatta: (s) => s.allergeni.length ? s.allergeni.join(", ") : "—" },
];

// ─── Normalizzazione dei singoli valori (robusta a JSON imperfetti) ──────────

function normalizzaStringa(v: unknown): string | null | undefined {
  if (typeof v === "string") {
    const pulita = v.trim();
    return pulita.length > 0 ? pulita : null;
  }
  return undefined; // campo non fornito → mantieni originale
}

function normalizzaStringhe(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    return v
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof v === "string") {
    const pulita = v.trim();
    if (!pulita) return [];
    return pulita
      .split(/[,;]\s*/)
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return undefined;
}

function normalizzaNumero(v: unknown): number | null | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[^0-9.,-]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function normalizzaCondizione(v: unknown): ProductCondition | undefined {
  if (v === "nuovo" || v === "usato" || v === "ricondizionato") return v;
  return undefined;
}

function normalizzaFiltri(v: unknown): Record<string, string> | null | undefined {
  if (v === null) return null;
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    const record: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string" && val.trim()) record[k] = val.trim();
    }
    return Object.keys(record).length > 0 ? record : null;
  }
  return undefined;
}

// ─── Merge: originale + risposta AI (mantiene ogni campo non toccato) ────────

/**
 * Applica la suggestion restituita dall'AI sul draft originale.
 * Regola fondamentale: un campo viene aggiornato SOLO se l'AI fornisce un
 * valore valido per quel campo; altrimenti viene conservato il valore
 * originale. In questo modo una risposta incompleta non perde mai dati.
 */
export function mergeSuggestion(
  originale: ProductVisionSuggestion,
  aggiornata: Partial<ProductVisionSuggestion> | null | undefined
): ProductVisionSuggestion {
  if (!aggiornata || typeof aggiornata !== "object") return { ...originale };

  const payload = aggiornata as Record<string, unknown>;

  const s = (chiave: keyof ProductVisionSuggestion): string | null => {
    const v = normalizzaStringa(payload[chiave]);
    if (v === undefined) return originale[chiave] as string | null;
    return v;
  };
  const arr = (chiave: keyof ProductVisionSuggestion): string[] => {
    const v = normalizzaStringhe(payload[chiave]);
    if (v === undefined) return (originale[chiave] as string[]) ?? [];
    return v;
  };
  const num = (chiave: keyof ProductVisionSuggestion): number | null => {
    const v = normalizzaNumero(payload[chiave]);
    if (v === undefined) return (originale[chiave] as number | null) ?? null;
    return v;
  };

  const condizione = normalizzaCondizione(payload.statoCondizione ?? payload.stato_condizione);
  const quantita = normalizzaNumero(payload.quantitaSuggerita ?? payload.quantita_suggerita);
  const prezzo = normalizzaNumero(payload.prezzoSuggerito ?? payload.prezzo_suggerito);
  const filtri = normalizzaFiltri(payload.filtriCatalogo ?? payload.filtri_catalogo);

  return {
    nome: s("nome") ?? "",
    descrizione: s("descrizione") ?? "",
    categoria: s("categoria") ?? "",
    sottocategoria: s("sottocategoria"),
    marca: s("marca"),
    colore: s("colore"),
    materiale: s("materiale"),
    paroleChiave: arr("paroleChiave"),
    prezzoSuggerito: prezzo !== undefined ? prezzo : originale.prezzoSuggerito,
    statoCondizione: condizione ?? originale.statoCondizione,
    quantitaSuggerita: quantita !== undefined && quantita !== null && quantita >= 1
      ? Math.round(quantita)
      : originale.quantitaSuggerita,
    confidenza: originale.confidenza,
    immaginePrincipale: s("immaginePrincipale"),
    descrizioneCompleta: s("descrizioneCompleta"),
    caratteristiche: arr("caratteristiche"),
    pesoVolume: s("pesoVolume"),
    seoTitle: s("seoTitle"),
    seoDescription: s("seoDescription"),
    altTextImmagine: s("altTextImmagine"),
    filtriCatalogo: filtri !== undefined ? filtri : originale.filtriCatalogo,
    formato: s("formato"),
    tipoConfezione: s("tipoConfezione"),
    codiceEan: s("codiceEan"),
    produttore: s("produttore"),
    ingredienti: arr("ingredienti"),
    allergeni: arr("allergeni"),
  };
}

// ─── Diff: elenco prima → dopo dei campi effettivamente modificati ───────────

export function diffCorrezioni(
  originale: ProductVisionSuggestion,
  aggiornata: ProductVisionSuggestion
): CorrezioneCampo[] {
  const cambi: CorrezioneCampo[] = [];

  for (const descrittore of CAMPI) {
    const prima = descrittore.formatta(originale);
    const dopo = descrittore.formatta(aggiornata);
    if (prima !== dopo) {
      cambi.push({
        campo: descrittore.etichetta,
        chiave: String(descrittore.chiave),
        prima,
        dopo,
      });
    }
  }

  return cambi;
}
