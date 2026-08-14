import Link from "next/link";
import { ReceiptText } from "lucide-react";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantStoreForUser } from "@/lib/merchant/data";
import { getOrdiniVenditore } from "@/lib/merchant/ordini";
import {
  FILTRI_ORDINI,
  isFiltroOrdini,
  statiPerFiltro,
} from "@/lib/merchant/ordini-stati";
import type { OrdineVenditoreLista } from "@/lib/merchant/ordini";
import { AvvisoNuoviOrdini } from "@/components/ordini/AvvisoNuoviOrdini";
import { KpiOrdini, type ConteggiOrdini } from "@/components/ordini/KpiOrdini";
import { OrderCard } from "@/components/ordini/OrderCard";

export const dynamic = "force-dynamic";

/**
 * Pagina "Ordini" dell'area venditore.
 * Card CONDIVISE (OrderCard) con il linguaggio visivo "Ordini InCittà":
 * numero + sintesi prodotto, cliente, data/ora, foto prodotto, totale,
 * stato. KPI per stato + banner "NUOVI ORDINI" + filtri (incluso Reclami,
 * che filtra in memoria su haReclamoAperto). OWNERSHIP server-side
 * (canManageStore + negozio_id): mai ordini di altri negozi.
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

  // Carica TUTTI gli ordini (una sola query) così i KPI e il filtro Reclami
  // restano coerenti indipendentemente dal filtro selezionato; poi si
  // filtra in memoria sulla base dello stato (o di haReclamoAperto).
  let ordini: OrdineVenditoreLista[] = [];
  let errore: string | null = null;
  try {
    ordini = await getOrdiniVenditore(user.id, negozioId);
  } catch (err) {
    errore = err instanceof Error ? err.message : "Errore sconosciuto";
  }

  const ordiniFiltrati =
    filtro === "reclami"
      ? ordini.filter((o) => o.haReclamoAperto)
      : (() => {
          const st = statiPerFiltro(filtro);
          return st.length > 0 ? ordini.filter((o) => st.includes(o.stato)) : ordini;
        })();

  // Attenzione: il KPI "In lavorazione" conta lo STESSO insieme del filtro
  // a cui rimanda (confermato+in_lavorazione+in_consegna), così il numero
  // corrisponde sempre alla lista che si apre; "In consegna" resta il
  // sotto-insieme dedicato.
  const conteggi: ConteggiOrdini = {
    nuovi: ordini.filter((o) => o.stato === "in_preparazione").length,
    lavorazione: ordini.filter((o) =>
      ["confermato", "in_lavorazione", "in_consegna"].includes(o.stato)
    ).length,
    inConsegna: ordini.filter((o) => o.stato === "in_consegna").length,
    pronti: ordini.filter((o) => o.stato === "pronto").length,
    completati: ordini.filter((o) => o.stato === "consegnato").length,
    annullati: ordini.filter((o) => o.stato === "cancellato").length,
  };
  const nonLetti = ordini.filter((o) => !o.lettoAt).length;
  const baseHref = `/merchant/${negozioId}/ordini`;

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
              Gestisci e monitora gli ordini del tuo negozio: dalla conferma
              fino alla consegna o all&apos;annullamento.
            </p>
          </div>
        </div>
      </div>

      {/* ── KPI per stato (Nuovi in rosso se > 0) ───────────────────────────── */}
      <KpiOrdini baseHref={baseHref} conteggi={conteggi} />

      {/* ── Banner nuovi ordini (letto_at, sistema esistente) ──────────────── */}
      {filtro === "tutti" && (
        <AvvisoNuoviOrdini
          conteggio={nonLetti}
          href={`${baseHref}?filtro=nuovi`}
        />
      )}

      {/* ── Filtri ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {FILTRI_ORDINI.map((f) => {
          const attivo = filtro === f.key;
          return (
            <Link
              key={f.key}
              href={
                f.key === "tutti"
                  ? baseHref
                  : `${baseHref}?filtro=${f.key}`
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
        <div className="rounded-[2rem] border border-blue-100 bg-white p-8 text-center shadow-sm">
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
                href={baseHref}
                className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-bold text-blue-800 transition hover:bg-yellow-300"
              >
                Mostra tutti gli ordini
              </Link>
            ) : undefined
          }
        />
      ) : ordiniFiltrati.length === 0 ? (
        /* ── Nessun ordine nel filtro selezionato ─────────────────────────── */
        <MerchantEmptyState
          title={filtro === "reclami" ? "Nessun reclamo aperto" : "Nessun ordine in questo filtro"}
          description={
            filtro === "reclami"
              ? "Quando un cliente segnala un problema su un ordine, il reclamo comparirà qui."
              : "Non ci sono ordini nello stato selezionato. Prova un altro filtro."
          }
          action={
            <Link
              href={baseHref}
              className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-bold text-blue-800 transition hover:bg-yellow-300"
            >
              Mostra tutti gli ordini
            </Link>
          }
        />
      ) : (
        /* ── Elenco ordini ─────────────────────────────────────────────────── */
        <div className="grid gap-4 lg:grid-cols-2">
          {ordiniFiltrati.map((ordine) => (
            <OrderCard
              key={ordine.id}
              vista="venditore"
              href={`/merchant/${negozioId}/ordini/${ordine.id}`}
              numero={ordine.numero}
              stato={ordine.stato}
              totale={ordine.totale}
              costoSpedizione={ordine.costoSpedizione}
              createdAt={ordine.createdAt}
              modalita={ordine.modalita}
              righe={ordine.righe}
              clienteNome={ordine.clienteNome}
              clienteCognome={ordine.clienteCognome}
              nonLetto={!ordine.lettoAt}
              haReclamoAperto={ordine.haReclamoAperto}
              ctaLabel="Apri ordine"
            />
          ))}
        </div>
      )}
    </div>
  );
}
