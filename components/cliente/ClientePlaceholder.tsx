import { Construction, Timer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ClienteEmptyState from "./ClienteEmptyState";

/**
 * Pagina placeholder professionale dei moduli dell'Area Clienti.
 * Grafica identica per ogni modulo: in questa fase fornisce solo
 * la struttura, senza logica, query o CRUD.
 */
export default function ClientePlaceholder({
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
              Area Clienti
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              {description}
            </p>

            <div className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-yellow-50 px-4 py-2 text-sm font-semibold text-yellow-800 ring-1 ring-yellow-200">
              <Timer className="h-4 w-4" aria-hidden />
              Modulo in preparazione
            </div>
          </div>
        </div>
      </div>

      {/* ── Pannello struttura pronta ────────────────────────────────────────── */}
      <ClienteEmptyState
        title="Sezione pronta, in attesa delle funzionalità"
        description="La struttura di questo modulo è predisposta: sarà collegata al database e alle API nelle prossime fasi."
        icon={Construction}
      />
    </div>
  );
}
