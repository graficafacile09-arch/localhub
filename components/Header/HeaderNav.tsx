"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid2X2, Home, Newspaper, Store, Tag } from "lucide-react";
import type { ComponentType } from "react";

export default function HeaderNav() {
  const pathname = usePathname();

  const voci = [
    { label: "Home", href: "/", icona: Home, badge: null, attiva: pathname === "/" },
    { label: "Negozi", href: "/negozi", icona: Store, badge: null, attiva: pathname === "/negozi" || pathname.startsWith("/negozi/") },
    { label: "Offerte", href: "/offerte", icona: Tag, badge: "SALDI", attiva: pathname === "/offerte" || pathname.startsWith("/offerte/") },
    { label: "Categorie", href: "/categorie", icona: Grid2X2, badge: null, attiva: pathname === "/categorie" || pathname.startsWith("/categorie/") },
    { label: "Notizie", href: "/notizie", icona: Newspaper, badge: "CV", attiva: pathname === "/notizie" || pathname.startsWith("/notizie/") },
  ];

  return (
    <div className="w-full xl:w-auto xl:shrink-0 incitta-desktop-public-nav">
      <nav aria-label="Navigazione principale" className="incitta-main-nav relative mx-auto grid w-full max-w-[760px] grid-cols-5 items-stretch overflow-hidden rounded-2xl border border-white/15 bg-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,.08)] backdrop-blur-sm xl:w-auto xl:min-w-[620px]">
        {voci.map((voce) => {
          const Icona = voce.icona as ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
          return (
            <Link
              key={voce.href}
              href={voce.href}
              aria-label={voce.label}
              aria-current={voce.attiva ? "page" : undefined}
              className={`incitta-public-nav-item group relative flex min-w-0 flex-col items-center justify-center gap-1 px-2 py-2.5 transition-all duration-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 ${voce.attiva ? "bg-white/12 shadow-[inset_0_-3px_0_#facc15]" : ""}`}
            >
              <span className={`incitta-public-nav-icon relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all ${voce.attiva ? "border-yellow-300/60 bg-yellow-400 text-blue-950 shadow-[0_5px_15px_rgba(250,204,21,.25)]" : "border-white/15 bg-white/10 text-yellow-300"}`}>
                <Icona aria-hidden className="h-5 w-5 text-current" />
                {voce.badge && (
                  <span aria-hidden className={`absolute -right-2 -top-2 inline-flex items-center rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] font-black uppercase leading-none tracking-tight text-white shadow-sm ring-2 ring-[#0d3470] ${voce.badge === "CV" ? "px-2 py-1 text-[9px]" : ""}`}>
                    {voce.badge}
                  </span>
                )}
              </span>
              <span className="incitta-public-nav-label whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.06em] text-white/90 transition-colors group-hover:text-white sm:text-xs">{voce.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
