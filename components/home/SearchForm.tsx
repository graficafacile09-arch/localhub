"use client";

import { Search } from "lucide-react";
import { useEffect, type FormEvent } from "react";
import { isLocalAssistantQuery } from "@/lib/assistente/local-intents";

type SearchFormProps = {
  initialQuery?: string;
  compact?: boolean;
};

export default function SearchForm({ initialQuery = "", compact = false }: SearchFormProps) {
  useEffect(() => {
    const query = initialQuery.trim();
    if (!query || !isLocalAssistantQuery(query)) return;

    // Ritarda l'evento di un tick: su /ricerca il listener globale di
    // AssistantPanel viene registrato da un componente fratello nel layout.
    const timer = window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("assistant:open", {
          detail: { initialQuery: query },
        })
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, [initialQuery]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const input = event.currentTarget.elements.namedItem("q");
    const query = input instanceof HTMLInputElement ? input.value.trim() : "";

    // Meteo, farmacia/sintomi e richieste locali speciali vanno direttamente
    // a Pino. Non devono mai raggiungere /ricerca?q= e quindi non possono
    // essere interpretate come query catalogo/prodotto.
    if (isLocalAssistantQuery(query)) {
      event.preventDefault();
      window.dispatchEvent(
        new CustomEvent("assistant:open", {
          detail: { initialQuery: query },
        })
      );
    }
  };

  return (
    <form action="/ricerca" method="get" onSubmit={handleSubmit} className="w-full">
      <div className="relative flex min-w-0 items-center">
        <input
          type="text"
          name="q"
          defaultValue={initialQuery}
          placeholder="Cerca prodotti, negozi o categorie..."
          autoComplete="off"
          enterKeyHint="search"
          className={`w-full rounded-lg border border-slate-200 bg-white py-0 pl-3 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300 ${compact ? "h-9" : "h-10"}`}
          aria-label="Cerca"
        />
        <button
          type="submit"
          aria-label="Cerca"
          className="absolute right-1.5 flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
