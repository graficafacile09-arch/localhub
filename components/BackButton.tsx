// Roadmap — BackButton da utilizzare nelle pagine dettaglio negozio/prodotto
"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function BackButton() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-600 px-5 py-2 text-blue-600 font-semibold hover:bg-blue-600 hover:text-white transition"
    >
      <ArrowLeft className="w-5 h-5" />
      Torna indietro
    </button>
  );
}