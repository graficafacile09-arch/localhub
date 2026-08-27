"use client";

import { useEffect, useState } from "react";
import { Clock, MapPin, Phone, Pill } from "lucide-react";

/**
 * Widget "Farmacia di turno · Castrovillari" nell'header.
 *
 * - MOBILE/TABLET: barra COMPATTA a tutta larghezza (~24px, una sola riga):
 *   "💊 Farmacia di turno: NOME ... telefono". Riempie la larghezza sotto
 *   il logo senza lasciare spazi vuoti e senza aggiungere quasi altezza.
 * - DESKTOP: card completa (titolo, nome, indirizzo, orari, telefono, fonte).
 *
 * I dati arrivano da /api/farmacie-turno (farmaciediturno.org, cache
 * server-side). Finché non ci sono dati non renderizza nulla: nessun flash,
 * nessuno spazio vuoto.
 */

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

  useEffect(() => {
    let cancellato = false;
    fetch("/api/farmacie-turno")
      .then((r) => r.json())
      .then((d: RispostaApi) => {
        if (cancellato) return;
        if (d?.success && d.data && d.data.farmacie.length > 0) {
          setDati(d.data);
        }
      })
      .catch(() => {
        // errore → nessun widget, nessun danno
      })
      .finally(() => {
        if (!cancellato) setPronto(true);
      });
    return () => {
      cancellato = true;
    };
  }, []);

  if (!pronto || !dati) return null;

  const diTurno =
    dati.farmacie.find((f) => f.turno) ??
    dati.farmacie.find((f) => f.stato === "aperta") ??
    dati.farmacie[0];
  if (!diTurno) return null;

  const urlScheda = diTurno.urlScheda ?? URL_FONTE;

  return (
    <>
      {/* ── MOBILE/TABLET: barra compatta a tutta larghezza, una riga ────── */}
      <div className="mt-1 flex w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-2 py-1 text-[11px] leading-none text-slate-600 lg:hidden">
        <Pill className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
        <span className="shrink-0 font-semibold text-slate-600">Farmacia di turno:</span>
        <a
          href={urlScheda}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 truncate font-bold text-emerald-700 transition hover:text-emerald-900 hover:underline"
        >
          {diTurno.nome}
        </a>
        {diTurno.telefono && (
          <a
            href={`tel:${diTurno.telefono}`}
            aria-label={`Chiama la farmacia ${diTurno.nome}`}
            className="ml-auto flex shrink-0 items-center gap-1 font-semibold text-blue-700 transition hover:text-blue-900 hover:underline"
          >
            <Phone className="h-3 w-3" aria-hidden />
            {diTurno.telefono}
          </a>
        )}
      </div>

      {/* ── DESKTOP: card completa ────────────────────────────────────────── */}
      <div className="mt-2 hidden w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-slate-700 lg:block">
        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
          <Pill className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
          Farmacia di turno · Castrovillari
        </p>

        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <a
            href={urlScheda}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold text-emerald-700 transition hover:text-emerald-900 hover:underline"
          >
            {diTurno.nome}
          </a>
          {diTurno.indirizzo && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              {diTurno.indirizzo}
            </span>
          )}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
          {diTurno.apertura && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
              {diTurno.apertura}
            </span>
          )}
          {diTurno.telefono && (
            <a
              href={`tel:${diTurno.telefono}`}
              className="inline-flex items-center gap-1 font-semibold text-blue-700 transition hover:text-blue-900 hover:underline"
            >
              <Phone className="h-3 w-3 shrink-0" aria-hidden />
              {diTurno.telefono}
            </a>
          )}
          <a
            href={URL_FONTE}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-[10px] text-slate-400 transition hover:text-slate-600 hover:underline"
          >
            Fonte: farmaciediturno.org
          </a>
        </div>
      </div>
    </>
  );
}
