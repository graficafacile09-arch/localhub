"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import ProductCard from "@/components/home/ProductCard";

// Stessa convenzione di lib/cliente/favorites.ts (chiave "tipo:id"),
// replicata qui senza importare moduli server-only in un Client Component.
const chiavePreferito = (tipo: string, riferimentoId: string) =>
  `${tipo}:${riferimentoId}`;

/**
 * Griglia compatta della vetrina "Eccellenze Calabresi".
 *
 * 4 colonne desktop / 3 tablet / 2 mobile (stessa griglia delle altre
 * sezioni, card in variante compatta). Mostra inizialmente solo le prime
 * `CARD_INIZIALI` card; se ce ne sono altre compare il pulsante
 * "Mostra tutto" che le espande tutte senza ricaricare la pagina
 * (e diventa "Mostra meno" per richiuderle).
 */
const CARD_INIZIALI = 4;

type ProdottoRecord = Record<string, unknown>;

type StatoPreferiti = {
  autenticato: boolean;
  chiavi: Set<string>;
};

export default function EccellenzeCalabresiGrid({
  prodotti,
  statoPreferiti,
}: {
  prodotti: ProdottoRecord[];
  statoPreferiti: StatoPreferiti;
}) {
  const [espanso, setEspanso] = useState(false);
  const visibili = espanso ? prodotti : prodotti.slice(0, CARD_INIZIALI);
  const haAltri = prodotti.length > CARD_INIZIALI;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
        {visibili.map((prodotto) => {
          const prodottoId = String(prodotto.id);
          return (
            <ProductCard
              key={prodottoId}
              id={prodottoId}
              slug={(prodotto.slug as string) ?? prodottoId}
              nome={prodotto.nome as string}
              prezzo={prodotto.prezzo as number}
              categoria={(prodotto.categoria as string) ?? null}
              negozio_nome={(prodotto.negozio_nome as string) ?? ""}
              negozio_id={String(prodotto.negozio_id ?? "")}
              immagine_principale={(prodotto.immagine_principale as string) ?? null}
              haVarianti={Boolean(prodotto.ha_varianti)}
              prodottoTipico
              compatto
              preferitoAttivo={statoPreferiti.chiavi.has(
                chiavePreferito("prodotto", prodottoId)
              )}
              autenticato={statoPreferiti.autenticato}
            />
          );
        })}
      </div>

      {haAltri && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setEspanso((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-6 py-2.5 text-sm font-black text-blue-900 shadow-sm transition hover:bg-yellow-300 active:scale-95"
          >
            {espanso ? (
              <>
                Mostra meno
                <ChevronUp className="h-4 w-4" aria-hidden />
              </>
            ) : (
              <>
                Mostra tutto
                <ChevronDown className="h-4 w-4" aria-hidden />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
