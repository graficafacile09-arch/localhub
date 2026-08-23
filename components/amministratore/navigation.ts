import {
  BadgePercent,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  Coins,
  FolderTree,
  Home,
  LayoutDashboard,
  LayoutTemplate,
  Newspaper,
  Package,
  ReceiptText,
  ScrollText,
  Settings,
  Star,
  Store,
  Trash2,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export type AdminNavGroup = {
  key: string;
  label: string;
  icon: LucideIcon;
  items: AdminNavItem[];
};

/** Base path del pannello Amministratore. */
export const ADMIN_BASE = "/amministratore";

/**
 * Menu laterale dell'Area Amministratore organizzato per GRUPPI logici
 * (accordion nella sidebar): poche voci per gruppo, nessuna duplicazione.
 * "Impostazioni" esiste una sola volta (gruppo Piattaforma), "La mia area"
 * è stata rimossa (il titolo dell'header porta già alla Panoramica).
 */
export const adminNavGroups: AdminNavGroup[] = [
  {
    key: "panoramica",
    label: "Panoramica",
    icon: LayoutDashboard,
    items: [
      {
        href: ADMIN_BASE,
        label: "Panoramica",
        description:
          "Vista d'insieme della piattaforma: numeri chiave e stato generale di LocalHub.",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    key: "negozi-catalogo",
    label: "Negozi & Catalogo",
    icon: Store,
    items: [
      {
        href: `${ADMIN_BASE}/attivita`,
        label: "Negozi",
        description:
          "Tutti i negozi della piattaforma: visualizza, modifica, duplica ed elimina le attività commerciali e professionali registrate.",
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
    ],
  },
  {
    key: "ordini-pagamenti",
    label: "Ordini & Pagamenti",
    icon: ReceiptText,
    items: [
      {
        href: `${ADMIN_BASE}/ordini`,
        label: "Ordini",
        description:
          "Supervisione centrale di tutti gli ordini di tutti i negozi della piattaforma.",
        icon: ReceiptText,
      },
      {
        href: `${ADMIN_BASE}/incassi`,
        label: "Incassi",
        description:
          "Rendicontazione economica globale: GMV, commissioni piattaforma, rimborsi e netto venditori.",
        icon: Wallet,
      },
      {
        href: `${ADMIN_BASE}/payout`,
        label: "Payout",
        description:
          "Supervisione dei payout interni dei negozi: calcolo per periodo, stato di erogazione e storico.",
        icon: Coins,
      },
    ],
  },
  {
    key: "contenuti-promozioni",
    label: "Contenuti & Promozioni",
    icon: LayoutTemplate,
    items: [
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
        href: `${ADMIN_BASE}/contenuti`,
        label: "Contenuti",
        description:
          "Gestione degli articoli e dei contenuti editoriali del portale.",
        icon: Newspaper,
      },
      {
        href: `${ADMIN_BASE}/template`,
        label: "Template",
        description:
          "Template di piattaforma per la creazione di nuovi negozi (creazione, modifica ed eliminazione riservate all'amministratore).",
        icon: LayoutTemplate,
      },
    ],
  },
  {
    key: "piattaforma",
    label: "Piattaforma",
    icon: Wrench,
    items: [
      {
        href: `${ADMIN_BASE}/utenti`,
        label: "Utenti",
        description:
          "Gestione degli utenti registrati e dei loro profili.",
        icon: Users,
      },
      {
        href: `${ADMIN_BASE}/segnalazioni`,
        label: "Segnalazioni",
        description: "Gestione delle segnalazioni inviate dagli utenti.",
        icon: Bell,
      },
      {
        href: `${ADMIN_BASE}/statistiche`,
        label: "Statistiche",
        description:
          "Analisi dei dati di traffico e delle performance della piattaforma.",
        icon: BarChart3,
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
        href: `${ADMIN_BASE}/registro-attivita`,
        label: "Registro attività",
        description:
          "Cronologia delle operazioni eseguite sulla piattaforma.",
        icon: ScrollText,
      },
      {
        href: `${ADMIN_BASE}/impostazioni`,
        label: "Impostazioni",
        description: "Configurazione generale della piattaforma.",
        icon: Settings,
      },
    ],
  },
];

/** Voci flattenate (per retrocompatibilità e placeholder). */
export const adminNavItems: AdminNavItem[] = adminNavGroups.flatMap(
  (group) => group.items
);

/** Trova la voce di navigazione per una route (per le pagine placeholder). */
export function getAdminNavItem(href: string): AdminNavItem {
  const item = adminNavItems.find((entry) => entry.href === href);
  if (!item) {
    throw new Error(`Voce di navigazione Amministratore non trovata: ${href}`);
  }
  return item;
}

/**
 * Voci della sezione footer della sidebar (navigazione rapida).
 * Solo "Torna al sito": "Impostazioni" NON è duplicata qui (è già nel
 * gruppo Piattaforma).
 */
export const adminFooterItems: AdminNavItem[] = [
  {
    href: "/",
    label: "Torna al sito",
    description: "Apri la homepage pubblica di LocalHub.",
    icon: Home,
  },
];
