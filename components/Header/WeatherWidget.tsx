"use client";

import { useEffect, useState } from "react";
import {
  Cloud, CloudDrizzle, CloudLightning, CloudRain, CloudSnow, CloudFog,
  Sun, CloudSun, Cloudy, X,
} from "lucide-react";

type WeatherInfo = { Icon: typeof Sun; label: string };
const WMO: Record<number, WeatherInfo> = {
  0: { Icon: Sun, label: "Sereno" },
  1: { Icon: Sun, label: "Prevalentemente sereno" },
  2: { Icon: CloudSun, label: "Parzialmente nuvoloso" },
  3: { Icon: Cloudy, label: "Coperto" },
  45: { Icon: CloudFog, label: "Nebbia" },
  48: { Icon: CloudFog, label: "Nebbia" },
  51: { Icon: CloudDrizzle, label: "Pioggerella" },
  53: { Icon: CloudDrizzle, label: "Pioggerella" },
  55: { Icon: CloudDrizzle, label: "Pioggerella intensa" },
  61: { Icon: CloudRain, label: "Pioggia" },
  63: { Icon: CloudRain, label: "Pioggia" },
  65: { Icon: CloudRain, label: "Pioggia intensa" },
  71: { Icon: CloudSnow, label: "Neve" },
  73: { Icon: CloudSnow, label: "Neve" },
  75: { Icon: CloudSnow, label: "Neve intensa" },
  80: { Icon: CloudRain, label: "Rovesci" },
  81: { Icon: CloudRain, label: "Rovesci" },
  82: { Icon: CloudRain, label: "Rovesci intensi" },
  95: { Icon: CloudLightning, label: "Temporale" },
  96: { Icon: CloudLightning, label: "Temporale con grandine" },
  99: { Icon: CloudLightning, label: "Temporale intenso" },
};

function resolveWeather(code: number): WeatherInfo {
  return WMO[code] ?? { Icon: Cloud, label: "Condizioni variabili" };
}

export default function WeatherWidget() {
  const [temp, setTemp] = useState<number | null>(null);
  const [code, setCode] = useState<number>(0);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);

    fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=39.817&longitude=16.202&current=temperature_2m,weather_code",
      { signal: ctrl.signal }
    )
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setTemp(Math.round(d.current.temperature_2m));
        setCode(d.current.weather_code);
        setLoaded(true);
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));

    return () => {
      cancelled = true;
      ctrl.abort();
      clearTimeout(timer);
    };
  }, []);

  if (!loaded || temp === null) return null;
  const { Icon, label } = resolveWeather(code);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Apri dettagli meteo di Castrovillari"
        aria-expanded={open}
        className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 py-1 text-sm transition hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      >
        <Icon className="h-4 w-4 shrink-0 text-amber-500 sm:h-[18px] sm:w-[18px]" strokeWidth={1.8} aria-hidden />
        <span className="font-bold tabular-nums text-slate-800">{temp}°</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Dettagli meteo di Castrovillari"
          className="absolute left-0 top-full z-[80] mt-2 w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meteo attuale</p>
              <p className="mt-1 text-sm font-bold text-slate-900">Castrovillari</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Chiudi dettagli meteo" className="rounded p-1 text-slate-500 hover:bg-slate-100">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Icon className="h-9 w-9 shrink-0 text-amber-500" strokeWidth={1.7} aria-hidden />
            <div>
              <p className="text-2xl font-bold leading-tight text-slate-900">{temp}°C</p>
              <p className="text-sm text-slate-600">{label}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">Condizioni e temperatura rilevate in tempo reale tramite Open-Meteo.</p>
        </div>
      )}
    </div>
  );
}
