/**
 * LocalHub — Pagina Assistente AI
 *
 * Interfaccia conversazionale stile ChatGPT per trovare negozi e servizi locali.
 * Usa AssistantChat che internamente chiama POST /api/search.
 *
 * Layout:
 * - Header sticky in alto (comune a tutto il sito)
 * - Area chat occupa tutto lo spazio verticale rimanente
 * - Input fissato in basso
 *
 * @module app/assistant/page
 */

import type { Metadata } from "next";
import Header from "@/components/Header/Header";
import AssistantChat from "@/components/assistant/AssistantChat";

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Assistente AI — LocalHub",
  description:
    "Chatta con l'Assistente AI di LocalHub per trovare negozi, servizi e attività nella tua città.",
};

// ─── Pagina ───────────────────────────────────────────────────────────────────

export default function AssistantPage() {
  return (
    /*
     * Il layout usa `h-[100dvh]` per occupare l'intera viewport anche su mobile
     * dove la barra del browser modifica l'altezza disponibile.
     * `overflow-hidden` sul wrapper esterno impedisce doppio scroll.
     */
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-slate-50">
      {/* Header sticky */}
      <Header />

      {/* Intestazione pagina — compatta, non toglie spazio alla chat */}
      <div className="border-b border-slate-200/80 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-black tracking-tight text-slate-950 sm:text-lg">
              Assistente AI
            </h1>
            <p className="text-[12px] text-slate-500">
              Trova negozi e servizi locali — powered by LocalHub Brain
            </p>
          </div>
          {/* Badge status */}
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            Online
          </div>
        </div>
      </div>

      {/* Chat — occupa tutto lo spazio rimanente */}
      <main className="min-h-0 flex-1">
        <AssistantChat />
      </main>
    </div>
  );
}
