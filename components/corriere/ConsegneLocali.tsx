"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  History,
  MapPin,
  MessageCircle,
  PackageCheck,
  RefreshCw,
  Truck,
} from "lucide-react";
import OrdineComunicazioni from "@/components/ordini/OrdineComunicazioni";

type Item = {
  ordine_id: string;
  stato: string;
  latitudine: number | null;
  longitudine: number | null;
  assegnata_at: string | null;
  consegnata_at: string | null;
  problema_at: string | null;
  comunicazioni_non_lette: number;
  ordini: {
    numero: string;
    negozio_nome: string | null;
    cliente_nome: string | null;
    cliente_cognome: string | null;
    cliente_telefono: string | null;
    spedizione_indirizzo: string | null;
    spedizione_cap: string | null;
    spedizione_citta: string | null;
    spedizione_note: string | null;
    totale: number | null;
  } | null;
};

const labels: Record<string, string> = {
  assegnata: "Da accettare",
  accettata: "Accettata",
  ritirata: "Ritirata",
  in_consegna: "In consegna",
  consegnata: "Consegnata",
  problema_consegna: "Problema",
  annullata: "Annullata",
};

const actions: Record<string, { stato: string; label: string }[]> = {
  assegnata: [
    { stato: "accettata", label: "Accetta consegna" },
    { stato: "problema_consegna", label: "Segnala problema" },
  ],
  accettata: [
    { stato: "ritirata", label: "Conferma ritiro" },
    { stato: "problema_consegna", label: "Segnala problema" },
  ],
  ritirata: [
    { stato: "in_consegna", label: "Avvia consegna" },
    { stato: "problema_consegna", label: "Segnala problema" },
  ],
  in_consegna: [
    { stato: "consegnata", label: "Conferma consegna" },
    { stato: "problema_consegna", label: "Segnala problema" },
  ],
  problema_consegna: [
    { stato: "accettata", label: "Riprendi consegna" },
    { stato: "annullata", label: "Annulla consegna" },
  ],
};

const filters = [
  ["tutte", "Tutte"],
  ["da_accettare", "Da accettare"],
  ["attive", "Attive"],
  ["problemi", "Problemi"],
  ["storico", "Storico"],
] as const;

function maps(
  lat: number | null,
  lng: number | null,
  address: string | null,
  cap: string | null,
  citta: string | null,
) {
  if (lat != null && lng != null) {
    return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(lat + "," + lng);
  }
  if (!address) return null;
  return (
    "https://www.google.com/maps/dir/?api=1&destination=" +
    encodeURIComponent([address, cap, citta].filter(Boolean).join(", "))
  );
}

function isHistory(stato: string) {
  return stato === "consegnata" || stato === "annullata";
}

export default function ConsegneLocali() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [chat, setChat] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof filters)[number][0]>("tutte");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/corriere/consegne", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Impossibile caricare le consegne.");
      setItems(j.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossibile caricare le consegne.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function update(id: string, stato: string) {
    setBusy(id);
    setError(null);
    try {
      const r = await fetch("/api/corriere/consegne", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordineId: id, stato }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Impossibile aggiornare la consegna.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossibile aggiornare la consegna.");
    } finally {
      setBusy(null);
    }
  }

  const stats = useMemo(
    () => ({
      daAccettare: items.filter((i) => i.stato === "assegnata").length,
      attive: items.filter((i) => ["accettata", "ritirata", "in_consegna"].includes(i.stato)).length,
      problemi: items.filter((i) => i.stato === "problema_consegna").length,
      consegnate: items.filter((i) => i.stato === "consegnata").length,
      nonLetti: items.reduce((sum, i) => sum + i.comunicazioni_non_lette, 0),
    }),
    [items],
  );

  const visible = useMemo(() => {
    if (filter === "da_accettare") return items.filter((i) => i.stato === "assegnata");
    if (filter === "attive") return items.filter((i) => ["accettata", "ritirata", "in_consegna"].includes(i.stato));
    if (filter === "problemi") return items.filter((i) => i.stato === "problema_consegna");
    if (filter === "storico") return items.filter((i) => isHistory(i.stato));
    return items;
  }, [items, filter]);

  const communications = items.filter((i) => i.comunicazioni_non_lette > 0);

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Caricamento dashboard corriere…</div>;
  }

  return (
    <div className="space-y-6">
      <section id="dashboard" className="scroll-mt-24">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ["Da accettare", stats.daAccettare, "bg-amber-50 border-amber-200 text-amber-800"],
            ["Attive", stats.attive, "bg-emerald-50 border-emerald-200 text-emerald-800"],
            ["Problemi", stats.problemi, "bg-red-50 border-red-200 text-red-800"],
            ["Consegnate", stats.consegnate, "bg-slate-50 border-slate-200 text-slate-800"],
            ["Messaggi", stats.nonLetti, "bg-blue-50 border-blue-200 text-blue-800"],
          ].map(([label, value, classes]) => (
            <div key={String(label)} className={`rounded-2xl border p-4 ${classes}`}>
              <p className="text-xs font-bold uppercase tracking-wide opacity-80">{label}</p>
              <p className="mt-1 text-2xl font-black">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="consegne" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900">Consegne locali</h2>
            <p className="text-sm text-slate-500">Gestisci ogni consegna senza perdere di vista le priorità.</p>
          </div>
          <button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" /> Aggiorna
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {filters.map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} className={`rounded-xl px-3 py-2 text-sm font-bold ${filter === key ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              {label}
              {key === "da_accettare" && stats.daAccettare > 0 ? ` · ${stats.daAccettare}` : ""}
              {key === "attive" && stats.attive > 0 ? ` · ${stats.attive}` : ""}
              {key === "problemi" && stats.problemi > 0 ? ` · ${stats.problemi}` : ""}
            </button>
          ))}
        </div>

        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

        <div className="mt-5 space-y-4">
          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Nessuna consegna in questa sezione.
            </div>
          ) : (
            visible.map((i) => {
              const o = i.ordini;
              const url = maps(i.latitudine, i.longitudine, o?.spedizione_indirizzo ?? null, o?.spedizione_cap ?? null, o?.spedizione_citta ?? null);
              return (
                <article key={i.ordine_id} className="rounded-2xl border border-slate-200 p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Ordine {o?.numero ?? i.ordine_id}</p>
                      <h3 className="mt-1 text-lg font-black text-slate-900">{o?.cliente_nome} {o?.cliente_cognome}</h3>
                      <p className="mt-1 text-sm font-semibold text-slate-600">{o?.negozio_nome ?? "Negozio"} · {o?.spedizione_indirizzo}, {o?.spedizione_cap} {o?.spedizione_citta}</p>
                      {o?.cliente_telefono && <p className="mt-1 text-sm text-slate-500">Tel. {o.cliente_telefono}</p>}
                      {o?.spedizione_note && <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{o.spedizione_note}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">{labels[i.stato] ?? i.stato}</span>
                      {i.comunicazioni_non_lette > 0 && <span className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">{i.comunicazioni_non_lette} nuovi messaggi</span>}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700"><MapPin className="h-4 w-4" />Navigazione</a>}
                    <button onClick={() => setChat(chat === i.ordine_id ? null : i.ordine_id)} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700"><MessageCircle className="h-4 w-4" />{chat === i.ordine_id ? "Chiudi comunicazioni" : "Comunicazioni"}{i.comunicazioni_non_lette > 0 ? ` · ${i.comunicazioni_non_lette}` : ""}</button>
                    {(actions[i.stato] ?? []).map((a) => (
                      <button key={a.stato} disabled={busy === i.ordine_id} onClick={() => void update(i.ordine_id, a.stato)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${a.stato === "problema_consegna" || a.stato === "annullata" ? "bg-red-600" : "bg-emerald-700"}`}>
                        {a.stato === "consegnata" ? <CheckCircle2 className="h-4 w-4" /> : a.stato === "ritirata" ? <PackageCheck className="h-4 w-4" /> : a.stato === "problema_consegna" ? <AlertTriangle className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                        {busy === i.ordine_id ? "Aggiornamento…" : a.label}
                      </button>
                    ))}
                  </div>

                  {chat === i.ordine_id && <div className="mt-4"><OrdineComunicazioni ordineId={i.ordine_id} /></div>}
                </article>
              );
            })
          )}
        </div>
      </section>

      <section id="comunicazioni" className="scroll-mt-24 rounded-2xl border border-blue-100 bg-blue-50/50 p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-blue-700" />
          <h2 className="text-lg font-black text-slate-900">Comunicazioni</h2>
          {stats.nonLetti > 0 && <span className="rounded-full bg-blue-600 px-2.5 py-1 text-xs font-bold text-white">{stats.nonLetti} non letti</span>}
        </div>
        <p className="mt-1 text-sm text-slate-600">Cliente, venditore e corriere parlano nello stesso ordine. Le conversazioni con messaggi nuovi sono evidenziate nelle consegne.</p>
        {communications.length > 0 ? (
          <div className="mt-4 space-y-2">
            {communications.map((i) => (
              <button key={i.ordine_id} onClick={() => { setFilter("tutte"); setChat(i.ordine_id); document.getElementById("consegne")?.scrollIntoView({ behavior: "smooth" }); }} className="flex w-full items-center justify-between rounded-xl bg-white p-3 text-left shadow-sm hover:bg-blue-50">
                <span className="font-bold text-slate-800">Ordine {i.ordini?.numero ?? i.ordine_id}</span>
                <span className="text-sm font-black text-blue-700">{i.comunicazioni_non_lette} nuovi</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-white p-4 text-sm text-slate-500">Nessun nuovo messaggio.</p>
        )}
      </section>

      <section id="storico" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-slate-600" />
          <h2 className="text-lg font-black text-slate-900">Storico consegne</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">Le consegne concluse e annullate rimangono consultabili.</p>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {items.filter((i) => isHistory(i.stato)).length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nessuna consegna conclusa.</p>
          ) : (
            items.filter((i) => isHistory(i.stato)).slice(0, 10).map((i) => (
              <button key={i.ordine_id} onClick={() => { setFilter("storico"); document.getElementById("consegne")?.scrollIntoView({ behavior: "smooth" }); }} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50">
                <span><span className="block font-bold text-slate-800">Ordine {i.ordini?.numero ?? i.ordine_id}</span><span className="text-xs text-slate-500">{i.ordini?.negozio_nome ?? "Negozio"}</span></span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${i.stato === "consegnata" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{labels[i.stato]}</span>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
