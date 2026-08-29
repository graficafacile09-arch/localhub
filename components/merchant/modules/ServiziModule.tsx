"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, Plus, Trash2, ChevronUp, ChevronDown, Camera, X, Loader2 } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { SaveBar, type StatoSalvataggio } from "./ModuleFields";
import { uploadStoreImage } from "@/components/merchant/editor/lib/upload-image";
import type { ServizioStrutturato } from "@/types/negozio";

type Props = { storeId: string };

function nuovoServizio(ordinamento: number): ServizioStrutturato {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    nome: "",
    descrizione: "",
    prezzo: null,
    prezzo_da: false,
    durata_min: null,
    immagine: "",
    ordinamento,
    attivo: true,
  };
}

/** Normalizza l'array salvato (difensivo: valori opzionali/null). */
function normalizza(lista: unknown): ServizioStrutturato[] {
  if (!Array.isArray(lista)) return [];
  return (lista as unknown[])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s, i) => ({
      id: typeof s.id === "string" && s.id ? s.id : `s-${i}-${Date.now()}`,
      nome: typeof s.nome === "string" ? s.nome : "",
      descrizione: typeof s.descrizione === "string" ? s.descrizione : "",
      prezzo:
        typeof s.prezzo === "number" && Number.isFinite(s.prezzo) ? s.prezzo : null,
      prezzo_da: s.prezzo_da === true,
      durata_min:
        typeof s.durata_min === "number" && Number.isFinite(s.durata_min)
          ? s.durata_min
          : null,
      immagine: typeof s.immagine === "string" ? s.immagine : "",
      ordinamento: typeof s.ordinamento === "number" ? s.ordinamento : i,
      attivo: s.attivo !== false,
    }));
}

export default function ServiziModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [servizi, setServizi] = useState<ServizioStrutturato[]>([]);
  const [original, setOriginal] = useState("");
  const [messaggio, setMessaggio] = useState<StatoSalvataggio>(null);

  // Upload immagine: un solo input nascosto condiviso, id del servizio in attesa.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  /** True appena l'utente inizia a modificare: evita che un fetch asincrono
   * (es. doppio mount) sovrascriva lo stato locale con i dati del server. */
  const editedRef = useRef(false);

  useEffect(() => {
    let attivo = true;
    fetch(`/api/merchant/stores/${storeId}/settings`)
      .then((r) => r.json())
      .then((json) => {
        if (!attivo) return;
        setLoading(false);
        if (!json.success) return;
        // Se l'utente ha già iniziato a modificare, non sovrascrivere.
        if (editedRef.current) return;
        const data = (json.data.settings.data ?? {}) as Record<string, unknown>;
        const lista = normalizza(data.servizi_strutturati);
        setServizi(lista);
        setOriginal(JSON.stringify(lista));
      })
      .catch(() => {
        if (attivo) setLoading(false);
      });
    return () => {
      attivo = false;
    };
  }, [storeId]);

  const dirty = JSON.stringify(servizi) !== original;

  // Quando l'utente riprende a modificare, nasconde l'esito precedente.
  useEffect(() => {
    if (dirty) setMessaggio(null);
  }, [dirty]);

  function update(id: string, patch: Partial<ServizioStrutturato>) {
    editedRef.current = true;
    setServizi((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function add() {
    editedRef.current = true;
    setServizi((prev) => [...prev, nuovoServizio(prev.length)]);
  }

  function remove(id: string) {
    editedRef.current = true;
    setServizi((prev) => prev.filter((s) => s.id !== id));
  }

  function move(index: number, dir: -1 | 1) {
    editedRef.current = true;
    setServizi((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      return next.map((s, i) => ({ ...s, ordinamento: i }));
    });
  }

  function chiediImmagine(id: string) {
    setPendingUploadId(id);
    fileInputRef.current?.click();
  }

  async function handleUpload(file: File | undefined) {
    if (!file || !pendingUploadId) return;
    const id = pendingUploadId;
    setUploadingId(id);
    setMessaggio(null);
    try {
      const url = await uploadStoreImage(storeId, file);
      update(id, { immagine: url });
    } catch (e) {
      setMessaggio({
        tipo: "errore",
        testo: e instanceof Error ? e.message : "Caricamento immagine non riuscito.",
      });
    } finally {
      setUploadingId(null);
      setPendingUploadId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessaggio(null);
    try {
      // Normalizza l'ordinamento (indice array) prima del salvataggio.
      const normalizzati = servizi.map((s, i) => ({ ...s, ordinamento: i }));
      const res = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: { servizi_strutturati: normalizzati },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setMessaggio({
          tipo: "errore",
          testo: json?.error?.message ?? "Salvataggio non riuscito. Riprova.",
        });
        return;
      }
      setServizi(normalizzati);
      setOriginal(JSON.stringify(normalizzati));
      setMessaggio({ tipo: "ok", testo: "Modifiche salvate." });
    } catch {
      setMessaggio({ tipo: "errore", testo: "Errore di rete. Riprova." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ModuleShell
        icon={<Sparkles className="h-4 w-4" />}
        title="Servizi"
        subtitle="Presenta ai clienti i servizi che offri."
        id="servizi"
      >
        <p className="text-sm text-slate-400">Caricamento...</p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell
      icon={<Sparkles className="h-4 w-4" />}
      title="Servizi"
      subtitle="Presenta ai clienti i servizi che offri."
      id="servizi"
    >
      <p className="mb-4 text-xs text-slate-500">
        Ogni servizio può avere prezzo (facoltativo), durata e immagine. I clienti li vedono
        nella tua pagina pubblica.
      </p>

      <div className="space-y-3">
        {servizi.map((s, i) => (
          <div
            key={s.id}
            className={`rounded-xl border p-4 transition ${
              s.attivo === false
                ? "border-slate-100 bg-slate-50 opacity-75"
                : "border-slate-200 bg-white"
            }`}
          >
            {/* Barra card: riordino, attivo, elimina */}
            <div className="mb-3 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="Sposta su"
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === servizi.length - 1}
                aria-label="Sposta giù"
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <span className="ml-2 text-[11px] font-bold text-slate-400">#{i + 1}</span>
              <span className="flex-1" />
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <input
                  type="checkbox"
                  checked={s.attivo !== false}
                  onChange={(e) => update(s.id, { attivo: e.target.checked })}
                  className="h-3.5 w-3.5 accent-blue-600"
                />
                Attivo
              </label>
              <button
                type="button"
                onClick={() => remove(s.id)}
                aria-label="Elimina servizio"
                className="ml-1 rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                  Nome servizio *
                </label>
                <input
                  type="text"
                  value={s.nome}
                  onChange={(e) => update(s.id, { nome: e.target.value })}
                  placeholder="es. Pulizia dentale"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                  Descrizione
                </label>
                <textarea
                  value={s.descrizione ?? ""}
                  onChange={(e) => update(s.id, { descrizione: e.target.value })}
                  rows={2}
                  placeholder="es. Igiene orale professionale completa"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                  Prezzo (€)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={s.prezzo ?? ""}
                  onChange={(e) =>
                    update(s.id, {
                      prezzo: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  placeholder="Facoltativo"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <label className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                  <input
                    type="checkbox"
                    checked={s.prezzo_da === true}
                    onChange={(e) => update(s.id, { prezzo_da: e.target.checked })}
                    className="h-3.5 w-3.5 accent-blue-600"
                  />
                  A partire da
                </label>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                  Durata (minuti)
                </label>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={s.durata_min ?? ""}
                  onChange={(e) =>
                    update(s.id, {
                      durata_min: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  placeholder="Facoltativa"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                  Immagine
                </label>
                <div className="flex items-center gap-3">
                  {s.immagine ? (
                    <img
                      src={s.immagine}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 bg-slate-100 object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50">
                      <Camera className="h-4 w-4 text-slate-300" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => chiediImmagine(s.id)}
                    disabled={uploadingId === s.id}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    {uploadingId === s.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Camera className="h-3.5 w-3.5" />
                    )}
                    {uploadingId === s.id ? "Caricamento..." : "Carica immagine"}
                  </button>
                  <input
                    value={s.immagine ?? ""}
                    onChange={(e) => update(s.id, { immagine: e.target.value })}
                    placeholder="oppure incolla un URL immagine..."
                    className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  {s.immagine ? (
                    <button
                      type="button"
                      onClick={() => update(s.id, { immagine: "" })}
                      aria-label="Rimuovi immagine"
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input file condiviso per le immagini dei servizi */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleUpload(e.target.files?.[0])}
      />

      <button
        type="button"
        onClick={add}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-3 text-xs font-bold text-slate-600 transition hover:border-blue-400 hover:text-blue-600"
      >
        <Plus className="h-4 w-4" /> Aggiungi servizio
      </button>

      <SaveBar saving={saving} onSave={handleSave} dirty={dirty} messaggio={messaggio} />
    </ModuleShell>
  );
}
