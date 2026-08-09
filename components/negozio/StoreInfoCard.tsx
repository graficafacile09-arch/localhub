import { Clock, ExternalLink, Info, MapPin, Phone } from "lucide-react";
import type { Orari } from "@/types/orari";
import OpeningHoursDisplay from "./OpeningHoursDisplay";

type DayOrari = {
  chiuso: boolean;
  apertura1: string;
  chiusura1: string;
  apertura2: string;
  chiusura2: string;
};

type StoreInfoCardProps = {
  indirizzo?: string | null;
  telefono?: string | null;
  orari?: Orari | Record<string, DayOrari> | null;
};

// Scheda unica "Informazioni" del negozio pubblico: indirizzo, telefono e
// orari di apertura in una card moderna. Solo presentazione: dati, link e
// logica apertura/chiusura invariati (gli orari riusano OpeningHoursDisplay).
export default function StoreInfoCard({
  indirizzo,
  telefono,
  orari,
}: StoreInfoCardProps) {
  const haDati = Boolean(indirizzo || telefono || orari);
  if (!haDati) return null;

  const mapsUrl = indirizzo
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(indirizzo)}`
    : null;

  return (
    <div className="overflow-hidden rounded-3xl border border-white/70 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md">
      {/* Intestazione */}
      <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-br from-white via-amber-50/70 to-white px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 shadow-sm">
          <Info className="h-5 w-5 text-amber-600" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-black tracking-tight text-slate-900">
            Informazioni
          </h2>
          <p className="mt-0.5 text-[11px] font-medium leading-4 text-slate-400">
            Dove siamo e quando siamo aperti
          </p>
        </div>
      </div>

      {/* Indirizzo + telefono */}
      <div className="space-y-1 px-3 py-3">
        {indirizzo && mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-slate-50 active:scale-[0.99]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 transition group-hover:bg-blue-100">
              <MapPin className="h-4 w-4 text-blue-600" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-[13px] font-semibold leading-5 text-slate-700 transition group-hover:text-blue-700">
              {indirizzo}
            </span>
            <ExternalLink
              className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:text-blue-500"
              aria-hidden
            />
          </a>
        )}

        {telefono && (
          <a
            href={`tel:${telefono}`}
            className="group flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-slate-50 active:scale-[0.99]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 transition group-hover:bg-emerald-100">
              <Phone className="h-4 w-4 text-emerald-600" aria-hidden />
            </span>
            <span className="flex-1 text-[13px] font-semibold leading-5 text-slate-700 transition group-hover:text-emerald-700">
              {telefono}
            </span>
          </a>
        )}
      </div>

      {/* Orari — riusa OpeningHoursDisplay in modalità embedded */}
      {orari && (
        <div className="border-t border-slate-100">
          <div className="flex items-center gap-2 px-5 pt-4">
            <Clock className="h-3.5 w-3.5 text-amber-500" aria-hidden />
            <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
              Orari di apertura
            </h3>
          </div>
          <div className="px-5 pb-4 pt-1">
            <OpeningHoursDisplay orari={orari} embedded />
          </div>
        </div>
      )}
    </div>
  );
}
