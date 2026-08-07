"use client";

import Link from "next/link";
import {
  MapPin,
  Package,
  Pencil,
  Sparkles,
  Store,
  Tags,
} from "lucide-react";
import type { AttivitaRow } from "@/lib/amministratore/attivita-types";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import AttivitaEliminaButton from "./AttivitaEliminaButton";

const formatData = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function BadgeStato({ attivo }: { attivo: boolean }) {
  if (attivo) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        Attiva
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden />
      Disattivata
    </span>
  );
}

/**
 * Griglia di card "Gestione Negozi" — sostituisce la vecchia tabella stretta.
 * Ogni card è ampia e leggibile, con nome, categoria, località, stato e azioni
 * grandi (MODIFICA → editor esistente; ELIMINA → soft-delete nel Cestino).
 * Responsive: una colonna su mobile, griglia su desktop.
 */
export default function AttivitaCardGrid({
  attivita,
  onElimina,
}: {
  attivita: AttivitaRow[];
  onElimina?: (id: string) => void;
}) {
  if (attivita.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-3xl border border-slate-100 bg-white px-6 py-16 text-center shadow-sm">
        <Store className="h-10 w-10 text-slate-200" aria-hidden />
        <p className="mt-4 text-lg font-bold text-slate-600">
          Nessun negozio trovato
        </p>
        <p className="mt-1 max-w-sm text-sm text-slate-400">
          Prova a modificare la ricerca o il filtro categoria.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
      {attivita.map((negozio) => {
        const immagine = getNegozioCardImmagine({
          logo_url: negozio.logo_url,
          categoria: negozio.categoria,
        });
        return (
          <article
            key={negozio.id}
            className="flex flex-col rounded-3xl border border-white/70 bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            {/* Intestazione card */}
            <div className="flex items-start gap-4">
              <span
                role="img"
                aria-label={`Logo di ${negozio.nome}`}
                className="block h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-slate-100 bg-cover bg-center ring-1 ring-slate-100"
                style={{ backgroundImage: `url(${immagine})` }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="flex items-center gap-2 text-lg font-black tracking-tight text-slate-900">
                    {negozio.nome}
                  </h2>
                  {negozio.is_demo && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-violet-600 ring-1 ring-violet-200">
                      <Sparkles className="h-3 w-3" aria-hidden />
                      Demo
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {negozio.categoria && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
                      <Tags className="h-3 w-3" aria-hidden />
                      {negozio.categoria}
                    </span>
                  )}
                  <BadgeStato attivo={negozio.attivo} />
                </div>

                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  {negozio.citta && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                      {negozio.citta}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Package className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                    {negozio.prodotti} {negozio.prodotti === 1 ? "prodotto" : "prodotti"}
                  </span>
                  <span className="text-slate-400">
                    Creato il {formatData.format(new Date(negozio.created_at))}
                  </span>
                </p>

                {negozio.slug && (
                  <p className="mt-1.5 truncate text-[11px] text-slate-400">
                    /{negozio.slug}
                  </p>
                )}
              </div>
            </div>

            {/* Azioni */}
            <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
              <Link
                href={`/amministratore/negozi/${negozio.id}/edit`}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700"
              >
                <Pencil className="h-4 w-4" aria-hidden />
                Modifica
              </Link>
              <AttivitaEliminaButton
                storeId={negozio.id}
                storeName={negozio.nome}
                onElimina={(id) => onElimina?.(id)}
                expand
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}