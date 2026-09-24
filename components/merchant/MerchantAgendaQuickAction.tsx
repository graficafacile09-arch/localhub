"use client";

import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { useState } from "react";

type Props = {
  storeId: string;
  initialActive: boolean;
  nuoviAppuntamenti?: number;
};

export default function MerchantAgendaQuickAction({
  storeId,
  initialActive,
  nuoviAppuntamenti = 0,
}: Props) {
  const [active, setActive] = useState(initialActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function toggleAgenda() {
    if (saving) return;
    setSaving(true);
    setError("");

    try {
      const currentRes = await fetch(`/api/merchant/stores/${storeId}/settings`);
      const currentJson = await currentRes.json().catch(() => null);
      if (!currentRes.ok || !currentJson?.success) {
        throw new Error(currentJson?.error?.message ?? "Impossibile leggere la configurazione Agenda.");
      }

      const data = (currentJson.data?.settings?.data ?? {}) as Record<string, unknown>;
      const currentConfig =
        data.prenotazioni_config && typeof data.prenotazioni_config === "object"
          ? (data.prenotazioni_config as Record<string, unknown>)
          : {};

      const nextActive = !active;
      const saveRes = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            prenotazioni_config: {
              ...currentConfig,
              attiva: nextActive,
            },
          },
        }),
      });
      const saveJson = await saveRes.json().catch(() => null);
      if (!saveRes.ok || !saveJson?.success) {
        throw new Error(saveJson?.error?.message ?? "Salvataggio non riuscito.");
      }

      setActive(nextActive);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio non riuscito.");
    } finally {
      setSaving(false);
    }
  }

  const cardClass = active
    ? "border-slate-200 bg-white shadow-sm hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/10"
    : "border-slate-200 bg-slate-100 shadow-sm";
  const iconClass = active ? "bg-blue-50 text-blue-700" : "bg-slate-200 text-slate-400";
  const titleClass = active ? "text-slate-900" : "text-slate-400";
  const descriptionClass = active ? "text-slate-500" : "text-slate-400";

  return (
    <div
      className={`group relative flex items-center gap-4 rounded-2xl border p-5 transition-all ${cardClass}`}
      aria-label="Agenda"
    >
      <Link
        href={active ? `/merchant/${storeId}/agenda` : "#"}
        aria-disabled={!active}
        onClick={(event) => {
          if (!active) event.preventDefault();
        }}
        className={`flex min-w-0 flex-1 items-center gap-4 ${!active ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition ${iconClass}`}>
          <CalendarCheck className="h-5 w-5" />
          {active && nuoviAppuntamenti > 0 && (
            <span
              className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black leading-none text-white shadow-sm"
              aria-label={`${nuoviAppuntamenti} nuovi appuntamenti`}
            >
              {nuoviAppuntamenti > 99 ? "99+" : nuoviAppuntamenti}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h2 className={`text-base font-bold tracking-tight ${titleClass}`}>Agenda</h2>
          <p className={`mt-0.5 text-xs leading-5 ${descriptionClass}`}>
            {active ? "Calendario e appuntamenti dei clienti." : "Attiva l'Agenda per gestire gli appuntamenti."}
          </p>
          {error && <p className="mt-1 text-[10px] font-semibold text-red-600">{error}</p>}
        </div>
      </Link>

      <div className="shrink-0">
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label={active ? "Disattiva Agenda" : "Attiva Agenda"}
          disabled={saving}
          onClick={() => void toggleAgenda()}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-wait disabled:opacity-60 ${active ? "bg-blue-600" : "bg-slate-300"}`}
        >
          <span
            className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${active ? "translate-x-5" : "translate-x-0"}`}
          />
        </button>
        <p className={`mt-1 text-center text-[9px] font-bold uppercase tracking-wide ${active ? "text-blue-700" : "text-slate-400"}`}>
          {active ? "Attiva" : "Spenta"}
        </p>
      </div>
    </div>
  );
}
