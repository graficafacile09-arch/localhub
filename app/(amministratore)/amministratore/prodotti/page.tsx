import ProdottiModule from "@/components/amministratore/ProdottiModule";
import { getAdminNavItem } from "@/components/amministratore/navigation";
import { getProdottiAmministrazione } from "@/lib/amministratore/prodotti";

export const metadata = {
  title: "Prodotti — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Catalogo prodotti nell'Area Amministratore: supervisione globale dei
 * prodotti pubblicati dai commercianti. La pagina carica i dati reali dal
 * DB (due query, zero N+1) e li passa al modulo interattivo che gestisce
 * ricerca, filtri, ordinamento, paginazione e azioni rapide (attiva/
 * disattiva, prodotto tipico, in offerta, eliminazione). La modifica
 * completa riusa il form condiviso del venditore via
 * /amministratore/prodotti/[productId].
 */
export default async function AdminProdottiPage() {
  const item = getAdminNavItem("/amministratore/prodotti");
  const Icon = item.icon;
  const prodotti = await getProdottiAmministrazione();

  return (
    <div className="space-y-5">
      {/* Intestazione modulo */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Icon className="h-7 w-7" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Pannello Amministratore
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              {item.label}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              {item.description}
            </p>
            <p className="mt-4 text-sm font-semibold text-slate-500">
              {prodotti.length} {prodotti.length === 1 ? "prodotto" : "prodotti"} nel catalogo
            </p>
          </div>
        </div>
      </div>

      {/* Modulo interattivo: ricerca, filtri, ordinamento, azioni rapide */}
      <ProdottiModule prodotti={prodotti} />
    </div>
  );
}
