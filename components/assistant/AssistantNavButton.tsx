"use client";

/**
 * Voce "Assistente AI" del menu di navigazione superiore (componente non
 * montato: l'accesso all'Assistente avviene dai pulsanti dedicati delle
 * pagine, es. HomeAssistantButton in homepage).
 * Usa la STESSA logica degli altri pulsanti funzionanti
 * (OpenAssistantButton, SearchForm): emette l'evento
 * `assistant:open` a cui risponde AssistantPanel (montato nel layout root).
 */
export default function AssistantNavButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("assistant:open"))}
      className="inline-flex items-center rounded-full bg-yellow-400 px-3.5 py-1.5 text-sm font-bold text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95"
    >
      <span>Assistente AI</span>
    </button>
  );
}
