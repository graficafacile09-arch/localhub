"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Package, Save } from "lucide-react";
import type { ConfigPaccoSpedizione } from "@/lib/merchant/types";

/** Formatta i grammi in kg leggibili ("1200" → "1,2 kg"); null → "". */
function formattaKg(grammi: number | null): string {
  if (grammi === null || grammi === undefined) return "";
  const kg = grammi / 1000;
  return `${kg.toLocaleString("it-IT", { maximumFractionDigits: 3 })} kg`;
}

/** Riepilogo compatto del pacco ("📦 Pacco: 1,2 kg · 30×20×15 cm"). */
function riepilogoPacco(cfg: ConfigPaccoSpedizione): string | null {
  const peso = cfg.paccoPesoGrammi ? formattaKg(cfg.paccoPesoGrammi) : null;
  const dims = [cfg.paccoLunghezzaCm, cfg.paccoLarghezzaCm, cfg.paccoAltezzaCm]
    .filter((v): v is number => typeof v === "number" && v > 0);
  if (!peso && dims.length === 0) return null;
  const parti = [peso, dims.length > 0 ? dims.join("×") + " cm" : null].filter(Boolean);
  return `Pacco: ${parti.join(" · ")}`;
}

/**
 * Accordion "Configura pacco e spedizione" (V1 stile eBay).
 * CHIUSO di default: mostra solo il riepilogo compatto del pacco (o "Pacco
 * non configurato"). Aperto: peso (kg), dimensioni (cm), peso massimo (kg) e
 * il salvataggio. Il peso in kg viene convertito in GRAMMI prima del salvataggio
 * (il DB e il motore tariffario usano grammi).
 */
export default function SpedizionePaccoConfig({
  negozioId,
  initialConfig,
}: {
  negozioId: string;
  initialConfig: ConfigPaccoSpedizione;
}) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);

  const [pesoKg, setPesoKg] = useState(
    initialConfig.paccoPesoGrammi ? String(initialConfig.paccoPesoGrammi / 1000) : ""
  );
  const [lunghezza, setLunghezza] = useState(
    initialConfig.paccoLunghezzaCm ? String(initialConfig.paccoLunghezzaCm) : ""
  );
  const [larghezza, setLarghezza] = useState(
    initialConfig.paccoLarghezzaCm ? String(initialConfig.paccoLarghezzaCm) : ""
  );
  const [altezza, setAltezza] = useState(
    initialConfig.paccoAltezzaCm ? String(initialConfig.paccoAltezzaCm) : ""
  );
  const [pesoMaxKg, setPesoMaxKg] = useState(
    initialConfig.paccoPesoMaxGrammi ? String(initialConfig.paccoPesoMaxGrammi / 1000) : ""
  );

  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [successo, setSuccesso] = useState(false);

  const riepilogo = riepilogoPacco(initialConfig);

  function parseKg(v: string): number | null {
    const t = v.trim().replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n <= 0) return NaN;
    return Math.round(n * 1000);
  }

  async function salva() {
    setErrore(null);
    setSuccesso(false);

    const grammi = parseKg(pesoKg);
    const l = lunghezza.trim() ? Number(lunghezza.trim()) : null;
    const la = larghezza.trim() ? Number(larghezza.trim()) : null;
    const a = altezza.trim() ? Number(altezza.trim()) : null;
    const pm = pesoMaxKg.trim() ? parseKg(pesoMaxKg) : null;

    if (pesoKg.trim() && (grammi === null || Number.isNaN(grammi))) {
      setErrore("Il peso del pacco deve essere un numero maggiore di zero.");
      return;
    }
    for (const [v, etichetta] of [
      [l, "la lunghezza"],
      [la, "la larghezza"],
      [a, "l'altezza"],
    ] as const) {
      if (v !== null && (!Number.isInteger(v) || v <= 0)) {
        setErrore(`Inserisci ${etichetta} come intero maggiore di zero (cm).`);
        return;
      }
    }
    if (pm !== null && (Number.isNaN(pm) || pm === null || pm <= 0)) {
      setErrore("Il peso massimo deve essere un numero maggiore di zero.");
      return;
    }

    setSalvando(true);
    try {
      const res = await fetch(`/api/merchant/stores/${negozioId}/spedizione`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paccoPesoGrammi: grammi,
          paccoLunghezzaCm: l,
          paccoLarghezzaCm: la,
          paccoAltezzaCm: a,
          paccoPesoMaxGrammi: pm,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        success?: boolean;
      } | null;

      if (!res.ok) {
        setErrore(data?.error?.message ?? "Impossibile salvare la configurazione.");
        return;
      }
      setSuccesso(true);
      router.refresh();
    } catch {
      setErrore("Errore di rete. Riprova.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        aria-expanded={aperto}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <Package className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black text-slate-900">
            📦 Configura pacco e spedizione
          </span>
          <span className="block text-[11px] text-slate-500">
            {riepilogo ?? "Pacco non configurato"}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition ${aperto ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {aperto && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-4">
          <p className="text-[11px] leading-4 text-slate-500">
            Il peso del pacco determina la tariffa di Poste Italiane e BRT (calcolata
            automaticamente da InCittà). Il corriere locale usa invece la tariffa
            configurata su ogni prodotto.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Campo
              id="pacco-peso"
              label="Peso pacco (kg)"
              value={pesoKg}
              onChange={setPesoKg}
              placeholder="es. 1,2"
              suffix="kg"
            />
            <Campo
              id="pacco-peso-max"
              label="Peso massimo (kg)"
              value={pesoMaxKg}
              onChange={setPesoMaxKg}
              placeholder="facoltativo"
              suffix="kg"
            />
            <Campo
              id="pacco-lunghezza"
              label="Lunghezza (cm)"
              value={lunghezza}
              onChange={setLunghezza}
              placeholder="es. 30"
              suffix="cm"
            />
            <Campo
              id="pacco-larghezza"
              label="Larghezza (cm)"
              value={larghezza}
              onChange={setLarghezza}
              placeholder="es. 20"
              suffix="cm"
            />
            <Campo
              id="pacco-altezza"
              label="Altezza (cm)"
              value={altezza}
              onChange={setAltezza}
              placeholder="es. 15"
              suffix="cm"
            />
          </div>

          {errore && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {errore}
            </p>
          )}
          {successo && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              Configurazione salvata.
            </p>
          )}

          <button
            type="button"
            onClick={salva}
            disabled={salvando}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-yellow-400 px-4 text-sm font-bold text-blue-800 shadow-sm transition hover:bg-yellow-300 disabled:opacity-50"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salva pacco
          </button>
        </div>
      )}
    </div>
  );
}

function Campo({
  id,
  label,
  value,
  onChange,
  placeholder,
  suffix,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-700">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 pr-12 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}
