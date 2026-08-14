"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

type BackButtonProps = {
  /** Testo del pulsante (default "Torna indietro"). */
  label?: string;
  /**
   * Destinazione di ripiego quando non esiste una cronologia di navigazione.
   * Se omesso, viene scelta automaticamente dall'area della pagina corrente:
   * /cliente, /merchant, /amministratore oppure / (home pubblica).
   */
  fallbackHref?: string;
  className?: string;
};

/**
 * Pulsante "indietro" unico per tutta la piattaforma.
 * - Se esiste una cronologia (history.length > 1) → router.back();
 * - altrimenti → fallbackHref, oppure la dashboard dell'area corrente
 *   (cliente/merchant/amministratore) se autenticato, altrimenti la home.
 */
export default function BackButton({
  label = "Torna indietro",
  fallbackHref,
  className = "",
}: BackButtonProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "";

  function resolveFallback(): string {
    if (fallbackHref) return fallbackHref;
    if (pathname.startsWith("/amministratore")) return "/amministratore";
    if (pathname.startsWith("/merchant")) return "/merchant";
    if (pathname.startsWith("/cliente")) return "/cliente";
    return "/";
  }

  function handleClick() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(resolveFallback());
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-2 rounded-full border border-blue-600 px-5 py-2 font-semibold text-blue-600 transition hover:bg-yellow-300 hover:text-blue-800 ${className}`}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
