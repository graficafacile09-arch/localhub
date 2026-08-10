import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Inbox,
  MapPin,
  MessageSquareText,
  Phone,
  ReceiptText,
  ShoppingBag,
  Truck,
} from "lucide-react";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import { requireCurrentUser } from "@/lib/auth/session";
import { formattaDataOrdine, etichettaModalita } from "@/lib/cliente/ordini-format";
import type { StatoOrdine } from "@/lib/cliente/types";
import { getMerchantStoreForUser } from "@/lib/merchant/data";
import { getOrdiniVenditore } from "@/lib/merchant/ordini";
import {
  ETICHETTE_STATO,
  FILTRI_ORDINI,
  isFiltroOrdini,
  prioritaStato,
} from "@/lib/merchant/ordini-stati";
import type { OrdineVenditoreLista } from "@/lib/merchant/ordini";

export const dynamic = "force-dynamic";

function formattaPrezzo(value: number): string {
  return `€${(value || 0).toFixed(2).replace(".", ",")}`;
}

/** Badge colorato in base allo stato. */
function BadgeStato({ stato }: { stato: StatoOrdine }) {
  const base = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold";
  const colori: Record<StatoOrdine, string> = {
    in_preparazione: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    confermato: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    in_lavorazione: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
    pronto: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200",
    in_consegna: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    consegnato: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    cancellato: "bg-red-50 text-red-600 ring-1 ring-red-200",
  };
  return <span className={`${base} ${colori[stato]}`}>{ETICHETTE_STATO[stato]}</span>;
}

/** Card di un ordine nella lista venditore. */
function OrdineCard({ negozioId, ordine }: { negozioId: string; ordine: OrdineVenditoreLista }) {
  const èRitiro = ordine.modalita === "ritiro";
  const nonLetto = !ordine.lettoAt;

  return (
    <Link
      href={`/merchant/${negozioId}/ordini/${ordine.id}`}
      className={`group block rounded-[1.75rem] border bg-white p-5 shadow-sm transition hover:shadow-md ${
        nonLetto ? "border-blue-200 ring-1 ring-blue-100" : "border-white/70 hover:border-blue-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {nonLetto && (
            <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" title="Nuovo ordine" />
          )}
          <span className="truncate text-sm font-black tracking-wide text-slate-900">
            {ordine.numero}
          </span>
          <BadgeStato stato={ordine.stato} />
          {ordine.haReclamoAperto && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 ring-1 ring-red-200">
              🚨 Reclamo aperto
            </span>
          )}
        </div>
        <span className="shrink-0 text-lg font-black text-slate-900">
          {formattaPrezzo(ordine.totale)}
        </span>
      </div>

      <p className="mt-2 text-sm font-semibold text-slate-700">
        {ordine.clienteNome} {ordine.clienteCognome}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
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
        <span className="inline-flex items-center gap-1.5">
          <ShoppingBag className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          {ordine.numeroRighe} {ordine.numeroRighe === 1 ? "prodotto" : "prodotti"}
        </span>
        {ordine.clienteTelefono && (
          <span className="inline-flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            {ordine.clienteTelefono}
          </span>
        )}
        {ordine.note && (
          <span className="inline-flex items-center gap-1.5" title={ordine.note}>
            <MessageSquareText className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            Note
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-xs font-semibold text-blue-700 transition group-hover:text-blue-800">
          Gestisci ordine
        </span>
        <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden />
      </div>
    </Link>
  );
}

/**
 * Pagina "Ordini" dell'area venditore.
 * Lista REALE da Supabase, filtrata per negozio_id + ownership server-side.
 * Ordinamento: prima i nuovi, poi in lavorazione, poi conclusi, più recenti
 * prima (gestito dal servizio getOrdiniVenditore).
 */
export default async function MerchantOrdiniPage({
  params,
  searchParams,
}: {
  params: Promise<{ negozioId: string }>;
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { negozioId } = await params;
  const { filtro: filtroRaw } = await searchParams;
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
        description="Non hai accesso agli ordini di questo negozio."
      />
    );
  }

  const filtro = isFiltroOrdini(filtroRaw) ? filtroRaw : "tutti";

  let ordini: OrdineVenditoreLista[] = [];
  let errore: string | null = null;
  try {
    ordini = await getOrdiniVenditore(user.id, negozioId, filtro);
  } catch (err) {
    errore = err instanceof Error ? err.message : "Errore sconosciuto";
  }

  return (
    <div className="space-y-5">
      {/* ── Intestazione ─────────────────────────────────────────────────────── */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
            <ReceiptText className="h-7 w-7" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Area venditore
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Ordini di {storeResult.data.nome}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              Ricevi, gestisci e traccia gli ordini arrivati dal sito: dalla
              conferma fino alla consegna o all&apos;annullamento.
            </p>
          </div>
        </div>
      </div>

      {/* ── Filtri ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {FILTRI_ORDINI.map((f) => {
          const attivo = filtro === f.key;
          return (
            <Link
              key={f.key}
              href={
                f.key === "tutti"
                  ? `/merchant/${negozioId}/ordini`
                  : `/merchant/${negozioId}/ordini?filtro=${f.key}`
              }
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                attivo
                  ? "bg-blue-600 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
              }`}
            >
              {f.etichetta}
            </Link>
          );
        })}
      </div>

      {/* ── Errore di lettura ────────────────────────────────────────────────── */}
      {errore ? (
        <div className="rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-sm">
          <h2 className="text-base font-bold text-slate-700">Impossibile caricare gli ordini</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Si è verificato un errore durante il recupero degli ordini. Riprova
            tra qualche istante.
          </p>
        </div>
      ) : ordini.length === 0 ? (
        /* ── Nessun ordine ────────────────────────────────────────────────── */
        <MerchantEmptyState
          title={filtro === "tutti" ? "Nessun ordine ricevuto" : "Nessun ordine in questo filtro"}
          description={
            filtro === "tutti"
              ? "Quando un cliente effettua un acquisto dal sito, l'ordine comparirà qui con tutti i dettagli da gestire."
              : "Non ci sono ordini nello stato selezionato. Prova un altro filtro."
          }
          action={
            filtro !== "tutti" ? (
              <Link
                href={`/merchant/${negozioId}/ordini`}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
              >
                Mostra tutti gli ordini
              </Link>
            ) : undefined
          }
        />
      ) : (
        /* ── Elenco ordini ─────────────────────────────────────────────────── */
        <div className="grid gap-4 lg:grid-cols-2">
          {ordini.map((ordine) => (
            <OrdineCard key={ordine.id} negozioId={negozioId} ordine={ordine} />
          ))}
        </div>
      )}
    </div>
  );
}
