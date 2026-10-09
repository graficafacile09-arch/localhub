"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Save, Wrench } from "lucide-react";

type MaintenanceState = {
  enabled: boolean;
  message: string;
  updatedAt?: string | null;
};

type ApiResponse = {
  success?: boolean;
  data?: {
    production?: MaintenanceState;
    enabled?: boolean;
    message?: string;
    updatedAt?: string | null;
    target?: string;
  };
  error?: { message?: string };
};

const DEFAULT_MESSAGE =
  "Stiamo lavorando per migliorare il servizio. Ci scusiamo per il disagio e torneremo online al più presto.";

export default function ManutenzioneSitoCard() {
  const [stato, setStato] = useState<MaintenanceState>({
    enabled: true,
    message: DEFAULT_MESSAGE,
  });
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [esito, setEsito] = useState<{ testo: string; ok: boolean } | null>(null);
  const [testoMessaggio, setTestoMessaggio] = useState(DEFAULT_MESSAGE);

  useEffect(() => {
    let attivo = true;

    fetch("/api/amministratore/manutenzione", { cache: "no-store" })
      .then(async (response) => {
        const json = (await response.json().catch(() => null)) as ApiResponse | null;
        if (!response.ok) {
          throw new Error(
            json?.error?.message ?? "Impossibile leggere lo stato del sito pubblico."
          );
        }

        const value = json?.data?.production;
        if (!value || typeof value.enabled !== "boolean") {
          throw new Error("Il server non ha restituito lo stato del sito pubblico.");
        }

        if (attivo) {
          const message = value.message || DEFAULT_MESSAGE;
          setStato({ ...value, message });
          setTestoMessaggio(message);
        }
      })
      .catch((error: unknown) => {
        if (attivo) {
          setEsito({
            testo: error instanceof Error ? error.message : "Errore di caricamento.",
            ok: false,
          });
        }
      })
      .finally(() => {
        if (attivo) setCaricamento(false);
      });

    return () => {
      attivo = false;
    };
  }, []);

  const salva = async (enabled: boolean, message = testoMessaggio) => {
    setSalvataggio(true);
    setEsito(null);

    try {
      const response = await fetch("/api/amministratore/manutenzione", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "production", enabled, message }),
      });

      const json = (await response.json().catch(() => null)) as ApiResponse | null;
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Salvataggio non riuscito.");
      }

      const value = json?.data;
      if (value?.target !== "production" || typeof value.enabled !== "boolean") {
        throw new Error("Il server non ha confermato lo stato del sito pubblico.");
      }

      const next = {
        enabled: value.enabled,
        message: value.message ?? message,
        updatedAt: value.updatedAt ?? null,
      };

      setStato(next);
      setTestoMessaggio(next.message);
      setEsito({
        testo: enabled
          ? "www.incitta.online è in manutenzione."
          : "www.incitta.online è online.",
        ok: true,
      });
    } catch (error) {
      setEsito({
        testo: error instanceof Error ? error.message : "Errore di salvataggio.",
        ok: false,
      });
    } finally {
      setSalvataggio(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-slate-100 px-6 py-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
          <Wrench className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black tracking-tight text-slate-900">
            Manutenzione sito
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Gestisci soltanto lo stato ON LINE / OFF LINE e il messaggio mostrato durante la manutenzione.
          </p>
        </div>
      </header>

      <div className="space-y-5 px-6 py-5">
        {esito && (
          <p
            role="status"
            className={`rounded-2xl border px-4 py-3 text-sm ${
              esito.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {esito.testo}
          </p>
        )}

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-slate-900">www.incitta.online</h3>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                Questo comando gestisce esclusivamente l'accessibilità del sito pubblico.
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                stato.enabled
                  ? "bg-amber-100 text-amber-900"
                  : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {caricamento
                ? "Caricamento…"
                : stato.enabled
                  ? "OFF LINE · manutenzione"
                  : "ON LINE"}
            </span>
          </div>

          <label className="mt-4 block">
            <span className="text-sm font-bold text-slate-800">
              Messaggio in manutenzione
            </span>
            <textarea
              value={testoMessaggio}
              onChange={(event) => setTestoMessaggio(event.target.value)}
              maxLength={500}
              rows={2}
              disabled={caricamento || salvataggio}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-100 disabled:opacity-60"
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => salva(stato.enabled, testoMessaggio)}
              disabled={
                caricamento || salvataggio || testoMessaggio.trim().length < 5
              }
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {salvataggio ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              Salva messaggio
            </button>

            <button
              type="button"
              onClick={() => salva(!stato.enabled)}
              disabled={caricamento || salvataggio}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50 ${
                stato.enabled
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-amber-400 text-slate-950 hover:bg-amber-300"
              }`}
            >
              {salvataggio ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 className="h-4 w-4" aria-hidden />
              )}
              {stato.enabled ? "METTI ON LINE" : "METTI OFF LINE"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
