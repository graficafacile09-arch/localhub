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
      <div className="w-full">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-1.5 rounded-lg px-1 py-0.5 text-left transition hover:bg-emerald-100/60"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <Pill className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-black uppercase tracking-wide text-emerald-700">Farmacia di turno</span>
            <span className="block truncate text-sm font-black text-slate-900">{diTurno.nome}</span>
          </span>
          {diTurno.stato && (
            <span className={`hidden rounded-full px-2 py-0.5 text-[10px] font-bold sm:inline ${diTurno.stato === "aperta" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {diTurno.stato === "aperta" ? "Aperta" : "Chiusa"}
            </span>
          )}
          <ChevronDown className={`h-4 w-4 shrink-0 text-emerald-700 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {open && (
          <div className="mt-2 rounded-lg bg-emerald-50/90 px-3 py-2 text-xs text-slate-600">
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
      <div className="mt-1 flex w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-2 py-1 text-[10px] leading-none text-slate-600 lg:hidden">
        <Pill className="h-3 w-3 shrink-0 text-emerald-600" aria-hidden />
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
