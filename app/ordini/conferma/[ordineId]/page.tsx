import Link from "next/link";
import type { ReactNode } from "react";
import {
  Home,
  MapPin,
  Package,
  PackageSearch,
  ReceiptText,
  Store,
  Truck,
} from "lucide-react";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getCheckoutConferma,
  getOrdineConferma,
  type CheckoutConfermaStato,
} from "@/lib/cliente/orders";
import { orderAccessCookieName } from "@/lib/cliente/order-access";
import type { OrdinePersistito } from "@/lib/cliente/orders";
import { etichettaStato, sintesiProdotti } from "@/lib/cliente/ordini-format";
import { StatoOrdineBanner } from "@/components/ordini/StatoOrdineBanner";
import { RigheProdotto } from "@/components/ordini/RigheProdotto";
import { OrderHeader } from "@/components/ordini/OrderHeader";
import { PagamentoStatoBanner } from "@/components/ordini/PagamentoStatoBanner";
import { CheckoutInAttesa } from "@/components/ordini/CheckoutInAttesa";
import { getDatiBonificoDiretto } from "@/lib/pagamenti/metodi-pubblici";

type Params = { ordineId: string };

export const metadata = {
  title: "Stato ordine — InCittà",
};

/** Breve messaggio in base allo stato reale dell'ordine. */
function messaggioStato(ordine: OrdinePersistito): string {
  switch (ordine.stato) {
    case "cancellato":
      return "Purtroppo il negozio ha dovuto annullare questo ordine.";
    case "consegnato":
      return "Il tuo ordine è stato completato. Grazie per aver acquistato su InCittà!";
    case "confermato":
      return "Il negozio ha confermato il tuo ordine e sta preparando i prodotti.";
    case "pronto":
      return "Il tuo ordine è pronto: puoi ritirarlo in negozio (o è in partenza per la spedizione).";
    case "in_lavorazione":
    case "in_consegna":
      return "Il negozio sta lavorando al tuo ordine.";
    default:
      return "Il negozio ha ricevuto il tuo ordine e lo preparerà al più presto.";
  }
}

export default async function ConfermaOrdinePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ordineId } = await params;
  const sp = await searchParams;
  const esitoPagamento =
    typeof sp.esito === "string" && (sp.esito === "ok" || sp.esito === "annullato")
      ? sp.esito
      : null;
  const accessToken =
    typeof sp.token === "string"
      ? sp.token
      : (await cookies()).get(orderAccessCookieName(ordineId))?.value ?? null;
  const utente = await getCurrentUser();
  const access = { userId: utente?.id ?? null, token: accessToken };

  // P5 — il parametro può essere un ORDINE (flusso legacy bonifico/ritiro) o
  // una SESSIONE/intento (payment-first online, dove l'ordine nasce SOLO dopo
  // il pagamento). Si prova prima l'ordine, poi il checkout.
  const ordineLegacy = await getOrdineConferma(ordineId, access);
  const checkout = ordineLegacy ? null : await getCheckoutConferma(ordineId, access);
  const ordine = ordineLegacy ?? (checkout?.tipo === "ordine" ? checkout.ordine : null);

  if (!ordine) {
    if (checkout?.tipo === "intento") {
      return (
        <ConfermaIntentoView
          checkoutId={ordineId}
          checkout={checkout.checkout}
          esito={esitoPagamento}
        />
      );
    }
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-100">
          <p className="text-sm font-semibold text-slate-600">Ordine non trovato.</p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-bold text-blue-800 transition hover:bg-yellow-300"
          >
            <Home className="h-4 w-4" /> Torna alla home
          </Link>
        </div>
      </main>
    );
  }

  const èAnnullato = ordine.stato === "cancellato";
  const sintesi = sintesiProdotti(ordine.righe);
  const linkNegozio = `/negozi?q=${encodeURIComponent(ordine.negozioNome)}`;

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Header condiviso (OrderHeader): numero + prodotto, stato, totale */}
        <OrderHeader
          numero={ordine.numero}
          sintesi={sintesi}
          stato={ordine.stato}
          totale={ordine.totale}
          createdAt={ordine.createdAt}
          modalita={ordine.modalita}
          eyebrow={èAnnullato ? "Stato del tuo ordine" : "Riepilogo ordine"}
          identita={
            <p>
              Ordine presso <strong className="text-slate-800">{ordine.negozioNome}</strong>
            </p>
          }
        />

        {/* Banner stato: LO STATO DEL DB COMANDA LA GRAFICA (annullato → 🔴) */}
        <div className="mt-4">
          <StatoOrdineBanner
            stato={ordine.stato}
            annullatoMotivo={ordine.annullatoMotivo}
            annullatoNota={ordine.annullatoNota}
            annullatoAt={ordine.annullatoAt}
          />
          <p className="mt-3 text-center text-sm text-slate-600">{messaggioStato(ordine)}</p>
        </div>

        {/* Banner pagamento (FASE F1): lo stato reale del pagamento dal DB */}
        <PagamentoStatoBanner
          ordineId={ordine.id}
          paymentStatus={ordine.paymentStatus}
          paymentPaidAt={ordine.paymentPaidAt}
          paymentRefundedAmount={ordine.paymentRefundedAmount}
          esito={esitoPagamento}
        />

        {/* Bonifico (FASE F1): coordinate per il pagamento manuale, se configurate */}
        {ordine.metodoPagamento === "bonifico_diretto_venditore" &&
          ordine.stato !== "cancellato" &&
          ordine.paymentStatus !== "paid" && (
            <BonificoDirettoInfo
              negozioId={ordine.negozioId}
              negozioNome={ordine.negozioNome}
              importo={ordine.totale}
              causale={ordine.bonificoCausale ?? `Ordine #${ordine.numero} - Marketplace InCittà`}
            />
          )}

        {/* Klarna: il pagamento verrà confermato dopo l'approvazione di Klarna.
            Il marcatore autoritativo è payment_provider='klarna' (la colonna
            metodo_pagamento resta 'carta' per compatibilità RPC, come nel
            flusso carrello F2.2). */}
        {ordine.paymentProvider === "klarna" &&
          ordine.stato !== "cancellato" &&
          ordine.paymentStatus !== "paid" && (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-bold text-blue-800">
                <img
                  src="/loghi/klarna-pink.svg"
                  alt="Klarna"
                  width={56}
                  height={12}
                  className="h-3 w-auto object-contain"
                />
                Pagamento in 3 rate
              </p>
              <p className="mt-0.5 text-xs text-blue-700">
                L&apos;ordine verrà confermato dopo l&apos;approvazione di Klarna.
              </p>
            </div>
          )}

        {/* Modalità ritiro/spedizione */}
        <div className="mt-4 rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              {ordine.modalita === "ritiro" ? (
                <MapPin className="h-4 w-4" aria-hidden />
              ) : (
                <Truck className="h-4 w-4" aria-hidden />
              )}
            </span>
            {ordine.modalita === "ritiro" ? "Ritiro in negozio" : "Spedizione a domicilio"}
          </h2>
          {ordine.modalita === "ritiro" ? (
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <p>
                {ordine.stato === "in_preparazione"
                  ? "Il negozio preparerà il tuo ordine per il ritiro."
                  : `Stato attuale: ${etichettaStato(ordine.stato)}.`}
              </p>
              {(ordine.ritiroData || ordine.ritiroFascia) && (
                <p className="font-semibold text-slate-800">
                  {ordine.ritiroData ? `📅 ${ordine.ritiroData}` : "📅 data da definire"}
                  {ordine.ritiroFascia ? ` — ${ordine.ritiroFascia}` : ""}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              {ordine.stato === "cancellato"
                ? "L'ordine è stato annullato: nessuna spedizione verrà effettuata."
                : "Ti avviseremo appena il pacco parte."}
            </p>
          )}
        </div>

        {/* Prodotti */}
        <div className="mt-4 rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Package className="h-4 w-4" aria-hidden />
            </span>
            Riepilogo prodotti
          </h2>
          <div className="mt-3">
            <RigheProdotto
              righe={ordine.righe}
              costoSpedizione={ordine.costoSpedizione}
              totale={ordine.totale}
            />
          </div>
        </div>

        {/* Dettagli consegna + azioni post-ordine */}
        <div className="mt-4 rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              {utente ? (
                <ReceiptText className="h-4 w-4" aria-hidden />
              ) : (
                <PackageSearch className="h-4 w-4" aria-hidden />
              )}
            </span>
            {utente ? "L'ordine è salvato sul tuo account" : "Hai acquistato senza account?"}
          </h2>
          {utente ? (
            <>
              <p className="mt-3 text-sm text-slate-600">
                Puoi ritrovare questo ordine in qualsiasi momento dalla tua
                area personale, anche dopo aver chiuso il browser.
              </p>
              <Link
                href="/cliente/ordini"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 px-5 py-3 text-sm font-bold text-blue-800 transition hover:bg-yellow-300 sm:w-auto"
              >
                <ReceiptText className="h-4 w-4" /> Vai ai miei ordini
              </Link>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-slate-600">
                Puoi recuperare i tuoi ordini in qualsiasi momento inserendo
                email e telefono usati al checkout.
              </p>
              <Link
                href="/ordini/recupera"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 px-5 py-3 text-sm font-bold text-blue-800 transition hover:bg-yellow-300 sm:w-auto"
              >
                <PackageSearch className="h-4 w-4" /> Recupera i miei ordini
              </Link>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-bold text-blue-800 transition hover:bg-yellow-300"
          >
            <Home className="h-4 w-4" /> Torna alla home
          </Link>
          <Link
            href={linkNegozio}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
          >
            <Store className="h-4 w-4" /> Visita il negozio
          </Link>
        </div>
      </div>
    </main>
  );
}

/**
 * P5 — Vista risultato per un checkout PAYMENT-FIRST SENZA ordine (intento).
 * Rappresenta correttamente gli stati del pagamento: MAI "ordine creato"
 * prima della conferma. Lo stato reale arriva da pagamenti_sessioni.
 */
async function ConfermaIntentoView({
  checkoutId,
  checkout,
  esito,
}: {
  checkoutId: string;
  checkout: CheckoutConfermaStato;
  esito?: string | null;
}) {
  const importo = `${Number(checkout.importo).toFixed(2)} €`;

  let statoCard: ReactNode;
  if (checkout.status === "created" || checkout.status === "pending") {
    statoCard = <CheckoutInAttesa checkoutId={checkoutId} esito={esito} />;
  } else if (checkout.status === "expired") {
    statoCard = (
      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <p className="text-sm font-bold text-blue-700">Pagamento scaduto</p>
        <p className="mt-0.5 text-xs text-blue-600">
          Il tempo per completare il pagamento è terminato: nessun ordine è stato creato e le
          scorte sono state liberate. Puoi effettuare un nuovo acquisto.
        </p>
      </div>
    );
  } else if (checkout.status === "refunded") {
    statoCard = (
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm font-bold text-slate-700">Pagamento rimborsato</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Il pagamento è stato rimborsato: nessun nuovo ordine verrà creato.
        </p>
      </div>
    );
  } else if (checkout.status === "failed" || checkout.status === "canceled") {
    statoCard = (
      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <p className="text-sm font-bold text-blue-700">Pagamento non riuscito</p>
        <p className="mt-0.5 text-xs text-blue-600">
          Nessun importo è stato addebitato e nessun ordine è stato creato.
        </p>
      </div>
    );
  } else {
    statoCard = <CheckoutInAttesa checkoutId={checkoutId} esito={esito} />;
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-sm">
          <h1 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <ReceiptText className="h-4 w-4" aria-hidden />
            </span>
            Stato del pagamento
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Importo: <strong className="text-slate-900">{importo}</strong>
          </p>
          {statoCard}
          <p className="mt-3 text-center text-xs text-slate-500">
            L&apos;ordine verrà creato e inviato al negozio solo dopo la conferma del pagamento.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-bold text-blue-800 transition hover:bg-yellow-300"
          >
            <Home className="h-4 w-4" /> Torna alla home
          </Link>
        </div>
      </div>
    </main>
  );
}

/** Coordinate bonifico del negozio (lettura pubblica server-side). */
async function BonificoDirettoInfo({ negozioId, negozioNome, importo, causale }: { negozioId: string; negozioNome: string; importo: number; causale: string }) {
  const dati = await getDatiBonificoDiretto(negozioId);
  if (!dati) return null;
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
      <p className="text-sm font-bold text-amber-900">Bonifico bancario diretto al venditore</p>
      <div className="mt-3 space-y-1 text-sm text-slate-800">
        <p><strong>Venditore:</strong> {negozioNome}</p>
        <p><strong>Intestatario conto:</strong> {dati.bankAccountName}</p>
        <p><strong>Banca:</strong> {dati.bankName}</p>
        <p><strong>IBAN:</strong> <span className="font-mono">{dati.iban}</span></p>
        <p><strong>BIC/SWIFT:</strong> <span className="font-mono">{dati.bicSwift}</span></p>
        <p><strong>Importo:</strong> €{importo.toFixed(2)}</p>
        <p><strong>Causale:</strong> {causale}</p>
      </div>
      <p className="mt-3 rounded-lg bg-white/70 p-3 text-xs leading-5 text-amber-950">
        ATTENZIONE: Stai effettuando un pagamento diretto sul conto corrente del venditore {negozioNome}. InCittà fornisce solo l&apos;infrastruttura tecnologica e non riceve né gestisce questo denaro. Per qualsiasi problema legato al pagamento o alla spedizione, il riferimento commerciale è il venditore sopra indicato.
      </p>
    </div>
  );
}
