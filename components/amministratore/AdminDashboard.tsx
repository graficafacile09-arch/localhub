import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BadgePercent,
  Bell,
  CalendarDays,
  Clock,
  Database,
  FolderTree,
  Package,
  Rocket,
  Server,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Users,
} from "lucide-react";
import type { ConteggiDashboard } from "@/lib/amministratore/data";
import ZonaPericolosaDashboard from "./ZonaPericolosaDashboard";

const formatNumero = new Intl.NumberFormat("it-IT");

/**
 * Dashboard Amministratore — Panoramica.
 * Riquadri con dati reali (0 se la sezione non è ancora disponibile),
 * attività recenti (placeholder), stato piattaforma (placeholder) e
 * accesso rapido ai moduli.
 */
export default function AdminDashboard({
  stats,
}: {
  stats: ConteggiDashboard;
}) {
  const tiles = [
    {
      key: "negozi" as const,
      label: "Attività",
      href: "/amministratore/attivita",
      icon: Store,
      gradient: "from-blue-500 to-blue-700",
      ring: "ring-blue-100",
      note: "attive sulla piattaforma",
    },
    {
      key: "prodotti" as const,
      label: "Prodotti",
      href: "/amministratore/prodotti",
      icon: Package,
      gradient: "from-emerald-500 to-emerald-700",
      ring: "ring-emerald-100",
      note: "nel catalogo attivo",
    },
    {
      key: "utenti" as const,
      label: "Utenti",
      href: "/amministratore/utenti",
      icon: Users,
      gradient: "from-violet-500 to-violet-700",
      ring: "ring-violet-100",
      note: "registrati alla piattaforma",
    },
    {
      key: "offerte" as const,
      label: "Offerte",
      href: "/amministratore/offerte",
      icon: BadgePercent,
      gradient: "from-amber-500 to-orange-600",
      ring: "ring-amber-100",
      note: "promozioni attive",
    },
    {
      key: "eventi" as const,
      label: "Eventi",
      href: "/amministratore/eventi",
      icon: CalendarDays,
      gradient: "from-rose-500 to-rose-700",
      ring: "ring-rose-100",
      note: "eventi in programma",
    },
    {
      key: "negoziInEvidenza" as const,
      label: "Negozi in evidenza",
      href: "/amministratore/negozi-in-evidenza",
      icon: Star,
      gradient: "from-yellow-400 to-amber-600",
      ring: "ring-amber-100",
      note: "in vetrina in homepage",
    },
    {
      key: "segnalazioni" as const,
      label: "Segnalazioni",
      href: "/amministratore/segnalazioni",
      icon: Bell,
      gradient: "from-red-500 to-red-700",
      ring: "ring-red-100",
      note: "in attesa di moderazione",
    },
  ];

  const statoPiattaforma = [
    {
      label: "Database",
      icon: Database,
      desc: "Connessione ai dati attiva",
      ok: true,
    },
    {
      label: "API",
      icon: Server,
      desc: "Endpoint di servizio operativi",
      ok: true,
    },
    {
      label: "Deploy",
      icon: Rocket,
      desc: "Ultimo rilascio in produzione",
      ok: true,
    },
  ];

  const statoPlaceholder = true;

  const accessoRapido = [
    {
      label: "Gestisci Attività",
      href: "/amministratore/attivita",
      icon: Store,
      gradient: "from-blue-500 to-blue-700",
      desc: "Elenco, stati e dettagli",
    },
    {
      label: "Gestisci Prodotti",
      href: "/amministratore/prodotti",
      icon: Package,
      gradient: "from-emerald-500 to-emerald-700",
      desc: "Catalogo e moderazione",
    },
    {
      label: "Gestisci Utenti",
      href: "/amministratore/utenti",
      icon: Users,
      gradient: "from-violet-500 to-violet-700",
      desc: "Profili e ruoli",
    },
    {
      label: "Categorie",
      href: "/amministratore/categorie",
      icon: FolderTree,
      gradient: "from-amber-500 to-orange-600",
      desc: "Organizzazione del catalogo",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Dashboard Amministratore
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Panoramica
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              I numeri chiave della piattaforma LocalHub, aggiornati in tempo
              reale dai dati del database. Le sezioni non ancora attive
              mostrano il valore 0.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-2xl bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-100">
            <Clock className="h-4 w-4 text-blue-600" aria-hidden />
            Aggiornato:{" "}
            {new Date().toLocaleString("it-IT", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const valore = stats[tile.key];
          return (
            <Link
              key={tile.key}
              href={tile.href}
              className="group relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div
                className={`absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br ${tile.gradient} opacity-[0.07] transition-opacity duration-300 group-hover:opacity-[0.14]`}
                aria-hidden
              />
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${tile.gradient} text-white shadow-md`}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                {tile.label}
              </p>
              <p className="mt-1.5 text-3xl font-black tracking-tight text-slate-900">
                {formatNumero.format(valore)}
              </p>
              <p className="mt-1.5 text-[11px] leading-4 text-slate-400">
                {tile.note}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-600 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                Apri
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </span>
            </Link>
          );
        })}

        {/* Categorie extra tile */}
        <Link
          href="/amministratore/categorie"
          className="group relative overflow-hidden rounded-[1.75rem] border border-dashed border-slate-200 bg-white/60 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-md">
            <FolderTree className="h-5 w-5" aria-hidden />
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Categorie
          </p>
          <p className="mt-1.5 text-3xl font-black tracking-tight text-slate-900">
            {formatNumero.format(stats.categorie)}
          </p>
          <p className="mt-1.5 text-[11px] leading-4 text-slate-400">
            categorie attive nel catalogo
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-600 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            Apri
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        </Link>
      </div>

      {/* Secondary sections grid */}
      <div className="grid gap-5 lg:grid-cols-5">
        {/* Recent activity */}
        <section className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-black tracking-tight text-slate-900">
              Attività recenti
            </h2>
            <Link
              href="/amministratore/registro-attivita"
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 transition hover:text-blue-700"
            >
              Registro attività
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] uppercase tracking-[0.12em] text-slate-400">
                  <th className="px-4 py-3 font-semibold">Evento</th>
                  <th className="px-4 py-3 font-semibold">Sezione</th>
                  <th className="px-4 py-3 font-semibold">Data</th>
                  <th className="px-4 py-3 font-semibold">Stato</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-12 text-center text-slate-400"
                  >
                    <Activity
                      className="mx-auto h-8 w-8 text-slate-200"
                      aria-hidden
                    />
                    <p className="mt-3 text-sm font-semibold text-slate-500">
                      Nessuna attività registrata
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Il registro si popolerà con le prossime fasi del pannello.
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Platform status */}
        <section className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-black tracking-tight text-slate-900">
            Stato della piattaforma
          </h2>

          <ul className="mt-4 space-y-3">
            {statoPiattaforma.map((voce) => {
              const Icon = voce.icon;
              return (
                <li
                  key={voce.label}
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-3"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-100">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800">
                      {voce.label}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      {voce.desc}
                    </p>
                  </div>
                  {voce.ok ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                      Operativo
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-amber-100">
                      <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                      In verifica
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {statoPlaceholder && (
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-blue-50/60 px-4 py-3 text-xs leading-5 text-blue-900 ring-1 ring-blue-100">
              <Sparkles
                className="mt-0.5 h-4 w-4 shrink-0 text-blue-600"
                aria-hidden
              />
              Stato indicativo: la verifica automatica arriverà con le
              prossime fasi del pannello.
            </p>
          )}
        </section>
      </div>

      {/* Quick access */}
      <section className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-blue-600" aria-hidden />
          <h2 className="text-sm font-black tracking-tight text-slate-900">
            Accesso rapido
          </h2>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {accessoRapido.map((azione) => {
            const Icon = azione.icon;
            return (
              <Link
                key={azione.label}
                href={azione.href}
                className="group flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-100 hover:bg-white hover:shadow-md"
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${azione.gradient} text-white shadow-md transition-transform duration-200 group-hover:scale-105`}
                >
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-slate-900">
                    {azione.label}
                  </span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {azione.desc}
                  </span>
                </span>
                <ArrowRight
                  className="ml-auto h-4 w-4 shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-blue-600"
                  aria-hidden
                />
              </Link>
            );
          })}
        </div>
      </section>

      {/* Zona Pericolosa */}
      <ZonaPericolosaDashboard />
    </div>
  );
}
