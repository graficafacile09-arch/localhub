"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock,
  Database,
  RefreshCw,
  Server,
  Zap,
} from "lucide-react";

type StatisticheOggi = {
  totale: number;
  cacheHit: number;
  cacheHitPercent: number;
  errori: number;
  errorPercent: number;
  tempoMedio: number;
  ultimaOra: number;
  distribuzioneProvider: { provider: string; count: number }[];
};

type ScansioneRecente = {
  id: string;
  provider: string;
  responseTimeMs: number;
  confidence: number | null;
  cacheHit: boolean;
  status: string;
  errorCode: string | null;
  createdAt: string;
};

type StatsData = {
  oggi: StatisticheOggi;
  recenti: ScansioneRecente[];
};

/**
 * Monitoraggio delle scansioni AI della piattaforma — Area Amministratore.
 * Funzione di amministrazione spostata dall'area commerciante.
 */
export default function ScansioniPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchStats() {
    try {
      const res = await fetch("/api/amministratore/scansioni");
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? "Errore nel caricamento");
      }
      const json = await res.json();
      setData(json.data);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Caricamento iniziale intenzionale + refresh periodico (pattern di
    // data-fetching standard: gli stati vengono aggiornati dopo l'await).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats();
    const interval = setInterval(() => { void fetchStats(); }, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
          <p className="text-sm text-slate-500">Caricamento statistiche...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-blue-500" />
        <p className="mt-2 text-sm font-semibold text-blue-700">Errore</p>
        <p className="mt-1 text-xs text-blue-600">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { oggi, recenti } = data;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-white/70 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Amministrazione
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
              Scansioni AI
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Monitoraggio in tempo reale delle scansioni AI della piattaforma
            </p>
          </div>
          <button
            type="button"
            onClick={fetchStats}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200"
            title="Aggiorna"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Card statistiche */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Zap}
          label="Scansioni oggi"
          value={String(oggi.totale)}
          sub={`${oggi.ultimaOra} nell'ultima ora`}
          accent="text-blue-700"
        />
        <StatCard
          icon={Database}
          label="Cache hit"
          value={`${oggi.cacheHitPercent}%`}
          sub={`${oggi.cacheHit} su ${oggi.totale} scansioni`}
          accent="text-blue-700"
        />
        <StatCard
          icon={Clock}
          label="Tempo medio"
          value={oggi.tempoMedio > 0 ? `${(oggi.tempoMedio / 1000).toFixed(1)}s` : "—"}
          sub={`${oggi.totale > 0 ? "su scansioni riuscite" : "nessun dato"}`}
          accent="text-yellow-700"
        />
        <StatCard
          icon={AlertTriangle}
          label="Errori"
          value={`${oggi.errorPercent}%`}
          sub={`${oggi.errori} errori su ${oggi.totale} scansioni`}
          accent={oggi.errori > 0 ? "text-blue-700" : "text-slate-500"}
        />
      </div>

      {/* Distribuzione provider */}
      {oggi.distribuzioneProvider.length > 0 && (
        <div className="rounded-2xl border border-white/70 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-slate-500" />
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Provider utilizzati
            </p>
          </div>
          <div className="mt-4 space-y-2">
            {oggi.distribuzioneProvider.map((p) => {
              const percent =
                oggi.totale > 0
                  ? Math.round((p.count / oggi.totale) * 100)
                  : 0;
              return (
                <div key={p.provider} className="flex items-center gap-3">
                  <span className="w-24 text-xs font-semibold text-slate-700">
                    {p.provider}
                  </span>
                  <div className="flex-1">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-16 text-right text-xs font-bold text-slate-600">
                    {p.count} ({percent}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ultime scansioni */}
      <div className="rounded-2xl border border-white/70 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-slate-500" />
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Scansioni recenti
          </p>
        </div>
        {recenti.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">Nessuna scansione recente.</p>
        ) : (
          <div className="mt-4 space-y-1">
            {recenti.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-xs transition hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      s.status === "success"
                        ? "bg-blue-500"
                        : s.status === "rate_limited"
                          ? "bg-yellow-500"
                          : "bg-blue-500"
                    }`}
                  />
                  <span className="font-medium text-slate-700">{s.provider}</span>
                  {s.cacheHit && (
                    <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                      CACHE
                    </span>
                  )}
                  {s.confidence !== null && (
                    <span
                      className={`font-semibold ${
                        s.confidence >= 60 ? "text-blue-600" : "text-yellow-600"
                      }`}
                    >
                      {s.confidence}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-slate-400">
                  <span>{s.responseTimeMs > 0 ? `${(s.responseTimeMs / 1000).toFixed(1)}s` : "—"}</span>
                  <span>
                    {new Date(s.createdAt).toLocaleTimeString("it-IT", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info limiti */}
      <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-xs text-yellow-900">
        <p className="font-semibold">Limiti attuali</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-yellow-800">
          <li>
            Rate limit:{" "}
            <strong>{process.env.NEXT_PUBLIC_RATE_LIMIT_MIN ?? 60}</strong> scan/minuto,
            <strong> {process.env.NEXT_PUBLIC_RATE_LIMIT_HOUR ?? 1000}</strong> scan/ora
          </li>
          <li>Gemini Free: 1.500 richieste al giorno</li>
          <li>Cache attiva: le immagini simili vengono riconosciute senza chiamare l&apos;AI</li>
        </ul>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
          {label}
        </p>
        <Icon className="h-4 w-4 text-slate-300" />
      </div>
      <p className={`mt-2 text-3xl font-black tracking-tight ${accent}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{sub}</p>
    </div>
  );
}
