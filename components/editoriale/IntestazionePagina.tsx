import type { LucideIcon } from "lucide-react";

/**
 * TESTATA EDITORIALE DELLE PAGINE INTERNE
 *
 * Una sola fascia per tutte le sezioni che si aprono dalla homepage:
 * occhiello in maiuscoletto color terra, titolo in verde bosco, filetto
 * oro e sommario. Sotto il sommario possono vivere i filtri della sezione
 * (chip, categorie), così l'intestazione resta identica ovunque.
 *
 * Non contiene dati né logica: riceve solo testo già presente nella pagina.
 */
export default function IntestazionePagina({
  occhiello,
  titolo,
  sommario,
  icona: Icona,
  idTitolo,
  azione,
  children,
}: {
  occhiello: string;
  titolo: string;
  sommario?: React.ReactNode;
  icona?: LucideIcon;
  idTitolo?: string;
  azione?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="rd-testa rd-entra">
      <div className="rd-guscio rd-testa-interna">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="rd-occhiello">
              {Icona ? <Icona aria-hidden /> : null}
              {occhiello}
            </p>
            <h1 id={idTitolo} className="rd-titolo">
              {titolo}
            </h1>
            <span aria-hidden="true" className="rd-regola" />
            {sommario ? <p className="rd-sommario">{sommario}</p> : null}
          </div>
          {azione ? <div className="shrink-0 pt-1">{azione}</div> : null}
        </div>
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </header>
  );
}
