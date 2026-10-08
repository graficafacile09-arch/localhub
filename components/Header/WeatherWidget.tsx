"use client";

import { useEffect, useState } from "react";
import {
  Cloud, CloudDrizzle, CloudLightning, CloudRain, CloudSnow,
  CloudFog, Sun, CloudSun, Cloudy, ChevronDown,
} from "lucide-react";

type WeatherInfo = { Icon: typeof Sun; label: string };

const WMO: Record<number, WeatherInfo> = {
  0: { Icon: Sun, label: "Sereno" }, 1: { Icon: Sun, label: "Prev. sereno" },
  2: { Icon: CloudSun, label: "Parz. nuvoloso" }, 3: { Icon: Cloudy, label: "Coperto" },
  45: { Icon: CloudFog, label: "Nebbia" }, 48: { Icon: CloudFog, label: "Nebbia" },
  51: { Icon: CloudDrizzle, label: "Pioggerella" }, 53: { Icon: CloudDrizzle, label: "Pioggerella" },
  55: { Icon: CloudDrizzle, label: "Pioggerella f." }, 61: { Icon: CloudRain, label: "Pioggia" },
  63: { Icon: CloudRain, label: "Pioggia" }, 65: { Icon: CloudRain, label: "Pioggia f." },
  71: { Icon: CloudSnow, label: "Neve" }, 73: { Icon: CloudSnow, label: "Neve" },
  75: { Icon: CloudSnow, label: "Neve f." }, 80: { Icon: CloudRain, label: "Rovesci" },
  81: { Icon: CloudRain, label: "Rovesci" }, 82: { Icon: CloudRain, label: "Rovesci f." },
  95: { Icon: CloudLightning, label: "Temporale" }, 96: { Icon: CloudLightning, label: "Temporale" },
  99: { Icon: CloudLightning, label: "Temporale" },
};

function resolveWeather(code: number): WeatherInfo {
  return WMO[code] ?? { Icon: Cloud, label: "" };
}

export default function WeatherWidget({
  mobileExtended = false,
  hero = false,
}: {
  mobileExtended?: boolean;
  hero?: boolean;
}) {
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
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d) => {
        if (cancelled) return;
        setTemp(Math.round(d.current.temperature_2m));
        setCode(d.current.weather_code);
        setLoaded(true);
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
    return () => { cancelled = true; ctrl.abort(); clearTimeout(timer); };
  }, []);

  if (!loaded) return null;
  const { Icon, label } = resolveWeather(code);

  if (!hero) {
    return (
      <div className="flex items-center gap-1 text-[11px] leading-tight sm:gap-1.5 sm:text-sm" aria-label="Meteo Castrovillari">
        <Icon className="h-4 w-4 shrink-0 text-yellow-700 sm:h-5 sm:w-5" strokeWidth={1.75} aria-hidden />
        <span className="font-bold tabular-nums text-slate-800">{temp}°</span>
        <span className={`${mobileExtended ? "inline" : "hidden sm:inline"} whitespace-nowrap font-medium text-slate-600`}>
          Castrovillari{label ? ` · ${label}` : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl px-1 py-0.5 text-left transition hover:bg-sky-100/60"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
          <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-black uppercase tracking-wide text-sky-700">Meteo</span>
          <span className="block truncate text-sm font-black text-slate-900">{temp}° · {label || "Condizioni attuali"}</span>
        </span>
        <span className="text-[11px] font-semibold text-slate-500">Castrovillari</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-sky-700 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-sky-50/90 px-3 py-2 text-xs text-slate-600">
          <div className="flex items-center justify-between gap-3">
            <span>Temperatura attuale</span>
            <strong className="text-slate-900">{temp}°C</strong>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span>Condizioni</span>
            <strong className="text-slate-900">{label || "—"}</strong>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span>Località</span>
            <strong className="text-slate-900">Castrovillari</strong>
          </div>
        </div>
      )}
    </div>
  );
}
