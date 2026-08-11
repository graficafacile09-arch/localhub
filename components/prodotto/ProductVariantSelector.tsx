"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { disponibilitaReale, prodottoEsaurito } from "@/lib/prodotti-disponibilita";
import type { VariantePubblica } from "@/lib/varianti-pubbliche";

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
  nome: string;
  categoria: string | null;
  descrizione: string | null;
  statoCondizione: string | null;
  prezzoBase: number;
  /** Immagine del prodotto padre già risolta (fallback). */
  immagineBase: string;
  altText: string | null;
  varianti: VariantePubblica[];
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
  nome,
  categoria,
  descrizione,
  statoCondizione,
  prezzoBase,
  immagineBase,
  altText,
  varianti,
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
    <div className="mt-4">
      {/* Immagine (variante se ha immagine propria, altrimenti prodotto padre) */}
      <div className="overflow-hidden rounded-xl">
        <div className="relative aspect-square max-h-[400px] overflow-hidden bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={immagineMostrata}
            alt={altText?.trim() || nome}
            className="h-full w-full object-cover"
          />
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black tracking-tight text-slate-900">{nome}</h1>
            {categoria && (
              <p className="mt-0.5 text-xs font-semibold text-blue-600">{categoria}</p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-black text-emerald-700">
              €{prezzoMostrato.toFixed(2)}
            </p>
            {statoCondizione && (
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                {statoCondizione}
              </p>
            )}
          </div>
        </div>

        {descrizione && (
          <p className="mt-3 text-sm leading-6 text-slate-600">{descrizione}</p>
        )}

        {/* Selettore attributi */}
        {chiavi.length > 0 && (
          <div className="mt-4 space-y-4">
            {chiavi.map((chiave) => {
              const valori = valoriConsentiti(chiave);
              const selezionato = String(selezioni[chiave] ?? "");
              return (
                <div key={chiave}>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
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
                              ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                              : "border-slate-200 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-700"
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
          <p className="mt-3 text-xs font-semibold text-slate-500">
            Variante: {varianteSelezionata.nome}
          </p>
        )}

        {/* Disponibilità (reale, considera la riserva) */}
        {varianteSelezionata && (
          <div className="mt-3 flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                !esaurito ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
              }`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  !esaurito ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              {!esaurito ? `${disponibile} disponibili` : "Esaurito"}
            </span>
          </div>
        )}

        {nessunaAcquistabile && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
            Prodotto non disponibile.
          </div>
        )}

        {/* Nota informativa (coerente con la gestione aggregata del catalogo) */}
        <p className="mt-2 text-[11px] leading-4 text-slate-400">
          Il prezzo e la disponibilità dipendono dalla variante selezionata. Per i
          prodotti con varianti prezzo e stock del prodotto vengono aggregati
          automaticamente dal sistema.
        </p>
      </div>

      {/* Acquista */}
      <div className="mt-4 space-y-2">
        {acquistabile && hrefAcquista ? (
          <Link
            href={hrefAcquista}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white shadow-sm transition hover:bg-blue-700"
          >
            <ShoppingBag className="h-5 w-5" />
            ACQUISTA
          </Link>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-300 px-4 py-3 text-base font-bold text-white"
          >
            <ShoppingBag className="h-5 w-5" />
            {nessunaAcquistabile || esaurito ? "Non disponibile" : "Seleziona una variante"}
          </button>
        )}
      </div>
    </div>
  );
}
