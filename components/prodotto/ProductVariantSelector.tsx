"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ShoppingBag, Store } from "lucide-react";
import { disponibilitaReale, prodottoEsaurito } from "@/lib/prodotti-disponibilita";
import type { VariantePubblica } from "@/lib/varianti-pubbliche";
import AggiungiAlCarrelloButton from "@/components/carrello/AggiungiAlCarrelloButton";

/**
 * Selettore varianti — pagina pubblica /prodotto/[slug] (FASE E4).
 *
 * Per i prodotti con ha_varianti=true sostituisce la sezione
 * immagine + prezzo + disponibilità + pulsante ACQUISTA della pagina:
 *   - attributi raggruppati per chiave (es. Taglia, Colore) con chip;
 *   - combinazioni inesistenti NON selezionabili (chip disabilitate);
 *   - varianti inattive mai visibili (filtrate server-side);
 *   - prima combinazione acquistabile selezionata automaticamente;
 *   - nessuna variante acquistabile → "Prodotto non disponibile";
 *   - prezzo della variante (fallback al prezzo padre se NULL);
 *   - disponibilità reale (quantita_disponibile - quantita_riservata);
 *   - immagine della variante (fallback all'immagine padre);
 *   - ACQUISTA attivo solo con variante valida e non esaurita, con
 *     varianteId nell'URL.
 *
 * Il prezzo mostrato è INFORMATIVO: la validazione definitiva avviene
 * server-side (E5/RPC). Nessun prezzo/stock viene mai inviato dal client.
 */

type Props = {
  slug: string;
  /**
   * REGOLA AUTO-ACQUISTO: true se l'utente autenticato è il VENDITORE del
   * negozio proprietario del prodotto → la CTA "Acquista" e "Aggiungi al
   * carrello" vengono sostituite dall'etichetta "Il tuo prodotto" (il
   * blocco vale anche server-side nelle API ordini).
   */
  eIlMioProdotto: boolean;
  /** Id del prodotto (per il carrello, FASE F2.4). */
  prodottoId: string;
  /** Snapshot UI negozio (mai autoritativo per prezzi/stock). */
  negozioId: string;
  negozioNome: string;
  nome: string;
  categoria: string | null;
  descrizione: string | null;
  statoCondizione: string | null;
  prezzoBase: number;
  /** Immagine del prodotto padre già risolta (fallback). */
  immagineBase: string;
  altText: string | null;
  varianti: VariantePubblica[];
  soggettoVerificaEta?: boolean;
  /** Elementi sovrapposti all'immagine principale (es. Pino). */
  overlay?: React.ReactNode;
};

type SelezioniAttributi = Record<string, string>;

function varianteCorrisponde(v: VariantePubblica, selezioni: SelezioniAttributi): boolean {
  for (const [chiave, valore] of Object.entries(selezioni)) {
    if (String(v.attributi[chiave] ?? "") !== String(valore)) return false;
  }
  return true;
}

function disponibileReale(v: VariantePubblica): number | null {
  return disponibilitaReale(v.quantita_disponibile, v.quantita_riservata);
}

/** Prima combinazione acquistabile (attiva con disponibilità reale > 0). */
function selezioneIniziale(varianti: VariantePubblica[]): SelezioniAttributi {
  for (const v of varianti) {
    const reale = disponibileReale(v);
    if (reale !== null && reale > 0) return { ...v.attributi };
  }
  return {};
}

export default function ProductVariantSelector({
  slug,
  eIlMioProdotto,
  prodottoId,
  negozioId,
  negozioNome,
  nome,
  categoria,
  descrizione,
  statoCondizione,
  prezzoBase,
  immagineBase,
  altText,
  varianti,
  overlay,
  soggettoVerificaEta = false,
}: Props) {
  const [selezioni, setSelezioni] = useState<SelezioniAttributi>(() =>
    selezioneIniziale(varianti)
  );

  // Chiavi attributo nell'ordine di comparsa delle varianti.
  const chiavi = useMemo(() => {
    const chiavi: string[] = [];
    for (const v of varianti) {
      for (const k of Object.keys(v.attributi)) {
        if (!chiavi.includes(k)) chiavi.push(k);
      }
    }
    return chiavi;
  }, [varianti]);

  // Nessuna selezione iniziale (prodotto senza combinazioni acquistabili):
  // lo stato "nessuna variante selezionata" è reale (non coincide mai con
  // la prima variante per semantica di match su selezione vuota).
  const varianteSelezionata = useMemo(() => {
    if (Object.keys(selezioni).length === 0) return null;
    return varianti.find((v) => varianteCorrisponde(v, selezioni)) ?? null;
  }, [varianti, selezioni]);

  const nessunaAcquistabile = useMemo(
    () => !varianti.some((v) => (disponibileReale(v) ?? 0) > 0),
    [varianti]
  );

  const prezzoMostrato = varianteSelezionata?.prezzo ?? prezzoBase;
  const esaurito = varianteSelezionata
    ? prodottoEsaurito(varianteSelezionata.quantita_disponibile, varianteSelezionata.quantita_riservata)
    : nessunaAcquistabile;
  const disponibile = varianteSelezionata
    ? disponibileReale(varianteSelezionata)
    : null;
  const immagineMostrata = varianteSelezionata?.immagine_principale || immagineBase;
  const acquistabile = varianteSelezionata !== null && !esaurito;

  /** Valori di una chiave compatibili con le selezioni correnti delle altre chiavi. */
  const valoriConsentiti = (chiave: string): string[] => {
    const valori: string[] = [];
    for (const v of varianti) {
      const valore = String(v.attributi[chiave] ?? "");
      if (!valore) continue;
      let compatibile = true;
      for (const [altraChiave, valoreSelezionato] of Object.entries(selezioni)) {
        if (altraChiave === chiave) continue;
        if (String(v.attributi[altraChiave] ?? "") !== String(valoreSelezionato)) {
          compatibile = false;
          break;
        }
      }
      if (compatibile && !valori.includes(valore)) valori.push(valore);
    }
    return valori;
  };

  const seleziona = (chiave: string, valore: string) => {
    setSelezioni((prev) => ({ ...prev, [chiave]: valore }));
  };

  const hrefAcquista = varianteSelezionata
    ? `/prodotto/${slug}/acquista?varianteId=${encodeURIComponent(varianteSelezionata.id)}`
    : null;

  return (
    <div className="mt-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start md:gap-8 lg:gap-10">
      {/* Desktop: immagine a sinistra; dettagli, varianti e acquisto a destra. Mobile invariato. */}
      <div className="min-w-0">
      {/* Immagine (variante se ha immagine propria, altrimenti prodotto padre) */}
      <div className="rd-scheda overflow-hidden">
        <div className="relative aspect-square max-h-[520px] overflow-hidden bg-[#f4efe4]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={immagineMostrata}
            alt={altText?.trim() || nome}
            className="h-full w-full object-cover"
          />
          {overlay}
        </div>
      </div>
      </div>

      <div className="min-w-0">
      <div className="rd-scheda mt-4 p-5 sm:p-6 md:mt-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="mt-1 text-[1.65rem] font-extrabold leading-[1.12] tracking-tight text-[#1b3624]">{nome}</h1>
            {categoria && (
              <p className="rd-occhiello mt-2">{categoria}</p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[1.9rem] font-extrabold leading-none tracking-tight text-[#1b3624] tabular-nums">
              €{prezzoMostrato.toFixed(2)}
            </p>
            {statoCondizione && (
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8a8378]">
                {statoCondizione}
              </p>
            )}
          </div>
        </div>

        {descrizione && (
          <p className="mt-4 border-t border-[#e5ded0] pt-4 text-sm leading-7 text-[#57534e]">{descrizione}</p>
        )}

        {/* Selettore attributi */}
        {chiavi.length > 0 && (
          <div className="mt-4 space-y-4">
            {chiavi.map((chiave) => {
              const valori = valoriConsentiti(chiave);
              const selezionato = String(selezioni[chiave] ?? "");
              return (
                <div key={chiave}>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a8378]">
                    {chiave}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {valori.map((valore) => {
                      const attivo = selezionato === valore;
                      return (
                        <button
                          key={valore}
                          type="button"
                          onClick={() => seleziona(chiave, valore)}
                          aria-pressed={attivo}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                            attivo
                              ? "border-[#24462f] bg-[#24462f] text-[#faf9f5] shadow-sm"
                              : "border-[#e5ded0] bg-white text-[#3f3a33] hover:border-[#d5a83a] hover:bg-[#fdfbf6] hover:text-[#24462f]"
                          }`}
                        >
                          {valore}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Nome variante selezionata */}
        {varianteSelezionata?.nome && (
          <p className="mt-3 text-xs font-semibold text-[#6b6459]">
            Variante: {varianteSelezionata.nome}
          </p>
        )}

        {/* Disponibilità (reale, considera la riserva) */}
        {varianteSelezionata && (
          <div className="mt-3 flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                !esaurito ? "bg-[#f4efe4] text-[#24462f]" : "bg-[#f4efe4] text-[#8a5a3b]"
              }`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  !esaurito ? "bg-[#24462f]" : "bg-[#8a5a3b]"
                }`}
              />
              {!esaurito ? `${disponibile} disponibili` : "Esaurito"}
            </span>
          </div>
        )}

        {nessunaAcquistabile && (
          <div className="mt-4 rounded-xl border border-[#e5ded0] bg-[#f4efe4] px-4 py-3 text-sm font-semibold text-[#24462f]">
            Prodotto non disponibile.
          </div>
        )}

        {/* Nota informativa (coerente con la gestione aggregata del catalogo) */}
        <p className="mt-2 text-[11px] leading-[1.5] text-[#8a8378]">
          Il prezzo e la disponibilità dipendono dalla variante selezionata. Per i
          prodotti con varianti prezzo e stock del prodotto vengono aggregati
          automaticamente dal sistema.
        </p>
      </div>

      {soggettoVerificaEta ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-black">18+ — prodotto soggetto a verifica dell'età</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">Per completare l'acquisto sarà richiesta la conferma della maggiore età. Il controllo dell'identità previsto dalla legge resta a carico del venditore.</p>
        </div>
      ) : null}

      {/* Acquista — sostituito da "Il tuo prodotto" per il venditore del
          negozio proprietario (regola auto-acquisto, blocco anche API) */}
      <div className="mt-4 space-y-2">
        {eIlMioProdotto ? (
          <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e5ded0] bg-[#f4efe4] px-4 py-3 text-base font-bold text-[#24462f]">
            <Store className="h-5 w-5 shrink-0" aria-hidden />
            Il tuo prodotto
          </div>
        ) : (
          <>
            {acquistabile && hrefAcquista ? (
              <Link
                href={hrefAcquista}
                className="rd-azione w-full py-3.5 text-base"
              >
                <ShoppingBag className="h-5 w-5" />
                ACQUISTA
              </Link>
            ) : (
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-[#e5ded0] px-4 py-3 text-base font-bold text-[#8a8378]"
              >
                <ShoppingBag className="h-5 w-5" />
                {nessunaAcquistabile || esaurito ? "Non disponibile" : "Seleziona una variante"}
              </button>
            )}

            {/* Aggiungi al carrello: rispetta la variante selezionata. Solo
                snapshot UI; prezzo/stock validati server-side (F2.1/F2.2). */}
            <AggiungiAlCarrelloButton
              prodottoId={prodottoId}
              varianteId={varianteSelezionata?.id ?? null}
              nome={nome}
              prezzo={prezzoMostrato}
              immagine={immagineMostrata}
              variante={varianteSelezionata?.nome ?? null}
              negozioId={negozioId}
              negozioNome={negozioNome}
              slug={slug}
              soggettoVerificaEta={soggettoVerificaEta}
              disabled={!acquistabile}
            />
          </>
        )}
      </div>
      </div>
    </div>
  );
}
