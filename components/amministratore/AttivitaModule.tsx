"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ShieldCheck, Store } from "lucide-react";
import type { AttivitaRow } from "@/lib/amministratore/attivita-types";
import AttivitaCardGrid from "./AttivitaCardGrid";
import AttivitaToolbar from "./AttivitaToolbar";

const normalizza = (testo: string) => testo.trim().toLowerCase();

/** Modulo "Gestione Negozi": header, ricerca, filtro e griglia di card. */
export default function AttivitaModule({
  attivita,
  categorie,
  errorMessage = null,
}: {
  attivita: AttivitaRow[];
  categorie: string[];
  errorMessage?: string | null;
}) {
  const [ricerca, setRicerca] = useState("");
  const [categoria, setCategoria] = useState("tutte");
  const [eliminati, setEliminati] = useState<Set<string>>(new Set());

  const handleElimina = useCallback((id: string) => {
    setEliminati((prev) => new Set(prev).add(id));
  }, []);

  const visibili = useMemo(() => {
    const termine = normalizza(ricerca);
    return attivita.filter((riga) => {
      if (eliminati.has(riga.id)) return false;
      if (categoria !== "tutte" && riga.categoria !== categoria) return false;
      if (termine) {
        const nelTesto = [riga.nome, riga.categoria, riga.slug]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!nelTesto.includes(termine)) return false;
      }
      return true;
    }).sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [attivita, ricerca, categoria, eliminati]);

  return (
    <div className="space-y-5">
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        {/* Breadcrumb */}
        <nav aria-label="Percorso" className="mb-5">
          <button
            type="button"
            onClick={() => (window.location.href = "/amministratore")}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 transition hover:text-blue-800"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Torna al pannello
          </button>
        </nav>

        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Store className="h-7 w-7" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Centro di controllo
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Gestione Negozi
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Gestisci tutti i negozi presenti sulla piattaforma. Usa la ricerca
              o il filtro per categoria, apri un negozio per modificarlo oppure
              sposta nel Cestino una scheda non più attiva.
            </p>
          </div>
        </div>
      </div>

      <AttivitaToolbar
        ricerca={ricerca}
        onRicerca={setRicerca}
        categoria={categoria}
        categorie={categorie}
        onCategoria={setCategoria}
      />

      {/* Errori server (es. DB non raggiungibile) */}
      {errorMessage ? (
        <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
          <p className="leading-6">{errorMessage}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-sm font-black text-slate-700">
          {visibili.length}{" "}
          {visibili.length === 1 ? "negozio" : "negozi"}
        </p>
        {(ricerca || categoria !== "tutte") && (
          <button
            type="button"
            onClick={() => {
              setRicerca("");
              setCategoria("tutte");
            }}
            className="text-xs font-semibold text-blue-600 underline-offset-2 transition hover:underline"
          >
            Azzera filtri
          </button>
        )}
      </div>

      <AttivitaCardGrid attivita={visibili} onElimina={handleElimina} />

      <div className="flex items-start gap-3 rounded-3xl border border-blue-100 bg-blue-50/60 px-5 py-4 text-sm text-blue-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
        <p className="leading-6">
          <span className="font-bold">Centro di controllo:</span> dati reali dal
          database. Elimina sposta la scheda nel Cestino, da cui puoi
          ripristinarla o eliminarla definitivamente.
        </p>
      </div>
    </div>
  );
}