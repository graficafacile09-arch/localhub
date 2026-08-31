import Link from "next/link";
import {
  ArrowLeft,
  CreditCard,
  History,
  Package,
  ReceiptText,
  Settings2,
  Trash2,
} from "lucide-react";
import OrdineAzioni from "@/components/merchant/OrdineAzioni";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import RimborsoSection from "@/components/amministratore/ordini/RimborsoSection";
import EliminaOrdineAdminButton from "@/components/amministratore/ordini/EliminaOrdineAdminButton";
import { getOrdineAdmin } from "@/lib/amministratore/ordini";
import { sintesiProdotti } from "@/lib/cliente/ordini-format";
import { azioniDisponibili } from "@/lib/merchant/ordini-stati";
import { azioniSpedizioneDisponibili } from "@/lib/merchant/ordini-spedizioni";
import { Sezione, RigaDettaglio } from "@/components/ordini/Sezione";
import { StatoOrdineBanner } from "@/components/ordini/StatoOrdineBanner";
import { RigheProdotto } from "@/components/ordini/RigheProdotto";
import { StoricoEventi } from "@/components/ordini/StoricoEventi";
import { OrderHeader } from "@/components/ordini/OrderHeader";
import { InformazioniCliente } from "@/components/ordini/InformazioniCliente";
import { InformazioniRitiroSpedizione } from "@/components/ordini/InformazioniRitiroSpedizione";

export const metadata = {
  title: "Dettaglio ordine — Amministratore",
};

export const dynamic = "force-dynamic";

const ETICHETTE_PAGAMENTO: Record<string, string> = {
  pending: "In attesa",
  authorized: "Autorizzato",
  paid: "Pagato",
  failed: "Fallito",
  expired: "Scaduto",
  canceled: "Annullato",
  refunded: "Rimborsato",
  partially_refunded: "Parz. rimborsato",
};

function formattaEuro(v: number | null): string {
  return `€${(v || 0).toFixed(2).replace(".", ",")}`;
}

/**
 * Dettaglio ordine nell'Area Amministratore: supervisione read-only con le
 * azioni operative (stato ordine + stato spedizione) riusate dalle RPC e dalle
 * macchine a stati esistenti. L'accesso è garantito dal layout admin (area
 * risolta server-side); le letture usano l'admin client (service role).
 */
export default async function AdminOrdineDettaglioPage({
  params,
}: {
  params: Promise<{ ordineId: string }>;
}) {
  const { ordineId } = await params;

  let ordine;
  let errore: string | null = null;
  try {
    ordine = await getOrdineAdmin(ordineId);
  } catch (err) {
    errore = err instanceof Error ? err.message : "Errore sconosciuto";
  }

  if (errore) {
    return (
      <MerchantEmptyState
        title="Impossibile caricare l'ordine"
        description={errore}
        action={
          <Link
            href="/amministratore/ordini"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-yellow-400 hover:text-blue-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Torna agli ordini
          </Link>
        }
      />
    );
  }

  if (!ordine) {
    return (
      <MerchantEmptyState
        title="Ordine non trovato"
        description="Questo ordine non esiste."
        action={
          <Link
            href="/amministratore/ordini"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-yellow-400 hover:text-blue-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Torna agli ordini
          </Link>
        }
      />
    );
  }

  const sintesi = sintesiProdotti(ordine.righe);

  const azioniOrdine = azioniDisponibili(ordine.stato);
  const azioniSpedizione =
    ordine.modalita === "spedizione"
      ? azioniSpedizioneDisponibili(ordine.statoSpedizione, ordine.stato)
      : [];
  const mostraPannello =
    ordine.stato !== "cancellato" && (azioniOrdine.length > 0 || azioniSpedizione.length > 0);

  const statoPagamento = ordine.paymentStatus ? ETICHETTE_PAGAMENTO[ordine.paymentStatus] ?? ordine.paymentStatus : null;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link href="/amministratore/ordini" className="transition hover:text-blue-600">
          Ordini
        </Link>
        <span>/</span>
        <span className="font-medium text-slate-700">{ordine.numero}</span>
      </nav>

      {/* Header ordine (componente condiviso) */}
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
            <span>
              <strong className="text-slate-800">
                {ordine.clienteNome} {ordine.clienteCognome}
              </strong>
            </span>
            <span className="text-slate-300">•</span>
            <span>{ordine.negozioNome}</span>
          </p>
        }
      />

      {/* Stato ordine */}
      <StatoOrdineBanner
        stato={ordine.stato}
        annullatoMotivo={ordine.annullatoMotivo}
        annullatoNota={ordine.annullatoNota}
        annullatoAt={ordine.annullatoAt}
        ruolo="venditore"
        sottoTitolo={
          ordine.stato === "cancellato"
            ? "Ordine terminale: lo stock è stato ripristinato (se tracciato)."
            : undefined
        }
      />

      {/* Azioni admin (stato ordine + spedizione via RPC esistenti) */}
      {mostraPannello && (
        <div className="rounded-[1.75rem] border border-blue-100 bg-white p-5 shadow-sm ring-1 ring-blue-50">
          <p className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Settings2 className="h-4 w-4" aria-hidden />
            </span>
            Pannello operativo
          </p>
          <OrdineAzioni
            negozioId={ordine.negozioId}
            ordineId={ordine.id}
            numero={ordine.numero}
            stato={ordine.stato}
            modalita={ordine.modalita}
            statoSpedizione={ordine.statoSpedizione}
            trackingUrl={ordine.trackingUrl}
            apiBase={`/api/amministratore/ordini/${ordine.id}`}
          />
        </div>
      )}

      {/* Elimina ordine — SEPARATO da "Annulla": soft delete verso il Cestino
          (stesso pattern dei negozi). Disponibile SEMPRE per l'admin, anche su
          ordini annullati. Non annulla, non cancella fisicamente: l'ordine
          resta recuperabile dal Cestino. */}
      <div className="rounded-[1.75rem] border border-red-100 bg-white p-5 shadow-sm ring-1 ring-red-50">
        <p className="mb-2 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <Trash2 className="h-4 w-4" aria-hidden />
          </span>
          Gestione cestino
        </p>
        <p className="mb-3 text-xs text-slate-500">
          Elimina sposta l&apos;ordine nel Cestino (recuperabile), separato
          dall&apos;annullamento e dalla cancellazione fisica.
        </p>
        <EliminaOrdineAdminButton ordineId={ordine.id} numero={ordine.numero} />
      </div>

      {/* Layout due colonne */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
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
            spedizioneCarrier={ordine.spedizioneCarrier}
            spedizioneServizio={ordine.spedizioneServizio}
            spedizionePesoGrammi={ordine.spedizionePesoGrammi}
            spedizioneTariffaVersione={ordine.spedizioneTariffaVersione}
            statoSpedizione={ordine.statoSpedizione}
            trackingCode={ordine.trackingCode}
            trackingUrl={ordine.trackingUrl}
            consegnaStimata={ordine.consegnaStimata}
            metodoSpedizione={ordine.metodoSpedizione}
            metodoPagamento={ordine.metodoPagamento as "carta" | "paypal" | "bonifico" | "klarna" | null}
            paymentProvider={ordine.paymentProvider}
          />

          {/* Pagamento */}
          <Sezione icon={CreditCard} titolo="Pagamento">
            <div className="space-y-1.5">
              {statoPagamento ? (
                <RigaDettaglio
                  etichetta="Stato"
                  valore={
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        ordine.paymentStatus === "paid"
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          : ordine.paymentStatus === "refunded" || ordine.paymentStatus === "partially_refunded"
                            ? "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                            : ordine.paymentStatus === "failed" || ordine.paymentStatus === "expired"
                              ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                              : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                      }`}
                    >
                      {statoPagamento}
                    </span>
                  }
                />
              ) : (
                <p className="text-sm text-slate-500">Nessun pagamento online registrato.</p>
              )}
              {ordine.paymentProvider && (
                <RigaDettaglio etichetta="Provider" valore={ordine.paymentProvider} />
              )}
              {ordine.paymentAmount != null && (
                <RigaDettaglio etichetta="Importo" valore={formattaEuro(ordine.paymentAmount)} />
              )}
              {ordine.paymentPaidAt && (
                <RigaDettaglio etichetta="Pagato il" valore={new Date(ordine.paymentPaidAt).toLocaleString("it-IT")} />
              )}
              {ordine.paymentRefundedAt && (
                <RigaDettaglio etichetta="Rimborsato il" valore={new Date(ordine.paymentRefundedAt).toLocaleString("it-IT")} />
              )}
              {ordine.paymentRefundedAmount != null && (
                <RigaDettaglio etichetta="Importo rimborsato" valore={formattaEuro(ordine.paymentRefundedAmount)} />
              )}
            </div>
          </Sezione>

          {/* Rimborso (admin): riepilogo + azione con dialog */}
          <RimborsoSection
            ordineId={ordine.id}
            totale={ordine.totale}
            paymentStatus={ordine.paymentStatus}
            paymentAmount={ordine.paymentAmount}
            paymentRefundedAmount={ordine.paymentRefundedAmount}
            commissionePercentuale={ordine.commissionePercentuale}
            commissioneImporto={ordine.commissioneImporto}
            nettoVenditore={ordine.nettoVenditore}
          />

          {/* Commissione piattaforma + netto venditore (dati derivati) */}
          <Sezione icon={ReceiptText} titolo="Commissione piattaforma">
            {ordine.commissionePercentuale != null && ordine.commissioneImporto != null ? (
              <div className="space-y-1.5">
                <RigaDettaglio
                  etichetta="Commissione"
                  valore={`${ordine.commissionePercentuale.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`}
                />
                <RigaDettaglio etichetta="Totale ordine" valore={formattaEuro(ordine.totale)} />
                <RigaDettaglio etichetta="Importo commissione" valore={formattaEuro(ordine.commissioneImporto)} />
                <div className="mt-2 flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 ring-1 ring-blue-100">
                  <span className="text-sm font-semibold text-blue-800">Netto venditore</span>
                  <span className="text-sm font-bold text-blue-900">
                    {formattaEuro(ordine.nettoVenditore)}
                  </span>
                </div>
                <p className="text-[11px] leading-4 text-slate-400">
                  Commissione calcolata alla creazione dell&apos;ordine (snapshot).
                  Il netto è dato derivato: totale − commissione.
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Nessuna commissione registrata (ordine precedente all&apos;introduzione).
              </p>
            )}
          </Sezione>
        </div>
      </div>

      {/* Ritorno */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/amministratore/ordini"
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-yellow-400 hover:text-blue-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Torna agli ordini
        </Link>
        <Link
          href="/amministratore"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
        >
          <ReceiptText className="h-4 w-4" aria-hidden /> Pannello amministratore
        </Link>
      </div>
    </div>
  );
}
