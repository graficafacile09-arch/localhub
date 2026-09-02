"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";

/**
 * Titolo prodotto nella pagina "Modifica prodotto".
 *
 * Click/tap (o Enter/Spazio da tastiera) attiva la modifica INLINE del
 * titolo: il titolo diventa un campo editabile precompilato con il nome
 * attuale (testo selezionato, così si può riscrivere subito l'intero nome).
 * Ogni digitazione viene sincronizzata nel campo "nome" del form sottostante
 * (#nome), quindi il normale salvataggio del form ("Aggiorna prodotto")
 * persiste il nuovo titolo tramite la PUT dell'API prodotti già esistente.
 * Dopo il salvataggio il titolo resta nel database: al refresh della pagina
 * il server restituisce il nome aggiornato.
 */
export default function ProductTitleEditTarget({
  nome,
  className,
}: {
  nome: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(nome);
  const inputRef = useRef<HTMLInputElement>(null);

  // Dopo reload/refresh il server fornisce un nome aggiornato: allinea lo
  // stato locale, ma mai mentre l'utente sta modificando inline.
  useEffect(() => {
    if (!editing) setValue(nome);
  }, [nome, editing]);

  // Sincronizza il valore nel campo #nome del form prodotto sottostante:
  // è il campo che il form legge al submit, quindi il salvataggio normale
  // persiste il nuovo titolo senza duplicare logica di modifica.
  const syncToForm = useCallback((next: string) => {
    const campo = document.getElementById("nome");
    if (campo instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      setter?.call(campo, next);
      // Notifica il form (onChange → rilevamento modifiche non salvate).
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, []);

  const startEditing = useCallback(() => {
    setEditing(true);
  }, []);

  // Conferma: il valore è già sincronizzato a ogni digitazione, il form lo
  // salva al submit. Si esce solo dalla modalità inline.
  const conferma = useCallback(() => {
    setEditing(false);
  }, []);

  // Annulla: ripristina il nome originale anche nel campo del form.
  const annulla = useCallback(() => {
    setValue(nome);
    syncToForm(nome);
    setEditing(false);
  }, [nome, syncToForm]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setValue(next);
      syncToForm(next);
    },
    [syncToForm]
  );

  // In modifica: focus immediato + selezione del nome corrente.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onBlur={conferma}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            conferma();
          } else if (e.key === "Escape") {
            e.preventDefault();
            annulla();
          }
        }}
        aria-label="Nome del prodotto"
        className={`mt-2 w-full rounded-lg border border-blue-300 bg-white px-2 py-1 text-xl font-black tracking-tight text-slate-900 shadow-sm outline-none ring-2 ring-blue-100 ${className ?? ""}`}
      />
    );
  }

  return (
    <h1
      id="titolo-prodotto-edit"
      role="button"
      tabIndex={0}
      onClick={startEditing}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          startEditing();
        }
      }}
      title="Clicca per modificare il nome del prodotto"
      aria-label={`Modifica il nome del prodotto: ${value}`}
      className={`group mt-2 flex max-w-full cursor-pointer items-start gap-2 rounded-lg transition hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
        className ?? ""
      }`}
    >
      <span className="min-w-0 flex-1 break-words line-clamp-2">{value}</span>
      <Pencil
        className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-blue-600"
        aria-hidden
      />
    </h1>
  );
}
