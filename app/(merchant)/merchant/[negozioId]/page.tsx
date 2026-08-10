import Link from "next/link";
import { Camera, ChevronRight, ReceiptText } from "lucide-react";
import MerchantDashboardCards from "@/components/merchant/MerchantDashboardCards";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import MerchantQuickActions from "@/components/merchant/MerchantQuickActions";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantProductsForStore, getMerchantStoreForUser } from "@/lib/merchant/data";
import { getOrdiniVenditore } from "@/lib/merchant/ordini";
import { getConteggioReclamiApertiVenditore } from "@/lib/ordine-reclami";

export default async function MerchantStorePage({
  params,
}: {
  params: Promise<{ negozioId: string }>;
}) {
  const { negozioId } = await params;
  const user = await requireCurrentUser("/login");
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired) {
    return (
      <MerchantEmptyState
        title="Configurazione database richiesta"
        description={storeResult.errorMessage ?? "Esegui la migrazione SQL per attivare l'area amministratore."}
      />
    );
  }

  if (!storeResult.data) {
    return (
      <MerchantEmptyState
        title="Negozio non disponibile"
        description="Non hai accesso a questo negozio oppure non esiste."
      />
    );
  }

  const productsResult = await getMerchantProductsForStore(user.id, negozioId);
  const prodotti = productsResult.data;
  const attivi = prodotti.filter((item) => item.attivo).length;
  const manuali = prodotti.filter((item) => (item.origine_pubblicazione ?? "manuale") === "manuale").length;

  // Riepilogo ordini (best-effort: un errore qui non deve far fallire la dashboard).
  let ordini: import("@/lib/merchant/ordini").OrdineVenditoreLista[] = [];
  try {
    ordini = await getOrdiniVenditore(user.id, negozioId);
  } catch {
    ordini = [];
  }
  const conteggioOrdini = {
    nuovi: ordini.filter((o) => o.stato === "in_preparazione").length,
    lavorazione: ordini.filter((o) =>
      ["confermato", "in_lavorazione", "in_consegna"].includes(o.stato)
    ).length,
    pronti: ordini.filter((o) => o.stato === "pronto").length,
    completati: ordini.filter((o) => o.stato === "consegnato").length,
    annullati: ordini.filter((o) => o.stato === "cancellato").length,
  };
  const nonLetti = ordini.filter((o) => !o.lettoAt).length;

  // Reclami attivi (best-effort: un errore qui non deve far fallire la dashboard).
  let reclamiAperti = 0;
  try {
    reclamiAperti = await getConteggioReclamiApertiVenditore(user.id, negozioId);
  } catch {
    reclamiAperti = 0;
  }

  return (
    <div className="space-y-4">
      {/* Header compatto */}
      <div className="rounded-2xl border border-white/70 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
          Dashboard negozio
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
          {storeResult.data.nome}
        </h1>
        {storeResult.data.descrizione && (
          <p className="mt-1 text-sm leading-5 text-slate-500">
            {storeResult.data.descrizione}
          </p>
        )}
      </div>

      {/* Scansione — azione principale, immediatamente visibile */}
      <Link
        href={`/merchant/${negozioId}/prodotti/ai`}
        className="flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-400 hover:to-blue-600 active:scale-[0.98]"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
          <Camera className="h-5 w-5" />
        </div>
        <span>Scansiona nuovo prodotto</span>
      </Link>

      {/* Altre azioni rapide */}
      <MerchantQuickActions storeId={negozioId} />

      {/* Ordini — riepilogo + accesso diretto */}
      <Link
        href={`/merchant/${negozioId}/ordini`}
        className="group block rounded-2xl border border-white/70 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <ReceiptText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold tracking-tight text-slate-900">
                Gestisci ordini
              </h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <p className="text-xs text-slate-500">
                  {ordini.length === 0
                    ? "Nessun ordine ricevuto"
                    : `${ordini.length} ordini totali`}
                </p>
                {nonLetti > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-white">
                    🔴 {nonLetti} nuovo{nonLetti === 1 ? " ordine" : "i ordini"}
                  </span>
                )}
                {reclamiAperti > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-700 ring-1 ring-red-200">
                    🚨 {reclamiAperti} {reclamiAperti === 1 ? "reclamo aperto" : "reclami aperti"}
                  </span>
                )}
              </div>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
        </div>

        {ordini.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 sm:grid-cols-5">
            {(
              [
                ["nuovi", "Nuovi", conteggioOrdini.nuovi],
                ["lavorazione", "In lavorazione", conteggioOrdini.lavorazione],
                ["pronti", "Pronti", conteggioOrdini.pronti],
                ["completati", "Completati", conteggioOrdini.completati],
                ["annullati", "Annullati", conteggioOrdini.annullati],
              ] as const
            ).map(([key, etichetta, valore]) => (
              <div key={key} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {etichetta}
                </p>
                <p className="mt-0.5 text-xl font-black tracking-tight text-slate-800">{valore}</p>
              </div>
            ))}
          </div>
        )}
      </Link>

      {/* Statistiche — comprimibili */}
      <MerchantDashboardCards
        totals={{
          prodotti: prodotti.length,
          attivi,
          inVetrina: manuali,
        }}
      />

      {/* Eliminazione negozio: disponibile in Impostazioni → Zona Pericolosa.
          Il ripristino dal Cestino è riservato all'amministratore. */}
    </div>
  );
}
