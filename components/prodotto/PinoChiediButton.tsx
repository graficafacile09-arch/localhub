"use client";

import { Sparkles } from "lucide-react";

/**
 * Pillola discreta nella scheda prodotto: apre Pino con una domanda
 * precompilata (ricette e abbinamenti). Emette `assistant:open` con
 * `detail.initialQuery`, letto da AssistantPanel.
 */
export default function PinoChiediButton({ domanda }: { domanda: string }) {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("assistant:open", { detail: { initialQuery: domanda } })
        )
      }
      className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#24462f]/25 bg-[#f4efe4] px-4 py-2 text-sm font-medium text-[#24462f] transition hover:bg-[#e9e1cf] active:scale-95"
    >
      <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
      Chiedi a Pino: ricette e abbinamenti
    </button>
  );
}
