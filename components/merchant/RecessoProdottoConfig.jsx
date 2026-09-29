"use client";

import { useState } from "react";

const CODICI = [
  ["prodotto_personalizzato", "Prodotto personalizzato"],
  ["prodotto_deperibile", "Prodotto deperibile"],
  ["bene_sigillato_igiene_salute", "Bene sigillato per igiene o salute"],
  ["servizio_tempo_libero_data_specifica", "Servizio per tempo libero con data specifica"],
  ["contenuto_digitale_avviato", "Contenuto digitale già avviato"],
  ["servizio_urgente_su_richiesta", "Servizio urgente su richiesta"],
  ["altra_esclusione_prevista", "Altra esclusione prevista"],
];

export default function RecessoProdottoConfig({ negozioId, productId, initialData }) {
  const [applicabile, setApplicabile] = useState(initialData?.recesso_applicabile !== false);
  const [codice, setCodice] = useState(initialData?.recesso_esclusione_codice || "");
  const [dettaglio, setDettaglio] = useState(initialData?.recesso_esclusione_dettaglio || "");
  const [busy, setBusy] = useState(false);
  const [messaggio, setMessaggio] = useState("");
  const [errore, setErrore] = useState("");

  async function salva() {
    setErrore("");
    setMessaggio("");

    if (!applicabile && !codice) {
      setErrore("Per escludere il recesso devi indicare una motivazione.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(
        "/api/merchant/stores/" + encodeURIComponent(negozioId) + "/products/" + encodeURIComponent(productId),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recessoApplicabile: applicabile,
            recessoEsclusioneCodice: applicabile ? null : codice,
            recessoEsclusioneDettaglio: applicabile ? null : dettaglio.trim() || null,
          }),
        }
      );
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setErrore(json?.error?.message || "Impossibile salvare la regola di recesso.");
        return;
      }
      setMessaggio("Regola di recesso salvata.");
    } catch {
      setErrore("Errore di rete. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-blue-100 bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
          Regola di recesso
        </p>
        <h2 className="mt-1 text-base font-black text-slate-900">
          Configurazione applicabilità
        </h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Questa regola viene copiata nell&apos;ordine quando il cliente acquista, così una modifica futura del prodotto non cambia retroattivamente l&apos;acquisto.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <select
          value={applicabile ? "true" : "false"}
          onChange={(e) => setApplicabile(e.target.value === "true")}
          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="true">Recesso applicabile</option>
          <option value="false">Recesso escluso</option>
        </select>

        {!applicabile ? (
          <>
            <select
              value={codice}
              onChange={(e) => setCodice(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">Seleziona il motivo dell&apos;esclusione</option>
              {CODICI.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <textarea
              value={dettaglio}
              onChange={(e) => setDettaglio(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Dettaglio informativo mostrato al cliente (facoltativo)"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
          </>
        ) : null}

        {errore ? (
          <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">{errore}</p>
        ) : null}
        {messaggio ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{messaggio}</p>
        ) : null}

        <button
          type="button"
          onClick={() => void salva()}
          disabled={busy}
          className="rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-bold text-blue-900 transition hover:bg-yellow-300 disabled:opacity-60"
        >
          {busy ? "Salvataggio…" : "Salva regola di recesso"}
        </button>
      </div>
    </section>
  );
}
