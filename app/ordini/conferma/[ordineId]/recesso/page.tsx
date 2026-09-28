"use client";

import { useParams } from "next/navigation";
import RecessoOrdine from "@/components/cliente/RecessoOrdine.jsx";

export default function RecessoGuestPage() {
  const params = useParams();
  const ordineId = String(params?.ordineId ?? "");

  let token = null;
  if (typeof window !== "undefined") {
    token = new URLSearchParams(window.location.search).get("token");
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6">
        <a
          href={`/ordini/conferma/${encodeURIComponent(ordineId)}`}
          className="text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          ← Torna all'ordine
        </a>
      </div>
      <RecessoOrdine ordineId={ordineId} token={token} />
    </main>
  );
}
