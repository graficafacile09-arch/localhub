import Link from "next/link";
import {
  ArrowLeft,
  History,
  MessageSquareText,
  Package,
  Phone,
  ReceiptText,
} from "lucide-react";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  getOrdineCliente,
  sintesiProdotti,
} from "@/lib/cliente/ordini";
import { getReclamiOrdineCliente } from "@/lib/ordine-reclami";
import type { ReclamoOrdine as ReclamoOrdineType } from "@/lib/ordine-reclami";
import {
  getMessaggiReclamoCliente,
  type MessaggioReclamo,
} from "@/lib/ordine-reclami-messaggi";
import type { OrdineClienteDettaglio } from "@/lib/cliente/types";
import ReclamoOrdine from "@/components/cliente/ReclamoOrdine";
import { Sezione, RigaDettaglio } from "@/components/ordini/Sezione";
import { StatoOrdineBanner } from "@/components/ordini/StatoOrdineBanner";
import { RigheProdotto } from "@/components/ordini/RigheProdotto";
import { StoricoEventi } from "@/components/ordini/StoricoEventi";
import { OrderHeader } from "@/components/ordini/OrderHeader";
import { InformazioniNegozio } from "@/components/ordini/InformazioniNegozio";
import { InformazioniRitiroSpedizione } from "@/components/ordini/InformazioniRitiroSpedizione";

type Params = { ordineId: string };

export const metadata = {
  title: "Dettaglio ordine — Area Clienti",
};

export const dynamic = "force-dynamic";

/**
 * Pagina dettaglio ordine — Area Clienti ("scheda ordine").
 * LO STATO DEL DB COMANDA LA GRAFICA: il banner (StatoOrdineBanner) è
 * derivato da ordine.stato e un ordine ANNULLATO mostra sempre e solo la
 * grafica di annullamento con motivo/nota. L'identificativo principale è
 * il numero leggibile (LH-XXXX) con la sintesi dei prodotti, MAI l'UUID.
 * OWNERSHIP server-side: ordine restituito solo se cliente_user_id =
 * utente della sessione.
 */
export default async function OrdineDettaglioPage({ params }: { params: Promise<Params> }) {
  const { ordineId } = await params;
  const user = await requireCurrentUser("/login?area=cliente");

  let ordine: OrdineClienteDettaglio | null = null;
  let errore: string | null = null;
  try {
    ordine = await getOrdineCliente(user.id, ordineId);
  } catch (err) {
    errore = err instanceof Error ? err.message : "Errore sconosciuto";
  }

  let reclami: ReclamoOrdineType[] = [];
  let messaggiReclami: Record<string, MessaggioReclamo[]> = {};
  if (ordine) {
    try {
      reclami = await getReclamiOrdineCliente(user.id, ordineId);
    } catch {
      reclami = [];
    }
    // Storico comunicazioni dei reclami (best-effort: mai far fallire il
    // dettaglio ordine se la lettura dei messaggi non riesce).
    try {
      const elenchi = await Promise.all(
        reclami.map(async (r) => [
          r.id,
          await getMessaggiReclamoCliente(user.id, ordineId, r.id),
        ] as const)
      );
      messaggiReclami = Object.fromEntries(elenchi);
    } catch {
      messaggiReclami = {};
    }
  }

  if (errore) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-xl font-black tracking-tight text-slate-900">
          Impossibile caricare l&apos;ordine
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
          Si è verificato un errore durante il recupero del dettaglio. Riprova
          tra qualche istante.
        </p>
        <Link
          href="/cliente/ordini"
          className="btn-cta mt-6 px-5 py-2.5 text-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Torna ai miei ordini
        </Link>
      </div>
    );
  }

  if (!ordine) {
    return (
      <div className="card p-8 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
          <Package className="h-8 w-8 text-slate-400" aria-hidden />
        </span>
        <h1 className="mt-5 text-xl font-black tracking-tight text-slate-900">
          Ordine non trovato
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
          Questo ordine non esiste o non appartiene al tuo account.
        </p>
        <Link
          href="/cliente/ordini"
          className="btn-cta mt-6 px-5 py-2.5 text-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Torna ai miei ordini
        </Link>
      </div>
    );
  }

  const sintesi = sintesiProdotti(ordine.righe);
  const linkNegozio = `/negozi?q=${encodeURIComponent(ordine.negozioNome)}`;

  return (
    <div className="space-y-5">
      {/* ── Header ordine (componente condiviso) ─────────────────────────────── */}
      <OrderHeader
        numero={ordine.numero}
        sintesi={sintesi}
        stato={ordine.stato}
        totale={ordine.totale}
        createdAt={ordine.createdAt}
        modalita={ordine.modalita}
        eyebrow="Area Clienti"
        identita={
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              Ordine presso <strong className="text-slate-800">{ordine.negozioNome}</strong>
            </span>
          </p>
        }
      />

      {/* ── Stato ordine (grafica guidata dal DB) ───────────────────────────── */}
      <StatoOrdineBanner
        stato={ordine.stato}
        annullatoMotivo={ordine.annullatoMotivo}
        annullatoNota={ordine.annullatoNota}
        annullatoAt={ordine.annullatoAt}
      />

      {/* ── Layout due colonne (desktop) ────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── Colonna principale ────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-5">
          {/* Prodotti + riepilogo totale */}
          <Sezione icon={Package} titolo="Prodotti" sottotitolo="Dettaglio delle righe dell'ordine">
            <RigheProdotto
              righe={ordine.righe}
              costoSpedizione={ordine.costoSpedizione}
              totale={ordine.totale}
            />
          </Sezione>

          {/* Cronologia (dati reali da ordini_eventi) */}
          {ordine.eventi.length > 0 && (
            <Sezione icon={History} titolo="Cronologia dell'ordine">
              <StoricoEventi eventi={ordine.eventi} />
            </Sezione>
          )}
        </div>

        {/* ── Colonna laterale ──────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-5">
          <InformazioniNegozio negozioNome={ordine.negozioNome} linkHref={linkNegozio} />

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
            metodoSpedizione={ordine.metodoSpedizione}
            metodoPagamento={ordine.metodoPagamento}
            paymentProvider={ordine.paymentProvider}
          />

          {(ordine.telefono || ordine.email) && (
            <Sezione icon={Phone} titolo="Contatti">
              <div className="space-y-1.5">
                {ordine.telefono && (
                  <RigaDettaglio etichetta="Telefono" valore={ordine.telefono} />
                )}
                {ordine.email && (
                  <RigaDettaglio etichetta="Email" valore={ordine.email} />
                )}
              </div>
            </Sezione>
          )}

          {ordine.note && (
            <Sezione icon={MessageSquareText} titolo="Note">
              <p className="text-sm leading-6 text-slate-700">{ordine.note}</p>
            </Sezione>
          )}
        </div>
      </div>

      {/* ── Reclamo: ordine non arrivato (il componente decide la visibilità) ── */}
      <ReclamoOrdine
        ordineId={ordineId}
        puòReclamare={ordine.stato !== "cancellato"}
        reclamiIniziali={reclami}
        messaggiIniziali={messaggiReclami}
      />

      {/* ── Azioni ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/cliente/ordini"
          className="btn-cta px-5 py-2.5 text-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Torna ai miei ordini
        </Link>
        <Link
          href={linkNegozio}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
        >
          <ReceiptText className="h-4 w-4" aria-hidden /> Visita il negozio
        </Link>
      </div>
    </div>
  );
}
