import Link from "next/link";
import { ArrowRight, PackageOpen, ReceiptText } from "lucide-react";
import { requireCurrentUser } from "@/lib/auth/session";
import { getOrdiniCliente } from "@/lib/cliente/ordini";
import type { OrdineClienteLista } from "@/lib/cliente/types";
import ClienteEmptyState from "@/components/cliente/ClienteEmptyState";
import { OrderCard } from "@/components/ordini/OrderCard";

export const metadata = {
  title: "I miei ordini — Area Clienti",
};

export const dynamic = "force-dynamic";

/**
 * Pagina "I miei ordini" — Area Clienti.
 * Card CONDIVISE (OrderCard) con il linguaggio visivo "Ordini InCittà":
 * numero + sintesi prodotto, negozio, data/ora, foto prodotto, totale e
 * stato. Dati REALI da Supabase, filtrati per cliente_user_id (server-side).
 */
export default async function OrdiniPage() {
  const user = await requireCurrentUser("/login?area=cliente");

  let ordini: OrdineClienteLista[];
  let errore: string | null = null;
  try {
    ordini = await getOrdiniCliente(user.id);
  } catch (err) {
    errore = err instanceof Error ? err.message : "Errore sconosciuto";
    ordini = [];
  }

  return (
    <div className="space-y-5">
      {/* ── Intestazione ─────────────────────────────────────────────────────── */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 ring-1 ring-teal-100">
            <ReceiptText className="h-7 w-7" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
              Area Clienti
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              I miei ordini
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              Lo storico completo dei tuoi acquisti, salvato sul tuo account:
              ritorna quando vuoi e ritrova ogni ordine con il suo stato.
            </p>
          </div>
        </div>
      </div>

      {/* ── Errore di lettura ────────────────────────────────────────────────── */}
      {errore ? (
        <div className="rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-sm">
          <h2 className="text-base font-bold text-slate-700">
            Impossibile caricare gli ordini
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Si è verificato un errore durante il recupero dei tuoi ordini.
            Riprova tra qualche istante.
          </p>
          <Link
            href="/cliente/ordini"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-700"
          >
            Riprova
          </Link>
        </div>
      ) : ordini.length === 0 ? (
        /* ── Nessun ordine ─────────────────────────────────────────────────── */
        <ClienteEmptyState
          icon={PackageOpen}
          title="Non hai ancora effettuato ordini"
          description="Quando acquisterai da un negozio della tua città, i tuoi ordini compariranno qui e resteranno salvati sul tuo account."
          action={
            <Link
              href="/negozi"
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-700"
            >
              Esplora i negozi
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          }
        />
      ) : (
        /* ── Elenco ordini (dal più recente al più vecchio) ─────────────────── */
        <div className="grid gap-4 lg:grid-cols-2">
          {ordini.map((ordine) => (
            <OrderCard
              key={ordine.id}
              vista="cliente"
              href={`/cliente/ordini/${ordine.id}`}
              numero={ordine.numero}
              stato={ordine.stato}
              totale={ordine.totale}
              costoSpedizione={ordine.costoSpedizione}
              createdAt={ordine.createdAt}
              modalita={ordine.modalita}
              righe={ordine.righe}
              negozioNome={ordine.negozioNome}
              ctaLabel="Visualizza ordine"
            />
          ))}
        </div>
      )}
    </div>
  );
}
