"use client";

import { useEffect, useState } from "react";
import { Clock, MapPin, Phone, X, ExternalLink } from "lucide-react";

type FarmaciaTurno = {
  id: string | null;
  nome: string;
  indirizzo: string | null;
  stato: "aperta" | "chiusa";
  apertura: string | null;
  turno: string | null;
  telefono: string | null;
  urlScheda: string | null;
};

type RispostaApi = {
  success: boolean;
  data?: {
    farmacie: FarmaciaTurno[];
    aggiornato?: string;
  };
};

const URL_FONTE = "https://www.farmaciediturno.org/comune.asp?cod=78033";

export default function FarmacieTurnoWidget() {
  const [dati, setDati] = useState<RispostaApi["data"] | null>(null);
  const [pronto, setPronto] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancellato = false;
    fetch("/api/farmacie-turno")
      .then((r) => r.json())
      .then((d: RispostaApi) => {
        if (cancellato) return;
        if (d?.success && d.data && d.data.farmacie.length > 0) setDati(d.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancellato) setPronto(true);
      });
    return () => {
      cancellato = true;
    };
  }, []);

  if (!pronto || !dati) return null;
  // Non mostrare mai una farmacia come di turno se la fonte non lo dichiara esplicitamente.
  const diTurno = dati.farmacie.find((f) => Boolean(f.turno));
  if (!diTurno) return null;

  const urlScheda = diTurno.urlScheda ?? URL_FONTE;

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Apri dettagli farmacia di turno: ${diTurno.nome}`}
        aria-expanded={open}
        className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full px-2 py-1 text-left transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        <span aria-hidden className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[4px] border-2 border-green-600 text-[17px] font-black leading-none text-green-700">F</span>
        <span className="max-w-[min(48vw,260px)] truncate text-xs font-semibold text-slate-800 sm:max-w-[300px] sm:text-sm">{diTurno.nome}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`Dettagli farmacia di turno: ${diTurno.nome}`}
          className="absolute left-0 top-full z-[80] mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xl"
        >
          <div className="flex items-start gap-3">
            <span aria-hidden className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-green-600 text-2xl font-black leading-none text-green-700">F</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Farmacia di turno · Castrovillari</p>
              <p className="mt-1 break-words text-sm font-bold text-slate-900">{diTurno.nome}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Chiudi dettagli farmacia" className="rounded p-1 text-slate-500 hover:bg-slate-100">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="mt-3 space-y-2 text-sm text-slate-700">
            {diTurno.indirizzo && (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                <span>{diTurno.indirizzo}</span>
              </p>
            )}
            {diTurno.apertura && (
              <p className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                <span>{diTurno.apertura}</span>
              </p>
            )}
            {diTurno.telefono && (
              <a href={`tel:${diTurno.telefono}`} className="flex items-center gap-2 font-semibold text-blue-700 hover:underline">
                <Phone className="h-4 w-4 shrink-0" aria-hidden />
                {diTurno.telefono}
              </a>
            )}
          </div>
          <a href={urlScheda} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline">
            Consulta la scheda della farmacia <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          <p className="mt-2 text-[11px] text-slate-400">Fonte: farmaciediturno.org</p>
        </div>
      )}
    </div>
  );
}
