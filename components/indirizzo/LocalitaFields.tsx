"use client";

import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import {
  etichettaProvincia,
  comuniPerCap,
  ricercaComuni,
  type Comune,
} from "@/lib/indirizzi/comuni";

export type CampoLocalita = "cap" | "citta" | "provincia";

type OpzioneCap = { cap: string; comune: Comune };

/**
 * CAP / Città / Provincia collegati tra loro (selezione assistita).
 *
 * - CAP: digitando mostra i comuni il cui CAP inizia con il prefisso; un CAP
 *   completo che identifica una sola città valorizza automaticamente città e
 *   provincia.
 * - Città: digitando mostra i comuni corrispondenti (autocomplete); selezionare
 *   una città valorizza automaticamente la provincia e il CAP (se unico).
 * - Provincia: derivata automaticamente dalla città scelta (sola lettura).
 *
 * Il valore `provincia` è la SIGLA (es. "CS"), coerente col formato già usato
 * dal backend (profilo cliente e checkout). La label mostrata è "Cosenza (CS)".
 * I campi espongono i `name` per essere letti via FormData (buy-now) e
 * notificano il genitore tramite `onChange` (checkout).
 */
export default function LocalitaFields({
  cap,
  citta,
  provincia,
  onChange,
  nomi = {},
  required = false,
  idPrefix = "",
}: {
  cap: string;
  citta: string;
  provincia: string;
  onChange: (campo: CampoLocalita, valore: string) => void;
  nomi?: { cap?: string; citta?: string; provincia?: string };
  required?: boolean;
  idPrefix?: string;
}) {
  const nomeCap = nomi.cap ?? "cap";
  const nomeCitta = nomi.citta ?? "citta";
  const nomeProvincia = nomi.provincia ?? "provincia";
  // Prefisso id: senza prefisso gli id restano "cap"/"citta"/"provincia" (come i
  // FormField originali e come si aspettano i test browser); con un prefisso
  // (es. "ck") diventano "ck-cap" ecc. (come i Campo del checkout).
  const prefisso = idPrefix ? `${idPrefix}-` : "";
  const idCap = `${prefisso}cap`;
  const idCitta = `${prefisso}citta`;
  const idProvincia = `${prefisso}provincia`;

  const [comuneSelezionato, setComuneSelezionato] = useState<Comune | null>(null);
  const [aperto, setAperto] = useState<"cap" | "citta" | null>(null);
  const [opzioniCap, setOpzioniCap] = useState<OpzioneCap[]>([]);
  const [opzioniCitta, setOpzioniCitta] = useState<Comune[]>([]);
  const [inCaricamento, setInCaricamento] = useState(false);

  const contenitoreRef = useRef<HTMLDivElement>(null);
  // Guardia anti-race: una risposta asincrona obsoleta (es. il tipo è cambiato
  // dopo il click su un'opzione) non deve mai sovrascrivere la selezione.
  const ultimoCapRef = useRef("");
  const ultimaCittaRef = useRef("");

  // Chiude il dropdown cliccando fuori o premendo Escape.
  useEffect(() => {
    function suClickFuori(e: MouseEvent) {
      if (contenitoreRef.current && !contenitoreRef.current.contains(e.target as Node)) {
        setAperto(null);
      }
    }
    function suTasto(e: KeyboardEvent) {
      if (e.key === "Escape") setAperto(null);
    }
    document.addEventListener("mousedown", suClickFuori);
    document.addEventListener("keydown", suTasto);
    return () => {
      document.removeEventListener("mousedown", suClickFuori);
      document.removeEventListener("keydown", suTasto);
    };
  }, []);

  function selezionaComune(comune: Comune, capScelto?: string) {
    setComuneSelezionato(comune);
    onChange("citta", comune.nome);
    onChange("provincia", comune.sigla);
    setOpzioniCitta([]);
    if (capScelto) {
      onChange("cap", capScelto);
      setOpzioniCap([]);
      setAperto(null);
    } else if (comune.cap.length === 1) {
      onChange("cap", comune.cap[0]);
      setOpzioniCap([]);
      setAperto(null);
    } else if (comune.cap.length > 1) {
      // Più CAP per questa città → tendina con le opzioni disponibili.
      onChange("cap", "");
      setOpzioniCap(comune.cap.map((c) => ({ cap: c, comune })));
      setAperto("cap");
    } else {
      onChange("cap", "");
      setOpzioniCap([]);
      setAperto(null);
    }
  }

  async function aggiornaCap(valore: string) {
    ultimoCapRef.current = valore;
    onChange("cap", valore);
    const v = valore.trim();
    if (v.length < 2) {
      setOpzioniCap([]);
      setAperto(null);
      return;
    }
    setInCaricamento(true);
    try {
      const comuni = await comuniPerCap(v);
      // Risposta obsoleta (il campo è cambiato nel frattempo) → ignora.
      if (ultimoCapRef.current !== valore) return;
      // CAP completo che identifica UNA sola città → auto-compila città+provincia
      // (chiude la tendina: selezionaComune azzera opzioni e aperto).
      if (v.length === 5) {
        const esatti = comuni.filter((c) => c.cap.includes(v));
        if (esatti.length === 1) {
          selezionaComune(esatti[0], v);
          return;
        }
      }
      const opzioni = comuni.flatMap((c) =>
        c.cap.filter((x) => x.startsWith(v)).map((x) => ({ cap: x, comune: c }))
      );
      setOpzioniCap(opzioni);
      setAperto(opzioni.length ? "cap" : null);
    } catch {
      setOpzioniCap([]);
    } finally {
      setInCaricamento(false);
    }
  }

  async function aggiornaCitta(valore: string) {
    ultimaCittaRef.current = valore;
    onChange("citta", valore);
    // Digitando una città diversa da quella selezionata la provincia non è più garantita.
    if (valore !== comuneSelezionato?.nome) {
      setComuneSelezionato(null);
      onChange("provincia", "");
    }
    const v = valore.trim();
    if (v.length < 2) {
      setOpzioniCitta([]);
      setAperto(null);
      return;
    }
    setInCaricamento(true);
    try {
      const lista = await ricercaComuni(v);
      // Risposta obsoleta (il campo è cambiato nel frattempo) → ignora.
      if (ultimaCittaRef.current !== valore) return;
      setOpzioniCitta(lista);
      setAperto(lista.length ? "citta" : null);
    } catch {
      setOpzioniCitta([]);
    } finally {
      setInCaricamento(false);
    }
  }

  const provinciaVisibile = comuneSelezionato
    ? etichettaProvincia(comuneSelezionato)
    : provincia;

  return (
    <div ref={contenitoreRef} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {/* CAP */}
      <div className="relative">
        <label htmlFor={idCap} className="block text-xs font-semibold text-slate-700">
          CAP{required && <span className="text-red-500"> *</span>}
        </label>
        <input
          id={idCap}
          name={nomeCap}
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          value={cap}
          onChange={(e) => aggiornaCap(e.target.value.replace(/\D/g, ""))}
          placeholder="00000"
          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
        />
        {aperto === "cap" && opzioniCap.length > 0 && (
          <Dropdown onClose={() => setAperto(null)}>
            {opzioniCap.map((o, i) => (
              <Opzione key={`${o.cap}-${i}`} onPick={() => selezionaComune(o.comune, o.cap)} testId="opt-cap">
                <span className="font-semibold tabular-nums text-slate-900">{o.cap}</span>
                <span className="truncate text-slate-500">
                  {" "}
                  {o.comune.nome} ({o.comune.sigla})
                </span>
              </Opzione>
            ))}
          </Dropdown>
        )}
      </div>

      {/* Città */}
      <div className="relative">
        <label htmlFor={idCitta} className="block text-xs font-semibold text-slate-700">
          Città{required && <span className="text-red-500"> *</span>}
        </label>
        <input
          id={idCitta}
          name={nomeCitta}
          type="text"
          autoComplete="address-level2"
          value={citta}
          onChange={(e) => aggiornaCitta(e.target.value)}
          placeholder="Comune"
          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
        />
        {aperto === "citta" && opzioniCitta.length > 0 && (
          <Dropdown onClose={() => setAperto(null)}>
            {opzioniCitta.map((c, i) => (
              <Opzione key={`${c.codiceCatastale}-${i}`} onPick={() => selezionaComune(c)} testId="opt-citta">
                <span className="font-semibold text-slate-900">{c.nome}</span>
                <span className="truncate text-slate-500">
                  {" "}
                  ({c.sigla}) · {c.cap.join(", ")}
                </span>
              </Opzione>
            ))}
          </Dropdown>
        )}
      </div>

      {/* Provincia (derivata) */}
      <div className="relative">
        <label htmlFor={idProvincia} className="block text-xs font-semibold text-slate-700">
          Provincia{required && <span className="text-red-500"> *</span>}
        </label>
        <div className="relative">
          <input
            id={idProvincia}
            type="text"
            readOnly
            value={provinciaVisibile}
            placeholder="—"
            tabIndex={-1}
            className="mt-1 block w-full cursor-default truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 pr-8 text-sm text-slate-600 outline-none"
          />
          <Lock className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
        </div>
        {/* Il valore inviato è la SIGLA (formato backend), non la label mostrata. */}
        <input type="hidden" name={nomeProvincia} value={provincia} />
      </div>

      {/* Stato di caricamento dataset (primo utilizzo) */}
      {inCaricamento && (
        <p className="col-span-full text-[11px] text-slate-400">Ricerca…</p>
      )}
    </div>
  );
}

function Dropdown({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 min-w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
      {children}
      <button type="button" onClick={onClose} className="sr-only">
        Chiudi
      </button>
    </div>
  );
}

function Opzione({
  children,
  onPick,
  testId,
}: {
  children: React.ReactNode;
  onPick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      data-testid={testId}
      className="flex w-full items-center gap-1 px-3 py-2 text-left text-xs leading-4 transition hover:bg-blue-50"
    >
      <span className="flex min-w-0 items-center gap-1 truncate">{children}</span>
    </button>
  );
}
