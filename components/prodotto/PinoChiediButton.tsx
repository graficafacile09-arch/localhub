"use client";

import PinoSprite from "@/components/assistant/PinoSprite";
import {
  categoriaProdottoPino,
  domandaProdottoPino,
} from "@/lib/assistente/prodotti-pino";

/**
 * Pillola discreta nella scheda prodotto. Apre Pino con una domanda precompilata
 * che cambia in base al tipo di prodotto: per un vino/bevanda chiede il piatto
 * da abbinare, per un alimento chiede ricetta e vino. Emette `assistant:open`
 * con `detail.initialQuery`, letto da AssistantPanel.
 */
export default function PinoChiediButton({
  productName,
  categoria = "",
}: {
  productName: string;
  categoria?: string;
}) {
  const famiglia = categoriaProdottoPino(productName, categoria);
  const domanda = domandaProdottoPino(productName, categoria);

  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("assistant:open", { detail: { initialQuery: domanda } })
        )
      }
      className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#24462f]/25 bg-[#f4efe4] py-1 pl-1 pr-4 text-sm font-medium text-[#24462f] transition hover:bg-[#e9e1cf] active:scale-95"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm">
        <PinoSprite mood="happy" className="h-[34px] w-auto max-w-none shrink-0 object-contain" />
      </span>
      {famiglia === "dolce" ? "Chiedi a Pino: abbinamento e vino" : "Chiedi a Pino: ricette e abbinamenti"}
    </button>
  );
}
