"use client";

import { useRouter } from "next/navigation";
import { Search, Sparkles } from "lucide-react";
import { useState } from "react";

type SearchFormProps = {
  initialQuery?: string;
  compact?: boolean;
};

export default function SearchForm({ initialQuery = "", compact = false }: SearchFormProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      router.push(`/ricerca?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const handleAI = () => {
    window.dispatchEvent(new Event("assistant:open"));
  };

  return (
    <form onSubmit={handleSearch} className="w-full">
      <div className="flex items-center gap-2">
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search
            className="pointer-events-none absolute left-3 h-4 w-4 shrink-0 text-slate-400"
            aria-hidden
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca negozi, prodotti o servizi..."
            className={`w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300 ${compact ? "h-9" : "h-10"}`}
            aria-label="Cerca"
          />
        </div>
        <button
          type="button"
          onClick={handleAI}
          className={`flex shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600 transition hover:bg-blue-100 ${compact ? "h-9 w-9" : "h-10 w-10"}`}
          aria-label="Chiedi all'Assistente AI"
        >
          <Sparkles className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
