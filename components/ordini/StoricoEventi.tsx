import {
  Ban,
  Bell,
  CheckCircle2,
  Hammer,
  Inbox,
  Mail,
  PackageCheck,
  PackagePlus,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { EventoOrdine, StatoOrdine } from "@/lib/cliente/types";
import { configStatoOrdine, formattaDataOraEvento } from "@/lib/cliente/ordini-format";
import { etichettaMotivoAnnullamento } from "@/lib/merchant/ordini-stati";
import { isStatoOrdine } from "@/lib/merchant/ordini-stati";

/** Mappa evento → icona professionale (fallback: Inbox). */
const ICONE_EVENTO: Record<string, LucideIcon> = {
  ordine_ricevuto: Inbox,
  in_preparazione: Bell,
  confermato: CheckCircle2,
  in_lavorazione: Hammer,
  pronto: PackageCheck,
  in_consegna: Truck,
  consegnato: PackagePlus,
  cancellato: Ban,
  email_stato_non_inviata: Mail,
  email_annullamento_non_inviata: Mail,
};

function iconaPerEvento(evento: string): LucideIcon {
  if (ICONE_EVENTO[evento]) return ICONE_EVENTO[evento];
  // Eventi legati a uno stato → stessa icona dello stato.
  if (isStatoOrdine(evento)) {
    return ICONE_EVENTO[evento] ?? Inbox;
  }
  return Inbox;
}

/**
 * Cronologia dell'ordine (dati REALI da ordini_eventi, mai inventati).
 * Timeline verticale professionale: icona, titolo, data/ora, eventuale nota;
 * l'ULTIMO evento è evidenziato; l'evento di annullamento è rosso con motivo.
 * Usata da Area Clienti e Area Venditore (stesso linguaggio visivo).
 */
export function StoricoEventi({ eventi }: { eventi: EventoOrdine[] }) {
  const ordinati = [...eventi].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );

  if (ordinati.length === 0) {
    return <p className="text-sm text-slate-500">Nessun evento registrato.</p>;
  }

  return (
    <ol className="relative space-y-1">
      {ordinati.map((ev, idx) => {
        const èUltimo = idx === 0;
        const èAnnullato = ev.evento === "cancellato";
        const èStato = isStatoOrdine(ev.evento);
        const dot = configStatoOrdine(ev.evento as StatoOrdine).dot;
        const Icona = iconaPerEvento(ev.evento);
        const èNonInviata = ev.evento.startsWith("email_") && ev.evento.includes("non_inviata");

        return (
          <li key={ev.id} className="relative flex gap-3.5 pb-5 last:pb-0">
            {/* Linea verticale (non dopo l'ultimo) */}
            {!èUltimo && (
              <span
                className="absolute left-[15px] top-9 bottom-0 w-px bg-slate-200"
                aria-hidden
              />
            )}

            {/* Icona evento */}
            <span
              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white shadow-sm ${
                èAnnullato
                  ? "bg-red-100 text-red-600"
                  : èNonInviata
                    ? "bg-amber-100 text-amber-600"
                    : èStato
                      ? `${dot} text-white`
                      : "bg-slate-100 text-slate-500"
              }`}
            >
              <Icona className="h-4 w-4" aria-hidden />
            </span>

            {/* Contenuto */}
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <p
                  className={`text-sm font-bold ${
                    èUltimo ? "text-slate-900" : "text-slate-700"
                  }`}
                >
                  {ev.dettaglio ?? ev.evento}
                </p>
                {èAnnullato && ev.motivo ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-200">
                    <Ban className="h-3 w-3" aria-hidden />
                    {etichettaMotivoAnnullamento(ev.motivo)}
                  </span>
                ) : null}
                {èUltimo ? (
                  <span className="inline-flex items-center rounded-full bg-slate-900 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                    Ultimo aggiornamento
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                {formattaDataOraEvento(ev.createdAt)}
              </p>
              {ev.nota && (
                <p className="mt-1 text-xs italic text-slate-500">“{ev.nota}”</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
