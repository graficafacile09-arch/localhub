"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Loader2,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
  UserCog,
} from "lucide-react";
import type { AttivitaRow } from "@/lib/amministratore/attivita-types";
import DuplicaNegozioWizard from "@/components/merchant/media/DuplicaNegozioWizard";

type Proprietario = {
  id: string;
  nome: string;
  email: string;
};

type AggiornamentoAttivita = Partial<
  Pick<AttivitaRow, "proprietarioId" | "proprietario" | "attivo" | "in_evidenza">
>;

/**
 * Menu Azioni di una riga Attività.
 * Tutte le mutazioni passano dalle API amministratore e aggiornano la riga
 * localmente tramite onAggiorna, senza ricaricare la pagina.
 */
export default function AttivitaActionsMenu({
  attivita,
  onElimina,
  onAggiorna,
}: {
  attivita: AttivitaRow;
  onElimina?: (id: string) => void;
  onAggiorna?: (id: string, aggiornamento: AggiornamentoAttivita) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confermaElimina, setConfermaElimina] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [erroreElimina, setErroreElimina] = useState<string | null>(null);
  const [showDuplica, setShowDuplica] = useState(false);
  const [ownerPanel, setOwnerPanel] = useState(false);
  const [proprietari, setProprietari] = useState<Proprietario[]>([]);
  const [caricandoProprietari, setCaricandoProprietari] = useState(false);
  const [proprietarioSelezionato, setProprietarioSelezionato] = useState("");
  const [salvando, setSalvando] = useState<"owner" | "evidenza" | "stato" | null>(null);
  const [erroreAzione, setErroreAzione] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
        setConfermaElimina(false);
        setOwnerPanel(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setConfermaElimina(false);
        setOwnerPanel(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const aggiornaAttivita = useCallback(
    async (
      payload: Record<string, boolean | string | null>,
      aggiornamento: AggiornamentoAttivita,
      azione: "owner" | "evidenza" | "stato"
    ) => {
      setSalvando(azione);
      setErroreAzione(null);
      try {
        const res = await fetch(`/api/amministratore/attivita/${attivita.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(json?.error?.message ?? "Impossibile aggiornare l'attività.");
        }
        onAggiorna?.(attivita.id, aggiornamento);
        return true;
      } catch (caught) {
        setErroreAzione(
          caught instanceof Error ? caught.message : "Errore sconosciuto."
        );
        return false;
      } finally {
        setSalvando(null);
      }
    },
    [attivita.id, onAggiorna]
  );

  const apriGestioneProprietario = useCallback(async () => {
    setOwnerPanel(true);
    setErroreAzione(null);
    setProprietarioSelezionato(attivita.proprietarioId ?? "");
    if (proprietari.length > 0) return;

    setCaricandoProprietari(true);
    try {
      const res = await fetch("/api/amministratore/attivita/proprietari");
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Impossibile caricare i proprietari.");
      }
      setProprietari(json.data?.proprietari ?? []);
    } catch (caught) {
      setErroreAzione(
        caught instanceof Error ? caught.message : "Errore sconosciuto."
      );
    } finally {
      setCaricandoProprietari(false);
    }
  }, [attivita.proprietarioId, proprietari.length]);

  const salvaProprietario = useCallback(async () => {
    const proprietario = proprietari.find((item) => item.id === proprietarioSelezionato);
    const nome = proprietario?.email ?? "nessun proprietario";
    if (!window.confirm(`Assegnare questa attività a ${nome}?`)) return;

    const riuscito = await aggiornaAttivita(
      { owner_user_id: proprietarioSelezionato || null },
      {
        proprietarioId: proprietarioSelezionato || null,
        proprietario: proprietario?.email ?? null,
      },
      "owner"
    );
    if (riuscito) {
      setOwnerPanel(false);
      setOpen(false);
    }
  }, [aggiornaAttivita, proprietari, proprietarioSelezionato]);

  const cambiaEvidenza = useCallback(async () => {
    const prossimo = !attivita.in_evidenza;
    if (!window.confirm(`${prossimo ? "Mettere" : "Togliere"} «${attivita.nome}» in evidenza?`)) {
      return;
    }
    const riuscito = await aggiornaAttivita(
      { in_evidenza: prossimo },
      { in_evidenza: prossimo },
      "evidenza"
    );
    if (riuscito) setOpen(false);
  }, [aggiornaAttivita, attivita.in_evidenza, attivita.nome]);

  const cambiaStato = useCallback(async () => {
    const prossimo = !attivita.attivo;
    if (!window.confirm(`${prossimo ? "Riattivare" : "Disattivare"} «${attivita.nome}»?`)) {
      return;
    }
    const riuscito = await aggiornaAttivita(
      { attivo: prossimo },
      { attivo: prossimo },
      "stato"
    );
    if (riuscito) setOpen(false);
  }, [aggiornaAttivita, attivita.attivo, attivita.nome]);

  const handleElimina = useCallback(async () => {
    setEliminando(true);
    setErroreElimina(null);
    try {
      const res = await fetch(`/api/amministratore/negozi/${attivita.id}/cestina`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Errore durante l'eliminazione.");
      }
      setOpen(false);
      setConfermaElimina(false);
      onElimina?.(attivita.id);
    } catch (caught) {
      setErroreElimina(
        caught instanceof Error ? caught.message : "Errore sconosciuto."
      );
    } finally {
      setEliminando(false);
    }
  }, [attivita.id, onElimina]);

  if (confermaElimina) {
    return (
      <div className="relative" ref={menuRef}>
        <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-xl">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <div>
              <p className="text-sm font-bold text-blue-800">
                Eliminare &ldquo;{attivita.nome}&rdquo;?
              </p>
              <p className="mt-1 text-xs leading-5 text-blue-600">
                Il negozio verrà spostato nel Cestino. Potrai ripristinarlo dalla
                pagina Cestino. Questa azione è riservata agli amministratori.
              </p>
              {erroreElimina && (
                <p className="mt-2 rounded-lg bg-blue-100 px-2.5 py-1.5 text-xs font-semibold text-blue-800">
                  {erroreElimina}
                </p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleElimina}
                  disabled={eliminando}
                  className="btn-cta px-3 py-1.5 text-xs disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {eliminando ? "Eliminazione..." : "Elimina"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfermaElimina(false);
                    setErroreElimina(null);
                  }}
                  disabled={eliminando}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-blue-100 disabled:opacity-60"
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      {showDuplica && (
        <DuplicaNegozioWizard
          storeId={attivita.id}
          storeName={attivita.nome}
          onClose={() => setShowDuplica(false)}
        />
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Azioni per ${attivita.nome}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-64 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl"
        >
          {ownerPanel ? (
            <div className="p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-black text-slate-800">Gestisci proprietario</p>
                <button
                  type="button"
                  onClick={() => setOwnerPanel(false)}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                >
                  Indietro
                </button>
              </div>
              {caricandoProprietari ? (
                <div className="flex items-center gap-2 px-1 py-4 text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Caricamento proprietari...
                </div>
              ) : (
                <>
                  <label className="sr-only" htmlFor={`proprietario-${attivita.id}`}>
                    Seleziona proprietario
                  </label>
                  <select
                    id={`proprietario-${attivita.id}`}
                    aria-label="Seleziona proprietario"
                    value={proprietarioSelezionato}
                    onChange={(event) => setProprietarioSelezionato(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Non assegnato</option>
                    {proprietari.map((proprietario) => (
                      <option key={proprietario.id} value={proprietario.id}>
                        {proprietario.email}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={salvaProprietario}
                    disabled={salvando !== null || caricandoProprietari}
                    className="btn-cta mt-2 w-full px-3 py-2 text-xs disabled:opacity-60"
                  >
                    {salvando === "owner" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {salvando === "owner" ? "Salvataggio..." : "Salva proprietario"}
                  </button>
                </>
              )}
              {erroreAzione && (
                <p role="alert" className="mt-2 rounded-lg bg-blue-50 px-2 py-1.5 text-[11px] font-semibold text-blue-700">
                  {erroreAzione}
                </p>
              )}
            </div>
          ) : (
            <>
              {attivita.slug && (
                <a
                  href={`/negozio/${attivita.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Eye className="h-4 w-4 shrink-0" aria-hidden />
                  Visualizza
                </a>
              )}

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  router.push(`/amministratore/negozi/${attivita.id}`);
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                Apri dashboard
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  router.push(`/amministratore/negozi/${attivita.id}/edit`);
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Pencil className="h-4 w-4 shrink-0" aria-hidden />
                Modifica
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setShowDuplica(true);
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Copy className="h-4 w-4 shrink-0" aria-hidden />
                Duplica negozio
              </button>

              <div className="my-1 border-t border-slate-100" />

              <button
                type="button"
                role="menuitem"
                onClick={apriGestioneProprietario}
                disabled={salvando !== null}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-60"
              >
                <UserCog className="h-4 w-4 shrink-0" aria-hidden />
                Gestisci proprietario
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={cambiaEvidenza}
                disabled={salvando !== null}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-yellow-700 transition hover:bg-yellow-50 disabled:opacity-60"
              >
                {salvando === "evidenza" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4 shrink-0" aria-hidden />}
                {attivita.in_evidenza ? "Togli evidenza" : "Metti in evidenza"}
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={cambiaStato}
                disabled={salvando !== null}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-yellow-700 transition hover:bg-yellow-50 disabled:opacity-60"
              >
                {salvando === "stato" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4 shrink-0" aria-hidden />}
                {attivita.attivo ? "Disattiva" : "Riattiva"}
              </button>

              {erroreAzione && (
                <p role="alert" className="mx-2 mt-1 rounded-lg bg-blue-50 px-2 py-1.5 text-[11px] font-semibold text-blue-700">
                  {erroreAzione}
                </p>
              )}

              <div className="my-1 border-t border-slate-100" />

              <button
                type="button"
                role="menuitem"
                onClick={() => setConfermaElimina(true)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
              >
                <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                Elimina
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
