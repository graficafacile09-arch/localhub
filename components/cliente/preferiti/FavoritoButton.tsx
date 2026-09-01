"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import type { TipoPreferito } from "@/lib/cliente/types";

type Variante = "overlay" | "inline";

type Props = {
  tipo: TipoPreferito;
  riferimentoId: string;
  /** Stato iniziale calcolato dal server (un'unica query, nessun N+1). */
  attivo: boolean;
  /** True se l'utente è loggato (il server lo passa già). */
  autenticato: boolean;
  variante?: Variante;
  /** Classi extra per il posizionamento (es. overlay sulla card). */
  className?: string;
  /** Label accessibile. */
  label?: string;
};

/**
 * Pulsante Preferiti (cuore) — componente strutturale riutilizzabile.
 *
 * - Utente anonimo → al click viene portato alla pagina di login.
 * - Utente loggato → toggle ottimistico via /api/cliente/preferiti.
 *
 * Lo stato iniziale (`attivo`, `autenticato`) arriva sempre dal server
 * calcolato con un'unica query per pagina (getChiaviPreferiti): nessuna
 * richiesta extra al caricamento, nessun N+1.
 */
export default function FavoritoButton({
  tipo,
  riferimentoId,
  attivo,
  autenticato,
  variante = "overlay",
  className = "",
  label,
}: Props) {
  const router = useRouter();
  const [attivoLocal, setAttivoLocal] = useState(attivo);
  const [inviando, setInviando] = useState(false);

  // Etichetta accessibile descrittiva: "Salva <nome> nei preferiti" oppure
  // "Rimuovi <nome> dai preferiti" (mai solo il nome dell'elemento).
  const oggetto = label ? ` ${label}` : "";
  const ariaEtichetta = attivoLocal
    ? `Rimuovi${oggetto} dai preferiti`
    : `Salva${oggetto} nei preferiti`;

  const toggle = useCallback(async () => {
    // Utente anonimo: prima l'accesso, poi potrà salvare il preferito.
    if (!autenticato) {
      router.push("/login");
      return;
    }

    const prossimoStato = !attivoLocal;
    setAttivoLocal(prossimoStato);
    setInviando(true);

    try {
      const response = await fetch("/api/cliente/preferiti", {
        method: prossimoStato ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, riferimentoId }),
      });

      if (!response.ok) {
        setAttivoLocal(!prossimoStato);
      }
    } catch {
      setAttivoLocal(!prossimoStato);
    } finally {
      setInviando(false);
    }
  }, [autenticato, attivoLocal, tipo, riferimentoId, router]);

  const base =
    "inline-flex items-center justify-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60";

  if (variante === "inline") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={inviando}
        aria-pressed={attivoLocal}
        aria-label={ariaEtichetta}
        className={`${base} gap-1.5 border px-3 py-2 text-xs font-bold ${
          attivoLocal
            ? "border-yellow-200 bg-yellow-50 text-yellow-600 hover:bg-yellow-100"
            : "border-yellow-300 bg-yellow-50 text-yellow-800 hover:border-yellow-400 hover:bg-yellow-100"
        } ${className}`}
      >
        <Heart
          className={`h-4 w-4 ${attivoLocal ? "fill-yellow-500 text-yellow-500" : ""}`}
          aria-hidden
        />
        {attivoLocal ? "Salvato" : "Salva"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={inviando}
      aria-pressed={attivoLocal}
      aria-label={ariaEtichetta}
      className={`${base} h-9 w-9 shadow-md ${
        attivoLocal
          ? "bg-yellow-500 text-white hover:bg-yellow-600"
          : "bg-yellow-50 text-yellow-700 backdrop-blur hover:bg-yellow-100 hover:text-yellow-800"
      } ${className}`}
    >
      <Heart
        className={`h-4 w-4 ${attivoLocal ? "fill-white" : ""}`}
        aria-hidden
      />
    </button>
  );
}
