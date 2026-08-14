"use client";

import Link from "next/link";
import { Heart, Store } from "lucide-react";
import type { ClientePreferito } from "@/lib/cliente/types";

type Props = {
  preferito: ClientePreferito;
  onRimuovi: (id: string) => void;
  rimuovendo: boolean;
};

/**
 * Card di un singolo preferito (negozio o prodotto).
 * Il link usa sempre lo slug pubblico; il cuore pieno rimuove il preferito.
 */
export default function PreferitoCard({ preferito, onRimuovi, rimuovendo }: Props) {
  const href =
    preferito.tipo === "negozio"
      ? `/negozio/${preferito.slug}`
      : `/prodotto/${preferito.slug}`;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/70 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link href={href} className="block">
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
          <div
            role="img"
            aria-label={preferito.nome}
            className="h-full w-full bg-cover bg-center transition duration-300 group-hover:scale-105"
            style={{
              backgroundImage: preferito.immagineUrl
                ? `url(${preferito.immagineUrl})`
                : undefined,
            }}
          />
          {preferito.tipo === "negozio" && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              <Store className="h-3 w-3" aria-hidden />
              Negozio
            </span>
          )}
        </div>
        <div className="p-3">
          <h3 className="line-clamp-1 text-sm font-bold text-slate-900 transition group-hover:text-blue-700">
            {preferito.nome}
          </h3>
          {preferito.categoria && (
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-600">
              {preferito.categoria}
            </p>
          )}
        </div>
      </Link>

      <button
        type="button"
        onClick={() => onRimuovi(preferito.id)}
        disabled={rimuovendo}
        aria-label={`Rimuovi ${preferito.nome} dai preferiti`}
        className="absolute right-2 top-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-yellow-500 text-white shadow-md transition hover:bg-yellow-600 disabled:opacity-60"
      >
        <Heart className="h-4 w-4 fill-white" aria-hidden />
      </button>
    </div>
  );
}
