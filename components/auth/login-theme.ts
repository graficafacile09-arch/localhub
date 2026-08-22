import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  LayoutDashboard,
  LockKeyhole,
  ShieldCheck,
  ShoppingBag,
  Store,
} from "lucide-react";

/**
 * Tema visivo della pagina di LOGIN per area di ingresso.
 *
 * Il parametro ?area= è SOLO un'indicazione estetica: qui non vive alcuna
 * logica di autorizzazione (quella resta interamente server-side in
 * lib/auth/*). Ogni tema definisce testi, sfondo, card, accenti, focus,
 * pulsanti ed elementi decorativi per rendere le tre esperienze
 * (cliente / venditore / amministrazione) chiaramente distinguibili.
 */
export type AreaLogin = "cliente" | "merchant" | "admin";

export type TemaLogin = {
  id: AreaLogin;
  /** Etichetta sopra il titolo (eyebrow). */
  eyebrow: string;
  eyebrowClass: string;
  /** Badge-icona sopra l'eyebrow (null = nessun badge, es. admin usa la banda). */
  IconaBadge: LucideIcon | null;
  badgeClass: string;
  titoloLogin: string;
  titoloRegistrati: string;
  sottotitoloLogin: string;
  sottotitoloRegistrati: string;
  titoloClass: string;
  sottotitoloClass: string;
  /** Sfondo del <main> (colore/pattern di base). */
  sfondoClass: string;
  /** Decorazioni assolute sullo sfondo (blob blur, griglie, vignette). */
  decorazioni: readonly string[];
  /** Sottile striscia in cima alla card (null = nessuna). */
  strisciaTopClasse: string | null;
  /** Banda istituzionale a tutta larghezza in cima alla card (solo admin). */
  bandaHeader: { Icona: LucideIcon; testo: string; classe: string } | null;
  cardClass: string;
  /** Micro-pill sotto il sottotitolo. */
  chips: readonly { testo: string; classe: string }[];
  tabsContainerClass: string;
  tabAttivoClass: string;
  tabInattivoClass: string;
  bannerClass: string;
  labelFieldClass: string;
  /** Focus degli input (passato anche a PasswordInput). */
  inputFocusClass: string;
  checkboxAccentClass: string;
  linkClass: string;
  ctaClass: string;
  IconaCta: LucideIcon | null;
  /** Placeholder del campo email in login. */
  placeholderEmailLogin: string;
  boxSecondarioClass: string;
  erroreCampoClass: string;
  notaFooter: { testo: string; classe: string } | null;
};

/** CLIENTE — consumer, caldo e accogliente: scoperta e acquisto in città. */
const temaCliente: TemaLogin = {
  id: "cliente",
  eyebrow: "LocalHub · Area Clienti",
  eyebrowClass: "text-orange-600",
  IconaBadge: ShoppingBag,
  badgeClass:
    "flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 text-white shadow-md shadow-orange-500/30",
  titoloLogin: "Bentornato!",
  titoloRegistrati: "Crea il tuo account",
  sottotitoloLogin:
    "Accedi per ritrovare i tuoi negozi preferiti e continuare gli acquisti nella tua città.",
  sottotitoloRegistrati:
    "Scopri e sostieni le attività locali della tua città, ogni giorno.",
  titoloClass: "text-3xl font-black tracking-tight text-slate-900",
  sottotitoloClass: "text-sm leading-6 text-slate-600",
  sfondoClass: "bg-[#fdf8f2]",
  decorazioni: [
    "absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-orange-200/45 blur-3xl",
    "absolute -bottom-40 -right-32 h-[26rem] w-[26rem] rounded-full bg-yellow-200/35 blur-3xl",
    "absolute right-[-10rem] top-1/3 h-80 w-80 rounded-full bg-sky-200/40 blur-3xl",
  ],
  strisciaTopClasse: "h-1.5 w-full bg-gradient-to-r from-orange-400 via-amber-300 to-sky-400",
  bandaHeader: null,
  cardClass:
    "card w-full max-w-md overflow-hidden rounded-3xl border-orange-100 shadow-[0_24px_60px_-30px_rgba(234,88,12,0.4)]",
  chips: [
    {
      testo: "Negozi vicini",
      classe:
        "rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700",
    },
    {
      testo: "Offerte locali",
      classe:
        "rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700",
    },
    {
      testo: "Ritiro in negozio",
      classe:
        "rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700",
    },
  ],
  tabsContainerClass: "flex rounded-2xl bg-amber-100/70 p-1",
  tabAttivoClass: "bg-white text-orange-800 shadow-sm",
  tabInattivoClass: "text-amber-900/60 hover:text-amber-900",
  bannerClass:
    "rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800",
  labelFieldClass: "text-sm font-semibold text-slate-700",
  inputFocusClass: "focus:border-blue-500 focus:ring-4 focus:ring-blue-100",
  checkboxAccentClass: "accent-blue-600",
  linkClass: "text-blue-700 hover:text-blue-800",
  ctaClass: "btn-cta",
  IconaCta: ArrowRight,
  placeholderEmailLogin: "cliente@localhub.it",
  boxSecondarioClass:
    "rounded-2xl border border-orange-200 bg-orange-50/70 px-4 py-3",
  erroreCampoClass: "text-xs font-semibold text-red-600",
  notaFooter: {
    testo: "Ogni acquisto sostiene il commercio della tua città.",
    classe: "mt-6 max-w-md text-center text-xs text-orange-900/50",
  },
};

/** VENDITORE — operativo e professionale: gestione di attività e vendite. */
const temaMerchant: TemaLogin = {
  id: "merchant",
  eyebrow: "LocalHub · Area Venditore",
  eyebrowClass: "text-slate-500",
  IconaBadge: Store,
  badgeClass:
    "flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-white shadow-md shadow-slate-900/30",
  titoloLogin: "Accesso esercente",
  titoloRegistrati: "Apri il tuo negozio",
  sottotitoloLogin:
    "Gestisci ordini, catalogo e vendite della tua attività da un unico pannello operativo.",
  sottotitoloRegistrati:
    "Crea l'account della tua attività e inizia a vendere sulla tua città.",
  titoloClass: "text-3xl font-extrabold tracking-tight text-slate-900",
  sottotitoloClass: "text-sm leading-6 text-slate-600",
  sfondoClass: "bg-slate-100",
  decorazioni: [
    "absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-slate-200/70 to-transparent",
    "absolute inset-0 [background-image:linear-gradient(to_right,rgba(100,116,139,0.09)_1px,transparent_1px),linear-gradient(to_bottom,rgba(100,116,139,0.09)_1px,transparent_1px)] [background-size:36px_36px]",
  ],
  strisciaTopClasse: "h-1 w-full bg-slate-900",
  bandaHeader: null,
  cardClass:
    "card w-full max-w-md overflow-hidden rounded-2xl border-slate-300 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.5)]",
  chips: [
    {
      testo: "Ordini",
      classe:
        "rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600",
    },
    {
      testo: "Catalogo",
      classe:
        "rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600",
    },
    {
      testo: "Vendite",
      classe:
        "rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600",
    },
  ],
  tabsContainerClass: "flex rounded-xl bg-slate-200/80 p-1",
  tabAttivoClass: "bg-white text-slate-900 shadow-sm ring-1 ring-slate-300",
  tabInattivoClass: "text-slate-500 hover:text-slate-700",
  bannerClass:
    "rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700",
  labelFieldClass: "text-sm font-semibold text-slate-700",
  inputFocusClass: "focus:border-slate-500 focus:ring-4 focus:ring-slate-200",
  checkboxAccentClass: "accent-slate-700",
  linkClass: "text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline",
  ctaClass:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-bold text-white shadow-lg shadow-slate-900/25 transition hover:bg-slate-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300 disabled:opacity-55 disabled:hover:bg-slate-900",
  IconaCta: LayoutDashboard,
  placeholderEmailLogin: "venditore@localhub.it",
  boxSecondarioClass: "rounded-xl border border-slate-300 bg-slate-50 px-4 py-3",
  erroreCampoClass: "text-xs font-semibold text-red-600",
  notaFooter: {
    testo: "Strumento operativo riservato agli esercenti di LocalHub.",
    classe: "mt-6 max-w-md text-center text-xs text-slate-500",
  },
};

/** ADMIN — istituzionale, riservato, autorevole: accesso controllato. */
const temaAdmin: TemaLogin = {
  id: "admin",
  eyebrow: "Amministrazione · Accesso riservato",
  eyebrowClass: "text-slate-500",
  IconaBadge: null,
  badgeClass: "",
  titoloLogin: "Area amministrativa",
  titoloRegistrati: "",
  sottotitoloLogin:
    "Autenticazione per il personale amministrativo autorizzato di LocalHub.",
  sottotitoloRegistrati: "",
  titoloClass: "text-2xl font-extrabold tracking-tight text-slate-900",
  sottotitoloClass: "text-sm leading-6 text-slate-500",
  sfondoClass: "bg-slate-950",
  decorazioni: [
    "absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(51,65,85,0.55),transparent)]",
    "absolute inset-0 bg-[radial-gradient(40%_40%_at_85%_100%,rgba(30,64,175,0.16),transparent)]",
  ],
  strisciaTopClasse: null,
  bandaHeader: {
    Icona: ShieldCheck,
    testo: "LocalHub · Amministrazione",
    classe:
      "flex items-center gap-2.5 border-b border-slate-200 bg-slate-950 px-8 py-4 text-xs font-bold uppercase tracking-[0.18em] text-slate-200",
  },
  cardClass:
    "card w-full max-w-md overflow-hidden rounded-lg border-slate-700 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.9)]",
  chips: [],
  tabsContainerClass: "",
  tabAttivoClass: "",
  tabInattivoClass: "",
  bannerClass:
    "rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-800",
  labelFieldClass: "text-sm font-semibold text-slate-700",
  inputFocusClass: "focus:border-blue-800 focus:ring-4 focus:ring-blue-900/15",
  checkboxAccentClass: "accent-blue-900",
  linkClass: "text-blue-800 underline-offset-2 hover:text-blue-950 hover:underline",
  ctaClass:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-900 text-sm font-bold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-950 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/60 disabled:opacity-55",
  IconaCta: LockKeyhole,
  placeholderEmailLogin: "admin@localhub.it",
  boxSecondarioClass: "rounded-lg border border-slate-300 bg-slate-100 px-4 py-3",
  erroreCampoClass: "text-xs font-semibold text-red-600",
  notaFooter: {
    testo: "Area protetta — gli accessi sono registrati e monitorati.",
    classe: "mt-6 max-w-md text-center text-xs text-slate-500",
  },
};

const temi: Record<AreaLogin, TemaLogin> = {
  cliente: temaCliente,
  merchant: temaMerchant,
  admin: temaAdmin,
};

/**
 * Risolve il tema a partire dal parametro ?area=.
 * Valore mancante o non riconosciuto → tema cliente (comportamento
 * identico a quello precedente, dove ogni area sconosciuta ricadeva
 * nell'esperienza clienti).
 */
export function risolviTemaLogin(
  area: string | null | undefined
): TemaLogin {
  if (area === "merchant") return temi.merchant;
  if (area === "admin") return temi.admin;
  return temi.cliente;
}
