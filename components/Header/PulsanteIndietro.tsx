"use client";

import { useCallback, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Ritorno alla pagina precedente in modo sicuro.
 *
 * 1. Si usa la cronologia del browser SOLO quando la voce precedente è
 *    dimostrabilmente dello stesso sito (Navigation API, dove disponibile).
 * 2. Altrimenti si usa la pila delle pagine interne visitate in questa scheda
 *    (sessionStorage): si torna all'ultima pagina interna diversa da quella
 *    corrente.
 * 3. Se non esiste alcuna pagina interna precedente (ingresso diretto da un
 *    link esterno, scheda nuova), si va alla homepage.
 *
 * In nessun caso il pulsante può riportare l'utente su un sito esterno.
 */
const CHIAVE_PILA = "radici-cronologia-interna";
const MAX_VOCI = 30;

function percorsoCorrente(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function leggiPila(): string[] {
  try {
    const valore = window.sessionStorage.getItem(CHIAVE_PILA);
    if (!valore) return [];
    const pila: unknown = JSON.parse(valore);
    return Array.isArray(pila)
      ? pila.filter((voce): voce is string => typeof voce === "string")
      : [];
  } catch {
    return [];
  }
}

function scriviPila(pila: string[]): void {
  try {
    window.sessionStorage.setItem(CHIAVE_PILA, JSON.stringify(pila.slice(-MAX_VOCI)));
  } catch {
    // Storage non disponibile (navigazione privata restrittiva): nessun errore.
  }
}

type NavigationApi = {
  currentEntry?: { index: number };
  entries: () => { url: string }[];
};

export default function PulsanteIndietro() {
  const router = useRouter();
  const pathname = usePathname();

  // Registra la pagina corrente in coda alla pila interna.
  useEffect(() => {
    const corrente = percorsoCorrente();
    const pila = leggiPila();
    if (pila[pila.length - 1] !== corrente) scriviPila([...pila, corrente]);
  }, [pathname]);

  // Back/forward del browser: la pagina raggiunta torna in cima senza
  // duplicare la voce già presente nella pila.
  useEffect(() => {
    const suPopstate = () => {
      const corrente = percorsoCorrente();
      const pila = leggiPila();
      const indice = pila.lastIndexOf(corrente);
      if (indice >= 0) scriviPila(pila.slice(0, indice + 1));
    };
    window.addEventListener("popstate", suPopstate);
    return () => window.removeEventListener("popstate", suPopstate);
  }, []);

  const tornaIndietro = useCallback(() => {
    const navigazione = (window as unknown as { navigation?: NavigationApi }).navigation;

    if (
      navigazione?.currentEntry &&
      typeof navigazione.currentEntry.index === "number" &&
      navigazione.currentEntry.index > 0
    ) {
      try {
        const precedente = navigazione.entries()[navigazione.currentEntry.index - 1];
        if (precedente?.url && new URL(precedente.url).origin === window.location.origin) {
          router.back();
          return;
        }
      } catch {
        // Navigation API non utilizzabile: si passa alla pila interna.
      }
    }

    const pila = leggiPila();
    const corrente = percorsoCorrente();
    let precedente: string | undefined;
    while (pila.length > 0) {
      const candidato = pila.pop();
      if (candidato && candidato !== corrente) {
        precedente = candidato;
        break;
      }
    }
    scriviPila(pila);

    router.push(precedente ?? "/");
  }, [router]);

  return (
    <button
      type="button"
      onClick={tornaIndietro}
      aria-label="Torna alla pagina precedente"
      title="Indietro"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold-soft bg-white text-forest transition-colors hover:border-gold hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2"
    >
      <ArrowLeft className="h-[18px] w-[18px]" aria-hidden />
    </button>
  );
}
