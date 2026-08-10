import type { ReactNode } from "react";
import { ReceiptText } from "lucide-react";
import type { StatoOrdine } from "@/lib/cliente/types";
import { etichettaModalita, formattaDataOraCard } from "@/lib/cliente/ordini-format";
import { StatoBadge } from "./StatoBadge";

function formattaPrezzo(value: number): string {
  return `€${(value || 0).toFixed(2).replace(".", ",")}`;
}

/**
 * HEADER ORDINE — card di testa condivisa tra Area Clienti e Area Venditore.
 * Identificazione: numero leggibile + sintesi prodotto (MAI UUID), poi la
 * riga di identità (negozio per il cliente / cliente per il venditore) e il
 * totale. Il badge stato usa configStatoOrdine (stessa identità visiva).
 */
export function OrderHeader({
  numero,
  sintesi,
  stato,
  totale,
  createdAt,
  modalita,
  eyebrow,
  eyebrowClass = "text-teal-700",
  iconClass = "bg-teal-50 text-teal-600 ring-teal-100",
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
  /** Riga di identità (negozio o cliente + data/ora). */
  identita: ReactNode;
  /** Riga opzionale in fondo (es. link al negozio). */
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
      <div className="flex items-start gap-4">
        <span
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1 ${iconClass}`}
        >
          <ReceiptText className="h-7 w-7" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`text-xs font-semibold uppercase tracking-[0.22em] ${eyebrowClass}`}
          >
            {eyebrow}
          </p>
          <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
            <span className="whitespace-nowrap">{numero}</span>
            {sintesi ? (
              <span className="ml-2 font-bold text-slate-500">· {sintesi}</span>
            ) : null}
          </h1>
          <div className="mt-2 text-sm text-slate-600">{identita}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatoBadge stato={stato} />
            <span className="text-xs text-slate-400">
              {etichettaModalita(modalita)} · {formattaDataOraCard(createdAt)}
            </span>
          </div>
          {footer ? <div className="mt-3">{footer}</div> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Totale
          </p>
          <p className="mt-1 text-2xl font-black text-slate-900">
            {formattaPrezzo(totale)}
          </p>
        </div>
      </div>
    </div>
  );
}
