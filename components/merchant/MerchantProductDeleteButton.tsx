"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export default function MerchantProductDeleteButton({
  negozioId,
  productId,
}: {
  negozioId: string;
  productId: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Eliminare questo prodotto?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/merchant/stores/${negozioId}/products/${productId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        alert(data?.error?.message ?? "Errore durante l'eliminazione.");
      }
    } catch {
      alert("Errore di rete.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {deleting ? "Eliminazione..." : "Elimina"}
    </button>
  );
}
