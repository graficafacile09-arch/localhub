"use client";

import { useCallback, useEffect, useState } from "react";
import { Tag, Plus, X, Power } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { Field, TextArea } from "./ModuleFields";

type Props = { storeId: string };

type OffertaForm = {
  id: string | null;
  titolo: string;
  descrizione: string;
  prezzo_originale: string;
  prezzo_offerta: string;
  data_inizio: string;
  data_fine: string;
  attiva: boolean;
};

type OffertaRiga = {
  id: string;
  titolo: string;
  descrizione: string | null;
  prezzo_originale: number | null;
  prezzo_offerta: number | null;
  data_inizio: string | null;
  data_fine: string | null;
  attiva: boolean;
};

function daRiga(riga: OffertaRiga): OffertaForm {
  return {
    id: riga.id,
    titolo: riga.titolo ?? "",
    descrizione: riga.descrizione ?? "",
    prezzo_originale: riga.prezzo_originale !== null ? String(riga.prezzo_originale) : "",
    prezzo_offerta: riga.prezzo_offerta !== null ? String(riga.prezzo_offerta) : "",
    data_inizio: (riga.data_inizio ?? "").slice(0, 10),
    data_fine: (riga.data_fine ?? "").slice(0, 10),
    attiva: riga.attiva !== false,
  };
}

function nuovaForm(): OffertaForm {
  return {
    id: null,
    titolo: "",
    descrizione: "",
    prezzo_originale: "",
    prezzo_offerta: "",
    data_inizio: "",
    data_fine: "",
    attiva: true,
  };
}

export default function OfferteModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [offerte, setOfferte] = useState<OffertaRiga[]>([]);
  const [form, setForm] = useState<OffertaForm>(nuovaForm());
  const [inModifica, setInModifica] = useState(false);

  useEffect(() => {
    const scarica = async () => {
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/offerte`);
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: { offerte?: OffertaRiga[] };
          error?: { message?: string };
        } | null;
        if (!res.ok || !json?.success) {
          throw new Error(json?.error?.message ?? "Impossibile caricare le offerte.");
        }
        setOfferte(json.data?.offerte ?? []);
      } catch (caught) {
        setErrore(caught instanceof Error ? caught.message : "Errore di caricamento.");
      } finally {
        setLoading(false);
      }
    };
    void scarica();
  }, [storeId]);

  const apriNuova = useCallback(() => {
    setMessaggio(null);
    setErrore(null);
    setForm(nuovaForm());
    setInModifica(true);
  }, []);

  const apriModifica = useCallback((riga: OffertaRiga) => {
    setMessaggio(null);
    setErrore(null);
    setForm(daRiga(riga));
    setInModifica(true);
  }, []);

  const chiudi = useCallback(() => {
    setInModifica(false);
    setErrore(null);
  }, []);

  const valida = useCallback((): string | null => {
    if (!form.titolo.trim()) return "Il titolo dell'offerta è obbligatorio.";
    if (form.prezzo_originale && !/^\d+(\.\d+)?$/.test(form.prezzo_originale)) {
      return "Il prezzo originale deve essere un numero valido.";
    }
    if (form.prezzo_offerta && !/^\d+(\.\d+)?$/.test(form.prezzo_offerta)) {
      return "Il prezzo offerta deve essere un numero valido.";
    }
    return null;
  }, [form]);

  const salva = useCallback(async () => {
    setMessaggio(null);
    setErrore(null);
    const validation = valida();
    if (validation) {
      setErrore(validation);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        titolo: form.titolo.trim(),
        descrizione: form.descrizione.trim() || null,
        prezzo_originale: form.prezzo_originale ? Number(form.prezzo_originale) : null,
        prezzo_offerta: form.prezzo_offerta ? Number(form.prezzo_offerta) : null,
        data_inizio: form.data_inizio ? new Date(form.data_inizio).toISOString() : null,
        data_fine: form.data_fine ? new Date(form.data_fine).toISOString() : null,
        attiva: true,
      };

      const url = form.id
        ? `/api/merchant/stores/${storeId}/offerte/${form.id}`
        : `/api/merchant/stores/${storeId}/offerte`;
      const res = await fetch(url, {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: { offerta?: OffertaRiga };
        error?: { message?: string };
      } | null;
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message ?? "Impossibile salvare l'offerta.");
      }
      const salvata = json.data?.offerta;
      if (!salvata) throw new Error("Risposta non valida dal server.");

      setOfferte((prev) => {
        const altre = prev.filter((o) => o.id !== salvata.id);
        return [salvata, ...altre];
      });
      setInModifica(false);
      setMessaggio(form.id ? "Offerta aggiornata." : "Offerta pubblicata.");
    } catch (caught) {
      setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
    } finally {
      setSaving(false);
    }
  }, [form, storeId, valida]);

  const toggleAttiva = useCallback(
    async (riga: OffertaRiga) => {
      setMessaggio(null);
      setErrore(null);
      setSaving(true);
      try {
        const nuovaAttiva = !riga.attiva;
        const res = await fetch(`/api/merchant/stores/${storeId}/offerte/${riga.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attiva: nuovaAttiva }),
        });
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: { offerta?: OffertaRiga };
          error?: { message?: string };
        } | null;
        if (!res.ok || !json?.success) {
          throw new Error(json?.error?.message ?? "Impossibile aggiornare l'offerta.");
        }
        const salvata = json.data?.offerta;
        if (salvata) {
          setOfferte((prev) => prev.map((o) => (o.id === salvata.id ? salvata : o)));
        }
        setMessaggio(nuovaAttiva ? "Offerta attivata." : "Offerta disattivata.");
      } catch (caught) {
        setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
      } finally {
        setSaving(false);
      }
    },
    [storeId]
  );

  const elimina = useCallback(
    async (riga: OffertaRiga) => {
      if (!window.confirm(`Eliminare definitivamente l'offerta "${riga.titolo}"?`)) return;
      setMessaggio(null);
      setErrore(null);
      setSaving(true);
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/offerte/${riga.id}`, {
          method: "DELETE",
        });
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          error?: { message?: string };
        } | null;
        if (!res.ok || !json?.success) {
          throw new Error(json?.error?.message ?? "Impossibile eliminare l'offerta.");
        }
        setOfferte((prev) => prev.filter((o) => o.id !== riga.id));
        setMessaggio("Offerta eliminata.");
      } catch (caught) {
        setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
      } finally {
        setSaving(false);
      }
    },
    [storeId]
  );

  if (loading) {
    return (
      <ModuleShell icon={<Tag className="h-4 w-4" />} title="Offerte" subtitle="Caricamento..." id="offerte">
        <p className="text-sm text-slate-400">Caricamento...</p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell icon={<Tag className="h-4 w-4" />} title="Offerte" subtitle="Offerte e promozioni del negozio" id="offerte">
      <div className="space-y-4">
        {(messaggio || errore) && (
          <div
            className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
              errore
                ? "border-blue-200 bg-blue-50 text-blue-900"
                : "border-blue-200 bg-blue-50 text-blue-900"
            }`}
          >
            <span className="mt-0.5 font-black" aria-hidden>{errore ? "!" : "OK"}</span>
            <p className="leading-5">{errore ?? messaggio}</p>
            <button type="button" onClick={() => (errore ? setErrore(null) : setMessaggio(null))} className="ml-auto text-xs font-bold hover:underline" aria-label="Chiudi">
              {errore ? "Chiudi" : ""}
            </button>
          </div>
        )}

        {offerte.length > 0 && (
          <div className="space-y-3">
            {offerte.map((offerta) => (
              <div key={offerta.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-800">{offerta.titolo}</p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          offerta.attiva
                            ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                            : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                        }`}
                      >
                        {offerta.attiva ? "Attiva" : "Disattivata"}
                      </span>
                    </div>
                    {offerta.descrizione && (
                      <p className="mt-1 text-sm leading-5 text-slate-500">{offerta.descrizione}</p>
                    )}
                    {(offerta.prezzo_originale !== null || offerta.prezzo_offerta !== null) && (
                      <p className="mt-1 text-sm text-slate-600">
                        {offerta.prezzo_originale !== null && (
                          <span className="text-slate-400 line-through">
                            {offerta.prezzo_originale} €{" "}
                          </span>
                        )}
                        {offerta.prezzo_offerta !== null && (
                          <span className="font-black text-blue-700">{offerta.prezzo_offerta} €</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => apriModifica(offerta)}
                    disabled={saving}
                    className="inline-flex h-9 items-center rounded-lg bg-blue-50 px-3 text-xs font-bold text-blue-700 ring-1 ring-blue-100 transition hover:bg-blue-100 disabled:opacity-60"
                  >
                    Modifica
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleAttiva(offerta)}
                    disabled={saving}
                    className="inline-flex h-9 items-center gap-1 rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-200 disabled:opacity-60"
                  >
                    <Power className="h-3.5 w-3.5" aria-hidden />
                    {offerta.attiva ? "Disattiva" : "Attiva"}
                  </button>
                  <button
                    type="button"
                    onClick={() => elimina(offerta)}
                    disabled={saving}
                    className="ml-auto inline-flex h-9 items-center gap-1 rounded-lg bg-blue-50 px-3 text-xs font-bold text-blue-600 ring-1 ring-blue-100 transition hover:bg-blue-100 disabled:opacity-60"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Elimina
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {inModifica ? (
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
            <p className="text-sm font-bold text-slate-800">
              {form.id ? "Modifica offerta" : "Nuova offerta"}
            </p>
            <div className="mt-3 space-y-3">
              <Field label="Titolo" value={form.titolo} onChange={(v) => setForm((f) => ({ ...f, titolo: v }))} placeholder="es. Sconto 20% su tutto" />
              <TextArea
                label="Descrizione"
                value={form.descrizione}
                onChange={(v) => setForm((f) => ({ ...f, descrizione: v }))}
                rows={2}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Prezzo originale (€)" value={form.prezzo_originale} onChange={(v) => setForm((f) => ({ ...f, prezzo_originale: v }))} placeholder="50.00" />
                <Field label="Prezzo offerta (€)" value={form.prezzo_offerta} onChange={(v) => setForm((f) => ({ ...f, prezzo_offerta: v }))} placeholder="35.00" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Valido dal" value={form.data_inizio} onChange={(v) => setForm((f) => ({ ...f, data_inizio: v }))} type="date" />
                <Field label="Valido al" value={form.data_fine} onChange={(v) => setForm((f) => ({ ...f, data_fine: v }))} type="date" />
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={salva}
                disabled={saving}
                className="btn-cta h-11 flex-1 gap-2 px-5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {form.id ? "Salva modifiche" : "Pubblica offerta"}
              </button>
              <button
                type="button"
                onClick={chiudi}
                disabled={saving}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-100 px-5 text-sm font-bold text-slate-600 transition hover:bg-slate-200"
              >
                Annulla
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={apriNuova}
            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-500 transition hover:border-blue-300 hover:text-blue-600"
          >
            <Plus className="h-4 w-4" /> Aggiungi offerta
          </button>
        )}

        {offerte.length === 0 && !inModifica && (
          <p className="text-sm text-slate-400">
            Nessuna offerta pubblicata: aggiungi la prima promozione per il tuo negozio.
          </p>
        )}
      </div>
    </ModuleShell>
  );
}