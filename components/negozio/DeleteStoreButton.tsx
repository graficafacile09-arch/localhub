"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  negozioId: string;
  isDemo?: boolean;
};

export default function DeleteStoreButton({ negozioId }: Props) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("Eliminare definitivamente questo negozio? Tutti i dati associati verranno rimossi.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/merchant/stores/${negozioId}`, { method: "DELETE" });
      if (res.ok) router.push("/merchant");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
    >
      {deleting ? "Eliminazione..." : "Elimina negozio"}
    </button>
  );
}
