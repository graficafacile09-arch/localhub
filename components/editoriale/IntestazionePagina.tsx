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
 *
 * Con `compatto` la fascia usa un'altezza fissa (120px, uguale su mobile e
 * desktop) e tipografia ridotta, così i comandi subito sotto non si spostano.
 * `titoloExtra` affianca un elemento al titolo, sulla stessa riga.
 */
export default function IntestazionePagina({
  occhiello,
  titolo,
  sommario,
  icona: Icona,
  idTitolo,
  azione,
  titoloExtra,
  compatto = false,
  children,
}: {
  occhiello: string;
  titolo: string;
  sommario?: React.ReactNode;
  icona?: LucideIcon;
  idTitolo?: string;
  azione?: React.ReactNode;
  titoloExtra?: React.ReactNode;
  compatto?: boolean;
  children?: React.ReactNode;
}) {
  // Variante compatta: altezza fissa identica su mobile e desktop, così
  // i comandi sotto la testata non si spostano mai. Il contenuto è più
  // piccolo del riquadro (120px) e il sommario resta su due righe al massimo.
  if (compatto) {
    return (
      <header className="rd-testa rd-entra">
        <div className="rd-guscio flex h-[120px] items-center justify-between gap-x-4">
          <div className="min-w-0 flex-1">
            <p className="rd-occhiello text-[9px] leading-[1.25] tracking-[0.12em] md:text-[10px] md:tracking-[0.16em]">
              {Icona ? <Icona aria-hidden /> : null}
              {occhiello}
            </p>
            <div className="mt-1.5 flex flex-nowrap items-center gap-2">
              <h1
                id={idTitolo}
                className="rd-titolo mt-0 whitespace-nowrap text-[1.5rem] leading-none md:text-[1.75rem]"
              >
                {titolo}
              </h1>
              {titoloExtra}
            </div>
            <span aria-hidden="true" className="rd-regola mt-2" />
            {sommario ? (
              <p className="rd-sommario mt-2 line-clamp-2 max-w-[46ch] text-[12px] leading-[1.45] md:text-[12.5px] md:leading-[1.5]">
                {sommario}
              </p>
            ) : null}
          </div>
          {azione ? <div className="shrink-0">{azione}</div> : null}
        </div>
        {children ? <div className="rd-guscio pb-3">{children}</div> : null}
      </header>
    );
  }

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
