import type { ComponentType, ReactNode } from "react";

/**
 * Card sezione condivisa delle pagine dettaglio ordine (Area Clienti e
 * Area Venditore): stessa identica grafica per mantenere un linguaggio
 * visivo unico. L'identità di stato è portata dal banner (StatoOrdineBanner),
 * non dal colore delle sezioni.
 */
export function Sezione({
  icon: Icon,
  titolo,
  children,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  titolo: string;
  children: ReactNode;
  /** Contenuto opzionale allineato a destra del titolo. */
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          {titolo}
        </h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** Riga chiave/valore di una sezione (nasconde i valori vuoti). */
export function RigaDettaglio({
  etichetta,
  valore,
}: {
  etichetta: string;
  valore: ReactNode;
}) {
  if (valore === null || valore === undefined || valore === "") return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-slate-500">{etichetta}</span>
      <span className="text-right text-sm font-semibold text-slate-800">{valore}</span>
    </div>
  );
}
