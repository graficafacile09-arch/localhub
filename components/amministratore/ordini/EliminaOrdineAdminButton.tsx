"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

/**
 * "Elimina ordine" — Area Amministratore.
 * Azione SEPARATA e DISTINTA da "Annulla ordine": sposta l'ordine nel
 * Cestino (soft delete, stessi deleted_at/deleted_by dei negozi), NON lo
 * annulla e NON lo cancella fisicamente. Dopo l'eliminazione l'ordine non è
 * più visibile nell'elenco ordinario ma resta recuperabile dal Cestino.
 * Solo sessioni admin (verifica server nell'API /cestina).
 */
export default function EliminaOrdineAdminButton({
  ordineId,
  numero,
}: {
  ordineId: string;
  numero: string;
}) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function confermaEliminazione() {
    if (invio) return;
    setInvio(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/amministratore/ordini/${ordineId}/cestina`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Impossibile eliminare l'ordine.");
      }
      setAperto(false);
      // L'ordine sparisce dall'elenco ordinario: torna alla lista aggiornata.
      router.push("/amministratore/ordini");
      router.refresh();
    } catch (caught) {
      setErrore(caught instanceof Error ? caught.message : "Errore durante l'eliminazione.");
      setInvio(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErrore(null);
          setAperto(true);
        }}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-bold text-red-600 transition hover:bg-red-50"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        Elimina ordine
      </button>

      <ConfirmDialog
        open={aperto}
        title="Eliminare questo ordine?"
        message={
          errore ??
          "L'ordine verrà spostato nel Cestino e non sarà più visibile nell'elenco degli ordini. Da lì potrà essere ripristinato dall'amministratore."
        }
        confirmLabel="Elimina ordine"
        destructive
        loading={invio}
        onConfirm={() => void confermaEliminazione()}
        onCancel={() => {
          if (!invio) setAperto(false);
        }}
      />
    </>
  );
}