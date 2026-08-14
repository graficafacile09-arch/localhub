"use client";

import Link from "next/link";
import { Package, Plus, Camera, ArrowRight, CheckCircle2 } from "lucide-react";
import type { StepProps } from "../editor-steps";

export default function StepCatalogo({ storeId, basePath, counts }: StepProps) {
  const base = `${basePath}/${storeId}`;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">I tuoi prodotti</p>
            <p className="text-xs text-slate-500">
              {counts.prodotti > 0
                ? `${counts.prodotti} ${counts.prodotti === 1 ? "prodotto pubblicato" : "prodotti pubblicati"}`
                : "Non hai ancora prodotti nel catalogo"}
            </p>
          </div>
        </div>

        {counts.prodotti === 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Per rendere il negozio davvero pronto, aggiungi almeno un prodotto: è ciò che i
              clienti possono acquistare o prenotare.
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href={`${base}/prodotti`}
          className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-md"
        >
          <Package className="h-6 w-6 text-slate-500 transition group-hover:text-blue-600" />
          <p className="mt-3 text-sm font-black text-slate-900">Gestisci catalogo</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            Vedi, modifica prezzo, immagine, descrizione e disponibilità dei prodotti.
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-600">
            Apri catalogo <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>

        <Link
          href={`${base}/prodotti/nuovo`}
          className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-md"
        >
          <Plus className="h-6 w-6 text-slate-500 transition group-hover:text-blue-600" />
          <p className="mt-3 text-sm font-black text-slate-900">Aggiungi prodotto</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            Crea un nuovo prodotto con nome, prezzo, immagine e descrizione.
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-600">
            Nuovo prodotto <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>

        <Link
          href={`${base}/prodotti/ai`}
          className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-violet-300 hover:shadow-md"
        >
          <Camera className="h-6 w-6 text-slate-500 transition group-hover:text-violet-600" />
          <p className="mt-3 text-sm font-black text-slate-900">Scansiona con AI</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            Fotografa un prodotto e lascia che l&apos;AI compili i dati per te.
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-violet-600">
            Scansiona <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      </div>
    </div>
  );
}
