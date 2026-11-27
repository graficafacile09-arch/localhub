"use client";

import PinoSprite from "@/components/assistant/PinoSprite";

/**
 * Pillola discreta nella scheda prodotto: apre Pino con una domanda precompilata
 * sul prodotto mostrato (uso/ricetta e vino calabrese). Emette `assistant:open`
 * con `detail.initialQuery`, letto da AssistantPanel.
 */
export default function PinoChiediButton({ productName }: { productName: string }) {
  const domanda = `Come posso usare o cucinare «${productName}» e quale vino calabrese abbinare?`;

  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("assistant:open", { detail: { initialQuery: domanda } })
        )
      }
      className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#24462f]/25 bg-[#f4efe4] py-1.5 pl-1.5 pr-4 text-sm font-medium text-[#24462f] transition hover:bg-[#e9e1cf] active:scale-95"
    >
      <PinoSprite mood="happy" className="h-6 w-6 shrink-0 object-contain" />
      Chiedi a Pino: ricette e abbinamenti
    </button>
  );
}
