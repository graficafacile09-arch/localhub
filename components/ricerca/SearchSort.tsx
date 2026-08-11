"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown } from "lucide-react";
import type { OrdinamentoProdottiPubblici } from "@/lib/negozi";

const OPZIONI: { value: OrdinamentoProdottiPubblici; label: string }[] = [
  { value: "rilevanza", label: "Rilevanza" },
  { value: "novita", label: "Più recenti" },
  { value: "prezzo_asc", label: "Prezzo crescente" },
  { value: "prezzo_desc", label: "Prezzo decrescente" },
];

type Props = {
  basePath?: string;
  value: OrdinamentoProdottiPubblici;
};

export default function SearchSort({ basePath = "/ricerca", value }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const onChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "rilevanza") {
      params.delete("ordina");
    } else {
      params.set("ordina", next);
    }
    // Un nuovo ordinamento riparte dalla prima pagina.
    params.delete("pagina");
    router.push(`${basePath}?${params.toString()}`);
  };

  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-500">
      <ArrowUpDown className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Ordina:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Ordina risultati"
        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
      >
        {OPZIONI.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
