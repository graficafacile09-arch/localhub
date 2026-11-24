import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import Header from "@/components/Header/Header";
import { getImpostazioniPubbliche } from "@/lib/platform/settings";
import { getSiteUrl } from "@/lib/site";

// I recapiti arrivano dalle impostazioni pubbliche della piattaforma: la
// pagina si legge a ogni richiesta, così l'admin può cambiarli senza deploy.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contatti",
  description:
    "Come contattare Radici Calabria per informazioni su negozi, prodotti, ordini e supporto alla piattaforma.",
  alternates: { canonical: `${getSiteUrl()}/contatti` },
};

export default async function ContattiPage() {
  const impostazioni = await getImpostazioniPubbliche();
  const email =
    impostazioni.public_email?.trim() ||
    process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim() ||
    "admin@incitta.online";
  const telefono = impostazioni.public_phone?.trim() || "";

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-900">
      <Header />

      <section className="bg-gradient-to-br from-blue-800 via-blue-900 to-blue-950 text-white">
        <div className="mx-auto max-w-4xl px-5 py-14 text-center sm:px-8 md:py-18">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">Radici Calabria</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
            Contatti
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">
            Per informazioni sui negozi, sui prodotti o sul funzionamento della piattaforma
            scrivici: ti rispondiamo il prima possibile.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 md:py-14">
        {(email || telefono) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {email && (
              <a
                href={`mailto:${email}`}
                className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-400 text-blue-900">
                  <Mail className="h-5 w-5" aria-hidden />
                </span>
                <p className="mt-4 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                  Email
                </p>
                <p className="mt-1 break-all text-base font-bold text-blue-800 group-hover:text-blue-900">
                  {email}
                </p>
              </a>
            )}

            {telefono && (
              <a
                href={`tel:${telefono}`}
                className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-400 text-blue-900">
                  <Phone className="h-5 w-5" aria-hidden />
                </span>
                <p className="mt-4 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                  Telefono
                </p>
                <p className="mt-1 text-base font-bold text-blue-800 group-hover:text-blue-900">
                  {telefono}
                </p>
              </a>
            )}
          </div>
        )}

        <div className="mt-8 rounded-2xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-black text-slate-900">Assistenza</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Per un problema relativo a un ordine specifico, contatta prima il Venditore
            attraverso i recapiti indicati nella scheda del negozio o dell&apos;ordine. Per il
            supporto tecnico sulla piattaforma puoi scriverci
            {email ? ` a ${email}` : ""}.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/faq"
              className="rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-black text-blue-900 transition hover:bg-yellow-300"
            >
              Domande frequenti
            </Link>
            <Link
              href="/negozi"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
            >
              Esplora i negozi
            </Link>
          </div>
        </div>

        {!email && !telefono && (
          <p className="mt-6 text-center text-sm text-slate-600">
            I recapiti pubblici saranno disponibili a breve.
          </p>
        )}
      </div>
    </main>
  );
}
