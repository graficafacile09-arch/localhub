// Roadmap — Ricerca prodotti lato cliente nel negozio, da integrare quando serve filtraggio lato client
"use client";

import { useState } from "react";
import { Search } from "lucide-react";

type StoreProductSearchProps = {
  onSearch: (query: string) => void;
};

export default function StoreProductSearch({ onSearch }: StoreProductSearchProps) {
  const [query, setQuery] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    onSearch(value);
  };

  return (
    <div className="relative flex items-center">
      <Search className="pointer-events-none absolute left-2.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      <input
        type="text"
        value={query}
        onChange={handleChange}
        placeholder="Cerca in questo negozio..."
        className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
        aria-label="Cerca prodotti nel negozio"
      />
    </div>
  );
}
