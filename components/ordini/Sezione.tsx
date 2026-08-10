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
  sottotitolo,
  children,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  titolo: string;
  /** Descrizione opzionale sotto il titolo. */
  sottotitolo?: string;
  children: ReactNode;
  /** Contenuto opzionale allineato a destra del titolo. */
  action?: ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            {titolo}
          </h2>
          {sottotitolo ? (
            <p className="mt-1.5 pl-10 text-xs text-slate-400">{sottotitolo}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
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
