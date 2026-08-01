"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Trash2 } from "lucide-react";

export default function StoreTrashCard() {
  const [trashCount, setTrashCount] = useState<number | null>(null);

  const fetchTrashCount = useCallback(async () => {
    try {
      const res = await fetch("/api/merchant/trash");
      if (!res.ok) return;
      const json = await res.json();
      const stores = Array.isArray(json?.data?.stores) ? json.data.stores : [];
      setTrashCount(stores.length);
    } catch {
      // In caso di errore non affermare che il cestino sia vuoto: resta "…"
    }
  }, []);

  useEffect(() => {
    fetchTrashCount();
  }, [fetchTrashCount]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
          <Trash2 className="h-4 w-4 text-slate-500" />
          Cestino
        </h2>
        <span className="inline-flex items-center rounded-lg bg-slate-200/80 px-2.5 py-1 text-xs font-bold text-slate-700">
          {trashCount === null ? "…" : trashCount === 1 ? "1 negozio" : `${trashCount} negozi`}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        I negozi eliminati vengono spostati nel Cestino e possono essere ripristinati.
      </p>
      <Link
        href="/merchant/trash"
        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-900"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Apri Cestino
      </Link>
    </div>
  );
}
