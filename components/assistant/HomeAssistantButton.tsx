"use client";

import { Sparkles } from "lucide-react";

/**
 * Pulsante dell'Assistente AI — SOLO homepage.
 *
 * È una NORMALE azione della homepage (niente fixed/sticky/absolute rispetto
 * alla viewport): viene montato nella riga delle azioni della homepage, così
 * NON copre mai le bottom navigation mobile e non esiste alcun elemento
 * flottante globale.
 *
 * Aspetto richiesto: giallo, compatto, contiene SOLO il logo/icona
 * dell'Assistente (nessun testo, nessuna descrizione).
 *
 * Logica identica agli altri trigger (stesso evento `assistant:open` a cui
 * risponde AssistantPanel, montato nel layout root): nessun secondo
 * Assistente, Gemini e /api/assistente restano invariati.
 */
export default function HomeAssistantButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("assistant:open"))}
      aria-label="Apri l'Assistente AI"
      title="Assistente AI"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95"
    >
      <Sparkles className="h-5 w-5" aria-hidden />
    </button>
  );
}
