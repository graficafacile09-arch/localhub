"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  ChevronLeft,
  Loader2,
  RotateCcw,
  Search,
} from "lucide-react";
import type { AdminActivityLog, AdminActivityStats, AdminActivityFiltri } from "@/lib/amministratore/activity-log";

const OPERATION_LABELS: Record<string, string> = {
  negozio_creato: "Negozio creato",
  negozio_modificato: "Negozio modificato",
  negozio_cestinato: "Negozio cestinato",
  negozio_ripristinato: "Negozio ripristinato",
  negozio_eliminato_definitivo: "Negozio eliminato definitivamente",
  prodotto_creato: "Prodotto creato",
  prodotto_modificato: "Prodotto modificato",
  prodotto_eliminato: "Prodotto eliminato",
  offerta_creata: "Offerta creata",
  offerta_modificata: "Offerta modificata",
  offerta_eliminata: "Offerta eliminata",
  evento_creato: "Evento creato",
  evento_modificato: "Evento modificato",
  evento_eliminato: "Evento eliminato",
  categoria_creata: "Categoria creata",
  categoria_modificata: "Categoria modificata",
  categoria_eliminata: "Categoria eliminata",
  impostazioni_modificate: "Impostazioni modificate",
  utente_modificato: "Utente modificato",
  negozio_in_evidenza_modificato: "In evidenza modificato",
  template_creato: "Template creato",
  template_modificato: "Template modificato",
  template_eliminato: "Template eliminato",
  ordine_cestinato: "Ordine cestinato",
  ordine_ripristinato: "Ordine ripristinato",
  ordine_eliminato_definitivo: "Ordine eliminato definitivamente",
};

const TARGET_LABELS: Record<string, string> = {
  negozio: "Negozio",
  prodotto: "Prodotto",
  offerta: "Offerta",
  evento: "Evento",
  categoria: "Categoria",
  utente: "Utente",
  impostazioni: "Impostazioni",
  negozio_in_evidenza: "In evidenza",
  template: "Template",
  ordine: "Ordine",
};

function formattaData(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getOperationLabel(type: string): string {
  return OPERATION_LABELS[type] ?? type;
}

function getTargetLabel(type: string): string {
  return TARGET_LABELS[type] ?? type;
}

export default function RegistroAttivitaModule() {
  const [attivita, setAttivita] = useState<AdminActivityLog[]>([]);
  const [stats, setStats] = useState<AdminActivityStats | null>(null);
  const [totale, setTotale] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const [filtri, setFiltri] = useState<AdminActivityFiltri>({
    limit: 50,
    offset: 0,
  });
  const [ricerca, setRicerca] = useState("");
  const [operationType, setOperationType] = useState("");
  const [targetType, setTargetType] = useState("");
  const [negozioId, setNegozioId] = useState("");
  const [dataDa, setDataDa] = useState("");
  const [dataA, setDataA] = useState("");
  const [result, setResult] = useState<"success" | "error" | "">("");

  const caricaDati = useCallback(async () => {
    setIsLoading(true);
    setErrore(null);
    const params = new URLSearchParams();
    if (filtri.ricerca) params.set("q", filtri.ricerca);
    if (filtri.operationType) params.set("operationType", filtri.operationType);
    if (filtri.targetType) params.set("targetType", filtri.targetType);
    if (filtri.negozioId) params.set("negozioId", filtri.negozioId);
    if (filtri.dataDa) params.set("dataDa", filtri.dataDa);
    if (filtri.dataA) params.set("dataA", filtri.dataA);
    if (filtri.result) params.set("result", filtri.result);
    params.set("limit", String(filtri.limit ?? 50));
    params.set("offset", String(filtri.offset ?? 0));

    try {
      const res = await fetch(`/api/amministratore/registro-attivita?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        attivita?: AdminActivityLog[];
        totale?: number;
        stats?: AdminActivityStats | null;
        data?: {
          attivita?: AdminActivityLog[];
          totale?: number;
          stats?: AdminActivityStats | null;
        };
      };
      // L'API restituisce { success: true, data: { attivita, totale, stats } }.
      // Fallback sulla vecchia forma piatta per compatibilità.
      const payload = json?.data ?? json;
      setAttivita(payload.attivita ?? []);
      setTotale(payload.totale ?? 0);
      setStats(payload.stats ?? null);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore caricamento registro");
    } finally {
      setIsLoading(false);
    }
  }, [filtri]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    caricaDati();
  }, [caricaDati]);

  const applicaFiltri = useCallback(() => {
    setFiltri((prev) => ({
      ...prev,
      ricerca: ricerca || undefined,
      operationType: operationType || undefined,
      targetType: targetType || undefined,
      negozioId: negozioId || undefined,
      dataDa: dataDa || undefined,
      dataA: dataA || undefined,
      result: result || undefined,
      offset: 0,
    }));
  }, [ricerca, operationType, targetType, negozioId, dataDa, dataA, result]);

  const azzeraFiltri = useCallback(() => {
    setRicerca("");
    setOperationType("");
    setTargetType("");
    setNegozioId("");
    setDataDa("");
    setDataA("");
    setResult("");
    setFiltri((prev) => ({ ...prev, offset: 0 }));
  }, []);

  const paginaSuccessiva = useCallback(() => {
    if ((filtri.offset ?? 0) + (filtri.limit ?? 50) < totale) {
      setFiltri((prev) => ({ ...prev, offset: (prev.offset ?? 0) + (prev.limit ?? 50) }));
    }
  }, [filtri, totale]);

  const paginaPrecedente = useCallback(() => {
    if ((filtri.offset ?? 0) > 0) {
      setFiltri((prev) => ({ ...prev, offset: Math.max(0, (prev.offset ?? 0) - (prev.limit ?? 50)) }));
    }
  }, [filtri]);

  const tipiOperazione = useMemo(() => {
    const tipi = new Set<string>();
    stats?.perTipoOperazione.forEach((t) => tipi.add(t.tipo));
    return Array.from(tipi).sort();
  }, [stats]);

  const tipiRisorsa = useMemo(() => {
    const tipi = new Set<string>();
    stats?.perRisorsa.forEach((t) => tipi.add(t.tipo));
    return Array.from(tipi).sort();
  }, [stats]);

  const haFiltriAttivi = ricerca || operationType || targetType || negozioId || dataDa || dataA || result;

  return (
    <div className="space-y-5">
      <div className="card p-6 md:p-8">
        <nav aria-label="Percorso" className="mb-5">
          <button
            type="button"
            onClick={() => (window.location.href = "/amministratore")}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 transition hover:text-blue-800"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Torna al pannello
          </button>
        </nav>

        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-yellow-50 text-yellow-600 ring-1 ring-yellow-100">
            <RotateCcw className="h-7 w-7" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-yellow-700">
              Amministrazione
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Registro attività
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Cronologia delle operazioni amministrative eseguite sulla piattaforma.
              Filtra per tipo, risorsa, negozio o periodo per trovare rapidamente
              l&#8217;azione desiderata.
            </p>
          </div>
        </div>
      </div>

      <div className="card p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              type="search"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applicaFiltri()}
              placeholder="Cerca per operazione, risorsa, email, negozio..."
              aria-label="Cerca nel registro"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm font-medium text-slate-700 placeholder:text-slate-400 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={operationType}
              onChange={(e) => setOperationType(e.target.value)}
              onBlur={applicaFiltri}
              className="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-700 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Tutte le operazioni</option>
              {tipiOperazione.map((t) => (
                <option key={t} value={t}>
                  {getOperationLabel(t)}
                </option>
              ))}
            </select>

            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              onBlur={applicaFiltri}
              className="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-700 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Tutte le risorse</option>
              {tipiRisorsa.map((t) => (
                <option key={t} value={t}>
                  {getTargetLabel(t)}
                </option>
              ))}
            </select>

            <select
              value={result}
              onChange={(e) => setResult(e.target.value as "success" | "error" | "")}
              onBlur={applicaFiltri}
              className="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-700 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Tutti i risultati</option>
              <option value="success">✓ Successo</option>
              <option value="error">✗ Errore</option>
            </select>

            <div className="relative">
              <Calendar
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                type="date"
                value={dataDa}
                onChange={(e) => setDataDa(e.target.value)}
                onBlur={applicaFiltri}
                placeholder="Dal"
                className="h-10 w-full sm:w-[150px] rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm font-medium text-slate-700 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="relative">
              <Calendar
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                type="date"
                value={dataA}
                onChange={(e) => setDataA(e.target.value)}
                onBlur={applicaFiltri}
                placeholder="Al"
                className="h-10 w-full sm:w-[150px] rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm font-medium text-slate-700 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
        </div>

        {(haFiltriAttivi || (filtri.offset ?? 0) > 0) && (
          <button
            type="button"
            onClick={azzeraFiltri}
            className="mt-2 text-xs font-semibold text-blue-600 underline-offset-2 transition hover:underline"
          >
            Azzera filtri
          </button>
        )}
      </div>

      {errore && (
        <div className="rounded-3xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
          {errore}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-[2rem] border border-white/70 bg-white shadow-sm md:h-[50vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
        </div>
      ) : attivita.length === 0 ? (
        <div className="rounded-[2rem] border border-slate-100 bg-white px-6 py-16 text-center shadow-sm">
          <RotateCcw className="h-10 w-10 mx-auto text-slate-200" aria-hidden />
          <p className="mt-4 text-lg font-bold text-slate-600">Nessuna attività trovata</p>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            {haFiltriAttivi
              ? "Prova a modificare i filtri selezionati."
              : "Il registro attività è vuoto."}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-[2rem] border border-white/70 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" role="table">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Data/Ora</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Admin</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Operazione</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Risorsa</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Negozio</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Risultato</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Dettaglio</th>
                  </tr>
                </thead>
                <tbody>
                  {attivita.map((riga) => (
                    <tr key={riga.id} className="border-b border-slate-100/50 hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-sm font-mono text-slate-700 whitespace-nowrap">
                        {formattaData(riga.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <div className="font-medium">{riga.admin_email ?? "—"}</div>
                        <div className="text-xs text-slate-400">{riga.admin_user_id?.slice(0, 8)}…</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">
                          {getOperationLabel(riga.operation_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2.5 py-0.5 text-[11px] font-semibold text-yellow-700 ring-1 ring-yellow-100">
                          {getTargetLabel(riga.target_type)}
                        </span>
                        {riga.target_name && (
                          <div className="mt-1 text-xs text-slate-500 truncate max-w-xs">{riga.target_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {riga.negozio_nome ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">
                            {riga.negozio_nome}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {riga.result === "success" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden />
                            Successo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden />
                            Errore
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 max-w-md">
                        {riga.detail && Object.keys(riga.detail).length > 0 ? (
                          <pre className="text-[11px] font-mono bg-slate-50 rounded p-2 max-h-20 overflow-auto">
                            {JSON.stringify(riga.detail, null, 2)}
                          </pre>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(totale > (filtri.limit ?? 50)) && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
                <p className="text-sm font-medium text-slate-700">
                  Mostrati {Math.min((filtri.offset ?? 0) + (filtri.limit ?? 50), totale)} di {totale} record
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={paginaPrecedente}
                    disabled={(filtri.offset ?? 0) === 0}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                    Precedente
                  </button>
                  <button
                    type="button"
                    onClick={paginaSuccessiva}
                    disabled={(filtri.offset ?? 0) + (filtri.limit ?? 50) >= totale}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Successiva
                    <ChevronLeft className="h-4 w-4 rotate-180" aria-hidden />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-3xl border border-yellow-100 bg-yellow-50/60 px-5 py-4 text-sm text-yellow-900">
            <p className="leading-6">
              <span className="font-bold">Nota:</span> il registro mostra le operazioni eseguite
              dall&#8217;area amministratore. I dati vengono registrati automaticamente
              quando un amministratore crea, modifica o elimina negozi, prodotti,
              offerte, eventi, categorie, template, utenti o impostazioni.
            </p>
          </div>
        </>
      )}
    </div>
  );
}