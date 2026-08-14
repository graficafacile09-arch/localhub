"use client";

import { useState } from "react";
import { Store, Truck, PackageOpen, CheckCircle2, Loader2 } from "lucide-react";
import ImpostazioniModule from "@/components/merchant/modules/ImpostazioniModule";
import PagamentiModule from "@/components/merchant/modules/PagamentiModule";
import { getModalitaVendita, type ModalitaVendita } from "../editor-steps";
import type { StepProps } from "../editor-steps";

export default function StepCommerciale({ storeId, store, onDataChanged }: StepProps) {
  const [modalita, setModalita] = useState<ModalitaVendita>(() => getModalitaVendita(store));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function salvaModalita(next: ModalitaVendita) {
    setModalita(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { modalita_vendita: next } }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        onDataChanged();
      }
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: keyof ModalitaVendita, value: boolean) {
    void salvaModalita({ ...modalita, [key]: value });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Store className="h-4 w-4 text-blue-500" /> Modalità di vendita
          </h3>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : saved ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : null}
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Indica come i clienti possono ricevere i tuoi prodotti.
        </p>
        <div className="space-y-2">
          <ModalitaToggle
            icon={<Store className="h-4 w-4 text-slate-500" />}
            label="Ritiro in negozio"
            description="Il cliente passa a ritirare l'ordine nel tuo punto vendita."
            checked={modalita.ritiro}
            onChange={(v) => toggle("ritiro", v)}
          />
          <ModalitaToggle
            icon={<PackageOpen className="h-4 w-4 text-slate-500" />}
            label="Consegna a domicilio"
            description="Consegni tu, direttamente al cliente."
            checked={modalita.consegna}
            onChange={(v) => toggle("consegna", v)}
          />
          <ModalitaToggle
            icon={<Truck className="h-4 w-4 text-slate-500" />}
            label="Spedizione"
            description="Spedisci con un corriere, con pagamento online."
            checked={modalita.spedizione}
            onChange={(v) => toggle("spedizione", v)}
          />
        </div>
      </section>

      <ImpostazioniModule storeId={storeId} />

      <PagamentiModule storeId={storeId} />
    </div>
  );
}

function ModalitaToggle({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 transition hover:border-slate-200">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-700">{label}</p>
        <p className="mt-0.5 text-[10px] leading-4 text-slate-400">{description}</p>
      </div>
      <div className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-blue-600" : "bg-slate-200"}`}>
        <div className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? "translate-x-4" : "translate-x-0"}`} />
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      </div>
    </label>
  );
}
