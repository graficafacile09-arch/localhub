import Link from "next/link";
import {
  Home,
  MapPin,
  Package,
  PackageSearch,
  ReceiptText,
  Store,
  Truck,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrdineConferma } from "@/lib/cliente/orders";
import type { OrdinePersistito } from "@/lib/cliente/orders";
import { etichettaStato, sintesiProdotti } from "@/lib/cliente/ordini-format";
import { StatoOrdineBanner } from "@/components/ordini/StatoOrdineBanner";
import { RigheProdotto } from "@/components/ordini/RigheProdotto";

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

export default async function ConfermaOrdinePage({ params }: { params: Promise<Params> }) {
  const { ordineId } = await params;
  const ordine = await getOrdineConferma(ordineId);
  const utente = await getCurrentUser();

  if (!ordine) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-100">
          <p className="text-sm font-semibold text-slate-600">Ordine non trovato.</p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            <Home className="h-4 w-4" /> Torna alla home
          </Link>
        </div>
      </main>
    );
  }

  const èAnnullato = ordine.stato === "cancellato";
  const sintesi = sintesiProdotti(ordine.righe);

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Header: numero + sintesi prodotto, MAI l'UUID */}
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-100">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
            {èAnnullato ? "Stato del tuo ordine" : "Riepilogo ordine"}
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
            {ordine.numero}
            {sintesi ? <span className="ml-2 font-bold text-slate-500">· {sintesi}</span> : null}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Grazie {ordine.righe[0]?.nomeProdotto ? "per il tuo acquisto" : "per il tuo ordine"} — il negozio è stato avvisato.
          </p>
        </div>

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

        {/* Negozio */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Store className="h-4 w-4 text-blue-500" /> Negozio
          </h2>
          <p className="mt-2 text-base font-semibold text-slate-800">{ordine.negozioNome}</p>
        </div>

        {/* Modalità */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            {ordine.modalita === "ritiro" ? (
              <MapPin className="h-4 w-4 text-blue-500" />
            ) : (
              <Truck className="h-4 w-4 text-blue-500" />
            )}
            {ordine.modalita === "ritiro" ? "Ritiro in negozio" : "Spedizione a domicilio"}
          </h2>
          {ordine.modalita === "ritiro" ? (
            <div className="mt-2 space-y-1 text-sm text-slate-600">
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
            <p className="mt-2 text-sm text-slate-600">
              {ordine.stato === "cancellato"
                ? "L'ordine è stato annullato: nessuna spedizione verrà effettuata."
                : "Ti avviseremo appena il pacco parte."}
            </p>
          )}
        </div>

        {/* Prodotti */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Package className="h-4 w-4 text-blue-500" /> Riepilogo prodotti
          </h2>
          <div className="mt-3">
            <RigheProdotto
              righe={ordine.righe}
              costoSpedizione={0}
              totale={ordine.totale}
            />
          </div>
        </div>

        {/* Dettagli consegna + azioni post-ordine */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            {utente ? (
              <ReceiptText className="h-4 w-4 text-blue-500" />
            ) : (
              <PackageSearch className="h-4 w-4 text-blue-500" />
            )}
            {utente
              ? "L'ordine è salvato sul tuo account"
              : "Hai acquistato senza account?"}
          </h2>
          {utente ? (
            <>
              <p className="mt-2 text-sm text-slate-600">
                Puoi ritrovare questo ordine in qualsiasi momento dalla tua
                area personale, anche dopo aver chiuso il browser.
              </p>
              <Link
                href="/cliente/ordini"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 sm:w-auto"
              >
                <ReceiptText className="h-4 w-4" /> Vai ai miei ordini
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-600">
                Puoi recuperare i tuoi ordini in qualsiasi momento inserendo
                email e telefono usati al checkout.
              </p>
              <Link
                href="/ordini/recupera"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 sm:w-auto"
              >
                <PackageSearch className="h-4 w-4" /> Recupera i miei ordini
              </Link>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            <Home className="h-4 w-4" /> Torna alla home
          </Link>
          <Link
            href="/negozi"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
          >
            Continua a esplorare
          </Link>
        </div>
      </div>
    </main>
  );
}
