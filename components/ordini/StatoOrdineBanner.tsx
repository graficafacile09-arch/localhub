import type { StatoOrdine } from "@/lib/cliente/types";
import {
  configStatoOrdine,
  formattaDataOraEvento,
} from "@/lib/cliente/ordini-format";
import { etichettaMotivoAnnullamento } from "@/lib/merchant/ordini-stati";
import { StatoIcona } from "./StatoIcona";

/**
 * Banner di stato ORDINE — la grafica è GUIDATA dallo stato letto dal DB
 * (configStatoOrdine): ogni stato ha una rappresentazione visiva distinta e
 * un ordine ANNULLATO non può MAI ricevere la grafica di un ordine
 * confermato. Icona professionale + etichetta (lo stato non dipende dal solo
 * colore). Per lo stato "cancellato" mostra in evidenza motivo e nota
 * dell'annullamento (e la data), quando disponibili.
 *
 * Usato da: Area Clienti, Area Venditore e pagina di conferma ordine
 * (il link delle email di annullamento apre proprio questa grafica).
 */
export function StatoOrdineBanner({
  stato,
  annullatoMotivo,
  annullatoNota,
  annullatoAt,
  sottoTitolo,
  ruolo = "cliente",
}: {
  stato: StatoOrdine;
  annullatoMotivo?: string | null;
  annullatoNota?: string | null;
  annullatoAt?: string | null;
  /** Riga opzionale sotto l'etichetta (es. data ordine). Se assente, viene
   *  usata la descrizione di ruolo della configurazione (cliente/venditore). */
  sottoTitolo?: string;
  /** Prospettiva: cliente o venditore (testi descrittivi diversi). */
  ruolo?: "cliente" | "venditore";
}) {
  const config = configStatoOrdine(stato);
  const èAnnullato = stato === "cancellato";
  const motivo = èAnnullato ? etichettaMotivoAnnullamento(annullatoMotivo) : "";
  const nota = èAnnullato ? (annullatoNota ?? "").trim() : "";
  const dataAnnullamento =
    èAnnullato && annullatoAt ? formattaDataOraEvento(annullatoAt) : "";
  const descrizione =
    sottoTitolo ??
    (ruolo === "cliente" ? config.descrizioneCliente : config.descrizioneVenditore);

  return (
    <div className={`rounded-[1.75rem] border p-5 shadow-sm ${config.banner}`}>
      <div className="flex items-start gap-4">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/80 shadow-sm ring-1 ring-black/5 ${config.iconaTesto}`}
        >
          <StatoIcona stato={stato} className="h-6 w-6" ariaHidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-lg font-black uppercase tracking-tight ${config.testo}`}>
            {config.etichettaBanner}
          </p>
          {descrizione ? (
            <p className={`mt-1 text-sm ${config.testo} opacity-80`}>{descrizione}</p>
          ) : null}

          {/* Dettagli dell'annullamento: motivo + nota (solo se presenti) */}
          {èAnnullato && (motivo || nota || dataAnnullamento) && (
            <div className="mt-3 space-y-1.5 rounded-xl bg-white/70 px-4 py-3 text-sm ring-1 ring-red-100">
              {motivo && (
                <p className="text-red-800">
                  <span className="font-bold">Motivo:</span> {motivo}
                </p>
              )}
              {nota && (
                <p className="text-red-800">
                  <span className="font-bold">Nota del negoziante:</span> {nota}
                </p>
              )}
              {dataAnnullamento && (
                <p className="text-xs text-red-700/80">
                  Annullato il {dataAnnullamento}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
