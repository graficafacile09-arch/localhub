import Link from "next/link";
import type { MerchantStoreSummary } from "@/lib/merchant/types";

/**
 * Elenco negozi della sidebar ("I tuoi negozi" per il venditore,
 * "Negozi gestiti" per l'amministratore). È una sezione SEPARATA dalla
 * navigazione principale: i link ai negozi non sono voci del menu.
 * Accanto al NOME del negozio mostra un badge rosso con il numero di ordini
 * NON LETTI (avvisi): il commerciante vede subito quale negozio ha ordini
 * nuovi, poi clicca per entrare e gestirli.
 * `baseHref` permette di cambiare la destinazione: per l'amministratore
 * i link portano alla dashboard negozio dell'area admin
 * (/amministratore/negozi/{id}) invece di /merchant/{id}.
 */
export default function MerchantStoreSwitcher({
  stores,
  currentStoreId,
  ordiniNonLettiPerNegozio,
  baseHref = "/merchant",
  label = "I tuoi negozi",
}: {
  stores: MerchantStoreSummary[];
  currentStoreId?: string;
  /** Conteggio ordini non letti per negozio (badge giallo accanto al nome). */
  ordiniNonLettiPerNegozio?: Record<string, number>;
  /** Prefisso dei link ai negozi ("merchant" o "amministratore/negozi"). */
  baseHref?: string;
  /** Etichetta della sezione (per l'admin: "Negozi gestiti"). */
  label?: string;
}) {
  if (stores.length === 0) {
    return null;
  }

  return (
    <div className="card p-5">
      <p className="section-label">
        {label}
      </p>
      <div className="mt-4 space-y-2">
        {stores.map((store) => {
          const active = store.id === currentStoreId;
          const ordiniNonLetti = ordiniNonLettiPerNegozio?.[store.id] ?? 0;

          return (
            <Link
              key={store.id}
              href={`${baseHref}/${store.id}`}
              className={`block rounded-2xl border px-4 py-3 text-sm transition ${
                active
                  ? "border-blue-300 bg-blue-50 text-blue-800"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-200 hover:bg-blue-50/60"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold">{store.nome}</span>
                {ordiniNonLetti > 0 && (
                  <span
                    className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-yellow-400 px-1.5 text-[10px] font-black leading-none text-blue-900"
                    title={`${ordiniNonLetti} ${ordiniNonLetti === 1 ? "ordine non letto" : "ordini non letti"}`}
                  >
                    {ordiniNonLetti > 9 ? "9+" : ordiniNonLetti}
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-slate-500">{store.categoria ?? "Categoria non definita"}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
