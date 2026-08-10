import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  MapPin,
  PackageOpen,
  ReceiptText,
  Store,
  Truck,
} from "lucide-react";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  etichettaModalita,
  etichettaStato,
  formattaDataOrdine,
  getOrdiniCliente,
} from "@/lib/cliente/ordini";
import type { OrdineClienteLista, StatoOrdine } from "@/lib/cliente/types";
import ClienteEmptyState from "@/components/cliente/ClienteEmptyState";

export const metadata = {
  title: "I miei ordini — Area Clienti",
};

export const dynamic = "force-dynamic";

function formattaPrezzo(value: number): string {
  return `€${(value || 0).toFixed(2).replace(".", ",")}`;
}

/** Badge colorato in base allo stato dell'ordine. */
function BadgeStato({ stato }: { stato: StatoOrdine }) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold";
  const colori: Record<StatoOrdine, string> = {
    in_preparazione: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    confermato: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    in_lavorazione: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
    pronto: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200",
    in_consegna: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    consegnato: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    cancellato: "bg-red-50 text-red-600 ring-1 ring-red-200",
  };
  return <span className={`${base} ${colori[stato]}`}>{etichettaStato(stato)}</span>;
}

/** Card di un singolo ordine nella lista. */
function OrdineCard({ ordine }: { ordine: OrdineClienteLista }) {
  const èRitiro = ordine.modalita === "ritiro";
  return (
    <Link
      href={`/cliente/ordini/${ordine.id}`}
      className="group block rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-sm transition hover:border-teal-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black tracking-wide text-slate-900">
              {ordine.numero}
            </span>
            <BadgeStato stato={ordine.stato} />
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <Store className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
            <span className="truncate">{ordine.negozioNome}</span>
          </p>
        </div>
        <span className="shrink-0 text-lg font-black text-slate-900">
          {formattaPrezzo(ordine.totale)}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          {formattaDataOrdine(ordine.createdAt)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          {èRitiro ? (
            <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          ) : (
            <Truck className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          )}
          {etichettaModalita(ordine.modalita)}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-xs font-semibold text-teal-700 transition group-hover:text-teal-800">
          Visualizza ordine
        </span>
        <ArrowRight
          className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-teal-600"
          aria-hidden
        />
      </div>
    </Link>
  );
}

/**
 * Pagina \"I miei ordini\" — Area Clienti.
 * Dati REALI da Supabase, filtrati per cliente_user_id = utente della
 * sessione (server-side). Dal più recente al più vecchio.
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
            <OrdineCard key={ordine.id} ordine={ordine} />
          ))}
        </div>
      )}
    </div>
  );
}
