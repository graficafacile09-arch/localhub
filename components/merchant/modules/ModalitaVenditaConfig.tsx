"use client";

import { useEffect, useState } from "react";
import { Store, PackageOpen, Truck, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { getModalitaVendita, type ModalitaVendita } from "@/components/merchant/editor/editor-steps";
import type { Negozio } from "@/types/negozio";

type Props = {
  storeId: string;
  /** Dati già disponibili (usato dal wizard per evitare un fetch iniziale). */
  store?: Negozio | null;
  /** Notifica al chiamante che i dati sono cambiati (per aggiornare gli stati). */
  onDataChanged?: () => void;
};

/**
 * Modalità di vendita (ritiro / consegna / spedizione) — componente condiviso
 * tra il wizard editor (StepCommerciale) e la pagina /impostazioni.
 * Ogni toggle salva immediatamente (PUT settings) e mostra un esito
 * verificato: verde su successo, rosso su errore (nessun falso "salvato").
 */
export default function ModalitaVenditaConfig({ storeId, store, onDataChanged }: Props) {
  const [loading, setLoading] = useState(!store);
  const [modalita, setModalita] = useState<ModalitaVendita>(() => getModalitaVendita(store ?? null));
  const [saving, setSaving] = useState(false);
  const [messaggio, setMessaggio] = useState<{ tipo: "ok" | "errore"; testo: string } | null>(null);

  useEffect(() => {
    if (store) return;
    let attivo = true;
    fetch(`/api/merchant/stores/${storeId}/settings`)
      .then((r) => r.json())
      .then((json) => {
        if (!attivo) return;
        if (json.success) setModalita(getModalitaVendita(json.data.settings));
      })
      .catch(() => {})
      .finally(() => {
        if (attivo) setLoading(false);
      });
    return () => {
      attivo = false;
    };
  }, [storeId, store]);

  async function toggle(key: keyof ModalitaVendita, value: boolean) {
    const precedente = modalita;
    const prossimo = { ...modalita, [key]: value };
    setModalita(prossimo);
    setSaving(true);
    setMessaggio(null);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { modalita_vendita: prossimo } }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setModalita(precedente);
        setMessaggio({
          tipo: "errore",
          testo: json?.error?.message ?? "Salvataggio non riuscito. Riprova.",
        });
        return;
      }
      setMessaggio({ tipo: "ok", testo: "Modalità di vendita salvate." });
      onDataChanged?.();
    } catch {
      setModalita(precedente);
      setMessaggio({ tipo: "errore", testo: "Errore di rete. Riprova." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModuleShell
      icon={<Store className="h-4 w-4 text-blue-600" />}
      title="Modalità di vendita"
      subtitle="Come i clienti ricevono i tuoi prodotti"
      id="modalita-vendita"
    >
      {loading ? (
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Caricamento...
        </p>
      ) : (
        <div className="space-y-2">
          <ModalitaToggle
            icon={<Store className="h-4 w-4 text-slate-500" />}
            label="Ritiro in negozio"
            description="Il cliente passa a ritirare l'ordine nel tuo punto vendita."
            checked={modalita.ritiro}
            busy={saving}
            onChange={(v) => toggle("ritiro", v)}
          />
          <ModalitaToggle
            icon={<PackageOpen className="h-4 w-4 text-slate-500" />}
            label="Consegna a domicilio"
            description="Consegni tu, direttamente al cliente."
            checked={modalita.consegna}
            busy={saving}
            onChange={(v) => toggle("consegna", v)}
          />
          <ModalitaToggle
            icon={<Truck className="h-4 w-4 text-slate-500" />}
            label="Spedizione"
            description="Spedisci con un corriere, con pagamento online."
            checked={modalita.spedizione}
            busy={saving}
            onChange={(v) => toggle("spedizione", v)}
          />
          {messaggio && (
            <p
              className={`flex items-start gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold ${
                messaggio.tipo === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {messaggio.tipo === "ok" ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : (
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              <span>{messaggio.testo}</span>
            </p>
          )}
        </div>
      )}
    </ModuleShell>
  );
}

function ModalitaToggle({
  icon,
  label,
  description,
  checked,
  busy,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  busy?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 transition hover:border-slate-200">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-700">{label}</p>
        <p className="mt-0.5 text-[10px] leading-4 text-slate-400">{description}</p>
      </div>
      <div className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-blue-600" : "bg-slate-200"} ${busy ? "opacity-50" : ""}`}>
        <div className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? "translate-x-4" : "translate-x-0"}`} />
        <input
          type="checkbox"
          checked={checked}
          disabled={busy}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
      </div>
    </label>
  );
}
