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

  const ultimoNumero = ordini[0]?.numero ?? "—";
  const ultimo = ordini[0]
    ? `${ordini[0].negozioNome} — ${formattaDataOrdine(ordini[0].createdAt)}`
    : "—";
  const statoUltimo = ordini[0]?.stato ?? null;

  return (
    <div className="space-y-5">
      {/* ── Intestazione dashboard ───────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="p-6 md:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                <ShoppingBasket className="h-7 w-7" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
                  Area Clienti
                </p>
                <h1 className="mt-1.5 text-3xl font-black tracking-tight text-slate-900">
                  Il mio account
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                  Il riepilogo della tua attività su InCittà: ordini, preferiti
                  e ultimi acquisti, sempre a portata di mano.
                </p>
              </div>
            </div>

            <Link href="/negozi" className="btn-cta shrink-0 px-6 py-3 text-sm">
              Esplora i negozi
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Griglia card ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <OrdiniCard
          conteggio={ordini.length}
          descrizione={
            statoUltimo
              ? `Ultimo ordine: ${ultimo}`
              : "Storico dei tuoi ordini e stato di spedizione e consegna."
          }
        />
        <PreferitiCard conteggio={totalePreferiti} />
        <UltimoAcquistoCard numero={ultimoNumero} descrizione={ultimo} stato={statoUltimo} />
        <OfferteConsigliateCard />
        <NegoziPreferitiCard conteggio={negoziPreferiti} />
        <EventiConsigliatiCard />
      </div>
    </div>
  );
}
