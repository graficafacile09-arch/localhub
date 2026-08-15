import { Banknote, CalendarDays, Clock, CreditCard } from "lucide-react";
import { Sezione, RigaDettaglio } from "./Sezione";
import { MapPin, Truck } from "lucide-react";

/**
 * Etichetta leggibile del metodo di spedizione.
 *
 * - ORDINI NUOVI (motore tariffario 20260831): usa i dati reali
 *   `spedizione_carrier` + `spedizione_servizio`;
 * - ORDINI STORICI (senza carrier/servizio): fallback legacy su
 *   `metodo_spedizione` (standard/express), invariato.
 */
function etichettaSpedizione(
  carrier: string | null,
  servizio: string | null,
  metodoSpedizione: "standard" | "express" | null
): string | null {
  if (carrier === "poste_italiane") {
    if (servizio === "express") return "Poste Italiane — Express (1-2 giorni)";
    if (servizio === "standard") return "Poste Italiane — Standard (3-5 giorni)";
  }
  if (carrier === "brt") {
    if (servizio === "online") return "BRT (24/48 ore)";
  }
  if (carrier === "locale") {
    return "Corriere locale";
  }
  if (metodoSpedizione === "express") return "Espresso (1-2 giorni)";
  if (metodoSpedizione === "standard") return "Standard (3-5 giorni)";
  return null;
}

/** Formatta un peso in grammi: "1,5 kg" oppure "500 g". */
function formattaPesoGrammi(grammi: number): string {
  if (grammi >= 1000) {
    return `${(grammi / 1000).toLocaleString("it-IT", { maximumFractionDigits: 2 })} kg`;
  }
  return `${grammi} g`;
}

/**
 * Sezione RITIRO / SPEDIZIONE condivisa (dettaglio cliente e venditore):
 * mostra SOLO i dati presenti (mai sezioni vuote) e solo la modalità reale.
 */
export function InformazioniRitiroSpedizione({
  modalita,
  negozioNome,
  ritiroData,
  ritiroFascia,
  spedizioneIndirizzo,
  spedizioneCap,
  spedizioneCitta,
  spedizioneProvincia,
  spedizioneNote,
  spedizioneCarrier,
  spedizioneServizio,
  spedizionePesoGrammi,
  spedizioneTariffaVersione,
  metodoSpedizione,
  metodoPagamento,
  paymentProvider,
}: {
  modalita: "ritiro" | "spedizione";
  negozioNome: string;
  ritiroData: string | null;
  ritiroFascia: string | null;
  spedizioneIndirizzo: string | null;
  spedizioneCap: string | null;
  spedizioneCitta: string | null;
  spedizioneProvincia: string | null;
  spedizioneNote: string | null;
  /** Corriere scelto al checkout (motore tariffario 20260831); null per gli
   *  ordini storici. */
  spedizioneCarrier: string | null;
  /** Servizio del corriere (es. "standard", "express", "online", "locale"). */
  spedizioneServizio: string | null;
  /** Peso in grammi della spedizione (motore tariffario 20260831). */
  spedizionePesoGrammi: number | null;
  /** Versione del listino tariffario applicata all'ordine. */
  spedizioneTariffaVersione: string | null;
  metodoSpedizione: "standard" | "express" | null;
  metodoPagamento: "carta" | "paypal" | "bonifico" | "klarna" | null;
  /** Marcatore autoritativo del provider (es. 'klarna'): la colonna
   *  metodo_pagamento resta 'carta' per gli ordini Klarna (allowlist RPC,
   *  stesso flusso del carrello F2.2), quindi la resa Klarna si basa su
   *  payment_provider. */
  paymentProvider?: string | null;
}) {
  const èRitiro = modalita === "ritiro";
  const indirizzoSpedizione = [
    spedizioneIndirizzo,
    spedizioneCap,
    spedizioneCitta,
    spedizioneProvincia,
  ]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(", ");

  return (
    <Sezione
      icon={èRitiro ? MapPin : Truck}
      titolo={èRitiro ? "Ritiro in negozio" : "Spedizione a domicilio"}
    >
      {èRitiro ? (
        <div className="space-y-1.5">
          <p className="text-sm text-slate-600">
            Ritira il tuo ordine presso {negozioNome}.
          </p>
          <RigaDettaglio
            etichetta="Data ritiro"
            valore={
              ritiroData ? (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden />
                  {ritiroData}
                </span>
              ) : (
                "Da definire"
              )
            }
          />
          {ritiroFascia && (
            <RigaDettaglio
              etichetta="Fascia oraria"
              valore={
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-slate-500" aria-hidden />
                  {ritiroFascia}
                </span>
              }
            />
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {indirizzoSpedizione ? (
            <p className="text-sm leading-6 text-slate-700">{indirizzoSpedizione}</p>
          ) : (
            <p className="text-sm text-slate-600">Indirizzo di spedizione non indicato.</p>
          )}
          {(() => {
            const etichetta = etichettaSpedizione(spedizioneCarrier, spedizioneServizio, metodoSpedizione);
            return etichetta ? (
              <RigaDettaglio etichetta="Metodo spedizione" valore={etichetta} />
            ) : null;
          })()}
          {spedizionePesoGrammi != null && spedizionePesoGrammi > 0 && (
            <RigaDettaglio etichetta="Peso" valore={formattaPesoGrammi(spedizionePesoGrammi)} />
          )}
          {spedizioneTariffaVersione ? (
            <RigaDettaglio etichetta="Listino tariffario" valore={spedizioneTariffaVersione} />
          ) : null}
          {(metodoPagamento || paymentProvider === "klarna") && (
            <RigaDettaglio
              etichetta="Metodo pagamento"
              valore={
                <span className="inline-flex items-center gap-1.5">
                  {paymentProvider === "klarna" ? (
                    <img
                      src="/loghi/klarna-pink.svg"
                      alt=""
                      width={48}
                      height={11}
                      className="h-3 w-auto object-contain"
                    />
                  ) : metodoPagamento === "bonifico" ? (
                    <Banknote className="h-4 w-4 text-slate-400" aria-hidden />
                  ) : (
                    <CreditCard className="h-4 w-4 text-slate-400" aria-hidden />
                  )}
                  {paymentProvider === "klarna"
                    ? "Klarna (3 rate)"
                    : metodoPagamento === "carta"
                      ? "Carta"
                      : metodoPagamento === "paypal"
                        ? "PayPal"
                        : "Bonifico bancario"}
                </span>
              }
            />
          )}
          {spedizioneNote && (
            <p className="pt-1 text-xs text-slate-500">Note consegna: {spedizioneNote}</p>
          )}
        </div>
      )}
    </Sezione>
  );
}
