"use client";

import HomepageProductCarousel from "@/components/home/HomepageProductCarousel";

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
  return (
    <HomepageProductCarousel
      prodotti={prodotti}
      statoPreferiti={statoPreferiti}
      prodottoTipico
      compatto
      mostraTutti
    />
  );
}
