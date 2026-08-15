import { ADMIN_BASE } from "@/components/amministratore/navigation";
import {
  Copy,
  Edit3,
  FolderOpen,
  Home,
  LayoutGrid,
  LogOut,
  MessageSquareWarning,
  Package,
  ReceiptText,
  Sparkles,
  Store,
  Trash2,
  Users,
  Wallet,
  Coins,
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
  /** Voce menu utente (es. "Esci" → signout). */
  isMenu?: boolean;
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
  /** Voce menu utente (Esci → signout form). */
  isMenu?: boolean;
};

/**
 * Voci della sidebar dell'Area Venditore/Amministratore relative al negozio
 * selezionato (Dashboard, Prodotti, Editor, Media, Duplica).
 * Unica fonte per la navigazione "store" lato venditore: AdminSidebar
 * (viste di piattaforma) è già separata in components/amministratore/navigation.ts.
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
      key: "incassi",
      label: "Incassi",
      description: "Pagato, commissioni e netto",
      href: `${storePath}/incassi`,
      icon: Wallet,
    },
    {
      key: "payout",
      label: "Payout",
      description: "Netto da erogare per periodo",
      href: `${storePath}/payout`,
      icon: Coins,
    },
    {
      key: "reclami",
      label: "Reclami",
      description: "Problemi dei clienti aperti",
      href: `${storePath}/ordini?filtro=reclami`,
      icon: MessageSquareWarning,
    },
    {
      key: "editor",
      label: "Editor",
      href: null,
      icon: Edit3,
      section: true,
    },
    {
      key: "gestione-negozio",
      label: "Gestione negozio",
      description: "Dati e informazioni",
      href: `${storePath}/edit`,
      icon: Edit3,
    },
    {
      key: "media",
      label: "Libreria Media",
      description: "Immagini e file",
      href: `${storePath}/media`,
      icon: FolderOpen,
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

/** Voci della bottom navigation mobile dell'Area Venditore. */
export function getMerchantBottomNavItems(
  storeId: string | null,
  baseHref: string
): MerchantBottomNavItem[] {
  const hasStore = Boolean(storeId);
  const storePath = hasStore ? `${MERCHANT_BASE}/${storeId}` : null;
  return [
    {
      key: "home",
      label: "Home",
      href: "/",
      icon: Home,
    },
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
      key: "ai",
      label: "AI",
      href: storePath ? `${storePath}/prodotti/ai` : baseHref,
      icon: Sparkles,
      requiresStore: true,
      ai: true,
    },
    {
      key: "gestione",
      label: "Gestione",
      href: storePath ? `${storePath}/impostazioni` : baseHref,
      icon: Store,
      requiresStore: true,
    },
    {
      key: "altro",
      label: "Esci",
      href: null,
      icon: LogOut,
      isMenu: true,
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
      key: "cestino",
      label: "Cestino",
      href: `${ADMIN_BASE}/cestino`,
      icon: Trash2,
    },
    {
      key: "utenti",
      label: "Utenti",
      href: `${ADMIN_BASE}/utenti`,
      icon: Users,
    },
    {
      key: "altro",
      label: "Esci",
      href: null,
      icon: LogOut,
      isMenu: true,
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
  if (suffix === "/incassi") return "Incassi";
  if (suffix === "/payout") return "Payout";
  if (suffix === "/impostazioni") return "Impostazioni";

  return storeName ?? "Venditore";
}