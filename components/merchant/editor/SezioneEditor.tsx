"use client";

import { useEffect, useRef } from "react";
import type { Negozio } from "@/types/negozio";
import {
  EDITOR_SEZIONI,
  type BloccoId,
  type EditorSezione,
  type SezioneId,
} from "./editor-sections";
import StepIdentita from "./steps/StepIdentita";
import StepContatti from "./steps/StepContatti";
import StepPresentazione from "./steps/StepPresentazione";
import StepCatalogo from "./steps/StepCatalogo";
import StepOfferte from "./steps/StepOfferte";
import StepCommerciale from "./steps/StepCommerciale";
import StepAnteprima from "./steps/StepAnteprima";
import StepPubblicazione from "./steps/StepPubblicazione";
import ServiziModule from "@/components/merchant/modules/ServiziModule";
import PrenotazioniModule from "@/components/merchant/modules/PrenotazioniModule";
import RichiestaInfoModule from "@/components/merchant/modules/RichiestaInfoModule";

type Props = {
  storeId: string;
  store: Negozio;
  basePath: string;
  area: "admin" | "merchant";
  counts: { prodotti: number; offerte: number };
  onDataChanged: () => void;
  sezione: EditorSezione;
  blocchi: BloccoId[];
  /** Blocco su cui effettuare lo scroll/focus mirato (navigazione da CTA). */
  targetBlocco?: BloccoId;
};

/** Sezione vuota: se tutti i blocchi sono nascosti mostra un avviso. */
function EmptySection({ sezione }: { sezione: EditorSezione }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-400">
      Nessuna opzione richiesta per la sezione "{sezione.titolo}" con la configurazione
      attuale dell&apos;attività.
    </p>
  );
}

export default function SezioneEditor({
  storeId,
  store,
  basePath,
  area,
  counts,
  onDataChanged,
  sezione,
  blocchi,
  targetBlocco,
}: Props) {
  const stepProps = { storeId, store, basePath, area, counts, onDataChanged };
  const bloccoRef = useRef<Map<BloccoId, HTMLDivElement>>(new Map());

  // Focus mirato: quando un blocco viene puntato (es. da una CTA esterna)
  // porta lo scroll fino a quel blocco e lo evidenzia brevemente.
  useEffect(() => {
    if (!targetBlocco) return;
    const el = bloccoRef.current.get(targetBlocco);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("editor-blocco-target");
    const t = setTimeout(() => el.classList.remove("editor-blocco-target"), 1600);
    return () => clearTimeout(t);
  }, [targetBlocco]);

  const renderBlocco = (blocco: BloccoId) => (
    <div
      key={blocco}
      ref={(el) => {
        if (el) bloccoRef.current.set(blocco, el);
        else bloccoRef.current.delete(blocco);
        return undefined;
      }}
      data-blocco={blocco}
      className="editor-blocco"
    >
      {(() => {
        switch (blocco) {
          case "identita":
            return <StepIdentita {...stepProps} />;
          case "contatti-orari":
            return <StepContatti {...stepProps} />;
          case "presentazione":
            return <StepPresentazione {...stepProps} />;
          case "catalogo-prodotti":
            return <StepCatalogo {...stepProps} />;
          case "servizi-strutturati":
            return (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <ServiziModule storeId={storeId} />
              </div>
            );
          case "offerte":
            return <StepOfferte {...stepProps} />;
          case "vendita-commerciale":
            return <StepCommerciale {...stepProps} />;
          case "prenotazioni":
            return (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <PrenotazioniModule storeId={storeId} />
              </div>
            );
          case "richiesta-info":
            return (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <RichiestaInfoModule storeId={storeId} />
              </div>
            );
          case "anteprima":
            return <StepAnteprima {...stepProps} />;
          case "pubblicazione": {
            const list = (store?.data as Record<string, unknown> | null | undefined)?.servizi_strutturati;
            const servizi = Array.isArray(list)
              ? (list as Array<{ attivo?: boolean }>).filter((s) => s.attivo !== false).length
              : 0;
            return <StepPubblicazione {...stepProps} counts={counts} servizi={servizi} />;
          }
          default:
            return null;
        }
      })()}
    </div>
  );

  if (blocchi.length === 0) return <EmptySection sezione={sezione} />;

  return <div className="space-y-6">{blocchi.map(renderBlocco)}</div>;
}

export { EDITOR_SEZIONI, type SezioneId };

/** list all sezioni per compatibilità con vecchi import dei numeri. */
export const SEZIONI_STEP = EDITOR_SEZIONI.length;