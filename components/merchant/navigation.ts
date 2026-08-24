import { ADMIN_BASE } from "@/components/amministratore/navigation";
import {
  Coins,
  Copy,
  CreditCard,
  FolderOpen,
  Home,
  LayoutGrid,
  Package,
  ReceiptText,
  Settings,
  Sparkles,
  Store,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Base path del pannello venditore. */
export const MERCHANT_BASE = "/merchant";

export type MerchantNavItem = {
  key: string;
  label: string;
  href: string | null;
  icon: LucideIcon;
  /** Descrizione breve sotto l'etichetta (sidebar ricca). */
  description?: string;
  /** Voce di sola intestazione (non cliccabile). */
  section?: boolean;
  /** Voce azione (apre un flusso, es. Duplica negozio). */
  action?: boolean;
  /** Disponibile solo quando un negozio è selezionato. */
  requiresStore?: boolean;
  /** Attiva solo con path esatto (non i sotto-percorsi). */
  exactActive?: boolean;
};

export type MerchantBottomNavItem = {
  key: string;
  label: string;
  href: string | null;
  icon: LucideIcon;
  /** Disponibile solo quando un negozio è selezionato. */
  requiresStore?: boolean;
  /** Pulsante centrale prominente (AI). */
  ai?: boolean;
};

/**
 * Voci della sidebar del negozio selezionato (Area Venditore).
 * Una funzione = una voce = una destinazione:
 * - Incassi + Payout sono accorpati in "Guadagni" (/guadagni);
 * - Reclami non è una voce autonoma: il badge vive su "Ordini";
 * - "Gestione negozio" (/edit) è stata unificata in "Impostazioni negozio"
 *   (/impostazioni); /edit resta funzionante solo per i flussi guidati
 *   (onboarding wizard, duplica, media) — non è più una voce di menu;
 * - "Duplica negozio" resta come azione secondaria.
 */
export function getMerchantStoreNavItems(storeId: string): MerchantNavItem[] {
  const storePath = `${MERCHANT_BASE}/${storeId}`;
  return [
    {
      key: "dashboard",
      label: "Dashboard",
      description: "Panoramica del negozio",
      href: storePath,
      icon: LayoutGrid,
      exactActive: true,
    },
    {
      key: "prodotti",
      label: "Prodotti",
      description: "Catalogo e pubblicazioni",
      href: `${storePath}/prodotti`,
      icon: Package,
    },
    {
      key: "ordini",
      label: "Ordini",
      description: "Da confermare a consegnati",
      href: `${storePath}/ordini`,
      icon: ReceiptText,
    },
    {
      key: "guadagni",
      label: "Guadagni",
      description: "Incassi e payout del negozio",
      href: `${storePath}/guadagni`,
      icon: Coins,
    },
    {
      key: "pagamenti",
      label: "Pagamenti",
      description: "Stripe Connect, provider e metodi",
      href: `${storePath}/pagamenti`,
      icon: CreditCard,
    },
    // ── Sezione strumenti: separa le funzioni SECONDARIE dalle principali.
    //    Pattern "section" già supportato da MerchantSidebarNav: intestazione
    //    + separatore; nessun href, nessuna voce eliminata. ────────────────
    {
      key: "strumenti",
      label: "Strumenti",
      href: null,
      icon: Wrench,
      section: true,
    },
    {
      key: "media",
      label: "Libreria Media",
      description: "Immagini e file",
      href: `${storePath}/media`,
      icon: FolderOpen,
    },
    {
      key: "impostazioni",
      label: "Impostazioni negozio",
      description: "Dati, foto, contatti e vendita",
      href: `${storePath}/impostazioni`,
      icon: Settings,
    },
    {
      key: "duplica",
      label: "Duplica negozio",
      href: null,
      icon: Copy,
      action: true,
    },
  ];
}

/**
 * Voci della bottom navigation mobile dell'Area Venditore.
 *
 * "Home" NON è più una voce della barra: il pulsante Home della top bar
 * mobile (MerchantTopBar) è SEMPRE visibile e porta a "/" — la destinazione
 * resta raggiungibile senza duplicarla nella barra. Al suo posto entra
 * GUADAGNI (funzione economica principale): la barra resta a 5 voci senza
 * sovraffollamento e senza eliminare alcuna destinazione.
 */
export function getMerchantBottomNavItems(
  storeId: string | null,
  baseHref: string
): MerchantBottomNavItem[] {
  const hasStore = Boolean(storeId);
  const storePath = hasStore ? `${MERCHANT_BASE}/${storeId}` : null;
  return [
    {
      key: "negozio",
      label: "Negozio",
      href: storePath ?? baseHref,
      icon: Store,
    },
    {
      key: "prodotti",
      label: "Prodotti",
      href: storePath ? `${storePath}/prodotti` : baseHref,
      icon: Package,
      requiresStore: true,
    },
    {
      key: "ordini",
      label: "Ordini",
      href: storePath ? `${storePath}/ordini` : baseHref,
      icon: ReceiptText,
      requiresStore: true,
    },
    {
      key: "guadagni",
      label: "Guadagni",
      href: storePath ? `${storePath}/guadagni` : baseHref,
      icon: Coins,
      requiresStore: true,
    },
    {
      key: "ai",
      label: "AI",
      href: storePath ? `${storePath}/prodotti/ai` : baseHref,
      icon: Sparkles,
      requiresStore: true,
      ai: true,
    },
  ];
}

/** Voci della bottom navigation mobile dell'Area Amministratore. */
export function getAdminBottomNavItems(): MerchantBottomNavItem[] {
  return [
    {
      key: "home",
      label: "Home",
      href: "/",
      icon: Home,
    },
    {
      key: "negozi",
      label: "Negozi",
      href: `${ADMIN_BASE}/attivita`,
      icon: Store,
    },
    {
      key: "ordini",
      label: "Ordini",
      href: `${ADMIN_BASE}/ordini`,
      icon: ReceiptText,
    },
    {
      key: "utenti",
      label: "Utenti",
      href: `${ADMIN_BASE}/utenti`,
      icon: Users,
    },
  ];
}

/**
 * Titolo della top bar mobile (determinato dal percorso).
 * Unica fonte per il titolo mostrato in MerchantTopBar.
 */
export function getMerchantTopTitle(
  pathname: string,
  storeName?: string | null,
  isAdmin = false
): string {
  if (isAdmin && pathname === ADMIN_BASE) return "I tuoi negozi";
  if (isAdmin && pathname.startsWith("/amministratore")) return "Amministrazione";
  if (pathname === MERCHANT_BASE) return "I tuoi negozi";

  const withStore = /^\/merchant\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!withStore) return isAdmin ? "Amministratore" : "Venditore";

  const suffix = withStore[2] ?? "";

  if (suffix === "" || suffix === "/") return storeName ?? "Dashboard";
  if (suffix === "/prodotti/ai") return "Aggiungi con AI";
  if (suffix === "/prodotti/nuovo") return "Nuovo prodotto";
  if (/^\/prodotti\/[^/]+$/.test(suffix)) return "Modifica prodotto";
  if (suffix === "/prodotti") return "Prodotti";
  if (suffix === "/ordini") return "Ordini";
  if (/^\/ordini\/[^/]+$/.test(suffix)) return "Dettaglio ordine";
  if (suffix === "/guadagni") return "Guadagni";
  if (suffix === "/incassi") return "Guadagni";
  if (suffix === "/payout") return "Guadagni";
  if (suffix === "/pagamenti") return "Pagamenti";
  if (suffix === "/impostazioni") return "Impostazioni negozio";
  if (suffix === "/edit") return "Editor negozio";

  return storeName ?? "Venditore";
}
