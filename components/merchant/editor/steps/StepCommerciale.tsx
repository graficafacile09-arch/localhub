"use client";

import ImpostazioniModule from "@/components/merchant/modules/ImpostazioniModule";
import ModalitaVenditaConfig from "@/components/merchant/modules/ModalitaVenditaConfig";
import PagamentiModule from "@/components/merchant/modules/PagamentiModule";
import type { StepProps } from "../editor-steps";

/**
 * Step "Impostazioni commerciali" del wizard editor.
 * La modalità di vendita è il componente condiviso ModalitaVenditaConfig
 * (usato anche nella pagina /impostazioni): unica implementazione,
 * salvataggio immediato con esito verificato.
 */
export default function StepCommerciale({ storeId, store, onDataChanged }: StepProps) {
  return (
    <div className="space-y-6">
      <ModalitaVenditaConfig
        storeId={storeId}
        store={store}
        onDataChanged={onDataChanged}
      />

      <ImpostazioniModule storeId={storeId} />

      <PagamentiModule storeId={storeId} />
    </div>
  );
}
