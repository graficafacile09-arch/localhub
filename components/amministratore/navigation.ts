import {
  BadgePercent,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  FolderTree,
  HelpCircle,
  Home,
  LayoutDashboard,
  LayoutTemplate,
  Newspaper,
  Package,
  ScrollText,
  Settings,
  Star,
  Store,
  Trash2,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** true = voce solo UI (es. Guida), senza navigazione reale ancora. */
  placeholder?: boolean;
};

/** Base path del pannello Amministratore. */
export const ADMIN_BASE = "/amministratore";

/** Voci del menu laterale (ordine di visualizzazione). */
export const adminNavItems: AdminNavItem[] = [
  {
    href: ADMIN_BASE,
    label: "Panoramica",
    description:
      "Vista d'insieme della piattaforma: numeri chiave e stato generale di LocalHub.",
    icon: LayoutDashboard,
  },
  {
    href: `${ADMIN_BASE}/attivita`,
    label: "Attività",
    description:
      "Gestione delle attività commerciali e professionali registrate sulla piattaforma.",
    icon: Store,
  },
  {
    href: `${ADMIN_BASE}/cestino`,
    label: "Cestino",
    description:
      "Negozi eliminati dalla piattaforma: ripristino o eliminazione definitiva (solo amministratore).",
    icon: Trash2,
  },
  {
    href: `${ADMIN_BASE}/prodotti`,
    label: "Prodotti",
    description:
      "Supervisione del catalogo prodotti pubblicato dai commercianti.",
    icon: Package,
  },
  {
    href: `${ADMIN_BASE}/offerte`,
    label: "Offerte",
    description:
      "Gestione delle offerte e delle promozioni attive su LocalHub.",
    icon: BadgePercent,
  },
  {
    href: `${ADMIN_BASE}/eventi`,
    label: "Eventi",
    description: "Pianificazione e moderazione degli eventi della città.",
    icon: CalendarDays,
  },
  {
    href: `${ADMIN_BASE}/utenti`,
    label: "Utenti",
    description:
      "Gestione degli utenti registrati e dei loro profili.",
    icon: Users,
  },
  {
    href: `${ADMIN_BASE}/categorie`,
    label: "Categorie",
    description:
      "Organizzazione delle categorie di negozi e prodotti.",
    icon: FolderTree,
  },
  {
    href: `${ADMIN_BASE}/negozi-in-evidenza`,
    label: "Negozi in evidenza",
    description:
      "Selezione dei negozi in evidenza mostrati nella homepage.",
    icon: Star,
  },
  {
    href: `${ADMIN_BASE}/template`,
    label: "Template",
    description:
      "Template di piattaforma per la creazione di nuovi negozi (creazione, modifica ed eliminazione riservate all'amministratore).",
    icon: LayoutTemplate,
  },
  {
    href: `${ADMIN_BASE}/contenuti`,
    label: "Contenuti",
    description:
      "Gestione degli articoli e dei contenuti editoriali del portale.",
    icon: Newspaper,
  },
  {
    href: `${ADMIN_BASE}/assistente-ai`,
    label: "Assistente AI",
    description:
      "Configurazione e monitoraggio dell'assistente intelligente.",
    icon: Bot,
  },
  {
    href: `${ADMIN_BASE}/scansioni`,
    label: "Scansioni AI",
    description:
      "Monitoraggio in tempo reale delle scansioni AI dei prodotti (log provider, cache ed errori).",
    icon: BarChart3,
  },
  {
    href: `${ADMIN_BASE}/statistiche`,
    label: "Statistiche",
    description:
      "Analisi dei dati di traffico e delle performance della piattaforma.",
    icon: BarChart3,
  },
  {
    href: `${ADMIN_BASE}/segnalazioni`,
    label: "Segnalazioni",
    description: "Gestione delle segnalazioni inviate dagli utenti.",
    icon: Bell,
  },
  {
    href: `${ADMIN_BASE}/impostazioni`,
    label: "Impostazioni",
    description: "Configurazione generale della piattaforma.",
    icon: Settings,
  },
  {
    href: `${ADMIN_BASE}/registro-attivita`,
    label: "Registro attività",
    description:
      "Cronologia delle operazioni eseguite sulla piattaforma.",
    icon: ScrollText,
  },
];

/** Trova la voce di navigazione per una route (per le pagine placeholder). */
export function getAdminNavItem(href: string): AdminNavItem {
  const item = adminNavItems.find((entry) => entry.href === href);
  if (!item) {
    throw new Error(`Voce di navigazione Amministratore non trovata: ${href}`);
  }
  return item;
}

/** Voci della sezione footer della sidebar (navigazione rapida). */
export const adminFooterItems: AdminNavItem[] = [
  {
    href: "/",
    label: "Torna al sito",
    description: "Apri la homepage pubblica di LocalHub.",
    icon: Home,
  },
  {
    href: `${ADMIN_BASE}/impostazioni`,
    label: "Impostazioni",
    description: "Configurazione generale della piattaforma.",
    icon: Settings,
  },
  {
    href: `${ADMIN_BASE}/guida`,
    label: "Guida",
    description: "Documentazione e aiuto sull'uso del pannello.",
    icon: HelpCircle,
    placeholder: true,
  },
];
