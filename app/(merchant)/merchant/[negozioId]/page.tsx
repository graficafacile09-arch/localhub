import Link from "next/link";
import {
  BellRing,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  PackageCheck,
  ReceiptText,
  XCircle,
} from "lucide-react";
import MerchantDashboardCards from "@/components/merchant/MerchantDashboardCards";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import MerchantQuickActions from "@/components/merchant/MerchantQuickActions";
import { AvvisoNuoviOrdini } from "@/components/ordini/AvvisoNuoviOrdini";
import { AvvisoReclamiAperti } from "@/components/ordini/AvvisoReclamiAperti";
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

      {/* ── AVVISI URGENTI (prima cosa visibile) ── */}
      {(nonLetti > 0 || reclamiAperti > 0) && (
        <div className="space-y-3">
          {nonLetti > 0 && (
            <AvvisoNuoviOrdini
              conteggio={nonLetti}
              href={`/merchant/${negozioId}/ordini`}
            />
          )}
          {reclamiAperti > 0 && (
            <AvvisoReclamiAperti
              conteggio={reclamiAperti}
              href={`/merchant/${negozioId}/ordini?filtro=reclami`}
            />
          )}
        </div>
      )}

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

      {/* Ordini — riepilogo + accesso diretto (card NON link per evitare
          anchor-in-anchor: il KPI grid interno resta una lista di Link) */}
      <div className="rounded-2xl border border-white/70 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md">
        <Link
          href={`/merchant/${negozioId}/ordini`}
          className="group flex items-center justify-between gap-3"
        >
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
        </Link>

        {ordini.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-2.5 border-t border-slate-100 pt-4 sm:grid-cols-5">
            {(
              [
                {
                  key: "nuovi",
                  etichetta: "Nuovi",
                  valore: conteggioOrdini.nuovi,
                  icona: BellRing,
                  classe: "bg-amber-50 text-amber-700 ring-amber-200",
                  filtro: "nuovi",
                },
                {
                  key: "lavorazione",
                  etichetta: "In lavorazione",
                  valore: conteggioOrdini.lavorazione,
                  icona: Clock,
                  classe: "bg-orange-50 text-orange-700 ring-orange-200",
                  filtro: "lavorazione",
                },
                {
                  key: "pronti",
                  etichetta: "Pronti",
                  valore: conteggioOrdini.pronti,
                  icona: PackageCheck,
                  classe: "bg-green-50 text-green-700 ring-green-200",
                  filtro: "pronti",
                },
                {
                  key: "completati",
                  etichetta: "Completati",
                  valore: conteggioOrdini.completati,
                  icona: CheckCircle2,
                  classe: "bg-emerald-50 text-emerald-700 ring-emerald-200",
                  filtro: "completati",
                },
                {
                  key: "annullati",
                  etichetta: "Annullati",
                  valore: conteggioOrdini.annullati,
                  icona: XCircle,
                  classe: "bg-red-50 text-red-700 ring-red-200",
                  filtro: "annullati",
                },
              ] as const
            ).map(({ key, etichetta, valore, icona: Icona, classe, filtro }) => (
              <Link
                key={key}
                href={`/merchant/${negozioId}/ordini?filtro=${filtro}`}
                className={`group/kpi rounded-xl bg-white px-3 py-3 ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${classe}`}
              >
                <span className="flex items-center gap-1.5">
                  <Icona className="h-3.5 w-3.5" aria-hidden />
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                    {etichetta}
                  </span>
                </span>
                <p className="mt-1.5 text-2xl font-black tracking-tight text-slate-900">
                  {valore}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

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
