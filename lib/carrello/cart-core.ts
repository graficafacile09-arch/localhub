/**
 * Carrello client-side (FASE F2.4) — logica PURA, testabile senza React.
 *
 * Ogni riga memorizza prodottoId/varianteId/quantita + uno SNAPSHOT UI di
 * nome/prezzo/immagine/variante/negozio. Lo snapshot serve SOLO alla
 * visualizzazione: NON è mai autoritativo per prezzi o stock — il backend
 * (F2.1/F2.2) risolve negozio, prezzo e disponibilità esclusivamente dal DB.
 */

export type RigaCarrello = {
  prodottoId: string;
  varianteId: string | null;
  quantita: number;
  // ── Snapshot UI (mai autoritativo) ───────────────────────────────────────
  nome: string;
  prezzo: number;
  immagine: string | null;
  /** Nome della variante selezionata (solo UI). */
  variante: string | null;
  negozioId: string;
  negozioNome: string;
  /** Slug del prodotto (link di ritorno alla scheda). */
  slug: string;
};

export type RigaInserimento = Omit<RigaCarrello, "quantita"> & {
  quantita?: number;
};

export type GruppoNegozio = {
  negozioId: string;
  negozioNome: string;
  righe: RigaCarrello[];
  subtotale: number;
};

/** Quantità minima/massima per riga (vincolo UI, verificato anche dal backend). */
export const QUANTITA_MIN = 1;
export const QUANTITA_MAX = 99;

/** Chiave univoca di una riga: combinazione prodotto + variante. */
export function chiaveRiga(prodottoId: string, varianteId: string | null): string {
  return `${prodottoId}::${varianteId ?? "base"}`;
}

export function chiaveDiRiga(riga: Pick<RigaCarrello, "prodottoId" | "varianteId">): string {
  return chiaveRiga(riga.prodottoId, riga.varianteId);
}

function clampQuantita(q: number): number {
  if (!Number.isFinite(q)) return QUANTITA_MIN;
  return Math.min(QUANTITA_MAX, Math.max(QUANTITA_MIN, Math.round(q)));
}

function rigaCompleta(r: RigaInserimento): RigaCarrello {
  return {
    prodottoId: r.prodottoId,
    varianteId: r.varianteId ?? null,
    quantita: clampQuantita(r.quantita ?? QUANTITA_MIN),
    nome: r.nome,
    prezzo: Number.isFinite(r.prezzo) ? Math.max(0, r.prezzo) : 0,
    immagine: r.immagine ?? null,
    variante: r.variante ?? null,
    negozioId: r.negozioId,
    negozioNome: r.negozioNome,
    slug: r.slug,
  };
}

/**
 * Aggiunge un prodotto al carrello. Se la stessa combinazione
 * prodotto + variante è già presente → incrementa la quantità
 * (senza superare QUANTITA_MAX). Ritorna un NUOVO array (immutabile).
 */
export function aggiungiAlCarrello(
  carrello: RigaCarrello[],
  riga: RigaInserimento,
  maxQuantita: number = QUANTITA_MAX
): RigaCarrello[] {
  const completa = rigaCompleta(riga);
  const chiave = chiaveDiRiga(completa);
  const esistente = carrello.find((r) => chiaveDiRiga(r) === chiave);

  if (esistente) {
    return carrello.map((r) =>
      chiaveDiRiga(r) === chiave
        ? { ...r, quantita: Math.min(maxQuantita, r.quantita + completa.quantita) }
        : r
    );
  }
  return [...carrello, { ...completa, quantita: Math.min(maxQuantita, completa.quantita) }];
}

/** Modifica la quantità di una riga (clampata tra MIN e MAX). */
export function aggiornaQuantita(
  carrello: RigaCarrello[],
  chiave: string,
  quantita: number
): RigaCarrello[] {
  if (quantita < QUANTITA_MIN) return rimuoviDalCarrello(carrello, chiave);
  return carrello.map((r) =>
    chiaveDiRiga(r) === chiave ? { ...r, quantita: clampQuantita(quantita) } : r
  );
}

export function rimuoviDalCarrello(carrello: RigaCarrello[], chiave: string): RigaCarrello[] {
  return carrello.filter((r) => chiaveDiRiga(r) !== chiave);
}

export function svuotaCarrello(): RigaCarrello[] {
  return [];
}

/** Numero totale di pezzi nel carrello (somma quantità) — per il badge. */
export function contaPezzi(carrello: RigaCarrello[]): number {
  return carrello.reduce((somma, r) => somma + r.quantita, 0);
}

export function subtotaleRighe(righe: RigaCarrello[]): number {
  return Math.round(
    righe.reduce((somma, r) => somma + r.prezzo * r.quantita, 0) * 100
  ) / 100;
}

/** Raggruppa le righe per negozio, nell'ordine di primo inserimento. */
export function raggruppaPerNegozio(carrello: RigaCarrello[]): GruppoNegozio[] {
  const gruppi: GruppoNegozio[] = [];
  for (const riga of carrello) {
    let gruppo = gruppi.find((g) => g.negozioId === riga.negozioId);
    if (!gruppo) {
      gruppo = {
        negozioId: riga.negozioId,
        negozioNome: riga.negozioNome,
        righe: [],
        subtotale: 0,
      };
      gruppi.push(gruppo);
    }
    gruppo.righe.push(riga);
    gruppo.subtotale = subtotaleRighe(gruppo.righe);
  }
  return gruppi;
}

export function totaleCarrello(carrello: RigaCarrello[]): number {
  return subtotaleRighe(carrello);
}

// ─── Persistenza localStorage (versione + validazione) ──────────────────────

export const STORAGE_KEY = "localhub.carrello.v1";
export const STORAGE_VERSIONE = 1;

export type CarrelloPersistito = {
  versione: number;
  righe: RigaCarrello[];
};

function validaRiga(raw: unknown): RigaCarrello | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.prodottoId !== "string" || !r.prodottoId) return null;
  if (typeof r.negozioId !== "string" || !r.negozioId) return null;
  if (typeof r.nome !== "string") return null;
  const prezzo = Number(r.prezzo);
  if (!Number.isFinite(prezzo) || prezzo < 0) return null;
  const quantita = Number(r.quantita);
  if (!Number.isFinite(quantita) || quantita < 1) return null;
  return {
    prodottoId: r.prodottoId,
    varianteId: typeof r.varianteId === "string" && r.varianteId ? r.varianteId : null,
    quantita: clampQuantita(quantita),
    nome: r.nome,
    prezzo: Math.round(prezzo * 100) / 100,
    immagine: typeof r.immagine === "string" && r.immagine ? r.immagine : null,
    variante: typeof r.variante === "string" && r.variante ? r.variante : null,
    negozioId: r.negozioId,
    negozioNome: typeof r.negozioNome === "string" ? r.negozioNome : "",
    slug: typeof r.slug === "string" ? r.slug : "",
  };
}

/**
 * Deserializza il contenuto di localStorage: righe invalide scartate,
 * quantità clampate, eventuali versioni future → carrello vuoto (mai crash).
 */
export function deserializzaCarrello(raw: string | null): RigaCarrello[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<CarrelloPersistito>;
    if (parsed.versione !== STORAGE_VERSIONE) return [];
    if (!Array.isArray(parsed.righe)) return [];
    const righe: RigaCarrello[] = [];
    for (const r of parsed.righe) {
      const valida = validaRiga(r);
      if (valida) righe.push(valida);
    }
    return righe;
  } catch {
    return [];
  }
}

export function serializzaCarrello(carrello: RigaCarrello[]): string {
  const persistito: CarrelloPersistito = { versione: STORAGE_VERSIONE, righe: carrello };
  return JSON.stringify(persistito);
}

// ─── Accesso storage iniettabile (testabile) ────────────────────────────────

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export function leggiCarrello(storage: StorageLike | null, key: string = STORAGE_KEY): RigaCarrello[] {
  if (!storage) return [];
  try {
    return deserializzaCarrello(storage.getItem(key));
  } catch {
    return [];
  }
}

export function scriviCarrello(
  storage: StorageLike | null,
  carrello: RigaCarrello[],
  key: string = STORAGE_KEY
): void {
  if (!storage) return;
  try {
    if (carrello.length === 0) storage.removeItem(key);
    else storage.setItem(key, serializzaCarrello(carrello));
  } catch {
    // storage pieno/indisponibile → ignora, il carrello resta in memoria
  }
}
