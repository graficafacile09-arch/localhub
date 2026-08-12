"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  aggiungiAlCarrello,
  aggiornaQuantita,
  chiaveDiRiga,
  chiaveRiga,
  contaPezzi,
  leggiCarrello,
  quantitaDiRiga,
  raggruppaPerNegozio,
  rimuoviDalCarrello,
  scriviCarrello,
  svuotaCarrello,
  totaleCarrello,
  type GruppoNegozio,
  type RigaCarrello,
  type RigaInserimento,
} from "./cart-core";

type StatoCarrello = {
  /** Righe ordinate per aggiunta (il raggruppamento è fatto in UI). */
  righe: RigaCarrello[];
  /** Numero di righe (combinazioni prodotto+variante) nel carrello. */
  numeroRighe: number;
  /** Totale pezzi (per il badge). */
  pezzi: number;
  /** Raggruppamento per negozio con subtotale (per la pagina carrello). */
  gruppi: GruppoNegozio[];
  /** Totale complessivo (solo prodotti, senza spedizione). */
  totale: number;
  /** Id dell'ultima riga aggiunta (per feedback visivi). */
  ultimoAggiunto: string | null;
  aggiungi: (riga: RigaInserimento) => void;
  aggiorna: (chiave: string, quantita: number) => void;
  rimuovi: (chiave: string) => void;
  svuota: () => void;
  /** Quantità della combinazione prodotto+variante (0 se assente). */
  getItemQuantity: (prodottoId: string, varianteId?: string | null) => number;
};

const CarrelloContext = createContext<StatoCarrello | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [righe, setRighe] = useState<RigaCarrello[]>([]);
  const [ultimoAggiunto, setUltimoAggiunto] = useState<string | null>(null);
  const [idratato, setIdratato] = useState(false);

  // Ripristino automatico all'avvio (solo client; SSR → stato vuoto).
  useEffect(() => {
    setRighe(leggiCarrello(typeof window !== "undefined" ? window.localStorage : null));
    setIdratato(true);
  }, []);

  // Persistenza a ogni modifica (MAI al primo render, quando righe è ancora
  // [] e sovrascriverebbe/cancellerebbe il carrello ripristinato).
  useEffect(() => {
    if (!idratato) return;
    scriviCarrello(typeof window !== "undefined" ? window.localStorage : null, righe);
  }, [righe, idratato]);

  const aggiungi = useCallback((riga: RigaInserimento) => {
    const chiave = chiaveDiRiga({ prodottoId: riga.prodottoId, varianteId: riga.varianteId ?? null });
    setRighe((prev) => aggiungiAlCarrello(prev, riga));
    setUltimoAggiunto(chiave);
  }, []);

  const aggiorna = useCallback((chiave: string, quantita: number) => {
    setRighe((prev) => aggiornaQuantita(prev, chiave, quantita));
  }, []);

  const rimuovi = useCallback((chiave: string) => {
    setRighe((prev) => rimuoviDalCarrello(prev, chiave));
  }, []);

  const svuota = useCallback(() => {
    setRighe(svuotaCarrello());
  }, []);

  const getItemQuantity = useCallback(
    (prodottoId: string, varianteId?: string | null) =>
      quantitaDiRiga(righe, prodottoId, varianteId ?? null),
    [righe]
  );

  const valore = useMemo<StatoCarrello>(
    () => ({
      righe,
      numeroRighe: righe.length,
      pezzi: contaPezzi(righe),
      gruppi: raggruppaPerNegozio(righe),
      totale: totaleCarrello(righe),
      ultimoAggiunto,
      aggiungi,
      aggiorna,
      rimuovi,
      svuota,
      getItemQuantity,
    }),
    [righe, ultimoAggiunto, aggiungi, aggiorna, rimuovi, svuota, getItemQuantity]
  );

  return <CarrelloContext.Provider value={valore}>{children}</CarrelloContext.Provider>;
}

export function useCarrello(): StatoCarrello {
  const ctx = useContext(CarrelloContext);
  if (!ctx) {
    throw new Error("useCarrello deve essere usato dentro <CartProvider>");
  }
  return ctx;
}

/** Alias internazionale (spec F2.4): stesso hook di `useCarrello`. */
export function useCart(): StatoCarrello {
  return useCarrello();
}

/** Utile per costruire la chiave di una riga senza esportare interni. */
export { chiaveRiga, chiaveDiRiga };
