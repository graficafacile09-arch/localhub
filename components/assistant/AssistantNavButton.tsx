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
      className="hover:text-blue-600 transition"
    >
      Assistente AI
    </button>
  );
}
