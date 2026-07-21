import Header from "@/components/Header/Header";
import SearchForm from "@/components/home/SearchForm";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import { getNegozi } from "../lib/negozi";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Baby,
  BriefcaseBusiness,
  Car,
  Dumbbell,
  HeartPulse,
  LayoutGrid,
  MapPin,
  PawPrint,
  Scissors,
  Shirt,
  Sofa,
  Sparkles,
  Smartphone,
  Store,
  UtensilsCrossed,
} from "lucide-react";

const categorieHome: {
  nome: string;
  query: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  iconText: string;
  hover: string;
}[] = [
  {
    nome: "Negozi",
    query: "Negozi",
    icon: Store,
    accent: "Negozi locali",
    iconBg: "bg-blue-50",
    iconText: "text-blue-700",
    hover: "hover:border-blue-200 hover:bg-blue-50/70",
  },
  {
    nome: "Food",
    query: "Food",
    icon: UtensilsCrossed,
    accent: "Ristorazione",
    iconBg: "bg-orange-50",
    iconText: "text-orange-700",
    hover: "hover:border-orange-200 hover:bg-orange-50/70",
  },
  {
    nome: "Moda",
    query: "Moda",
    icon: Shirt,
    accent: "Boutique",
    iconBg: "bg-fuchsia-50",
    iconText: "text-fuchsia-700",
    hover: "hover:border-fuchsia-200 hover:bg-fuchsia-50/70",
  },
  {
    nome: "Servizi",
    query: "Servizi",
    icon: BriefcaseBusiness,
    accent: "Professionisti",
    iconBg: "bg-slate-100",
    iconText: "text-slate-700",
    hover: "hover:border-slate-300 hover:bg-slate-50",
  },
  {
    nome: "Beauty",
    query: "Beauty",
    icon: Sparkles,
    accent: "Benessere",
    iconBg: "bg-pink-50",
    iconText: "text-pink-700",
    hover: "hover:border-pink-200 hover:bg-pink-50/70",
  },
  {
    nome: "Casa",
    query: "Casa",
    icon: Sofa,
    accent: "Arredo",
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-700",
    hover: "hover:border-emerald-200 hover:bg-emerald-50/70",
  },
  {
    nome: "Auto",
    query: "Auto",
    icon: Car,
    accent: "Motori",
    iconBg: "bg-amber-50",
    iconText: "text-amber-700",
    hover: "hover:border-amber-200 hover:bg-amber-50/70",
  },
  {
    nome: "Salute",
    query: "Salute",
    icon: HeartPulse,
    accent: "Benessere",
    iconBg: "bg-red-50",
    iconText: "text-red-700",
    hover: "hover:border-red-200 hover:bg-red-50/70",
  },
];

const vetrineCommerciali: {
  titolo: string;
  descrizione: string;
  ricerche: string[];
  icon: LucideIcon;
  iconBg: string;
  iconText: string;
  linkColor: string;
}[] = [
  {
    titolo: "Beauty & Benessere",
    icon: Scissors,
    descrizione:
      "Parrucchieri, barber shop, centri estetici e trattamenti dedicati alla cura personale.",
    ricerche: ["Parrucchiere", "Barber Shop", "Centro Estetico"],
    iconBg: "bg-pink-50",
    iconText: "text-pink-700",
    linkColor: "hover:border-pink-300 hover:text-pink-700",
  },
  {
    titolo: "Casa & Arredo",
    icon: Sofa,
    descrizione:
      "Mobili, decorazioni, illuminazione e soluzioni per arredare casa e ufficio.",
    ricerche: ["Arredamento", "Decorazioni", "Illuminazione"],
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-700",
    linkColor: "hover:border-emerald-300 hover:text-emerald-700",
  },
  {
    titolo: "Tech & Elettronica",
    icon: Smartphone,
    descrizione:
      "Telefonia, computer, accessori e assistenza tecnica per privati e professionisti.",
    ricerche: ["Telefonia", "Computer", "Riparazioni"],
    iconBg: "bg-blue-50",
    iconText: "text-blue-700",
    linkColor: "hover:border-blue-300 hover:text-blue-700",
  },
  {
    titolo: "Bimbi & Giocattoli",
    icon: Baby,
    descrizione:
      "Articoli per bambini, giocattoli, scuola e idee regalo per ogni età.",
    ricerche: ["Giocattoli", "Prima Infanzia", "Cartoleria"],
    iconBg: "bg-yellow-50",
    iconText: "text-yellow-700",
    linkColor: "hover:border-yellow-300 hover:text-yellow-700",
  },
  {
    titolo: "Sport & Fitness",
    icon: Dumbbell,
    descrizione:
      "Palestre, accessori sportivi, abbigliamento tecnico e attività per il tempo libero.",
    ricerche: ["Palestra", "Articoli Sportivi", "Yoga"],
    iconBg: "bg-indigo-50",
    iconText: "text-indigo-700",
    linkColor: "hover:border-indigo-300 hover:text-indigo-700",
  },
  {
    titolo: "Pet Shop & Animali",
    icon: PawPrint,
    descrizione:
      "Alimentazione, accessori, toelettatura e servizi per cani, gatti e altri animali.",
    ricerche: ["Pet Shop", "Toelettatura", "Veterinario"],
    iconBg: "bg-orange-50",
    iconText: "text-orange-700",
    linkColor: "hover:border-orange-300 hover:text-orange-700",
  },
];

const highlights = [
  { value: "Negozi locali", label: "Attività, servizi e professionisti della tua zona" },
  { value: "Ricerca immediata", label: "Trova rapidamente quello che ti serve" },
  { value: "Categorie utili", label: "Accessi veloci alle ricerche più frequenti" },
];

export default async function Home() {
  const negozi = await getNegozi();

  return (
    <main className="min-h-screen bg-gray-100 text-slate-900">
      <Header />

      <section className="mx-auto max-w-7xl px-4 py-3 md:px-6 md:py-4">
        <div className="overflow-hidden rounded-[2rem] border border-blue-300/40 bg-linear-to-r from-blue-700 to-blue-500 text-white shadow-[0_30px_70px_-38px_rgba(37,99,235,0.38)]">
          <div className="h-1 bg-linear-to-r from-cyan-300 via-white to-yellow-300" />

          <div className="grid gap-6 p-6 lg:grid-cols-[1.35fr_0.92fr] lg:p-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-50 shadow-sm backdrop-blur-sm">
                <LayoutGrid className="h-4 w-4 text-cyan-200" />
                Cerca in città
              </div>

              <h1 className="mt-2 text-3xl font-black leading-tight tracking-tight text-white md:text-5xl lg:text-[3.35rem]">
                Tutto il territorio a portata di ricerca
              </h1>

              <p className="mt-4 max-w-3xl text-sm leading-7 text-blue-50/95 md:text-base md:leading-8">
                Scopri negozi, professionisti, attività, offerte e servizi locali con una grafica più luminosa,
                ordinata e adatta a un vero portale commerciale.
              </p>

              <div className="mt-1 rounded-[1.75rem] border border-blue-100 bg-white/88 p-3 shadow-[0_18px_44px_-28px_rgba(37,99,235,0.24)] backdrop-blur-sm md:p-4">
                <SearchForm />
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                {highlights.map((item) => (
                  <div
                    key={item.value}
                    className="rounded-2xl border border-white/15 bg-white/10 px-4 py-4 shadow-sm backdrop-blur-sm"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-yellow-200">
                      {item.value}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-blue-50/90">
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[1.75rem] border border-white/15 bg-[linear-gradient(145deg,#0f172a_0%,#1e40af_58%,#2563eb_100%)] p-5 text-white shadow-[0_24px_54px_-30px_rgba(30,58,138,0.62)]">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
                  Accesso rapido
                </p>
                <h2 className="mt-3 text-2xl font-black leading-tight">
                  Trova subito quello che ti serve
                </h2>
                <div className="mt-5 space-y-3 text-sm text-slate-100">
                  <div className="flex items-start gap-3 rounded-2xl bg-white/10 px-4 py-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                    <span>Attività locali organizzate per categorie e percorsi di ricerca più veloci.</span>
                  </div>
                  <div className="flex items-start gap-3 rounded-2xl bg-white/10 px-4 py-3">
                    <Store className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                    <span>Vetrine con fotografie reali, dettagli utili e accesso diretto ai negozi.</span>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-white/15 bg-white/10 p-5 shadow-sm backdrop-blur-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-100">
                  Ricerche frequenti
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {["Ristorante", "Farmacia", "Palestra", "Arredamento", "Pet Shop", "Parrucchiere"].map((item) => (
                    <Link
                      key={item}
                      href={`/ricerca?q=${encodeURIComponent(item)}`}
                      className="rounded-full border border-white/20 bg-white/85 px-3.5 py-2 text-sm font-medium text-blue-900 transition hover:border-white/40 hover:bg-white hover:text-[#1d4ed8]"
                    >
                      {item}
                    </Link>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl bg-white/85 px-4 py-4 text-sm leading-6 text-blue-900">
                  Un unico punto di accesso per cercare, confrontare e raggiungere le attività del territorio.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="categorie" className="mx-auto max-w-7xl px-4 py-3 md:px-6 md:py-4">
        <div className="rounded-[1.9rem] border border-blue-200 bg-[linear-gradient(180deg,#dbeafe_0%,#eff6ff_32%,#ffffff_100%)] p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Categorie principali
              </p>
              <h2 className="mt-2 text-2xl font-black text-slate-900 md:text-3xl">
                Esplora per tipologia
              </h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Accessi veloci alle ricerche più utili per trovare negozi, servizi e professionisti in pochi clic.
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {categorieHome.map((categoria) => {
              const Icon = categoria.icon;

              return (
                <Link
                  key={categoria.nome}
                  href={`/ricerca?q=${encodeURIComponent(categoria.query)}`}
                  className={`group rounded-2xl border border-slate-200/80 bg-white/72 p-4 transition backdrop-blur-sm ${categoria.hover}`}
                >
                  <div className="flex items-center justify-between">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${categoria.iconBg} ${categoria.iconText} shadow-sm`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:text-slate-700" />
                  </div>
                  <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {categoria.accent}
                  </p>
                  <h3 className="mt-1 text-sm font-bold text-slate-900 md:text-base">
                    {categoria.nome}
                  </h3>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-3 md:px-6 md:py-4">
        <div className="rounded-[1.9rem] border border-cyan-100 bg-[linear-gradient(180deg,#e0f2fe_0%,#eff6ff_44%,#ffffff_100%)] p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Settori più richiesti
              </p>
              <h2 className="mt-2 text-2xl font-black text-slate-900 md:text-3xl">
                Ricerche suggerite
              </h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Entra rapidamente nelle aree più cercate e raggiungi le attività più adatte alle tue esigenze.
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {vetrineCommerciali.map((categoria) => {
              const Icon = categoria.icon;

              return (
                <div
                  key={categoria.titolo}
                  className="rounded-2xl border border-blue-100/80 bg-white/80 p-5 transition backdrop-blur-sm hover:border-cyan-200 hover:bg-white hover:shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${categoria.iconBg} ${categoria.iconText}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {categoria.titolo}
                    </h3>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {categoria.descrizione}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {categoria.ricerche.map((ricerca) => (
                      <Link
                        key={ricerca}
                        href={`/ricerca?q=${encodeURIComponent(ricerca)}`}
                        className={`rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition ${categoria.linkColor}`}
                      >
                        {ricerca}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-3 pb-8 md:px-6 md:py-4 md:pb-10">
        <div className="rounded-[1.9rem] border border-blue-100 bg-[linear-gradient(180deg,#eff6ff_0%,#ffffff_40%,#f8fbff_100%)] p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Attività in evidenza
              </p>
              <h2 className="mt-2 text-2xl font-black text-slate-900 md:text-3xl">
                Alcuni negozi da visitare subito
              </h2>
            </div>

            <Link
              href="/negozi"
              className="inline-flex items-center gap-2 self-start rounded-full bg-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_-14px_rgba(37,99,235,0.5)] transition hover:bg-[#1d4ed8]"
            >
              Vedi tutti i negozi
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {negozi.map((negozio) => {
              const imageUrl = getNegozioCardImmagine({
                immagine: negozio.immagine,
                categoria: negozio.categoria,
              });

              return (
                <article
                  key={negozio.id}
                  className="group overflow-hidden rounded-2xl border border-blue-100/80 bg-white/86 transition backdrop-blur-sm hover:border-blue-300 hover:shadow-[0_16px_34px_-22px_rgba(37,99,235,0.36)]"
                >
                  <div className="relative aspect-video overflow-hidden bg-slate-100">
                    <div
                      role="img"
                      aria-label={`Fotografia del negozio ${negozio.nome}`}
                      className="h-full w-full bg-cover bg-center transition-transform duration-500 ease-out group-hover:scale-105"
                      style={{ backgroundImage: `url(${imageUrl})` }}
                    />
                    <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/65 via-black/10 to-transparent" />
                  </div>

                  <div className="p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#2563eb]">
                      {negozio.categoria}
                    </p>

                    <h3 className="mt-2 text-lg font-bold text-slate-900">
                      {negozio.nome}
                    </h3>

                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                      {negozio.descrizione}
                    </p>

                    <Link
                      href={`/negozio/${negozio.id}`}
                      className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[#0f172a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2563eb]"
                    >
                      Visualizza negozio
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
