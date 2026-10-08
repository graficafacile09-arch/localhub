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
    <div className="w-full">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-center transition hover:bg-sky-100/60">
        <Icon className="h-6 w-6 text-sky-700 sm:hidden" strokeWidth={1.8} aria-hidden />
        <span className="hidden text-[10px] font-black uppercase tracking-wide text-sky-700 sm:block">Meteo</span>
        <span className="text-sm font-black leading-none text-slate-900 sm:text-xs">{temp}°</span>
        <span className="max-w-full truncate text-[7px] font-semibold leading-none text-slate-600 sm:hidden">{label}</span>
        <span className="hidden text-[10px] font-black text-slate-900 sm:block">{label}</span>
        <ChevronDown className={`h-2.5 w-2.5 text-sky-700 transition-transform sm:h-3 sm:w-3 ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && <div className="mt-1 rounded-lg bg-sky-50/95 px-2 py-2 text-[10px] text-slate-600">
        <div className="flex items-center justify-between gap-2"><span>Temperatura</span><strong className="text-slate-900">{temp}°C</strong></div>
        <div className="mt-1 flex items-center justify-between gap-2"><span>Condizioni</span><strong className="text-right text-slate-900">{label || "—"}</strong></div>
        <div className="mt-1 flex items-center justify-between gap-2"><span>Località</span><strong className="text-slate-900">Castrovillari</strong></div>
      </div>}
    </div>
  );

