"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Loader2,
  Mail,
  PackageSearch,
  Phone,
  Search,
  ShieldCheck,
  Store,
} from "lucide-react";
import type { OrdineClienteDettaglio, StatoOrdine } from "@/lib/cliente/types";
import {
  etichettaModalita,
  etichettaStato,
  formattaDataOrdine,
} from "@/lib/cliente/ordini-format";

function formattaPrezzo(value: number): string {
  return `€${(value || 0).toFixed(2).replace(".", ",")}`;
}

function BadgeStato({ stato }: { stato: StatoOrdine }) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold";
  const colori: Record<StatoOrdine, string> = {
    in_preparazione: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    confermato: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    in_lavorazione: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
    pronto: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200",
    in_consegna: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    consegnato: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    cancellato: "bg-red-50 text-red-600 ring-1 ring-red-200",
  };
  return <span className={`${base} ${colori[stato]}`}>{etichettaStato(stato)}</span>;
}

function OrdineRecuperato({ ordine }: { ordine: OrdineClienteDettaglio }) {
  const indirizzoSpedizione = [
    ordine.spedizioneIndirizzo,
    ordine.spedizioneCap,
    ordine.spedizioneCitta,
    ordine.spedizioneProvincia,
  ]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(", ");

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-black tracking-wide text-slate-900">
              {ordine.numero}
            </span>
            <BadgeStato stato={ordine.stato} />
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <Store className="h-4 w-4 text-emerald-600" aria-hidden />
            {ordine.negozioNome}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {formattaDataOrdine(ordine.createdAt)} · {etichettaModalita(ordine.modalita)}
          </p>
        </div>
        <span className="text-xl font-black text-slate-900">
          {formattaPrezzo(ordine.totale)}
        </span>
      </div>

      {/* Prodotti */}
      <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
        {ordine.righe.map((riga) => (
          <div key={riga.prodottoId} className="flex items-center justify-between py-2.5">
            <div className="min-w-0 pr-4">
              <p className="truncate text-sm font-semibold text-slate-800">
                {riga.nomeProdotto}
              </p>
              <p className="text-xs text-slate-500">
                {riga.quantita} × {formattaPrezzo(riga.prezzoUnitario)}
              </p>
            </div>
            <span className="shrink-0 text-sm font-bold text-slate-900">
              {formattaPrezzo(riga.prezzoUnitario * riga.quantita)}
            </span>
          </div>
        ))}
      </div>

      {/* Dettagli consegna */}
      {(ordine.ritiroData ||
        ordine.ritiroFascia ||
        indirizzoSpedizione ||
        ordine.note) && (
        <div className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          {ordine.modalita === "ritiro" ? (
            <p>
              <strong>Ritiro in negozio</strong>
              {(ordine.ritiroData || ordine.ritiroFascia) &&
                ` — ${[ordine.ritiroData, ordine.ritiroFascia].filter(Boolean).join(", ")}`}
            </p>
          ) : (
            indirizzoSpedizione && (
              <p>
                <strong>Spedizione a:</strong> {indirizzoSpedizione}
              </p>
            )
          )}
          {ordine.note && <p className="mt-1.5">📝 {ordine.note}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Recupero ordini per clienti GUEST (acquisto senza account).
 * Email + telefono (entrambi): la corrispondenza avviene lato server;
 * l'ordine compare solo se i due dati coincidono con quelli salvati.
 */
export default function RecuperaOrdiniPage() {
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [ricerca, setRicerca] = useState(false);
  const [caricamento, setCaricamento] = useState(false);
  const [ordini, setOrdini] = useState<OrdineClienteDettaglio[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const cerca = async () => {
    if (caricamento) return;
    if (!email.trim() || !telefono.trim()) {
      setErrore("Inserisci sia l'email sia il telefono usati per l'ordine.");
      return;
    }

    setCaricamento(true);
    setErrore(null);
    setOrdini(null);
    try {
      const res = await fetch("/api/ordini/recupera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), telefono: telefono.trim() }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { ordini?: OrdineClienteDettaglio[] };
        error?: { message?: string };
      };

      if (!res.ok || !json.success || !json.data?.ordini) {
        setErrore(
          json.error?.message ?? "Nessun ordine trovato con questi dati."
        );
        return;
      }

      setOrdini(json.data.ordini);
    } catch {
      setErrore("Errore di rete. Controlla la connessione e riprova.");
    } finally {
      setCaricamento(false);
      setRicerca(true);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Intestazione */}
        <div className="rounded-2xl bg-gradient-to-b from-blue-600 to-blue-700 p-6 text-center text-white shadow-lg shadow-blue-500/20">
          <PackageSearch className="mx-auto h-12 w-12" />
          <h1 className="mt-3 text-2xl font-black tracking-tight">
            Recupera i tuoi ordini
          </h1>
          <p className="mt-1 text-sm text-blue-100">
            Hai acquistato senza account? Inserisci l&apos;email e il telefono
            usati al momento dell&apos;ordine.
          </p>
          <p className="mx-auto mt-3 inline-flex max-w-md items-center gap-1.5 rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold text-blue-50">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            I tuoi ordini restano al sicuro: servono entrambi i dati per trovarli
          </p>
        </div>

        {/* Form */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="email-recupero"
                className="block text-xs font-semibold text-slate-700"
              >
                Email *
              </label>
              <div className="relative mt-1">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="email-recupero"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@esempio.it"
                  className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="telefono-recupero"
                className="block text-xs font-semibold text-slate-700"
              >
                Telefono *
              </label>
              <div className="relative mt-1">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="telefono-recupero"
                  type="tel"
                  autoComplete="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="333 1234567"
                  className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                />
              </div>
            </div>
          </div>

          {errore && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {errore}
            </div>
          )}

          <button
            type="button"
            onClick={cerca}
            disabled={caricamento}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-blue-500/25 transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {caricamento ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Ricerca in corso...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Cerca i miei ordini
              </>
            )}
          </button>
        </div>

        {/* Risultati */}
        {ordini && ordini.length > 0 && (
          <div className="mt-4 space-y-4">
            <p className="text-sm font-bold text-slate-700">
              {ordini.length === 1
                ? "Trovato 1 ordine"
                : `Trovati ${ordini.length} ordini`}
            </p>
            {ordini.map((ordine) => (
              <OrdineRecuperato key={ordine.id} ordine={ordine} />
            ))}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-800">
              <p className="font-bold">Hai un account? I tuoi ordini restano qui per sempre.</p>
              <p className="mt-1">
                Se ti registri e accedi come cliente, i tuoi prossimi acquisti
                compariranno automaticamente nella tua area personale.
              </p>
            </div>
          </div>
        )}

        {ricerca && ordini && ordini.length === 0 && !caricamento && (
          <div className="mt-4 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-100">
            <p className="text-sm font-semibold text-slate-600">
              Nessun ordine trovato con questi dati.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Verifica che email e telefono coincidano con quelli usati al checkout.
            </p>
          </div>
        )}

        {/* Azioni */}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/ordini"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" /> Torna alla home
          </Link>
        </div>
      </div>
    </main>
  );
}
