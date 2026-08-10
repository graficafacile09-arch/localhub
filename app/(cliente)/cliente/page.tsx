import Link from "next/link";
import { ArrowRight, ShoppingBasket } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getConteggioPreferiti } from "@/lib/cliente/favorites";
import { formattaDataOrdine, getOrdiniCliente } from "@/lib/cliente/ordini";
import type { OrdineClienteLista } from "@/lib/cliente/types";
import OrdiniCard from "@/components/cliente/dashboard/OrdiniCard";
import PreferitiCard from "@/components/cliente/dashboard/PreferitiCard";
import UltimoAcquistoCard from "@/components/cliente/dashboard/UltimoAcquistoCard";
import OfferteConsigliateCard from "@/components/cliente/dashboard/OfferteConsigliateCard";
import NegoziPreferitiCard from "@/components/cliente/dashboard/NegoziPreferitiCard";
import EventiConsigliatiCard from "@/components/cliente/dashboard/EventiConsigliatiCard";

export const metadata = {
  title: "Dashboard — Area Clienti",
};

// La dashboard rifletterà in tempo reale i dati dell'utente nelle fasi
// successive: nessuna cache statica finché non ci sono dati da mostrare.
export const dynamic = "force-dynamic";

/**
 * Dashboard dell'Area Clienti.
 * Card predisposte per: ordini, preferiti, ultimo acquisto, offerte
 * consigliate, negozi preferiti ed eventi consigliati.
 */
export default async function ClienteDashboardPage() {
  // Conteggi reali per le card della dashboard (FASE 3): due query head
  // (conteggio esatto), nessun fetch della lista completa.
  const user = await getCurrentUser();
  const [totalePreferiti, negoziPreferiti, ordini] = await Promise.all([
    user ? getConteggioPreferiti(user.id) : Promise.resolve(0),
    user ? getConteggioPreferiti(user.id, "negozio") : Promise.resolve(0),
    user
      ? getOrdiniCliente(user.id).catch((): OrdineClienteLista[] => [])
      : Promise.resolve([] as OrdineClienteLista[]),
  ]);

  const ultimo = ordini[0]
    ? `${ordini[0].negozioNome} — ${formattaDataOrdine(ordini[0].createdAt)}`
    : "—";

  return (
    <div className="space-y-5">
      {/* ── Intestazione dashboard ───────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-sm">
        <div className="h-1.5 bg-linear-to-r from-cyan-300 via-teal-400 to-yellow-300" />
        <div className="p-6 md:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 ring-1 ring-teal-100">
                <ShoppingBasket className="h-7 w-7" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
                  Area Clienti
                </p>
                <h1 className="mt-1.5 text-3xl font-black tracking-tight text-slate-900">
                  Benvenuto in LocalHub
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                  Qui trovi il riepilogo della tua attività: ordini, preferiti,
                  offerte ed eventi pensati per te. I moduli verranno attivati
                  nelle prossime fasi.
                </p>
              </div>
            </div>

            <Link
              href="/negozi"
              className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-teal-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700"
            >
              Esplora i negozi
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Griglia card ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <OrdiniCard conteggio={ordini.length} />
        <PreferitiCard conteggio={totalePreferiti} />
        <UltimoAcquistoCard descrizione={ultimo} />
        <OfferteConsigliateCard />
        <NegoziPreferitiCard conteggio={negoziPreferiti} />
        <EventiConsigliatiCard />
      </div>
    </div>
  );
}
