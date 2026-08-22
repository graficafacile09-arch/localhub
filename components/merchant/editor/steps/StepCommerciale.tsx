"use client";

import ImpostazioniModule from "@/components/merchant/modules/ImpostazioniModule";
import ModalitaVenditaConfig from "@/components/merchant/modules/ModalitaVenditaConfig";
import PagamentiModule from "@/components/merchant/modules/PagamentiModule";
import CommissioneNegozio from "../CommissioneNegozio";
import type { StepProps } from "../editor-steps";

/**
 * Step "Impostazioni commerciali" del wizard editor.
 * La modalità di vendita è il componente condiviso ModalitaVenditaConfig
 * (usato anche nella pagina /impostazioni): unica implementazione,
 * salvataggio immediato con esito verificato.
 *
 * La sezione "Commissione piattaforma" è RISERVATA all'Area Amministratore
 * (area === "admin"): il merchant non la vede mai in questo step.
 */
export default function StepCommerciale({ storeId, store, area, onDataChanged }: StepProps) {
  return (
    <div className="space-y-6">
      {area === "admin" && (
        <CommissioneNegozio storeId={storeId} store={store} onDataChanged={onDataChanged} />
      )}

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
