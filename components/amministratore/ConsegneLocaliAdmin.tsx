"use client";

import { useEffect, useState } from "react";
import { MapPin, Truck, UserRound } from "lucide-react";

type Courier = { userId: string; nome: string; cognome: string; email: string };
type Delivery = {
  ordine_id: string;
  stato: string;
  latitudine: number | null;
  longitudine: number | null;
  ordine: {
    id: string;
    numero: string;
    stato: string;
    stato_spedizione: string | null;
    cliente_nome: string;
    cliente_cognome: string;
    cliente_telefono: string | null;
    spedizione_indirizzo: string;
    spedizione_cap: string;
    spedizione_citta: string;
    spedizione_provincia: string;
    spedizione_note: string | null;
    negozio_nome: string;
  } | null;
  corriere: Courier | null;
};

export default function ConsegneLocaliAdmin() {
  const [items, setItems] = useState<Delivery[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/amministratore/corrieri/consegne", { cache: "no-store" });
      const json = await response.json();
      if (response.ok) {
        setItems(json.data ?? []);
        setCouriers(json.corrieri ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function assegna(ordineId: string, corriereUserId: string) {
    setBusy(ordineId);
    try {
      const response = await fetch("/api/amministratore/corrieri/consegne", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordineId, corriereUserId: corriereUserId || null }),
      });
      if (!response.ok) return;
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="card p-6 text-sm text-slate-500">Caricamento consegne locali...</div>;

  return (
    <section className="card p-5 md:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
          <Truck className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Operatività</p>
          <h2 className="mt-1 text-xl font-black text-slate-900">Consegne locali</h2>
          <p className="mt-1 text-sm text-slate-500">Assegna gli ordini del corriere locale esclusivamente ai corrieri approvati.</p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="mt-5 text-sm text-slate-500">Nessuna consegna locale presente.</p>
      ) : (
        <div className="mt-5 space-y-3">
          {items.map((item) => {
            const ordine = item.ordine;
            if (!ordine) return null;
            const maps = item.latitudine != null && item.longitudine != null
              ? `https://www.google.com/maps/dir/?api=1&destination=${item.latitudine},${item.longitudine}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${ordine.spedizione_indirizzo}, ${ordine.spedizione_cap} ${ordine.spedizione_citta} (${ordine.spedizione_provincia})`
                )}`;

            return (
              <article key={item.ordine_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-slate-900">#{ordine.numero}</span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600">{item.stato}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-800">{ordine.cliente_nome} {ordine.cliente_cognome}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="h-3.5 w-3.5" />{ordine.spedizione_indirizzo}, {ordine.spedizione_cap} {ordine.spedizione_citta}</p>
                    <p className="mt-1 text-xs text-slate-500">Negozio: {ordine.negozio_nome}</p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      value={item.corriere?.userId ?? ""}
                      disabled={busy === item.ordine_id}
                      onChange={(event) => void assegna(item.ordine_id, event.target.value)}
                      className="min-w-56 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500"
                    >
                      <option value="">Da assegnare</option>
                      {couriers.map((courier) => (
                        <option key={courier.userId} value={courier.userId}>
                          {courier.nome} {courier.cognome}
                        </option>
                      ))}
                    </select>

                    <a
                      href={maps}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 hover:border-emerald-300 hover:text-emerald-700"
                    >
                      <MapPin className="h-4 w-4" aria-hidden />
                      Maps
                    </a>

                    <span className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-bold text-slate-500">
                      <UserRound className="h-4 w-4" aria-hidden />
                      {item.corriere ? `${item.corriere.nome} ${item.corriere.cognome}` : "Non assegnato"}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
