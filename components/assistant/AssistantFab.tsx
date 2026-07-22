"use client";

/**
 * LocalHub — AssistantFab
 *
 * Pulsante flottante fisso per l'Assistente AI.
 * Visibile su tutte le pagine tranne /assistant.
 * Vive nel root layout per essere garantito globalmente.
 *
 * Posizionamento:
 * - Mobile: bottom-20 right-4 (sopra la bottom nav)
 * - Desktop: bottom-6 right-6
 *
 * @module components/assistant/AssistantFab
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot } from "lucide-react";

export default function AssistantFab() {
  const pathname = usePathname();

  // Non mostrare il FAB quando si è già sull'assistente
  if (pathname === "/assistant") return null;

  return (
    <Link
      href="/assistant"
      aria-label="Apri l'Assistente AI"
      title="Assistente AI"
      className="fixed bottom-20 right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-[0_8px_30px_rgba(124,58,237,0.55)] transition-all duration-200 hover:scale-105 hover:bg-violet-500 hover:shadow-[0_12px_36px_rgba(124,58,237,0.70)] active:scale-95 sm:bottom-6 sm:right-6"
    >
      <Bot className="h-6 w-6" aria-hidden />
      {/* Label visibile solo su desktop, a sinistra del bottone */}
      <span className="pointer-events-none absolute right-16 hidden whitespace-nowrap rounded-xl bg-slate-900 px-3 py-1.5 text-[12px] font-semibold text-white sm:group-hover:block">
        Assistente AI
      </span>
    </Link>
  );
}
