"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Layers,
  Loader2,
  Plus,
  Power,
  Save,
  Trash2,
  X,
} from "lucide-react";
import type { AttributiVariante, VarianteProdotto } from "@/lib/merchant/types";
import { prodottoEsaurito } from "@/lib/prodotti-disponibilita";

/** Previene l'invio implicito del form principale premendo Invio nei campi variante. */
function previeniInvio(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") e.preventDefault();
}

type ProdottoInfo = {
  prezzo: number | null;
  quantitaDisponibile: number | null;
  quantitaRiservata: number | null;
  haVarianti: boolean;
};

type Props = {
  negozioId: string;
  productId: string;
  /** Dati aggregati del prodotto padre (informativi: prezzo/stock sono
   *  ricalcolati automaticamente dal trigger quando ci sono varianti). */
  prodotto?: ProdottoInfo;
};

type RigaAttributo = { nome: string; valori: string };
type DraftRiga = { nome: string; prezzo: string; quantita: string };

const DEFAULT_PRODOTTO: ProdottoInfo = {
  prezzo: null,
  quantitaDisponibile: null,
  quantitaRiservata: null,
  haVarianti: false,
};

/** Chiave canonica degli attributi (jsonb normalizza l'ordine delle chiavi →
 *  qui ordiniamo le chiavi per confrontare combinazioni in modo affidabile). */
function chiaveCanonica(attributi: AttributiVariante): string {
  return JSON.stringify(
    Object.keys(attributi)
      .sort()
      .reduce<Record<string, string>>((acc, k) => {
        acc[k] = attributi[k];
        return acc;
      }, {})
  );
}

/** Prodotto cartesiano delle righe attributo compilate. */
function generaCombinazioni(righe: RigaAttributo[]): AttributiVariante[] {
  let combinazioni: AttributiVariante[] = [{}];
  for (const riga of righe) {
    const nome = riga.nome.trim();
    const valori = riga.valori
      .split(/[,;]\s*/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (!nome || valori.length === 0) continue;
    const prossime: AttributiVariante[] = [];
    for (const base of combinazioni) {
      for (const valore of valori) {
        prossime.push({ ...base, [nome]: valore });
      }
    }
    combinazioni = prossime;
  }
  return combinazioni.filter((c) => Object.keys(c).length > 0);
}

function formattaAttributi(attributi: AttributiVariante): string {
  return Object.entries(attributi)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

export default function VariantiManager({ negozioId, productId, prodotto }: Props) {
  const [varianti, setVarianti] = useState<VarianteProdotto[]>([]);
  const [prodottoInfo, setProdottoInfo] = useState<ProdottoInfo>(prodotto ?? DEFAULT_PRODOTTO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successo, setSuccesso] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  // Builder combinazioni
  const [righeAttributo, setRigheAttributo] = useState<RigaAttributo[]>([{ nome: "", valori: "" }]);
  const [prezzoPredefinito, setPrezzoPredefinito] = useState("");
  const [quantitaPredefinita, setQuantitaPredefinita] = useState("0");

  // Bozze di modifica rapida per riga
  const [draft, setDraft] = useState<Record<string, DraftRiga>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const base = `/api/merchant/stores/${negozioId}/products/${productId}/varianti`;

  const mostraSuccesso = useCallback((msg: string) => {
    setSuccesso(msg);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSuccesso(null), 3500);
  }, []);

  const carica = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(base);
      const json = (await res.json()) as {
        success: boolean;
        data?: { varianti?: VarianteProdotto[] };
        error?: { message?: string };
      };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error?.message ?? "Impossibile caricare le varianti.");
        return;
      }
      const lista = json.data.varianti ?? [];
      setVarianti(lista);
      setDraft(
        Object.fromEntries(
          lista.map((v) => [
            v.id,
            { nome: v.nome ?? "", prezzo: v.prezzo === null ? "" : String(v.prezzo), quantita: String(v.quantita_disponibile) },
          ])
        )
      );
    } catch {
      setError("Errore di rete durante il caricamento delle varianti.");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void carica();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [carica]);

  // Combinazioni generate + già presenti (per il preview e l'esclusione duplicati)
  const combinazioniGenerate = useMemo(() => generaCombinazioni(righeAttributo), [righeAttributo]);
  const esistenti = useMemo(() => new Set(varianti.map((v) => chiaveCanonica(v.attributi))), [varianti]);
  const daCreare = combinazioniGenerate.filter((c) => !esistenti.has(chiaveCanonica(c)));
  const duplicati = combinazioniGenerate.filter((c) => esistenti.has(chiaveCanonica(c)));

  const aggiornaProdottoDaRisposta = useCallback((p: ProdottoInfo | undefined) => {
    if (p) setProdottoInfo(p);
  }, []);

  const toggleAttivo = async (v: VarianteProdotto) => {
    setBusyId(v.id);
    setError(null);
    try {
      const res = await fetch(`${base}/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attivo: !v.attivo }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { prodotto?: ProdottoInfo };
        error?: { message?: string };
      };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? "Impossibile aggiornare la variante.");
        return;
      }
      aggiornaProdottoDaRisposta(json.data?.prodotto);
      await carica();
      mostraSuccesso(v.attivo ? "Variante disattivata." : "Variante attivata.");
    } catch {
      setError("Errore di rete.");
    } finally {
      setBusyId(null);
    }
  };

  const salvaModifica = async (v: VarianteProdotto) => {
    const d = draft[v.id];
    if (!d) return;
    setBusyId(v.id);
    setError(null);

    // Validazioni client leggere (l'API ripete la validazione in modo rigoroso).
    const patch: { nome?: string | null; prezzo?: number | null; quantitaDisponibile?: number } = {};
    if (d.nome.trim() !== (v.nome ?? "")) patch.nome = d.nome.trim() || null;
    if (d.prezzo.trim() !== (v.prezzo === null ? "" : String(v.prezzo))) {
      const p = d.prezzo.trim();
      if (p === "") {
        patch.prezzo = null;
      } else {
        const num = Number(p);
        if (Number.isNaN(num) || num < 0) {
          setError("Inserisci un prezzo valido (0 o superiore) oppure lascia vuoto per ereditare il prezzo del prodotto.");
          setBusyId(null);
          return;
        }
        patch.prezzo = num;
      }
    }
    if (d.quantita.trim() !== String(v.quantita_disponibile)) {
      const q = Number(d.quantita.trim());
      if (!Number.isInteger(q) || q < 0) {
        setError("Inserisci una quantità valida (numero intero 0 o superiore).");
        setBusyId(null);
        return;
      }
      patch.quantitaDisponibile = q;
    }

    if (Object.keys(patch).length === 0) {
      mostraSuccesso("Nessuna modifica da salvare.");
      setBusyId(null);
      return;
    }

    try {
      const res = await fetch(`${base}/${v.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { prodotto?: ProdottoInfo };
        error?: { message?: string };
      };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? "Impossibile salvare la variante.");
        return;
      }
      aggiornaProdottoDaRisposta(json.data?.prodotto);
      await carica();
      mostraSuccesso("Variante salvata. Prezzo e stock del prodotto sono stati ricalcolati automaticamente.");
    } catch {
      setError("Errore di rete.");
    } finally {
      setBusyId(null);
    }
  };

  const elimina = async (v: VarianteProdotto) => {
    if (!window.confirm(`Eliminare la variante "${v.nome || formattaAttributi(v.attributi) || "senza nome"}"?`)) return;
    setBusyId(v.id);
    setError(null);
    try {
      const res = await fetch(`${base}/${v.id}`, { method: "DELETE" });
      const json = (await res.json()) as {
        success: boolean;
        data?: { prodotto?: ProdottoInfo };
        error?: { message?: string };
      };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? "Impossibile eliminare la variante.");
        return;
      }
      aggiornaProdottoDaRisposta(json.data?.prodotto);
      await carica();
      mostraSuccesso(
        varianti.length === 1
          ? "Ultima variante eliminata: il prodotto è tornato al comportamento normale."
          : "Variante eliminata."
      );
    } catch {
      setError("Errore di rete.");
    } finally {
      setBusyId(null);
    }
  };

  const creaCombinazioni = async () => {
    if (daCreare.length === 0) {
      setError("Nessuna combinazione nuova da creare. Aggiungi attributi/valori oppure disattiva le combinazioni esistenti.");
      return;
    }
    setCreando(true);
    setError(null);

    const prezzoDefault = prezzoPredefinito.trim();
    const prezzoNum = prezzoDefault === "" ? null : Number(prezzoDefault);
    if (prezzoDefault !== "" && (Number.isNaN(prezzoNum as number) || (prezzoNum as number) < 0)) {
      setError("Inserisci un prezzo predefinito valido oppure lascia vuoto per ereditare il prezzo del prodotto.");
      setCreando(false);
      return;
    }
    const quantitaNum = Number(quantitaPredefinita.trim());
    if (!Number.isInteger(quantitaNum) || quantitaNum < 0) {
      setError("Inserisci una quantità predefinita valida (numero intero 0 o superiore).");
      setCreando(false);
      return;
    }

    let creati = 0;
    let falliti = 0;
    let saltate = 0;
    for (const attributi of daCreare) {
      const body: { attributi: AttributiVariante; nome?: string | null; prezzo?: number | null; quantitaDisponibile: number } = {
        attributi,
        nome: formattaAttributi(attributi),
        prezzo: prezzoNum,
        quantitaDisponibile: quantitaNum,
      };
      try {
        const res = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as {
          success: boolean;
          data?: { prodotto?: ProdottoInfo };
          error?: { message?: string };
        };
        if (!res.ok || !json.success) {
          // Duplicato (409): possibile solo in caso di corsa (il filtro già
          // esclude le combinazioni presenti) → conta come "saltata", non errore.
          if (res.status === 409) {
            saltate++;
          } else {
            falliti++;
            console.error("creazione variante fallita:", json.error?.message);
          }
          continue;
        }
        aggiornaProdottoDaRisposta(json.data?.prodotto);
        creati++;
      } catch {
        falliti++;
      }
    }

    await carica();
    setCreando(false);
    if (falliti > 0) {
      setError(`Create ${creati} variante${creati === 1 ? "" : "e"}; ${falliti} non salvate (riprova).`);
    } else if (saltate > 0) {
      mostraSuccesso(`Create ${creati} variante${creati === 1 ? "" : "e"}; ${saltate} già presente${saltate === 1 ? "" : "i"} saltate.`);
      setRigheAttributo([{ nome: "", valori: "" }]);
      setPrezzoPredefinito("");
      setQuantitaPredefinita("0");
    } else {
      mostraSuccesso(`Create ${creati} variante${creati === 1 ? "" : "e"}. Prezzo e stock del prodotto aggiornati automaticamente.`);
      // Reset builder dopo la creazione riuscita.
      setRigheAttributo([{ nome: "", valori: "" }]);
      setPrezzoPredefinito("");
      setQuantitaPredefinita("0");
    }
  };

  const esaurito = prodottoEsaurito(prodottoInfo.quantitaDisponibile, prodottoInfo.quantitaRiservata);

  return (
    <div className="space-y-4">
      {/* Riepilogo aggregato (solo informativo) */}
      <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-500">Prodotto (aggregato automatico)</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-700">
          <span className="rounded-full bg-white px-2 py-0.5 font-semibold shadow-sm">
            Prezzo: {prodottoInfo.prezzo === null ? "—" : `€${prodottoInfo.prezzo.toFixed(2)}`}
          </span>
          <span className={`rounded-full px-2 py-0.5 font-semibold shadow-sm ${esaurito ? "bg-blue-100 text-blue-700" : "bg-white"}`}>
            Stock: {prodottoInfo.quantitaDisponibile === null ? "non tracciato" : prodottoInfo.quantitaDisponibile}
            {esaurito ? " · Esaurito" : ""}
          </span>
          {prodottoInfo.quantitaRiservata ? (
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 font-semibold text-yellow-700 shadow-sm">
              Riservata: {prodottoInfo.quantitaRiservata} (informazione)
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-blue-500">
          Con le varianti attive, prezzo e stock del prodotto vengono calcolati automaticamente dal sistema
          (prezzo = il più basso tra le varianti attive, stock = somma delle varianti attive). Non modificare prezzo/stock
          del prodotto da qui.
        </p>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {successo ? (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{successo}</span>
        </div>
      ) : null}

      {/* ── Elenco varianti ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Caricamento varianti…
        </div>
      ) : varianti.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
          <p className="text-xs font-medium text-slate-500">
            Nessuna variante. Definisci attributi (es. Taglia, Colore) qui sotto per generare le combinazioni.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Variante</th>
                <th className="px-3 py-2 font-semibold">Attributi</th>
                <th className="px-3 py-2 font-semibold">Prezzo</th>
                <th className="px-3 py-2 font-semibold">Quantità</th>
                <th className="px-3 py-2 font-semibold">Stato</th>
                <th className="px-3 py-2 text-right font-semibold">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {varianti.map((v) => {
                const d = draft[v.id] ?? { nome: v.nome ?? "", prezzo: v.prezzo === null ? "" : String(v.prezzo), quantita: String(v.quantita_disponibile) };
                const esaurita = prodottoEsaurito(v.quantita_disponibile, v.quantita_riservata);
                return (
                  <tr key={v.id} className={v.attivo ? "bg-white" : "bg-slate-50/60 opacity-80"}>
                    <td className="px-3 py-2">
                      <input
                        name={`vp-nome-${v.id}`}
                        value={d.nome}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [v.id]: { ...d, nome: e.target.value } }))}
                        onKeyDown={previeniInvio}
                        placeholder="Nome variante"
                        className="h-8 w-full min-w-[120px] rounded-md border border-slate-200 px-2 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] text-slate-600">{formattaAttributi(v.attributi)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">€</span>
                        <input
                          name={`vp-prezzo-${v.id}`}
                          value={d.prezzo}
                          onChange={(e) => setDraft((prev) => ({ ...prev, [v.id]: { ...d, prezzo: e.target.value } }))}
                          onKeyDown={previeniInvio}
                          placeholder="Eredita"
                          type="number"
                          min="0"
                          step="0.01"
                          className="h-8 w-24 rounded-md border border-slate-200 pl-5 pr-1 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <p className="mt-0.5 text-[9px] text-slate-400">vuoto = prezzo prodotto</p>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        name={`vp-qta-${v.id}`}
                        value={d.quantita}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [v.id]: { ...d, quantita: e.target.value } }))}
                        onKeyDown={previeniInvio}
                        type="number"
                        min="0"
                        step="1"
                        className="h-8 w-20 rounded-md border border-slate-200 px-2 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                      {esaurita ? (
                        <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">Esaurito</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          v.attivo ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {v.attivo ? "Attiva" : "Inattiva"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void salvaModifica(v)}
                          disabled={busyId === v.id}
                          title="Salva modifiche riga"
                          aria-label="Salva modifiche riga"
                          className="rounded-md p-1.5 text-slate-500 transition hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40"
                        >
                          {busyId === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleAttivo(v)}
                          disabled={busyId === v.id}
                          title={v.attivo ? "Disattiva variante" : "Attiva variante"}
                          aria-label={v.attivo ? "Disattiva variante" : "Attiva variante"}
                          className="rounded-md p-1.5 text-slate-500 transition hover:bg-yellow-50 hover:text-yellow-600 disabled:opacity-40"
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void elimina(v)}
                          disabled={busyId === v.id}
                          title="Elimina variante"
                          aria-label="Elimina variante"
                          className="rounded-md p-1.5 text-slate-500 transition hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Builder combinazioni ────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4 text-blue-600" />
          <p className="text-xs font-bold text-slate-800">Crea nuove varianti</p>
        </div>

        <div className="space-y-2">
          {righeAttributo.map((riga, idx) => (
            <div key={idx} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                name={`vp-attributo-nome-${idx}`}
                value={riga.nome}
                onChange={(e) => {
                  const copia = [...righeAttributo];
                  copia[idx] = { ...copia[idx], nome: e.target.value };
                  setRigheAttributo(copia);
                }}
                onKeyDown={previeniInvio}
                placeholder="Attributo (es. Taglia)"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:w-44"
              />
              <input
                name={`vp-attributo-valori-${idx}`}
                value={riga.valori}
                onChange={(e) => {
                  const copia = [...righeAttributo];
                  copia[idx] = { ...copia[idx], valori: e.target.value };
                  setRigheAttributo(copia);
                }}
                onKeyDown={previeniInvio}
                placeholder="Valori separati da virgola (es. S, M, L)"
                className="h-9 w-full flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              {righeAttributo.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRigheAttributo((prev) => prev.filter((_, i) => i !== idx))}
                  title="Rimuovi attributo"
                  aria-label="Rimuovi attributo"
                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-blue-500"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRigheAttributo((prev) => [...prev, { nome: "", valori: "" }])}
            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800"
          >
            <Plus className="h-3 w-3" /> Aggiungi attributo
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Prezzo predefinito (vuoto = eredita)
            </label>
            <input
              name="vp-prezzo-default"
              value={prezzoPredefinito}
              onChange={(e) => setPrezzoPredefinito(e.target.value)}
              onKeyDown={previeniInvio}
              type="number"
              min="0"
              step="0.01"
              placeholder="es. 19,90"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Quantità predefinita
            </label>
            <input
              name="vp-qta-default"
              value={quantitaPredefinita}
              onChange={(e) => setQuantitaPredefinita(e.target.value)}
              onKeyDown={previeniInvio}
              type="number"
              min="0"
              step="1"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {combinazioniGenerate.length > 0 ? (
          <div className="mt-3 rounded-lg border border-blue-100 bg-white px-3 py-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-blue-500">
              Combinazioni ({combinazioniGenerate.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {combinazioniGenerate.map((c) => {
                const k = chiaveCanonica(c);
                const giaPresente = esistenti.has(k);
                return (
                  <span
                    key={k}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      giaPresente ? "bg-slate-100 text-slate-400 line-through" : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {formattaAttributi(c)}
                    {giaPresente ? " (esiste)" : ""}
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void creaCombinazioni()}
          disabled={creando || daCreare.length === 0}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-yellow-400 px-3.5 py-2 text-xs font-bold text-blue-800 shadow-sm transition hover:bg-yellow-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {creando
            ? "Creazione in corso…"
            : daCreare.length > 0
              ? `Crea ${daCreare.length} variante${daCreare.length === 1 ? "" : "e"}`
              : combinazioniGenerate.length > 0
                ? "Tutte già presenti"
                : "Crea varianti"}
        </button>
        {duplicati.length > 0 ? (
          <p className="mt-1.5 text-[10px] text-slate-500">
            {duplicati.length} combinazione{duplicati.length === 1 ? " già presente" : " già presenti"} verranno saltate.
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
        <Layers className="h-3 w-3" />
        <span>La quantità riservata è gestita automaticamente dal sistema e non è modificabile.</span>
      </div>
    </div>
  );
}
