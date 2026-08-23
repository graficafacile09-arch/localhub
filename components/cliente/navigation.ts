import {
  Flag,
  Heart,
  LayoutDashboard,
  Package,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ClienteNavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Gruppo di sezione nella sidebar (separazione logica del menu). */
  gruppo: "ordini" | "account";
  /** true = voce solo UI, senza navigazione reale ancora. */
  placeholder?: boolean;
};

/** Base path dell'Area Clienti. */
export const CLIENTE_BASE = "/cliente";

/**
 * Voci del menu laterale (ordine di visualizzazione).
 * Massimo 5 voci: Dashboard, Ordini, Preferiti, Profilo, Segnalazioni.
 * Profilo è il punto UNICO per dati personali, indirizzo, avatar e password
 * (le ex "Impostazioni" sono state fuse in Profilo: /cliente/impostazioni
 * reindirizza a /cliente/profilo). Il ritorno al sito avviene dal logo
 * (desktop) e dal pulsante Home della top bar (mobile): nessuna voce
 * "Torna al sito" duplicata nel menu.
 */
export const clienteNavItems: ClienteNavItem[] = [
  {
    href: CLIENTE_BASE,
    label: "Dashboard",
    description:
      "Il tuo riepilogo personale: ordini, preferiti, offerte ed eventi.",
    icon: LayoutDashboard,
    gruppo: "ordini",
  },
  {
    href: `${CLIENTE_BASE}/ordini`,
    label: "Ordini",
    description: "Storico dei tuoi ordini con lo stato di spedizione e consegna.",
    icon: Package,
    gruppo: "ordini",
  },
  {
    href: `${CLIENTE_BASE}/preferiti`,
    label: "Preferiti",
    description: "I negozi e i prodotti che hai salvato per non perderli di vista.",
    icon: Heart,
    gruppo: "account",
  },
  {
    href: `${CLIENTE_BASE}/profilo`,
    label: "Profilo",
    description: "Dati personali, indirizzo, avatar e sicurezza del tuo account.",
    icon: UserRound,
    gruppo: "account",
  },
  {
    href: `${CLIENTE_BASE}/segnalazioni`,
    label: "Segnalazioni",
    description: "Invia una segnalazione o un report al team di supporto.",
    icon: Flag,
    gruppo: "account",
  },
];

/** Trova la voce di navigazione per una route (per le pagine placeholder). */
export function getClienteNavItem(href: string): ClienteNavItem {
  const item = clienteNavItems.find((entry) => entry.href === href);
  if (!item) {
    throw new Error(`Voce di navigazione Area Clienti non trovata: ${href}`);
  }
  return item;
}
