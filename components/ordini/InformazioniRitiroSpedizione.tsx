import { Banknote, CalendarDays, Clock, CreditCard } from "lucide-react";
import { Sezione, RigaDettaglio } from "./Sezione";
import { MapPin, Truck } from "lucide-react";

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
          {metodoSpedizione && (
            <RigaDettaglio
              etichetta="Metodo spedizione"
              valore={
                metodoSpedizione === "express"
                  ? "Espresso (1-2 giorni)"
                  : "Standard (3-5 giorni)"
              }
            />
          )}
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
