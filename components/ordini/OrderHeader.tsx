import type { ReactNode } from "react";
import { ReceiptText } from "lucide-react";
import type { StatoOrdine } from "@/lib/cliente/types";
import {
  configStatoOrdine,
  etichettaModalita,
  formattaDataOraCard,
} from "@/lib/cliente/ordini-format";
import { StatoBadge } from "./StatoBadge";

function formattaPrezzo(value: number): string {
  return `€${(value || 0).toFixed(2).replace(".", ",")}`;
}

/**
 * HEADER ORDINE — card di testa condivisa tra Area Clienti e Area Venditore.
 * Gerarchia professionale: numero ordine GRANDE, prodotto accanto, riga di
 * identità, badge stato ben visibile, data/ora e totale a destra.
 * Identificazione: numero leggibile + sintesi prodotto (MAI UUID).
 */
export function OrderHeader({
  numero,
  sintesi,
  stato,
  totale,
  createdAt,
  modalita,
  eyebrow,
  eyebrowClass = "text-blue-700",
  iconClass = "bg-blue-50 text-blue-600 ring-blue-100",
  identita,
  footer,
}: {
  numero: string;
  sintesi: string;
  stato: StatoOrdine;
  totale: number;
  createdAt: string;
  modalita: "ritiro" | "spedizione";
  eyebrow: string;
  eyebrowClass?: string;
  iconClass?: string;
  /** Riga di identità (negozio o cliente). */
  identita: ReactNode;
  /** Riga opzionale in fondo (es. link). */
  footer?: ReactNode;
}) {
  const èAnnullato = stato === "cancellato";
  // Banda superiore guidata dallo stato (colore professionale), MAI blu per
  // gli annullati e MAI verde/confermato per un annullato.
  const accentoBanda: Record<string, string> = {
    in_preparazione: "bg-linear-to-r from-yellow-300 via-yellow-400 to-yellow-300",
    confermato: "bg-linear-to-r from-blue-300 via-blue-400 to-blue-300",
    in_lavorazione: "bg-linear-to-r from-yellow-300 via-yellow-400 to-yellow-300",
    pronto: "bg-linear-to-r from-blue-300 via-blue-400 to-blue-300",
    in_consegna: "bg-linear-to-r from-blue-300 via-blue-400 to-blue-300",
    consegnato: "bg-linear-to-r from-blue-300 via-blue-400 to-blue-300",
    cancellato: "bg-linear-to-r from-blue-300 via-blue-400 to-blue-300",
  };

  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-sm">
      <div
        className={`h-1.5 ${accentoBanda[stato] ?? "bg-linear-to-r from-slate-200 via-slate-300 to-slate-200"}`}
      />
      <div className="p-6 md:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1 ${iconClass}`}
            >
              <ReceiptText className="h-7 w-7" aria-hidden />
            </span>
            <div className="min-w-0">
              <p
                className={`text-xs font-semibold uppercase tracking-[0.22em] ${eyebrowClass}`}
              >
                {eyebrow}
              </p>
              <h1 className="mt-1.5 break-words font-black leading-tight tracking-tight text-slate-900">
                <span
                  className={`break-words font-mono text-2xl tabular-nums md:text-3xl ${
                    èAnnullato ? "text-blue-700" : "text-slate-900"
                  }`}
                >
                  {numero}
                </span>
                {sintesi ? (
                  <span className="mt-0.5 block text-lg font-bold text-slate-500">
                    · {sintesi}
                  </span>
                ) : null}
              </h1>
              <div className="mt-2 text-sm text-slate-600">{identita}</div>
            </div>
          </div>

          <div className="flex shrink-0 items-start justify-between gap-6 sm:flex-col sm:items-end">
            <div className="text-right">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Totale ordine
              </p>
              <p className="mt-0.5 text-3xl font-black tracking-tight text-slate-900">
                {formattaPrezzo(totale)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatoBadge stato={stato} />
              <span className="text-xs text-slate-400">
                {etichettaModalita(modalita)} · {formattaDataOraCard(createdAt)}
              </span>
            </div>
          </div>
        </div>
        {footer ? <div className="mt-5 border-t border-slate-100 pt-4">{footer}</div> : null}
      </div>
    </div>
  );
}
