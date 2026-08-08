"use client";

/**
 * Voce "Assistente AI" del menu di navigazione superiore.
 * Usa la STESSA logica degli altri pulsanti funzionanti
 * (AssistantFab, OpenAssistantButton, SearchForm): emette l'evento
 * `assistant:open` a cui risponde AssistantPanel (montato nel layout root).
 * L'aspetto è identico alla vecchia voce di menu (nessun cambiamento grafico).
 */
export default function AssistantNavButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("assistant:open"))}
      className="relative inline-flex items-center overflow-hidden rounded-full bg-gradient-to-b from-yellow-300 to-yellow-400 px-3.5 py-1.5 text-sm font-bold text-slate-800 shadow-md shadow-yellow-400/30 ring-1 ring-yellow-300 transition-all duration-200 before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-white/25 before:to-transparent hover:-translate-y-0.5 hover:from-yellow-200 hover:to-yellow-300 hover:shadow-lg hover:shadow-yellow-400/40 active:translate-y-0 active:scale-95 active:shadow-sm"
    >
      <span className="relative">Assistente AI</span>
    </button>
  );
}
