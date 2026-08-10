import type { EventoOrdine, StatoOrdine } from "@/lib/cliente/types";
import { configStatoOrdine, formattaDataOraEvento } from "@/lib/cliente/ordini-format";
import { etichettaMotivoAnnullamento } from "@/lib/merchant/ordini-stati";

/**
 * Cronologia dell'ordine (dati REALI da ordini_eventi, mai inventati).
 * Timeline con il più recente in alto; l'evento di annullamento è marcato
 * in rosso con il motivo, e il colore del puntino segue lo stato. Usata da
 * Area Clienti e Area Venditore (stesso linguaggio visivo).
 */
export function StoricoEventi({ eventi }: { eventi: EventoOrdine[] }) {
  const ordinati = [...eventi].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );

  if (ordinati.length === 0) {
    return <p className="text-sm text-slate-500">Nessun evento registrato.</p>;
  }

  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {ordinati.map((ev) => {
        const èAnnullato = ev.evento === "cancellato";
        const dot = configStatoOrdine(ev.evento as StatoOrdine).dot;
        return (
          <li key={ev.id} className="relative">
            <span
              className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white shadow ${dot}`}
              aria-hidden
            />
            <p className="text-sm font-bold text-slate-800">
              {ev.dettaglio ?? ev.evento}
              {èAnnullato && ev.motivo ? (
                <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                  {etichettaMotivoAnnullamento(ev.motivo)}
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              {formattaDataOraEvento(ev.createdAt)}
            </p>
            {ev.nota && (
              <p className="mt-1 text-xs italic text-slate-500">“{ev.nota}”</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
