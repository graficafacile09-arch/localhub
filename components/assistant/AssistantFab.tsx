"use client";

import { Bot } from "lucide-react";

export default function AssistantFab() {
  const handleClick = () => {
    window.dispatchEvent(new Event("assistant:open"));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Apri l'Assistente AI"
      className={[
        "fixed z-[60] flex items-center gap-1.5 rounded-full px-3 py-2",
        "bg-blue-600 text-white shadow-lg shadow-blue-500/30",
        "bottom-4 right-4 sm:bottom-6 sm:right-6",
        "transition-all duration-200 hover:bg-blue-500 hover:shadow-xl active:scale-95",
      ].join(" ")}
    >
      <Bot className="h-4 w-4 shrink-0" aria-hidden />
      <span className="text-xs font-bold">AI</span>
    </button>
  );
}
