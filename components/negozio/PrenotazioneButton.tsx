"use client";

import { useState } from "react";
import { CalendarCheck, X } from "lucide-react";
import type { ConfigPrenotazioni, ServizioStrutturato } from "@/types/negozio";
import PrenotazioneForm from "./PrenotazioneForm";

type Props = {
  slug: string;
  /** Servizi attivi e prenotabili del negozio. */
  servizi: ServizioStrutturato[];
  config: ConfigPrenotazioni;
  /** Servizio preselezionato (es. dalla card). */
  servizioIniziale?: string;
  /** Etichetta del pulsante ("Prenota" / "Prenota ora"). */
  etichetta?: string;
  /** Stile compatto per le card dei singoli servizi. */
  compatto?: boolean;
  /** Numero WhatsApp del negozio corrente (fallback: telefono). */
  whatsapp?: string;
};

export default function PrenotazioneButton({
  slug,
  servizi,
  config,
  servizioIniziale,
  etichetta = "Prenota ora",
  compatto = false,
  whatsapp = "",
}: Props) {
  const [aperto, setAperto] = useState(false);

  // Servizio preselezionato valido → passa direttamente al flow.
  const serviceId = servizioIniziale;

  return (
    <>
      <button
        type="button"
        onClick={() => setAperto(true)}
        className={
          compatto
            ? "mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-yellow-400 px-3 py-2 text-[11px] font-bold text-blue-900 shadow-sm transition hover:bg-yellow-300 hover:shadow"
            : "inline-flex items-center gap-1.5 rounded-xl bg-yellow-400 px-3.5 py-2 text-xs font-bold text-blue-900 shadow-sm transition hover:bg-yellow-300 hover:shadow-md"
        }
      >
        <CalendarCheck className="h-4 w-4" />
        {etichetta}
      </button>

      {aperto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
          onClick={() => setAperto(false)}
        >
          <div
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Prenota un appuntamento"
          >
            <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-slate-100 bg-white px-5 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <CalendarCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-slate-900">Prenota un appuntamento</h3>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                  Scegli servizio, giorno, orario e conferma.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAperto(false)}
                aria-label="Chiudi"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-yellow-100 hover:text-yellow-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <PrenotazioneForm
              slug={slug}
              servizi={servizi}
              config={config}
              servizioIniziale={serviceId}
              whatsapp={whatsapp}
            />
          </div>
        </div>
      )}
    </>
  );
}