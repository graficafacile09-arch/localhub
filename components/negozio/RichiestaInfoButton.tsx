"use client";

import { useState } from "react";
import { MessageSquare, Loader2, X, CheckCircle2, AlertTriangle } from "lucide-react";
import type { TipoRichiestaInfo } from "@/lib/negozio/richiesta-info";

type Props = {
  slug: string;
  titolo: string;
  testo: string;
  tipo: TipoRichiestaInfo;
  emailObbligatoria: boolean;
  telefonoObbligatoria: boolean;
  messaggioObbligatoria: boolean;
  /** Contesto opzionale (es. immobile): trasmesso all'API, non obbligatorio. */
  oggettoRiferimento?: string;
  oggettoTipo?: string;
  oggettoId?: string;
};

export default function RichiestaInfoButton({
  slug,
  titolo,
  testo,
  emailObbligatoria,
  telefonoObbligatoria,
  messaggioObbligatoria,
  oggettoRiferimento,
  oggettoTipo,
  oggettoId,
}: Props) {
  const [aperto, setAperto] = useState(false);
  const [inviando, setInviando] = useState(false);
  const [fatto, setFatto] = useState(false);
  const [errore, setErrore] = useState("");

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [messaggio, setMessaggio] = useState("");

  // Honeypot: campi nascosti che solo i bot compilano.
  const [website, setWebsite] = useState("");
  const [company, setCompany] = useState("");
  const [fax, setFax] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrore("");
    setInviando(true);
    try {
      const res = await fetch(`/api/negozi/${slug}/richiesta-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          email,
          telefono,
          messaggio,
          tipo: "informazioni",
          pagina_origine:
            typeof window !== "undefined" ? window.location.pathname : null,
          oggetto_riferimento: oggettoRiferimento || null,
          oggetto_tipo: oggettoTipo || null,
          oggetto_id: oggettoId || null,
          website,
          company,
          fax,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setErrore(
          json?.error?.message ??
            "Non è stato possibile inviare la richiesta. Riprova tra poco."
        );
        return;
      }
      setFatto(true);
    } catch {
      setErrore("Errore di connessione. Riprova tra poco.");
    } finally {
      setInviando(false);
    }
  }

  function chiudi() {
    setAperto(false);
    // Reset dopo la chiusura per la prossima apertura.
    setTimeout(() => {
      setFatto(false);
      setErrore("");
      setNome("");
      setEmail("");
      setTelefono("");
      setMessaggio("");
    }, 200);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAperto(true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-yellow-400 px-3.5 py-2 text-xs font-bold text-blue-900 shadow-sm transition hover:bg-yellow-300 hover:shadow-md"
      >
        <MessageSquare className="h-4 w-4" />
        {titolo}
      </button>

      {aperto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
          onClick={chiudi}
        >
          <div
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={titolo}
          >
            <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-slate-900">{titolo}</h3>
                {testo && <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{testo}</p>}
              </div>
              <button
                type="button"
                onClick={chiudi}
                aria-label="Chiudi"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-yellow-100 hover:text-yellow-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {fatto ? (
              <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                <p className="text-sm font-bold text-slate-900">
                  Richiesta inviata. Ti ricontatteremo al più presto.
                </p>
                <button
                  type="button"
                  onClick={chiudi}
                  className="mt-2 rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-600 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800"
                >
                  Chiudi
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4" noValidate>
                {/* Honeypot: nascosti, ignorati dagli utenti reali */}
                <div className="hidden" aria-hidden="true">
                  <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
                  <input type="text" tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} name="company" />
                  <input type="text" tabIndex={-1} autoComplete="off" value={fax} onChange={(e) => setFax(e.target.value)} name="fax" />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                    Nome <span className="text-blue-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                    maxLength={200}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                    Email {emailObbligatoria && <span className="text-blue-400">*</span>}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required={emailObbligatoria}
                    maxLength={200}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                    Telefono {telefonoObbligatoria && <span className="text-blue-400">*</span>}
                  </label>
                  <input
                    type="tel"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    required={telefonoObbligatoria}
                    maxLength={30}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                    Messaggio {messaggioObbligatoria && <span className="text-blue-400">*</span>}
                  </label>
                  <textarea
                    value={messaggio}
                    onChange={(e) => setMessaggio(e.target.value)}
                    required={messaggioObbligatoria}
                    rows={3}
                    maxLength={5000}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
                  />
                </div>

                {errore && (
                  <p className="flex items-start gap-1.5 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {errore}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={inviando}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 px-6 py-3 text-xs font-bold text-blue-900 transition hover:bg-yellow-300 disabled:opacity-50"
                >
                  {inviando ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Invio in corso...
                    </>
                  ) : (
                    "Invia richiesta"
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
