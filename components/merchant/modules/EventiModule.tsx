"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, Plus, X, Power } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { Field, TextArea } from "./ModuleFields";

type Props = { storeId: string };

type EventoForm = {
  id: string | null;
  titolo: string;
  descrizione: string;
  luogo: string;
  data_inizio: string;
  data_fine: string;
  attivo: boolean;
};

type EventoRiga = {
  id: string;
  titolo: string;
  descrizione: string | null;
  immagine_url: string | null;
  luogo: string | null;
  data_inizio: string | null;
  data_fine: string | null;
  attivo: boolean;
};

function daRiga(riga: EventoRiga): EventoForm {
  return {
    id: riga.id,
    titolo: riga.titolo ?? "",
    descrizione: riga.descrizione ?? "",
    luogo: riga.luogo ?? "",
    data_inizio: (riga.data_inizio ?? "").slice(0, 10),
    data_fine: (riga.data_fine ?? "").slice(0, 10),
    attivo: riga.attivo !== false,
  };
}

function nuovaForm(): EventoForm {
  return {
    id: null,
    titolo: "",
    descrizione: "",
    luogo: "",
    data_inizio: "",
    data_fine: "",
    attivo: true,
  };
}

export default function EventoModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [eventi, setEventi] = useState<EventoRiga[]>([]);
  const [form, setForm] = useState<EventoForm>(nuovaForm());
  const [inModifica, setInModifica] = useState(false);

  useEffect(() => {
    const scarica = async () => {
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/eventi`);
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: { eventi?: EventoRiga[] };
          error?: { message?: string };
        } | null;
        if (!res.ok || !json?.success) {
          throw new Error(json?.error?.message ?? "Impossibile caricare gli eventi.");
        }
        setEventi(json.data?.eventi ?? []);
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

  const apriModifica = useCallback((riga: EventoRiga) => {
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
    if (!form.titolo.trim()) return "Il titolo dell'evento è obbligatorio.";
    if (form.data_inizio && form.data_fine && form.data_fine < form.data_inizio) {
      return "La data di fine non può precedere la data di inizio.";
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
        luogo: form.luogo.trim() || null,
        data_inizio: form.data_inizio ? new Date(form.data_inizio).toISOString() : null,
        data_fine: form.data_fine ? new Date(form.data_fine).toISOString() : null,
        attivo: true,
      };

      const url = form.id
        ? `/api/merchant/stores/${storeId}/eventi/${form.id}`
        : `/api/merchant/stores/${storeId}/eventi`;
      const res = await fetch(url, {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: { evento?: EventoRiga };
        error?: { message?: string };
      } | null;
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message ?? "Impossibile salvare l'evento.");
      }
      const salvato = json.data?.evento;
      if (!salvato) throw new Error("Risposta non valida dal server.");

      setEventi((prev) => {
        const altri = prev.filter((e) => e.id !== salvato.id);
        return [...altri, salvato].sort((a, b) =>
          (a.data_inizio ?? "").localeCompare(b.data_inizio ?? "")
        );
      });
      setInModifica(false);
      setMessaggio(form.id ? "Evento aggiornato." : "Evento pubblicato.");
    } catch (caught) {
      setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
    } finally {
      setSaving(false);
    }
  }, [form, storeId, valida]);

  const toggleAttivo = useCallback(
    async (riga: EventoRiga) => {
      setMessaggio(null);
      setErrore(null);
      setSaving(true);
      try {
        const nuovoAttivo = !riga.attivo;
        const res = await fetch(`/api/merchant/stores/${storeId}/eventi/${riga.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attivo: nuovoAttivo }),
        });
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: { evento?: EventoRiga };
          error?: { message?: string };
        } | null;
        if (!res.ok || !json?.success) {
          throw new Error(json?.error?.message ?? "Impossibile aggiornare l'evento.");
        }
        const salvato = json.data?.evento;
        if (salvato) {
          setEventi((prev) => prev.map((e) => (e.id === salvato.id ? salvato : e)));
        }
        setMessaggio(nuovoAttivo ? "Evento attivo." : "Evento disattivato.");
      } catch (caught) {
        setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
      } finally {
        setSaving(false);
      }
    },
    [storeId]
  );

  const elimina = useCallback(
    async (riga: EventoRiga) => {
      if (!window.confirm(`Eliminare definitivamente l'evento "${riga.titolo}"?`)) return;
      setMessaggio(null);
      setErrore(null);
      setSaving(true);
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/eventi/${riga.id}`, {
          method: "DELETE",
        });
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          error?: { message?: string };
        } | null;
        if (!res.ok || !json?.success) {
          throw new Error(json?.error?.message ?? "Impossibile eliminare l'evento.");
        }
        setEventi((prev) => prev.filter((e) => e.id !== riga.id));
        setMessaggio("Evento eliminato.");
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
      <ModuleShell icon={<Calendar className="h-4 w-4" />} title="Eventi" subtitle="Caricamento..." id="eventi">
        <p className="text-sm text-slate-400">Caricamento...</p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell icon={<Calendar className="h-4 w-4" />} title="Eventi" subtitle="Eventi e appuntamenti del negozio" id="eventi">
      <div className="space-y-4">
        {(messaggio || errore) && (
          <div
            className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
              errore
                ? "border-red-200 bg-red-50 text-red-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            <span className="mt-0.5 font-black" aria-hidden>{errore ? "!" : "OK"}</span>
            <p className="leading-5">{errore ?? messaggio}</p>
            <button
              type="button"
              onClick={() => (errore ? setErrore(null) : setMessaggio(null))}
              className="ml-auto text-xs font-bold hover:underline"
              aria-label="Chiudi avviso"
            >
              {errore ? "Chiudi" : ""}
            </button>
          </div>
        )}

        {eventi.length > 0 && (
          <div className="space-y-3">
            {eventi.map((evento) => (
              <div key={evento.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-800">{evento.titolo}</p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          evento.attivo
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                            : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                        }`}
                      >
                        {evento.attivo ? "Attivo" : "Disattivato"}
                      </span>
                    </div>
                    {evento.descrizione && (
                      <p className="mt-1 text-sm leading-5 text-slate-500">{evento.descrizione}</p>
                    )}
                    {(evento.data_inizio || evento.luogo) && (
                      <p className="mt-1 text-sm text-slate-600">
                        {evento.data_inizio && (
                          <span>
                            {new Date(evento.data_inizio).toLocaleDateString("it-IT", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </span>
                        )}
                        {evento.data_inizio && evento.data_fine && (
                          <span>
                            {" → "}
                            {new Date(evento.data_fine).toLocaleDateString("it-IT", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </span>
                        )}
                        {evento.luogo && <span className="text-slate-400"> · {evento.luogo}</span>}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => apriModifica(evento)}
                    disabled={saving}
                    className="inline-flex h-9 items-center rounded-lg bg-blue-50 px-3 text-xs font-bold text-blue-700 ring-1 ring-blue-100 transition hover:bg-blue-100 disabled:opacity-60"
                  >
                    Modifica
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleAttivo(evento)}
                    disabled={saving}
                    className="inline-flex h-9 items-center gap-1 rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-200 disabled:opacity-60"
                  >
                    <Power className="h-3.5 w-3.5" aria-hidden />
                    {evento.attivo ? "Disattiva" : "Attiva"}
                  </button>
                  <button
                    type="button"
                    onClick={() => elimina(evento)}
                    disabled={saving}
                    className="ml-auto inline-flex h-9 items-center gap-1 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-600 ring-1 ring-red-100 transition hover:bg-red-100 disabled:opacity-60"
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
              {form.id ? "Modifica evento" : "Nuovo evento"}
            </p>
            <div className="mt-3 space-y-3">
              <Field
                label="Titolo"
                value={form.titolo}
                onChange={(v) => setForm((f) => ({ ...f, titolo: v }))}
                placeholder="es. Degustazione vini"
              />
              <TextArea
                label="Descrizione"
                value={form.descrizione}
                onChange={(v) => setForm((f) => ({ ...f, descrizione: v }))}
                rows={2}
              />
              <Field
                label="Luogo"
                value={form.luogo}
                onChange={(v) => setForm((f) => ({ ...f, luogo: v }))}
                placeholder="es. Presso il negozio"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Inizio"
                  value={form.data_inizio}
                  onChange={(v) => setForm((f) => ({ ...f, data_inizio: v }))}
                  type="date"
                />
                <Field
                  label="Fine"
                  value={form.data_fine}
                  onChange={(v) => setForm((f) => ({ ...f, data_fine: v }))}
                  type="date"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={salva}
                disabled={saving}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {form.id ? "Salva modifiche" : "Pubblica evento"}
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
            <Plus className="h-4 w-4" /> Aggiungi evento
          </button>
        )}

        {eventi.length === 0 && !inModifica && (
          <p className="text-sm text-slate-400">
            Nessun evento pubblicato: aggiungi il primo appuntamento per il tuo negozio.
          </p>
        )}
      </div>
    </ModuleShell>
  );
}