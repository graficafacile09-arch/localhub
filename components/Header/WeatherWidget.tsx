"use client";

import { useEffect, useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudFog,
  Sun,
  CloudSun,
  Cloudy,
} from "lucide-react";

/* ── WMO weather codes → icon + Italian description ─────────────────────── */

type WeatherInfo = { Icon: typeof Sun; label: string };

const WMO: Record<number, WeatherInfo> = {
  0: { Icon: Sun, label: "Sereno" },
  1: { Icon: Sun, label: "Prev. sereno" },
  2: { Icon: CloudSun, label: "Parz. nuvoloso" },
  3: { Icon: Cloudy, label: "Coperto" },
  45: { Icon: CloudFog, label: "Nebbia" },
  48: { Icon: CloudFog, label: "Nebbia" },
  51: { Icon: CloudDrizzle, label: "Pioggerella" },
  53: { Icon: CloudDrizzle, label: "Pioggerella" },
  55: { Icon: CloudDrizzle, label: "Pioggerella f." },
  61: { Icon: CloudRain, label: "Pioggia" },
  63: { Icon: CloudRain, label: "Pioggia" },
  65: { Icon: CloudRain, label: "Pioggia f." },
  71: { Icon: CloudSnow, label: "Neve" },
  73: { Icon: CloudSnow, label: "Neve" },
  75: { Icon: CloudSnow, label: "Neve f." },
  80: { Icon: CloudRain, label: "Rovesci" },
  81: { Icon: CloudRain, label: "Rovesci" },
  82: { Icon: CloudRain, label: "Rovesci f." },
  95: { Icon: CloudLightning, label: "Temporale" },
  96: { Icon: CloudLightning, label: "Temporale" },
  99: { Icon: CloudLightning, label: "Temporale" },
};

function resolveWeather(code: number): WeatherInfo {
  return WMO[code] ?? { Icon: Cloud, label: "" };
}

/* ── Component ──────────────────────────────────────────────────────────── */

export default function WeatherWidget() {
  const [temp, setTemp] = useState<number | null>(null);
  const [code, setCode] = useState<number>(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000); // 8s timeout

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
      .catch(() => {
        // errore/timeout → widget non mostrato
      })
      .finally(() => {
        clearTimeout(timer);
      });

    return () => {
      cancelled = true;
      ctrl.abort();
      clearTimeout(timer);
    };
  }, []);

  // Non renderizzare nulla finché i dati non arrivano (nessun flash)
  if (!loaded) return null;

  const { Icon, label } = resolveWeather(code);

  return (
    <div className="hidden items-center gap-2 text-sm md:flex" aria-label="Meteo Castrovillari">
      <Icon className="h-5 w-5 text-yellow-500" strokeWidth={1.75} aria-hidden />
      <div className="flex flex-col leading-tight">
        <span className="text-base font-bold tabular-nums text-slate-800">
          {temp}°
        </span>
        <span className="text-[10px] font-medium text-slate-400">
          Castrovillari{label ? ` · ${label}` : ""}
        </span>
      </div>
    </div>
  );
}
