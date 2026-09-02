"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BadgePercent,
  Bot,
  CalendarDays,
  Database,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import type { DatiDashboard } from "@/lib/amministratore/dashboard-queries";

/**
 * Panoramica — Dashboard Amministratore.
 * KPI e grafici REALI dal database (negozi demo e utenti di test esclusi).
 * Nessun numero inventato: ogni valore proviene da /api/amministratore/dashboard.
 */
export default function DashboardPage() {
  const [data, setData] = useState<DatiDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ultimoAggiornamento, setUltimoAggiornamento] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/amministratore/dashboard");
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Errore nel caricamento della dashboard.");
      }
      const json = await res.json();
      setData(json.data?.dashboard ?? null);
      setUltimoAggiornamento(new Date().toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Caricamento iniziale intenzionale (data-fetching standard).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[400px] items-center justify-center card shadow-sm">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
          <p className="text-sm text-slate-500">Caricamento dati piattaforma...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-3xl border border-blue-200 bg-blue-50 p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-blue-500" />
        <p className="mt-2 text-sm font-semibold text-blue-700">Errore</p>
        <p className="mt-1 text-xs text-blue-600">{error}</p>
        <button
          type="button"
          onClick={() => { setLoading(true); void fetchDashboard(); }}
          className="btn-cta mt-4 px-4 py-2 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Riprova
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { kpi, grafici, ultimiNegozi, ultimiUtenti, ultimeAttivita, statoPiattaforma } = data;
  const totaleScansioni = grafici.scansioniSettimana.reduce((acc, g) => acc + g.count, 0);

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="card p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <Activity className="h-7 w-7" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
                Pannello Amministratore
              </p>
              <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
                Panoramica
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Stato generale della piattaforma LocalHub, con dati reali dal database.
              </p>
              {ultimoAggiornamento && (
                <p className="mt-2 text-[11px] font-semibold text-slate-400">
                  Aggiornato alle {ultimoAggiornamento}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setLoading(true); void fetchDashboard(); }}
            disabled={loading}
            title="Aggiorna i dati"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-100 text-yellow-700 transition hover:bg-yellow-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {data.avvisi.length > 0 && (
        <section className="rounded-3xl border border-yellow-200 bg-yellow-50 p-5 text-yellow-900 shadow-sm" role="status">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" aria-hidden />
            <div>
              <h2 className="text-sm font-black">Fonti dati parzialmente disponibili</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
                {data.avvisi.map((avviso) => <li key={avviso}>{avviso}</li>)}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* ── KPI ────────────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard icon={Users} label="Utenti totali" value={kpi.utenti} sub="account registrati" accent={{ bg: "bg-blue-50", text: "text-blue-600" }} />
        <KpiCard icon={ShoppingBag} label="Commercianti" value={kpi.commercianti} sub="con ruolo venditore" accent={{ bg: "bg-blue-50", text: "text-blue-600" }} />
        <KpiCard icon={UserRound} label="Clienti" value={kpi.clienti} sub="con ruolo cliente" accent={{ bg: "bg-blue-50", text: "text-blue-600" }} />
        <KpiCard icon={Store} label="Negozi attivi" value={kpi.negoziAttivi} sub={`${kpi.negoziSospesi} sospesi`} accent={{ bg: "bg-blue-50", text: "text-blue-600" }} />
        <KpiCard icon={Trash2} label="Nel cestino" value={kpi.negoziCestino} sub="ripristinabili" accent={{ bg: "bg-yellow-50", text: "text-yellow-600" }} />
        <KpiCard icon={Package} label="Prodotti" value={kpi.prodotti} sub="pubblicati e attivi" accent={{ bg: "bg-yellow-50", text: "text-yellow-600" }} />
        <KpiCard icon={BadgePercent} label="Offerte attive" value={kpi.offerteAttive} sub="elementi pubblicati" accent={{ bg: "bg-blue-50", text: "text-blue-600" }} />
        <KpiCard icon={CalendarDays} label="Eventi" value={kpi.eventi} sub="elementi pubblicati" accent={{ bg: "bg-blue-50", text: "text-blue-600" }} />
        <KpiCard icon={Activity} label="Scansioni AI oggi" value={kpi.scansioniOggi} sub={`${totaleScansioni} negli ultimi 7 giorni`} accent={{ bg: "bg-slate-100", text: "text-slate-600" }} />
        <KpiCard icon={ShieldCheck} label="Negozi reali" value={kpi.negoziAttivi + kpi.negoziSospesi} sub="dati demo esclusi" accent={{ bg: "bg-blue-50", text: "text-blue-600" }} />
      </div>

      {/* ── Grafici ────────────────────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-3">
        {/* Negozi per categoria */}
        <section className="card min-w-0 p-5 shadow-sm">
          <header className="flex items-center gap-2">
            <Store className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Negozi per categoria
            </h2>
          </header>
          {grafici.negoziPerCategoria.length === 0 ? (
            <EmptyChart message="Nessun negozio attivo" />
          ) : (
            <div className="mt-4 space-y-2.5">
              {grafici.negoziPerCategoria.map((riga) => {
                const max = grafici.negoziPerCategoria[0].count || 1;
                return (
                  <div key={riga.categoria} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-xs font-semibold text-slate-600">
                      {riga.categoria}
                    </span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
                        style={{ width: `${Math.max(6, (riga.count / max) * 100)}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs font-black tabular-nums text-slate-700">
                      {riga.count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Utenti per ruolo — donut */}
        <section className="card min-w-0 p-5 shadow-sm">
          <header className="flex items-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Utenti per ruolo
            </h2>
          </header>
          {grafici.utentiPerRuolo.length === 0 ? (
            <EmptyChart message="Nessun utente registrato" />
          ) : (
            <DonutRuoli dati={grafici.utentiPerRuolo} totale={kpi.utenti} />
          )}
        </section>

        {/* Scansioni ultimi 7 giorni */}
        <section className="card min-w-0 p-5 shadow-sm">
          <header className="flex items-center gap-2">
            <Activity className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Scansioni AI — ultimi 7 giorni
            </h2>
          </header>
          <AreaScansioni settimana={grafici.scansioniSettimana} />
        </section>
      </div>

      {/* ── Liste recenti ──────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ListaCard title="Ultimi negozi" icon={Store} href="/amministratore/attivita">
          {ultimiNegozi.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">Nessun negozio attivo</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {ultimiNegozi.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">{n.nome}</p>
                    <p className="truncate text-[11px] text-slate-400">
                      {n.categoria ?? "Senza categoria"}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold text-slate-400">
                    {formatData(n.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ListaCard>

        <ListaCard title="Ultimi utenti" icon={Users} href="/amministratore/utenti">
          {ultimiUtenti.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">Nessun utente registrato</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {ultimiUtenti.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">{u.nome}</p>
                    <p className="truncate text-[11px] text-slate-400">{u.email}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${stileRuolo[u.ruolo]}`}>
                    {etichettaRuolo[u.ruolo]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ListaCard>

        <ListaCard title="Ultime attività" icon={Activity} href="/amministratore/attivita">
          {ultimeAttivita.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">Nessuna attività recente</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {ultimeAttivita.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-2.5">
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconaTipo[a.tipo].bg}`}>
                    {iconaTipo[a.tipo].icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">{a.titolo}</p>
                    <p className="truncate text-[11px] text-slate-400">{a.descrizione}</p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold text-slate-400">
                    {formatData(a.data)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ListaCard>
      </div>

      {/* ── Stato piattaforma ──────────────────────────────────────────── */}
      <section className="card min-w-0 p-5 shadow-sm">
        <header className="flex items-center gap-2">
          <Database className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Stato generale piattaforma
          </h2>
        </header>
        <div className="mt-4 flex flex-wrap gap-2">
          <StatoChip ok={statoPiattaforma.database} etichetta="Database connesso" />
          <StatoChip ok={statoPiattaforma.filtroDemo} etichetta="Filtro dati demo attivo" />
          <StatoChip ok={statoPiattaforma.aiConfigurato} etichetta="AI visione configurata" />
          <StatoChip ok={true} etichetta={`Rate limit ${statoPiattaforma.rateLimitMin}/min`} />
          <StatoChip ok={statoPiattaforma.cacheVisione > 0} etichetta={`Cache visione: ${statoPiattaforma.cacheVisione} elementi`} />
          <StatoChip ok={Boolean(statoPiattaforma.ultimaScansione)} etichetta={statoPiattaforma.ultimaScansione ? `Ultima scansione ${formatDataOra(statoPiattaforma.ultimaScansione)}` : "Nessuna scansione registrata"} />
        </div>
      </section>
    </div>
  );
}

// ── Sotto-componenti ────────────────────────────────────────────────────────

const etichettaRuolo: Record<string, string> = {
  amministratore: "Admin",
  commerciante: "Venditore",
  utente: "Cliente",
};

const stileRuolo: Record<string, string> = {
  amministratore: "bg-blue-100 text-blue-700",
  commerciante: "bg-blue-100 text-blue-700",
  utente: "bg-slate-100 text-slate-600",
};

const iconaTipo: Record<string, { icon: React.ReactNode; bg: string }> = {
  negozio: { icon: <Store className="h-3.5 w-3.5 text-blue-600" aria-hidden />, bg: "bg-blue-50" },
  prodotto: { icon: <Package className="h-3.5 w-3.5 text-yellow-600" aria-hidden />, bg: "bg-yellow-50" },
  scansione: { icon: <Bot className="h-3.5 w-3.5 text-slate-600" aria-hidden />, bg: "bg-slate-100" },
};

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sub: string;
  accent: { bg: string; text: string };
}) {
  return (
    <div className="card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
          {label}
        </p>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${accent.bg}`}>
          <Icon className={`h-4 w-4 ${accent.text}`} aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-3xl font-black tabular-nums tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-slate-400">{sub}</p>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center">
      <p className="text-xs text-slate-400">{message}</p>
    </div>
  );
}

const COLORI_DONUT = ["#7c3aed", "#2563eb", "#64748b"];

function DonutRuoli({
  dati,
  totale,
}: {
  dati: { ruolo: string; count: number }[];
  totale: number;
}) {
  const segmenti = dati.map((d, i) => ({
    ...d,
    colore: COLORI_DONUT[i % COLORI_DONUT.length],
  }));
  // Calcolo puro degli angoli del donut (nessuna variabile riassegnata in render).
  const conAngoli = segmenti.reduce<{ colore: string; inizio: number; fine: number }[]>(
    (acc, s) => {
      const accumulo = acc.length > 0 ? acc[acc.length - 1].fine : 0;
      const inizio = (accumulo / Math.max(totale, 1)) * 360;
      const fine = ((accumulo + s.count) / Math.max(totale, 1)) * 360;
      return [...acc, { colore: s.colore, inizio, fine }];
    },
    []
  );
  const gradient = conAngoli.map((s) => `${s.colore} ${s.inizio}deg ${s.fine}deg`).join(", ");

  return (
    <div className="mt-4 flex items-center gap-5">
      <div
        className="relative h-32 w-32 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${gradient})` }}
        role="img"
        aria-label="Distribuzione utenti per ruolo"
      >
        <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-white">
          <p className="text-2xl font-black tabular-nums text-slate-900">{totale}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">utenti</p>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2">
        {segmenti.map((s) => (
          <li key={s.ruolo} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.colore }} />
            <span className="font-semibold text-slate-600">{etichettaRuolo[s.ruolo]}</span>
            <span className="ml-auto font-black tabular-nums text-slate-800">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AreaScansioni({
  settimana,
}: {
  settimana: { data: string; etichetta: string; count: number }[];
}) {
  const totale = settimana.reduce((acc, g) => acc + g.count, 0);

  if (totale === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <p className="text-xs text-slate-400">Nessuna scansione negli ultimi 7 giorni</p>
      </div>
    );
  }

  const larghezza = 300;
  const altezza = 120;
  const max = Math.max(...settimana.map((g) => g.count), 1);
  const punti = settimana.map((g, i) => {
    const x = (i / Math.max(settimana.length - 1, 1)) * larghezza;
    const y = altezza - (g.count / max) * (altezza - 14) - 6;
    return { x, y, ...g };
  });

  const linea = punti.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const area = `${linea} L ${larghezza} ${altezza} L 0 ${altezza} Z`;

  return (
    <div className="mt-2">
      <svg viewBox={`0 0 ${larghezza} ${altezza}`} className="h-36 w-full" role="img" aria-label="Andamento scansioni ultimi 7 giorni">
        <defs>
          <linearGradient id="grad-scansioni" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#grad-scansioni)" />
        <path d={linea} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {punti.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3.5" fill="#fff" stroke="#2563eb" strokeWidth="2" />
            <text x={p.x} y={altezza - 2} textAnchor="middle" className="fill-slate-400 text-[9px] font-semibold">
              {p.etichetta}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-1 text-center text-[11px] font-semibold text-slate-400">
        {totale} scansioni in 7 giorni
      </p>
    </div>
  );
}

function ListaCard({
  title,
  icon: Icon,
  href,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card min-w-0 p-5 shadow-sm">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <h2 className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {title}
          </h2>
        </div>
        <a href={href} className="shrink-0 text-[11px] font-bold text-blue-600 transition hover:text-blue-700 hover:underline">
          Vedi tutto
        </a>
      </header>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function StatoChip({ ok, etichetta }: { ok: boolean; etichetta: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ring-1 ${
        ok
          ? "bg-blue-50 text-blue-700 ring-blue-200"
          : "bg-yellow-50 text-yellow-700 ring-yellow-200"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-blue-500" : "bg-yellow-500"}`} aria-hidden />
      {etichetta}
    </span>
  );
}

function formatData(value: string): string {
  try {
    return new Date(value).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "—";
  }
}

function formatDataOra(value: string): string {
  try {
    return new Date(value).toLocaleString("it-IT", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}
