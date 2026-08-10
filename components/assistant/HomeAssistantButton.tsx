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
      className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-yellow-300 to-yellow-400 text-slate-800 shadow-md shadow-yellow-400/30 ring-1 ring-yellow-300 transition-all duration-200 before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-white/25 before:to-transparent hover:-translate-y-0.5 hover:from-yellow-200 hover:to-yellow-300 hover:shadow-lg hover:shadow-yellow-400/40 active:translate-y-0 active:scale-95 active:shadow-sm"
    >
      <Sparkles className="relative h-5 w-5" aria-hidden />
    </button>
  );
}
