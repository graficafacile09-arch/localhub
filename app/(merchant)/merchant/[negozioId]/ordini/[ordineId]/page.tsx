import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  History,
  MessageSquareText,
  Package,
  Settings2,
  Store,
} from "lucide-react";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import OrdineAzioni from "@/components/merchant/OrdineAzioni";
import { requireCurrentUser } from "@/lib/auth/session";
import { sintesiProdotti } from "@/lib/cliente/ordini-format";
import { getMerchantStoreForUser } from "@/lib/merchant/data";
import { getOrdineVenditore } from "@/lib/merchant/ordini";
import { getReclamiVenditore } from "@/lib/ordine-reclami";
import type { ReclamoOrdine as ReclamoOrdineType } from "@/lib/ordine-reclami";
import ReclamiOrdine from "@/components/merchant/ReclamiOrdine";
import type { OrdineVenditoreDettaglio } from "@/lib/merchant/ordini";
import { Sezione } from "@/components/ordini/Sezione";
import { StatoOrdineBanner } from "@/components/ordini/StatoOrdineBanner";
import { RigheProdotto } from "@/components/ordini/RigheProdotto";
import { StoricoEventi } from "@/components/ordini/StoricoEventi";
import { OrderHeader } from "@/components/ordini/OrderHeader";
import { InformazioniCliente } from "@/components/ordini/InformazioniCliente";
import { InformazioniRitiroSpedizione } from "@/components/ordini/InformazioniRitiroSpedizione";

export const dynamic = "force-dynamic";

/**
 * Pagina dettaglio ordine — Area Venditore ("scheda ordine").
 * Stesso linguaggio visivo dell'area cliente (OrderHeader, banner di stato
 * guidato dal DB, sezioni condivise) con in più gli strumenti di gestione:
 * azioni di stato (OrdineAzioni), dati cliente e gestione reclami. Un ordine
 * ANNULLATO mostra sempre la grafica di annullamento con motivo/nota.
 * OWNERSHIP server-side: canManageStore + filtro negozio_id.
 */
export default async function MerchantOrdineDettaglioPage({
  params,
}: {
  params: Promise<{ negozioId: string; ordineId: string }>;
}) {
  const { negozioId, ordineId } = await params;
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

  let ordine: OrdineVenditoreDettaglio | null = null;
  let errore: string | null = null;
  try {
    ordine = await getOrdineVenditore(user.id, negozioId, ordineId);
  } catch (err) {
    errore = err instanceof Error ? err.message : "Errore sconosciuto";
  }

  let reclami: ReclamoOrdineType[] = [];
  if (ordine) {
    try {
      reclami = await getReclamiVenditore(user.id, negozioId, ordineId);
    } catch {
      reclami = [];
    }
  }

  if (errore) {
    return (
      <div className="rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-black tracking-tight text-slate-900">Impossibile caricare l&apos;ordine</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
          Si è verificato un errore durante il recupero del dettaglio. Riprova tra qualche istante.
        </p>
        <Link
          href={`/merchant/${negozioId}/ordini`}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Torna agli ordini
        </Link>
      </div>
    );
  }

  if (!ordine) {
    return (
      <MerchantEmptyState
        title="Ordine non trovato"
        description="Questo ordine non esiste oppure non appartiene a questo negozio."
        action={
          <Link
            href={`/merchant/${negozioId}/ordini`}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Torna agli ordini
          </Link>
        }
      />
    );
  }

  const sintesi = sintesiProdotti(ordine.righe);

  return (
    <div className="space-y-5">
      {/* ── Breadcrumb ─────────────────────────────────────────────────────── */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/merchant/${negozioId}/ordini`} className="transition hover:text-blue-600">
          Ordini
        </Link>
        <span>/</span>
        <span className="font-medium text-slate-700">{ordine.numero}</span>
      </nav>

      {/* ── Header ordine (componente condiviso) ────────────────────────────── */}
      <OrderHeader
        numero={ordine.numero}
        sintesi={sintesi}
        stato={ordine.stato}
        totale={ordine.totale}
        createdAt={ordine.createdAt}
        modalita={ordine.modalita}
        eyebrow="Dettaglio ordine"
        eyebrowClass="text-blue-700"
        iconClass="bg-blue-50 text-blue-700 ring-blue-100"
        identita={
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <strong className="text-slate-800">
              {ordine.clienteNome} {ordine.clienteCognome}
            </strong>
            <span className="text-slate-300">•</span>
            <span>{ordine.negozioNome}</span>
          </p>
        }
      />

      {/* ── Stato ordine (grafica guidata dal DB) ───────────────────────────── */}
      <StatoOrdineBanner
        stato={ordine.stato}
        annullatoMotivo={ordine.annullatoMotivo}
        annullatoNota={ordine.annullatoNota}
        annullatoAt={ordine.annullatoAt}
        ruolo="venditore"
        sottoTitolo={
          ordine.stato === "cancellato"
            ? "Ordine terminale: lo stock è stato ripristinato (se tracciato) e il cliente è stato avvisato via email."
            : undefined
        }
      />

      {/* ── Azioni venditore (in base allo stato reale) — sempre ben visibile ── */}
      {ordine.stato !== "cancellato" && ordine.stato !== "consegnato" && (
        <div className="rounded-[1.75rem] border border-blue-100 bg-white p-5 shadow-sm ring-1 ring-blue-50">
          <p className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Settings2 className="h-4 w-4" aria-hidden />
            </span>
            Pannello operativo
          </p>
          <OrdineAzioni
            negozioId={negozioId}
            ordineId={ordineId}
            numero={ordine.numero}
            stato={ordine.stato}
          />
        </div>
      )}

      {/* ── Layout due colonne (desktop) ────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── Colonna principale ────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-5">
          <Sezione icon={Package} titolo="Prodotti" sottotitolo="Dettaglio delle righe dell'ordine">
            <RigheProdotto
              righe={ordine.righe}
              costoSpedizione={ordine.costoSpedizione}
              totale={ordine.totale}
            />
          </Sezione>

          <Sezione icon={History} titolo="Cronologia dell'ordine">
            <StoricoEventi eventi={ordine.eventi} />
          </Sezione>
        </div>

        {/* ── Colonna laterale ──────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-5">
          <InformazioniCliente
            nome={ordine.clienteNome}
            cognome={ordine.clienteCognome}
            telefono={ordine.clienteTelefono}
            email={ordine.clienteEmail}
          />

          <InformazioniRitiroSpedizione
            modalita={ordine.modalita}
            negozioNome={ordine.negozioNome}
            ritiroData={ordine.ritiroData}
            ritiroFascia={ordine.ritiroFascia}
            spedizioneIndirizzo={ordine.spedizioneIndirizzo}
            spedizioneCap={ordine.spedizioneCap}
            spedizioneCitta={ordine.spedizioneCitta}
            spedizioneProvincia={ordine.spedizioneProvincia}
            spedizioneNote={ordine.spedizioneNote}
            metodoSpedizione={ordine.metodoSpedizione}
            metodoPagamento={ordine.metodoPagamento}
          />

          {ordine.note && (
            <Sezione icon={MessageSquareText} titolo="Note del cliente">
              <p className="text-sm leading-6 text-slate-700">{ordine.note}</p>
            </Sezione>
          )}
        </div>
      </div>

      {/* ── RECLAMI — Centro gestione reclamo (scheda operativa completa) ──── */}
      {reclami.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-600">
              <AlertTriangle className="h-4 w-4" aria-hidden />
            </span>
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">
              Reclami del cliente
            </h2>
          </div>
          <ReclamiOrdine
            negozioId={negozioId}
            ordineId={ordineId}
            numero={ordine.numero}
            sintesi={sintesi}
            reclamiIniziali={reclami}
          />
        </div>
      )}

      {/* ── Ritorno ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/merchant/${negozioId}/ordini`}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Torna agli ordini
        </Link>
        <Link
          href={`/merchant/${negozioId}`}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
        >
          <Store className="h-4 w-4" aria-hidden /> Dashboard negozio
        </Link>
      </div>
    </div>
  );
}
