"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ShoppingCart } from "lucide-react";
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
  soggettoVerificaEta?: boolean;
  quantita?: number;
  disabled?: boolean;
};

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
  soggettoVerificaEta = false,
  quantita = 1,
  disabled = false,
}: Props) {
  const { aggiungi, ultimoAggiunto } = useCarrello();
  const chiave = chiaveRiga(prodottoId, varianteId ?? null);
  const [mostraOk, setMostraOk] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (ultimoAggiunto === chiave) {
      setMostraOk(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setMostraOk(false), 2600);
    } else {
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
      soggettoVerificaEta,
    });
  };

  if (soggettoVerificaEta) {
    return (
      <Link
        href={`/prodotto/${slug}`}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-base font-bold text-amber-900 shadow-sm transition hover:bg-amber-100 active:scale-[0.98]"
      >
        🔞 Verifica età per acquistare
      </Link>
    );
  }

  if (mostraOk) {
    return (
      <div className="w-full space-y-2">
        <p data-testid="aggiunto-feedback" className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-base font-bold text-blue-700">
          <Check className="h-5 w-5" aria-hidden />
          Aggiunto al carrello
        </p>
        <Link href="/carrello" className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 px-4 py-3 text-base font-bold text-blue-800 shadow-sm transition hover:bg-yellow-300 active:scale-[0.98]">
          <ShoppingCart className="h-5 w-5" aria-hidden />
          Vai al carrello
          <ArrowRight className="h-5 w-5" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={`Aggiungi ${nome} al carrello`}
      className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-base font-bold shadow-sm transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-60"
          : "border-blue-200 bg-white text-blue-700 hover:border-blue-400 hover:bg-blue-50 active:scale-[0.98]"
      }`}
    >
      <ShoppingCart className="h-5 w-5" aria-hidden />
      Aggiungi al carrello
    </button>
  );
}
