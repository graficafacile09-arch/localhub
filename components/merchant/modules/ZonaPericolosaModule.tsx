"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Skull, Trash2 } from "lucide-react";
import ModuleShell from "./ModuleShell";

type Props = { storeId: string };

export default function ZonaPericolosaModule({ storeId }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
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

  async function handleSoftDelete() {
    if (!confirm("Eliminare questo negozio? Puoi ripristinarlo dal Cestino entro 30 giorni.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}`, { method: "DELETE" });
      if (res.ok) router.push("/merchant");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ModuleShell icon={<Skull className="h-4 w-4" />} title="Zona Pericolosa" subtitle="Operazioni distruttive" id="zona-pericolosa">
      <div className="space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-red-700">
            <Trash2 className="h-4 w-4" />
            Elimina negozio
          </h3>
          <p className="mt-2 text-xs leading-5 text-red-600">
            Il negozio verrà spostato nel Cestino. Potrai ripristinarlo entro 30 giorni dalla sezione Cestino.
            Trascorso questo periodo, verrà eliminato definitivamente.
          </p>
          <button
            type="button"
            onClick={handleSoftDelete}
            disabled={deleting}
            className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? "Eliminazione..." : "Sposta nel Cestino"}
          </button>
        </div>

        {/* Cestino */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
              <Trash2 className="h-4 w-4 text-slate-500" />
              Cestino
            </h3>
            <span className="inline-flex items-center rounded-lg bg-slate-200/80 px-2.5 py-1 text-xs font-bold text-slate-700">
              {trashCount === null ? "…" : trashCount === 1 ? "1 negozio" : `${trashCount} negozi`}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            I negozi eliminati vengono spostati nel Cestino e possono essere ripristinati.
          </p>
          <button
            type="button"
            onClick={() => router.push("/merchant/trash")}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-900"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Apri Cestino
          </button>
        </div>
      </div>
    </ModuleShell>
  );
}
