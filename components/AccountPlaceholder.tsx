import type { ComponentType } from "react";
import Header from "@/components/Header/Header";

/**
 * Placeholder professionale per le pagine dell'area utente (Profilo,
 * Preferiti, Ordini). Stessa grafica dei placeholder del progetto:
 * nessuna logica, solo UI.
 */
export default function AccountPlaceholder({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <main className="min-h-screen bg-gray-50">
      <Header />

      <section className="mx-auto max-w-3xl px-4 py-16 md:py-20 md:px-6">
        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white text-center shadow-sm">
          <div className="h-1.5 bg-linear-to-r from-cyan-300 via-blue-500 to-yellow-300" />
          <div className="p-10 md:p-12">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
              <Icon className="h-8 w-8 text-blue-600" aria-hidden />
            </span>

            <h1 className="mt-6 text-3xl font-black tracking-tight text-slate-900">
              {title}
            </h1>

            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
              {description}
            </p>

            <div className="mx-auto mt-8 inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-900">
              <span aria-hidden>🚧</span>
              Modulo in preparazione
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
