"use client";

// Withdrawal UI — production retry marker.

import { useEffect, useMemo, useState } from "react";

function euro(value) {
  return Number(value || 0).toFixed(2).replace(".", ",");
}

function dataIT(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("it-IT");
}

export default function RecessoOrdine({ ordineId, token = null }) {
  const [info, setInfo] = useState(null);
  const [aperto, setAperto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [selezionate, setSelezionate] = useState({});
  const [motivo, setMotivo] = useState("");
  const [nota, setNota] = useState("");

  useEffect(() => {
    let attivo = true;

    async function carica() {
      try {
        const query = token ? "?token=" + encodeURIComponent(token) : "";
        const response = await fetch(
          "/api/ordini/" + encodeURIComponent(ordineId) + "/recesso" + query,
          { cache: "no-store" }
        );
        const json = await response.json().catch(() => null);

        if (!response.ok) return;
        if (attivo) {
          setInfo(json?.data ?? null);
          const iniziali = {};
          for (const r of json?.data?.righe ?? []) {
            if (r.recesso_applicabile === true) {
              iniziali[r.id] = Math.max(0, Number(r.quantita || 0));
            }
          }
          setSelezionate(iniziali);
        }
      } catch {
        if (attivo) setErrore("Impossibile verificare il diritto di recesso.");
      }
    }

    void carica();
    return () => {
      attivo = false;
    };
  }, [ordineId, token]);

  const righe = useMemo(
    () =>
      Object.entries(selezionate)
        .map(([ordineRigaId, quantita]) => ({
          ordineRigaId,
          quantita: Number(quantita),
        }))
        .filter((r) => r.quantita > 0),
    [selezionate]
  );

  if (!info || !info.righe?.length) return null;

  const richiesta = info.richiesta;
  const eleggibili = info.righe.filter(
    (r) => r.recesso_applicabile === true && Number(r.quantita || 0) > 0
  );

  async function invia() {
    if (!righe.length) {
      setErrore("Seleziona almeno un articolo.");
      return;
    }

    setBusy(true);
    setErrore("");

    try {
      const response = await fetch(
        "/api/ordini/" + encodeURIComponent(ordineId) + "/recesso",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: token || undefined,
            righe,
            motivo: motivo.trim() || null,
            note: nota.trim() || null,
          }),
        }
      );

      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setErrore(json?.error?.message ?? "Impossibile registrare la richiesta.");
        return;
      }

      setInfo((prev) => ({
        ...prev,
        richiesta: json?.data?.richiesta ?? prev.richiesta,
      }));
      setAperto(false);
    } catch {
      setErrore("Errore di rete. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <span aria-hidden="true">↩</span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">
            Diritto di recesso
          </h2>

          {richiesta ? (
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Richiesta {richiesta.numero} registrata il {dataIT(richiesta.ricevuta_at)}.
            </p>
          ) : info.termineRecessoAt ? (
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Puoi trasmettere la richiesta entro {dataIT(info.termineRecessoAt)}.
            </p>
          ) : (
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Puoi trasmettere la richiesta anche prima della consegna.
            </p>
          )}
        </div>
      </div>

      {errore ? (
        <p className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          {errore}
        </p>
      ) : null}

      {!richiesta && eleggibili.length > 0 ? (
        <>
          <div className="mt-4 space-y-2">
            {eleggibili.map((r) => {
              const q = Number(selezionate[r.id] || 0);
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={q > 0}
                    onChange={(event) =>
                      setSelezionate((prev) => ({
                        ...prev,
                        [r.id]: event.target.checked ? Number(r.quantita || 0) : 0,
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800">{r.nome_prodotto}</p>
                    <p className="text-xs text-slate-500">
                      {Number(r.quantita || 0)} × € {euro(r.prezzo_unitario)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setAperto(true)}
            className="mt-4 rounded-xl bg-yellow-400 px-5 py-3 text-sm font-bold text-blue-800 hover:bg-yellow-300"
          >
            Recedere dal contratto qui
          </button>
        </>
      ) : null}

      {aperto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Chiudi"
            className="fixed inset-0 bg-black/40"
            onClick={() => !busy && setAperto(false)}
          />
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-black text-slate-900">
              Conferma recesso
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              La dichiarazione sarà trasmessa al venditore e registrata con data e ora.
            </p>

            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Motivo (facoltativo)"
              className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />

            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={1500}
              rows={3}
              placeholder="Nota al venditore (facoltativa)"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setAperto(false)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void invia()}
                className="rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-bold text-blue-800"
              >
                {busy ? "Invio…" : "Conferma recesso"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
