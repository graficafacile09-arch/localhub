"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Skull, Trash2 } from "lucide-react";
import ModuleShell from "./ModuleShell";

type Props = { storeId: string };

export default function ZonaPericolosaModule({ storeId }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

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
      </div>
    </ModuleShell>
  );
}
