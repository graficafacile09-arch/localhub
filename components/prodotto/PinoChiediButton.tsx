"use client";

/**
 * Link inline discreto nella scheda prodotto: apre Pino con una domanda
 * precompilata (abbinamenti e ricette). Riusa l'evento `assistant:open`
 * con `initialQuery`, gestito da AssistantPanel.
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
      className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#24462f] underline decoration-[#24462f]/40 underline-offset-4 transition-colors hover:text-[#8a5a3b]"
    >
      Chiedi a Pino: abbinamenti e ricette
    </button>
  );
}
