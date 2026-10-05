"use client";

import { useState } from "react";

const LABELS = {
  presa_in_carico: "Prendi in carico / Accetta richiesta",
  istruzioni_reso: "Invia istruzioni reso",
  reso_ricevuto: "Registra reso ricevuto",
  rimborso_avviato: "Avvia rimborso",
  rimborsata: "Conferma rimborso",
  chiusa: "Chiudi pratica",
  rifiuta: "Rifiuta pratica",
};

export default function RecessoAzioniVenditore({ negozioId, ordineId, richiestaId, stato }) {
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [nota, setNota] = useState("");
  const [importo, setImporto] = useState("");

  const azioni = {
    richiesta: ["presa_in_carico", "rifiuta"],
    presa_in_carico: ["istruzioni_reso", "rifiuta"],
    reso_da_spedire: ["reso_ricevuto"],
    reso_ricevuto: ["rimborso_avviato"],
    rimborso_in_corso: ["rimborsata"],
    rimborsata: ["chiusa"],
  }[stato] || [];

  if (!azioni.length) {
    const messaggioStato = {
      rifiutata: "Questa pratica è stata rifiutata e non è più modificabile.",
      annullata: "Questa pratica è stata annullata e non è più modificabile.",
      chiusa: "Questa pratica è chiusa e non è più modificabile.",
    }[stato] || "Questa pratica è in uno stato non modificabile dal venditore.";

    return (
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Azioni pratica</p>
        <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
          {messaggioStato}
        </p>
      </div>
    );
  }

  async function esegui(azione) {
    if ((azione === "rifiuta" || azione === "istruzioni_reso") && !nota.trim()) {
      setErrore(
        azione === "rifiuta"
          ? "Inserisci una nota prima di rifiutare la pratica."
          : "Inserisci una nota prima di inviare le istruzioni di reso."
      );
      return;
    }
    setBusy(true);
    setErrore("");
    try {
      const res = await fetch(
        `/api/merchant/stores/${encodeURIComponent(negozioId)}/ordini/${encodeURIComponent(ordineId)}/recesso/${encodeURIComponent(richiestaId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            azione,
            nota: nota.trim() || null,
            importoRimborsato: azione === "rimborsata" ? importo : null,
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message || "Operazione non riuscita.");
      }
      window.location.reload();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Operazione non riuscita.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">Azioni pratica</p>

      {(azioni.includes("istruzioni_reso") || azioni.includes("rifiuta")) && (
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota per il cliente (obbligatoria per istruzioni reso o rifiuto)"
          rows={3}
          className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          disabled={busy}
        />
      )}

      {azioni.includes("rimborsata") && (
        <label className="mt-3 block text-sm font-semibold text-slate-700">
          Importo effettivamente rimborsato
          <div className="mt-1 flex items-center gap-2">
            <span className="text-slate-500">€</span>
            <input
              inputMode="decimal"
              value={importo}
              onChange={(e) => setImporto(e.target.value)}
              placeholder="0,00"
              className="w-40 rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
              disabled={busy}
            />
          </div>
        </label>
      )}

      {errore && <p className="mt-3 text-sm font-semibold text-red-600">{errore}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {azioni.map((azione) => (
          <button
            key={azione}
            type="button"
            onClick={() => esegui(azione)}
            disabled={busy}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${azione === "rifiuta" ? "border border-red-200 bg-white text-red-700 hover:bg-red-50" : "bg-slate-900 text-white hover:bg-slate-800"}`}
          >
            {busy ? "Attendi…" : LABELS[azione]}
          </button>
        ))}
      </div>
    </div>
  );
}
