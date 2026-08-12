"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ShoppingCart } from "lucide-react";
import { useCarrello } from "@/lib/carrello/CartContext";
import { chiaveRiga } from "@/lib/carrello/cart-core";

type Props = {
  prodottoId: string;
  varianteId?: string | null;
  nome: string;
  prezzo: number;
  immagine: string | null;
  variante: string | null;
  negozioId: string;
  negozioNome: string;
  slug: string;
  quantita?: number;
  disabled?: boolean;
};

/**
 * Pulsante "Aggiungi al carrello" (FASE F2.4). Trasmette SOLO lo snapshot UI
 * (nome/prezzo/immagine/variante/negozio) per la visualizzazione: prezzi e
 * stock non sono mai autoritativi — il backend li risolve dal DB.
 */
export default function AggiungiAlCarrelloButton({
  prodottoId,
  varianteId = null,
  nome,
  prezzo,
  immagine,
  variante,
  negozioId,
  negozioNome,
  slug,
  quantita = 1,
  disabled = false,
}: Props) {
  const { aggiungi, ultimoAggiunto } = useCarrello();
  const chiave = chiaveRiga(prodottoId, varianteId ?? null);
  const [mostraOk, setMostraOk] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feedback quando l'ultimo aggiunto è questa riga (reset se cambia riga).
  useEffect(() => {
    if (ultimoAggiunto === chiave) {
      setMostraOk(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setMostraOk(false), 1600);
    } else {
      // Un altro prodotto è stato aggiunto nel frattempo: spegni il feedback
      // per non lasciarlo "Aggiunto" per sempre.
      setMostraOk(false);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [ultimoAggiunto, chiave]);

  const handleClick = () => {
    aggiungi({
      prodottoId,
      varianteId: varianteId ?? null,
      quantita,
      nome,
      prezzo,
      immagine,
      variante: variante ?? null,
      negozioId,
      negozioNome,
      slug,
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={`Aggiungi ${nome} al carrello`}
      className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-base font-bold shadow-sm transition ${
        mostraOk
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-blue-200 bg-white text-blue-700 hover:border-blue-400 hover:bg-blue-50"
      } ${disabled ? "cursor-not-allowed opacity-50" : "active:scale-[0.98]"}`}
    >
      {mostraOk ? (
        <>
          <Check className="h-5 w-5" aria-hidden />
          Aggiunto al carrello
        </>
      ) : (
        <>
          <ShoppingCart className="h-5 w-5" aria-hidden />
          Aggiungi al carrello
        </>
      )}
    </button>
  );
}
