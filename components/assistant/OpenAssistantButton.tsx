"use client";

import { Sparkles, ArrowUpRight } from "lucide-react";

export function OpenAssistantButton({ label = "Chiedi all'AI" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("assistant:open"))}
      className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100"
    >
      <Sparkles className="h-3 w-3" />
      {label}
    </button>
  );
}

export function OpenAssistantLink({ label = "Approfondisci con l'AI" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("assistant:open"))}
      className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline"
    >
      {label}
      <ArrowUpRight className="h-3 w-3" />
    </button>
  );
}
