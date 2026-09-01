"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";

/**
 * Pulsante "Avvisami quando torna disponibile" (prodotto esaurito).
 *
 * - Se l'utente è autenticato: l'iscrizione usa l'account (email + user_id),
 *   nessun campo email da compilare. All'apertura verifica lo stato per
 *   mostrare "già iscritto".
 * - Se guest: mostra un campo email (validato client + server).
 * - Stati: idle → email (solo guest) → success / already; loading dedicato,
 *   gestione errori chiara. Coerente con lo stile InCittà (desktop/mobile).
 */
export default function AvvisamiDisponibilitaButton({
  prodottoId,
  autenticato,
}: {
  prodottoId: string;
  autenticato: boolean;
}) {
  const [fase, setFase] = useState<"idle" | "email" | "success" | "already">("idle");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [errore, setErrore] = useState<string | null>(null);

  // Utente autenticato: verifica subito se è già iscritto.
  useEffect(() => {
    if (!autenticato) return;
    let attivo = true;
    fetch(`/api/cliente/prodotti/${prodottoId}/avvisami`)
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: { iscritto?: boolean } }) => {
        if (attivo && j?.success && j?.data?.iscritto) setFase("already");
      })
      .catch(() => {});
    return () => {
      attivo = false;
    };
  }, [prodottoId, autenticato]);

  async function iscriviti(emailInviata?: string) {
    setErrore(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/cliente/prodotti/${prodottoId}/avvisami`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(emailInviata ? { email: emailInviata } : {}),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: { giaIscritto?: boolean };
        error?: { message?: string };
      } | null;

      if (!res.ok || !json?.success) {
        setErrore(json?.error?.message ?? "Si è verificato un errore. Riprova.");
        return;
      }

      setFase(json.data?.giaIscritto ? "already" : "success");
    } catch {
      setErrore("Errore di rete. Controlla la connessione e riprova.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valore = email.trim();
    if (!valore) {
      setErrore("Inserisci la tua email.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valore)) {
      setErrore("Inserisci un indirizzo email valido.");
      return;
    }
    iscriviti(valore);
  }

  if (fase === "success") {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
        <BellRing className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Ti avviseremo quando sarà nuovamente disponibile.</span>
      </div>
    );
  }

  if (fase === "already") {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
        <BellRing className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Sei già iscritto: ti avviseremo quando torna disponibile.</span>
      </div>
    );
  }

  if (fase === "email") {
    return (
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 bg-white p-4"
      >
        <p className="text-sm font-bold text-slate-900">
          Avvisami quando torna disponibile
        </p>
        <label
          htmlFor="avvisami-email"
          className="mt-3 block text-xs font-semibold text-slate-700"
        >
          Email *
        </label>
        <input
          id="avvisami-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrore(null);
          }}
          autoComplete="email"
          required
          aria-required="true"
          placeholder="nome@esempio.it"
          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
        />
        {errore && (
          <p className="mt-2 text-xs font-semibold text-blue-600">{errore}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-400 px-4 py-2 text-sm font-bold text-blue-800 shadow-sm transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            Conferma iscrizione
          </button>
          <button
            type="button"
            onClick={() => {
              setFase("idle");
              setErrore(null);
            }}
            className="inline-flex items-center rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm font-semibold text-yellow-800 transition hover:border-yellow-300 hover:bg-yellow-100"
          >
            Annulla
          </button>
        </div>
      </form>
    );
  }

  return (
    <div>
      {errore && (
        <p className="mb-2 text-xs font-semibold text-blue-600">{errore}</p>
      )}
      <button
        type="button"
        onClick={() => {
          if (autenticato) {
            iscriviti();
          } else {
            setFase("email");
            setErrore(null);
          }
        }}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 transition hover:border-blue-400 hover:bg-blue-100 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Bell className="h-4 w-4" />
        )}
        Avvisami quando torna disponibile
      </button>
    </div>
  );
}
