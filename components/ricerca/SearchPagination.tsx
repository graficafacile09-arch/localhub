import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  /** Path di base (es. /ricerca o /negozio/<slug>). */
  basePath: string;
  /** Parametri URL attuali (esclusi pagina). */
  params: Record<string, string | undefined>;
  pagina: number;
  totale: number;
  perPagina: number;
};

export default function SearchPagination({ basePath, params, pagina, totale, perPagina }: Props) {
  const totalePagine = Math.max(1, Math.ceil(totale / perPagina));
  if (totalePagine <= 1) return null;

  const build = (paginaTarget: number) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) search.set(k, v);
    }
    if (paginaTarget <= 1) {
      search.delete("pagina");
    } else {
      search.set("pagina", String(paginaTarget));
    }
    const qs = search.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <nav
      aria-label="Paginazione risultati"
      className="mt-4 flex items-center justify-center gap-2"
    >
      <a
        href={build(pagina - 1)}
        aria-disabled={pagina <= 1}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-slate-600 transition ${
          pagina <= 1
            ? "pointer-events-none border-slate-100 text-slate-300"
            : "border-slate-200 bg-white hover:bg-slate-50"
        }`}
        aria-label="Pagina precedente"
      >
        <ChevronLeft className="h-4 w-4" />
      </a>
      <span className="px-2 text-xs font-medium text-slate-500">
        Pagina {Math.min(pagina, totalePagine)} di {totalePagine}
      </span>
      <a
        href={build(pagina + 1)}
        aria-disabled={pagina >= totalePagine}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-slate-600 transition ${
          pagina >= totalePagine
            ? "pointer-events-none border-slate-100 text-slate-300"
            : "border-slate-200 bg-white hover:bg-slate-50"
        }`}
        aria-label="Pagina successiva"
      >
        <ChevronRight className="h-4 w-4" />
      </a>
    </nav>
  );
}
