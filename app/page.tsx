import type { Metadata } from "next";
import Header from "@/components/Header/Header";
import Image from "next/image";
import HomepageProductSwipeReveal from "@/components/home/HomepageProductSwipeReveal";
import HomepageFiliereShowcase from "@/components/home/HomepageFiliereShowcase";

// Mantiene la homepage dinamica, come nella versione precedente.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "InCittà | I negozi di Castrovillari on-line",
  description:
    "Trova i negozi, i prodotti e i servizi di Castrovillari: cerca, confronta e acquista dai commercianti della tua città.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <main className="min-h-screen bg-[#eef3f8]">
      <Header homepage />

      <HomepageProductSwipeReveal
        hero={
          <section className="incitta-home-hero relative overflow-hidden rounded-b-[2rem] bg-slate-900 shadow-lg shadow-slate-900/10 sm:rounded-b-[2.5rem] md:min-h-[600px]">
            <Image
              src="/hero-coppia-castrovillari.webp"
              alt="Coppia a Castrovillari"
              fill
              sizes="100vw"
              preload
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover object-center md:object-[center_40%]"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/25 to-transparent"
            />
            <div className="relative z-10 mx-auto max-w-7xl px-4 py-10 text-left md:flex md:min-h-[600px] md:w-full md:items-center md:px-6 md:py-16">
              <div>
                <h1 className="mt-4 max-w-xl text-3xl font-black leading-tight tracking-tight text-white drop-shadow-lg md:mt-6 md:text-7xl">
                  Tutto quello che cerchi... <span className="text-yellow-300">è già</span> nella tua città.
                </h1>
              </div>
            </div>
          </section>
        }
        valueStrip={null}
        products={<HomepageFiliereShowcase />}
      />
    </main>
  );
}
