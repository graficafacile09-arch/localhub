import {
  Construction,
  Database,
  ListChecks,
  Settings2,
  Sparkles,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Pagina placeholder professionale del pannello Amministratore.
 * Grafica identica per ogni modulo: in questa fase fornisce solo
 * la struttura, senza logica, query o CRUD.
 */
export default function AdminPlaceholder({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-5">
      {/* ── Intestazione modulo ─────────────────────────────────────────────── */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Icon className="h-7 w-7" aria-hidden />
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Pannello Amministratore
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              {description}
            </p>

            <div className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
              <Timer className="h-4 w-4" aria-hidden />
              Modulo in preparazione
            </div>
          </div>
        </div>
      </div>

      {/* ── Pannello struttura pronta ────────────────────────────────────────── */}
      <div className="rounded-[2rem] border-2 border-dashed border-slate-200 bg-white/70 p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Construction className="h-8 w-8" aria-hidden />
        </div>
        <p className="mt-5 text-base font-bold text-slate-700">
          Sezione pronta, in attesa delle funzionalità
        </p>
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-slate-500">
          Questa area è solo la struttura del pannello Amministratore.
          Le funzionalità reali verranno attivate nelle prossime fasi.
        </p>
      </div>

      {/* ── Anteprima dei blocchi futuri ─────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/70 bg-white p-5 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <Database className="h-5 w-5" aria-hidden />
          </div>
          <p className="mt-4 text-sm font-bold text-slate-800">
            Dati in arrivo
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Elenchi e dettagli verranno popolati con i dati della piattaforma.
          </p>
        </div>

        <div className="rounded-3xl border border-white/70 bg-white p-5 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <ListChecks className="h-5 w-5" aria-hidden />
          </div>
          <p className="mt-4 text-sm font-bold text-slate-800">
            Azioni di gestione
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Creazione, modifica e moderazione saranno disponibili qui.
          </p>
        </div>

        <div className="rounded-3xl border border-white/70 bg-white p-5 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <Settings2 className="h-5 w-5" aria-hidden />
          </div>
          <p className="mt-4 text-sm font-bold text-slate-800">
            Configurazione futura
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Preferenze e impostazioni specifiche del modulo.
          </p>
        </div>
      </div>

      {/* ── Nota di stato ────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-3xl border border-blue-100 bg-blue-50/60 px-5 py-4 text-sm text-blue-900">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
        <p className="leading-6">
          <span className="font-bold">Stato attuale:</span> architettura del
          pannello completata. Nessuna modifica a homepage, API, database o
          autenticazione.
        </p>
      </div>
    </div>
  );
}
