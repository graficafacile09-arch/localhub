"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MapPin, Sprout, Store } from "lucide-react";
import type { ComponentType } from "react";
import MarchioRadiscan from "./MarchioRadiscan";

type VoceNav = {
  label: string;
  href: string;
  icona: ComponentType<{ className?: string; "aria-hidden"?: boolean; strokeWidth?: number }>;
  badge: string | null;
  /** Testo alternativo mostrato da md in su (badge compatte su mobile). */
  badgeLungo?: string | null;
  /** Colore di sfondo/spaziature del badge (il resto è comune). */
  badgeClass?: string | null;
  micro: string | null;
  attiva: boolean;
};

/**
 * Navigazione pubblica — UNICA fonte delle voci Home/Aziende/Filiere/Radiscan
 * e Territorio. Link, ordine e stato attivo restano quelli di sempre.
 *
 * Grafica (mockup approvato):
 * - fondo crema con bordo oro sottile per le voci inattive;
 * - pillola verde bosco piena, con testo bianco, per la voce attiva;
 * - pillole alte e generose, icona a sinistra e testo a destra;
 * - badge centrata SOPRA la pillola, staccata dal bordo (\"-top-3.5\" su
 *   mobile, \"-top-5\" da md in su) così da non toccare mai la linea del tasto:
 *   "FOCUS" verde bosco su Filiere e "AI SCAN · DOP · IGP · IGT · BIO" rosso
 *   su RadiciScan (su mobile resta la sola scritta "AI SCAN");
 * - la voce Radiscan porta il marchio allegato (riquadro con i prodotti) e il
 *   logotipo al posto dell'icona lucide e della vecchia etichetta TerraQ, con
 *   la stessa pillola, la stessa luce e gli stessi ingombri delle altre voci;
 * - icone semplici, arrotondate, senza ombre marcate;
 * - mobile: cinque pillole compatte con icona sopra e testo sotto, per non
 *   tagliare nessuna voce né creare overflow orizzontale.
 * - tablet (640–1279px): pillole leggermente più strette, così le cinque voci
 *   restano sempre su UNA riga e "Territorio" non scende sfalsato sotto le
 *   altre; da 1280px in su tornano le misure piene del desktop.
 */
export default function HeaderNav({ overlay = false }: { overlay?: boolean } = {}) {
  const pathname = usePathname();

  const voci: VoceNav[] = [
    { label: "Home", href: "/", icona: Home, badge: null, micro: null, attiva: pathname === "/" },
    { label: "Aziende", href: "/negozi", icona: Store, badge: null, micro: null, attiva: pathname === "/negozi" || pathname.startsWith("/negozi/") },
    {
      label: "Filiere",
      href: "/filiere",
      icona: Sprout,
      badge: "FOCUS",
      badgeClass: "bg-[#1E3F2B] md:px-2",
      micro: null,
      attiva: pathname === "/filiere" || pathname.startsWith("/filiere/"),
    },
    {
      label: "RadiciScan",
      href: "/prodotti",
      icona: MarchioRadiscan,
      badge: "AI SCAN",
      badgeLungo: "AI SCAN · DOP · IGP · IGT · BIO",
      badgeClass: "bg-[#C83E3B] md:px-2.5",
      micro: null,
      attiva: pathname === "/prodotti" || pathname.startsWith("/prodotti/"),
    },
    {
      label: "Territorio",
      href: "/territorio",
      icona: MapPin,
      badge: null,
      micro: null,
      attiva: pathname === "/territorio" || pathname.startsWith("/territorio/"),
    },
  ];

  return (
    <nav
      aria-label="Navigazione principale"
      className={
        overlay
          ? "mx-auto flex w-full max-w-[900px] flex-wrap items-center justify-center gap-2 sm:gap-2 lg:gap-3 xl:gap-3"
          : "mx-auto flex w-full max-w-[1120px] flex-wrap items-stretch justify-center gap-2 sm:gap-2 lg:gap-2.5 xl:gap-[19px]"
      }
    >
      {voci.map((voce) => {
        const Icona = voce.icona;
        const marchio = voce.label === "RadiciScan";
        const classiVoce = `group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full border px-2 py-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 sm:flex-none sm:flex-row sm:gap-1.5 sm:px-3 sm:py-2.5 md:px-4 lg:gap-2 lg:px-5 lg:py-3 xl:gap-3.5 xl:px-[38px] xl:py-3 ${
          voce.attiva
            ? "border-forest bg-forest text-white"
            : "border-gold-soft bg-cream text-forest hover:border-gold hover:bg-[#f4ecdc]"
        }`;

        return (
          <Link
            key={voce.href}
            href={voce.href}
            aria-label={voce.label}
            aria-current={voce.attiva ? "page" : undefined}
            className={classiVoce}
          >
            <Icona
              aria-hidden
              className={`h-5 w-5 shrink-0 transition-colors duration-200 sm:h-5 sm:w-5 lg:h-[22px] lg:w-[22px] xl:h-[26px] xl:w-[26px] ${
                voce.attiva ? "text-white" : "text-forest"
              }`}
              strokeWidth={1.8}
            />
            {/* Su mobile la pillola è stretta: le etichette tradotte (francese,
                spagnolo, tedesco) vanno a capo invece di uscire dal riquadro
                e sovrapporsi alle voci accanto. Da sm in su restano su una riga.

                Radiscan fa eccezione: è un nome di marchio e sta SEMPRE su un
                rigo solo, con la stessa tipografia delle altre voci (nessun
                peso o spaziatura diversa: il tasto resta identico agli altri).
                Se la parola andasse a capo la pillola diventerebbe più alta
                delle altre e, con `items-stretch`, alzerebbe tutta la fila:
                per questo non si spezza mai e, solo sui telefoni più stretti,
                scende di un punto invece di uscire dal tasto. */}
            <span
              className={`incitta-public-nav-label ${
                marchio
                  ? "whitespace-nowrap text-[9px] font-semibold leading-tight tracking-tight max-sm:tracking-[-0.04em] max-[389px]:text-[8px] max-[359px]:text-[7px] sm:text-[14px] md:text-[15px] xl:text-[18px]"
                  : "max-w-full hyphens-auto break-words text-balance text-center text-[10px] font-semibold leading-tight tracking-tight sm:whitespace-nowrap sm:text-[14px] md:text-[15px] xl:text-[18px]"
              } ${voce.attiva ? "text-white" : "text-forest"}`}
            >
              {voce.label}
            </span>

            {voce.badge && (
              <span
                aria-hidden
                className={`absolute -top-3.5 left-1/2 z-10 inline-flex -translate-x-1/2 items-center justify-center whitespace-nowrap rounded-full px-1.5 py-[2px] text-[8px] font-black uppercase leading-none tracking-[0.1em] text-white shadow-sm md:-top-5 md:text-[10px] ${
                  voce.badgeClass ?? "bg-[#C83E3B]"
                }`}
              >
                <span className={voce.badgeLungo ? "md:hidden" : undefined}>{voce.badge}</span>
                {voce.badgeLungo && <span className="hidden md:inline">{voce.badgeLungo}</span>}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
