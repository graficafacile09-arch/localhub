"use client";

import { useEffect, useState } from "react";
import { Clock, MapPin, Phone, Pill, ChevronDown } from "lucide-react";

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
  data?: { farmacie: FarmaciaTurno[]; aggiornato?: string };
};

const URL_FONTE = "https://www.farmaciediturno.org/comune.asp?cod=78033";

export default function FarmacieTurnoWidget({ hero = false }: { hero?: boolean }) {
  const [dati, setDati] = useState<RispostaApi["data"] | null>(null);
  const [pronto, setPronto] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancellato = false;
    fetch("/api/farmacie-turno")
      .then((r) => r.json())
      .then((d: RispostaApi) => {
        if (!cancellato && d?.success && d.data && d.data.farmacie.length > 0) setDati(d.data);
      })
      .catch(() => {})
      .finally(() => { if (!cancellato) setPronto(true); });
    return () => { cancellato = true; };
  }, []);

  if (!pronto || !dati) return null;
  const diTurno = dati.farmacie.find((f) => Boolean(f.turno));
  if (!diTurno) return null;
  const urlScheda = diTurno.urlScheda ?? URL_FONTE;

  if (hero) {
    return (
      <div className="relative w-full">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex h-6 w-full items-center gap-1 rounded-lg px-1 text-left transition hover:bg-emerald-100/60 sm:h-8 sm:gap-2"
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 sm:h-9 sm:w-9 sm:rounded-lg">
            <Pill className="h-2.5 w-2.5 sm:h-5 sm:w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[10px] font-black text-slate-900 sm:text-sm">Farmacia · {diTurno.nome}</span>
          </span>
          
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-emerald-700 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {open && (
          <div className="absolute bottom-full left-0 mb-2 w-full rounded-lg bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-lg backdrop-blur-md">
            {diTurno.indirizzo && <div className="flex items-start justify-between gap-3"><span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />Indirizzo</span><strong className="text-right text-slate-900">{diTurno.indirizzo}</strong></div>}
            {diTurno.apertura && <div className="mt-1 flex items-center justify-between gap-3"><span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Orario</span><strong className="text-slate-900">{diTurno.apertura}</strong></div>}
            {diTurno.telefono && <div className="mt-1 flex items-center justify-between gap-3"><span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />Telefono</span><a href={`tel:${diTurno.telefono}`} className="font-bold text-blue-700 hover:underline">{diTurno.telefono}</a></div>}
            <a href={urlScheda} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[10px] font-semibold text-emerald-700 hover:underline">Vedi scheda completa ↗</a>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="mt-1 flex w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-2 py-1 text-[11px] leading-none text-slate-600 lg:hidden">
        <Pill className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
        <span className="shrink-0 font-semibold text-slate-600">Farmacia di turno:</span>
        <a href={urlScheda} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-bold text-emerald-700 hover:underline">{diTurno.nome}</a>
        {diTurno.telefono && <a href={`tel:${diTurno.telefono}`} aria-label={`Chiama la farmacia ${diTurno.nome}`} className="ml-auto flex shrink-0 items-center gap-1 font-semibold text-blue-700 hover:underline"><Phone className="h-3 w-3" />{diTurno.telefono}</a>}
      </div>
      <div className="mt-2 hidden w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-slate-700 lg:block">
        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500"><Pill className="h-3.5 w-3.5 text-emerald-600" />Farmacia di turno · Castrovillari</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <a href={urlScheda} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-emerald-700 hover:underline">{diTurno.nome}</a>
          {diTurno.indirizzo && <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><MapPin className="h-3 w-3" />{diTurno.indirizzo}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
          {diTurno.apertura && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3 text-slate-400" />{diTurno.apertura}</span>}
          {diTurno.telefono && <a href={`tel:${diTurno.telefono}`} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"><Phone className="h-3 w-3" />{diTurno.telefono}</a>}
          <a href={URL_FONTE} target="_blank" rel="noopener noreferrer" className="ml-auto text-[10px] text-slate-400 hover:underline">Fonte: farmaciediturno.org</a>
        </div>
      </div>
    </>
  );
}
