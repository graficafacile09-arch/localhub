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
     * h-[100dvh]: occupa la viewport dinamica su mobile (esclude barre browser).
     * overflow-hidden: impedisce doppio scroll a livello di pagina.
     * flex flex-col: Header (shrink-0) + main (flex-1 min-h-0).
     */
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-slate-50">
      {/* Header globale — si restringe, non cresce */}
      <Header />

      {/*
       * main è flex-1 min-h-0: prende tutto lo spazio verticale residuo
       * senza espandersi oltre. flex flex-col propaga l'altezza ad AssistantChat
       * che usa h-full internamente.
       */}
      <main className="flex flex-1 flex-col min-h-0">
        <AssistantChat />
      </main>
    </div>
  );
}
