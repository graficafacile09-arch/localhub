"use client";

import { useCallback, useMemo, useState } from "react";
import { Sparkles, Store } from "lucide-react";
import type {
  AttivitaRow,
  FiltroEvidenzaAttivita,
  FiltroStatoAttivita,
  OrdinaAttivita,
} from "@/lib/amministratore/attivita-types";
import AttivitaTable from "./AttivitaTable";
import AttivitaToolbar from "./AttivitaToolbar";

type AggiornamentoAttivita = Partial<
  Pick<AttivitaRow, "proprietarioId" | "proprietario" | "attivo" | "in_evidenza">
>;

const normalizza = (testo: string) => testo.trim().toLowerCase();

/** Modulo Attività interattivo con mutazioni admin immediate e locali. */
export default function AttivitaModule({
  attivita,
  categorie,
}: {
  attivita: AttivitaRow[];
  categorie: string[];
}) {
  const [righe, setRighe] = useState(attivita);
  const [ricerca, setRicerca] = useState("");
  const [categoria, setCategoria] = useState("tutte");
  const [stato, setStato] = useState<FiltroStatoAttivita>("tutti");
  const [evidenza, setEvidenza] = useState<FiltroEvidenzaAttivita>("tutti");
  const [ordina, setOrdina] = useState<OrdinaAttivita>("recenti");
  const [eliminati, setEliminati] = useState<Set<string>>(new Set());

  const handleElimina = useCallback((id: string) => {
    setEliminati((prev) => new Set(prev).add(id));
  }, []);

  const handleAggiorna = useCallback(
    (id: string, aggiornamento: AggiornamentoAttivita) => {
      setRighe((prev) =>
        prev.map((riga) => (riga.id === id ? { ...riga, ...aggiornamento } : riga))
      );
    },
    []
  );

  const visibili = useMemo(() => {
    const termine = normalizza(ricerca);
    const filtrati = righe.filter((riga) => {
      if (eliminati.has(riga.id)) return false;
      if (termine) {
        const nelTesto = [riga.nome, riga.categoria, riga.proprietario]
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
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [righe, ricerca, categoria, stato, evidenza, ordina, eliminati]);

  return (
    <div className="space-y-5">
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
              Negozi
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Gestisci tutti i negozi presenti nella piattaforma. Questo è il
              pannello di amministrazione della piattaforma: qui vedi ogni
              attività, il suo proprietario e lo stato globale, puoi modificare,
              duplicare ed eliminare un negozio.
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
        stato={stato}
        onStato={setStato}
        evidenza={evidenza}
        onEvidenza={setEvidenza}
        ordina={ordina}
        onOrdina={setOrdina}
      />

      <p className="px-1 text-xs font-semibold text-slate-500">
        {visibili.length} attività trovate
      </p>

      <AttivitaTable
        attivita={visibili}
        onElimina={handleElimina}
        onAggiorna={handleAggiorna}
      />

      <div className="flex items-start gap-3 rounded-3xl border border-blue-100 bg-blue-50/60 px-5 py-4 text-sm text-blue-900">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
        <p className="leading-6">
          <span className="font-bold">Centro di controllo:</span> dati reali dal
          database. Le azioni amministrative aggiornano subito la tabella; Elimina
          sposta nel Cestino.
        </p>
      </div>
    </div>
  );
}
