import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header/Header";
import { getSiteUrl } from "@/lib/site";
import { FAQ_CATEGORIES as categorie } from "@/lib/faq-data";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Domande frequenti su InCittà, acquisti, ordini, pagamenti, venditori e utilizzo della piattaforma.",
  alternates: {
    canonical: `${getSiteUrl()}/faq`,
  },
};

export default function FAQPage() {
  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-900">
      <Header />

      <section className="bg-gradient-to-br from-blue-800 via-blue-900 to-blue-950 text-white">
        <div className="mx-auto max-w-4xl px-5 py-14 text-center sm:px-8 md:py-18">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">
            InCittà
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
            Domande frequenti
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">
            Le risposte alle domande più comuni su ricerca, acquisti, ordini,
            pagamenti, venditori e utilizzo della piattaforma.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 md:py-14">
        <div className="space-y-10">
          {categorie.map((categoria) => (
            <section key={categoria.titolo}>
              <h2 className="mb-4 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
                {categoria.titolo}
              </h2>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {categoria.domande.map((item, index) => (
                  <details
                    key={item.domanda}
                    className={index > 0 ? "border-t border-slate-200" : ""}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-5 px-5 py-4 text-sm font-bold text-slate-900 marker:hidden hover:bg-slate-50 sm:px-6 sm:py-5">
                      <span>{item.domanda}</span>
                      <span
                        aria-hidden="true"
                        className="shrink-0 text-xl font-normal leading-none text-blue-700"
                      >
                        +
                      </span>
                    </summary>
                    <div className="px-5 pb-5 text-sm leading-6 text-slate-600 sm:px-6">
                      {item.risposta}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-black text-slate-900">Non hai trovato la risposta?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Per le condizioni giuridiche e commerciali complete consulta i documenti
            pubblicati nel footer. Per un problema relativo a uno specifico ordine,
            verifica prima le informazioni del Venditore e dell'ordine.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/acquirenti"
              className="rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-black text-blue-900 transition hover:bg-yellow-300"
            >
              Termini per gli Acquirenti
            </Link>
            <Link
              href="/condizioni-vendita"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
            >
              Condizioni di vendita
            </Link>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-sm font-semibold text-blue-700 underline-offset-2 hover:underline"
          >
            ← Torna a InCittà
          </Link>
        </div>
      </div>
    </main>
  );
}
