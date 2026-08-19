import Link from "next/link";
import { ArrowRight, PackageOpen, ReceiptText } from "lucide-react";
import { requireCurrentUser } from "@/lib/auth/session";
import { getOrdiniCliente } from "@/lib/cliente/ordini";
import {
  FILTRI_ORDINI_CLIENTE,
  filtraOrdiniCliente,
  isFiltroOrdiniCliente,
} from "@/lib/cliente/ordini-format";
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
 * Filtri di presentazione (Tutti / In corso / Completati / Annullati):
 * applicati in pagina, lo stato del DB resta l'unica fonte.
 */
export default async function OrdiniPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { filtro: filtroRaw } = await searchParams;
  const user = await requireCurrentUser("/login?area=cliente");

  let ordini: OrdineClienteLista[];
  let errore: string | null = null;
  try {
    ordini = await getOrdiniCliente(user.id);
  } catch (err) {
    errore = err instanceof Error ? err.message : "Errore sconosciuto";
    ordini = [];
  }

  const filtro = isFiltroOrdiniCliente(filtroRaw) ? filtroRaw : "tutti";
  const ordiniFiltrati = errore ? [] : filtraOrdiniCliente(ordini, filtro);

  // Conteggio per filtro (dati reali, mostrato come badge nel chip).
  const conteggiFiltri = FILTRI_ORDINI_CLIENTE.map((f) => ({
    ...f,
    conteggio: errore ? 0 : filtraOrdiniCliente(ordini, f.key).length,
  }));

  // Titolo dello stato vuoto, leggibile per ogni filtro.
  const titoloVuoto: Record<string, string> = {
    in_corso: "Nessun ordine in corso",
    completati: "Nessun ordine completato",
    annullati: "Nessun ordine annullato",
  };

  return (
    <div className="space-y-5">
      {/* ── Intestazione ─────────────────────────────────────────────────────── */}
      <div className="card p-6 md:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <ReceiptText className="h-7 w-7" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
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

      {/* ── Filtri moderni con conteggi (solo se ci sono ordini) ──────────── */}
      {!errore && ordini.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {conteggiFiltri.map((f) => {
            const attivo = filtro === f.key;
            return (
              <Link
                key={f.key}
                href={
                  f.key === "tutti"
                    ? "/cliente/ordini"
                    : `/cliente/ordini?filtro=${f.key}`
                }
                aria-current={attivo ? "page" : undefined}
                className={`inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                  attivo
                    ? "bg-yellow-400 text-blue-900 shadow-sm"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
                }`}
              >
                {f.etichetta}
                {f.conteggio > 0 && (
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black tabular-nums ${
                      attivo
                        ? "bg-white/40 text-slate-800"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {f.conteggio > 99 ? "99+" : f.conteggio}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Errore di lettura ────────────────────────────────────────────────── */}
      {errore ? (
        <div className="card p-8 text-center">
          <h2 className="text-base font-bold text-slate-700">
            Impossibile caricare gli ordini
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Si è verificato un errore durante il recupero dei tuoi ordini.
            Riprova tra qualche istante.
          </p>
          <Link
            href="/cliente/ordini"
            className="btn-cta mt-6 px-5 py-2.5 text-sm"
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
              className="btn-cta px-6 py-2.5 text-sm"
            >
              <span>Esplora i negozi</span>
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          }
        />
      ) : ordiniFiltrati.length === 0 ? (
        /* ── Nessun ordine nel filtro ──────────────────────────────────────── */
        <ClienteEmptyState
          icon={PackageOpen}
          title={titoloVuoto[filtro] ?? "Nessun ordine"}
          description="Non ci sono ordini nello stato selezionato. Prova un altro filtro."
          action={
            <Link
              href="/cliente/ordini"
              className="btn-cta px-5 py-2.5 text-sm"
            >
              Mostra tutti gli ordini
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          }
        />
      ) : (
        /* ── Elenco ordini (dal più recente al più vecchio) ─────────────────── */
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ordiniFiltrati.map((ordine) => (
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
