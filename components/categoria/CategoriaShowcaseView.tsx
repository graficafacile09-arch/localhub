import Link from "next/link";
import { ArrowLeft, Store } from "lucide-react";
import CategoryStoreCard from "./CategoryStoreCard";
import type { CategoriaShowcase } from "@/lib/negozi";
import { chiavePreferito } from "@/lib/cliente/favorites";

/**
 * Vetrina di una categoria (pagina /ricerca?categoria=<slug>).
 * `chiaviPreferiti` e `autenticato` sono opzionali: se presenti, le card
 * mostrano il pulsante preferiti con lo stato iniziale calcolato dal server.
 */
export default function CategoriaShowcaseView({
  showcase,
  chiaviPreferiti,
  autenticato,
}: {
  showcase: CategoriaShowcase;
  chiaviPreferiti?: Set<string>;
  autenticato?: boolean;
}) {
  const { categoria, negozi, totaleNegozi } = showcase;

  // Categoria non trovata (slug inesistente o inattiva).
  if (!categoria) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[2rem] border border-white/70 bg-white px-6 py-16 text-center shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
          <Store className="h-8 w-8 text-slate-400" />
        </div>
        <h2 className="mt-4 text-lg font-black tracking-tight text-slate-900">
          Categoria non trovata
        </h2>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          La categoria richiesta non esiste o non è più disponibile.
        </p>
        <Link
          href="/categorie"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-yellow-400 hover:text-blue-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Torna alle categorie
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header categoria */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
          Categoria
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
          {categoria.nome}
        </h1>
        {categoria.descrizione ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {categoria.descrizione}
          </p>
        ) : null}
        <p className="mt-3 text-sm text-slate-600">
          <span className="font-black text-slate-900">{totaleNegozi}</span>{" "}
          {totaleNegozi === 1 ? "negozio" : "negozi"} in{" "}
          <span className="font-bold text-blue-700">&ldquo;{categoria.nome}&rdquo;</span>
        </p>
      </div>

      {negozi.length === 0 ? (
        /* Empty state professionale */
        <div className="flex flex-col items-center justify-center rounded-[2rem] border border-white/70 bg-white px-6 py-16 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
            <Store className="h-8 w-8 text-blue-500" />
          </div>
          <h2 className="mt-4 text-lg font-black tracking-tight text-slate-900">
            Nessun negozio presente in questa categoria
          </h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Al momento non ci sono attività registrate in questa categoria.
          </p>
          <Link
            href="/categorie"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-yellow-400 hover:text-blue-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Torna alle categorie
          </Link>
        </div>
      ) : (
        /* Griglia negozi */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {negozi.map((negozio) => (
            <CategoryStoreCard
              key={negozio.id}
              negozio={negozio}
              preferitoAttivo={chiaviPreferiti?.has(chiavePreferito("negozio", negozio.id))}
              autenticato={autenticato}
            />
          ))}
        </div>
      )}
    </div>
  );
}
