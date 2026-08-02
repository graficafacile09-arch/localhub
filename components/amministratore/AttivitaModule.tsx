"use client";

import { useMemo, useState } from "react";
import { Sparkles, Store } from "lucide-react";
import type {
  AttivitaRow,
  FiltroEvidenzaAttivita,
  FiltroStatoAttivita,
  OrdinaAttivita,
} from "@/lib/amministratore/attivita-types";
import AttivitaTable from "./AttivitaTable";
import AttivitaToolbar from "./AttivitaToolbar";

const normalizza = (testo: string) => testo.trim().toLowerCase();

/**
 * Modulo Attività (/amministratore/attivita) — parte interattiva.
 * Ricerca, filtri e ordinamento avvengono client-side sui dati reali passati
 * come prop dal server. Pronto per essere collegato a CRUD, permessi, audit
 * e storico modifiche nelle prossime fasi.
 */
export default function AttivitaModule({
  attivita,
  categorie,
}: {
  attivita: AttivitaRow[];
  categorie: string[];
}) {
  const [ricerca, setRicerca] = useState("");
  const [categoria, setCategoria] = useState("tutte");
  const [stato, setStato] = useState<FiltroStatoAttivita>("tutti");
  const [evidenza, setEvidenza] =
    useState<FiltroEvidenzaAttivita>("tutti");
  const [ordina, setOrdina] = useState<OrdinaAttivita>("recenti");

  const visibili = useMemo(() => {
    const termine = normalizza(ricerca);

    const filtrati = attivita.filter((riga) => {
      if (termine) {
        const nelTesto = [
          riga.nome,
          riga.categoria,
          riga.proprietario,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!nelTesto.includes(termine)) return false;
      }
      if (categoria !== "tutte" && riga.categoria !== categoria) return false;
      if (stato === "attivi" && !riga.attivo) return false;
      if (stato === "disattivati" && riga.attivo) return false;
      if (evidenza === "solo-evidenza" && !riga.in_evidenza) return false;
      return true;
    });

    return filtrati.sort((a, b) => {
      switch (ordina) {
        case "nome":
          return a.nome.localeCompare(b.nome, "it");
        case "prodotti":
          return b.prodotti - a.prodotti;
        case "evidenza":
          return Number(b.in_evidenza) - Number(a.in_evidenza);
        case "stato":
          return Number(b.attivo) - Number(a.attivo);
        case "recenti":
        default:
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
      }
    });
  }, [attivita, ricerca, categoria, stato, evidenza, ordina]);

  return (
    <div className="space-y-5">
      {/* ── Intestazione modulo ─────────────────────────────────────────────── */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Store className="h-7 w-7" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Centro di controllo
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Attività
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Gestisci tutti i negozi presenti nella piattaforma. Questo è il
              pannello dell&apos;Amministratore, non quello del Commerciante:
              qui vedi ogni attività, il suo proprietario e lo stato globale.
            </p>
          </div>
        </div>
      </div>

      {/* ── Barra superiore ─────────────────────────────────────────────────── */}
      <AttivitaToolbar
        ricerca={ricerca}
        onRicerca={setRicerca}
        categoria={categoria}
        categorie={categorie}
        onCategoria={setCategoria}
        stato={stato}
        onStato={setStato}
        evidenza={evidenza}
        onEvidenza={setEvidenza}
        ordina={ordina}
        onOrdina={setOrdina}
      />

      {/* ── Contatore risultati ─────────────────────────────────────────────── */}
      <p className="px-1 text-xs font-semibold text-slate-500">
        {visibili.length} attività trovate
      </p>

      {/* ── Tabella ─────────────────────────────────────────────────────────── */}
      <AttivitaTable attivita={visibili} />

      {/* ── Nota di stato ───────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-3xl border border-blue-100 bg-blue-50/60 px-5 py-4 text-sm text-blue-900">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
        <p className="leading-6">
          <span className="font-bold">Stato attuale:</span> dati reali dal
          database (negozi, prodotti attivi e proprietari). Le azioni
          (Visualizza, Modifica, Apri negozio, Gestisci proprietario, Metti in
          evidenza, Disattiva, Elimina) sono placeholder.
        </p>
      </div>
    </div>
  );
}
