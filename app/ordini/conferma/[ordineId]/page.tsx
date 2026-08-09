import Link from "next/link";
import { CheckCircle2, Package, Store, Truck, Calendar, MapPin, Home } from "lucide-react";
import { getOrdineConferma } from "@/lib/cliente/orders";

type Params = { ordineId: string };

export const metadata = {
  title: "Conferma ordine — InCittà",
};

function formattaPrezzo(v: number): string {
  return `€${v.toFixed(2).replace(".", ",")}`;
}

export default async function ConfermaOrdinePage({ params }: { params: Promise<Params> }) {
  const { ordineId } = await params;
  const ordine = await getOrdineConferma(ordineId);

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

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Header conferma */}
        <div className="rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 p-6 text-center text-white shadow-lg shadow-emerald-500/20">
          <CheckCircle2 className="mx-auto h-12 w-12" />
          <h1 className="mt-3 text-2xl font-black tracking-tight">Ordine confermato!</h1>
          <p className="mt-1 text-sm text-emerald-100">
            Grazie {ordine.righe[0]?.nomeProdotto ? "per il tuo acquisto" : "per il tuo ordine"} — il negozio è stato avvisato.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-100">Numero ordine</span>
            <span className="text-lg font-black tracking-wide">{ordine.numero}</span>
          </div>
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
              <p>{ordine.stato === "in_preparazione" ? "Il negozio preparerà il tuo ordine per il ritiro." : "Ordine confermato."}</p>
              {(ordine.ritiroData || ordine.ritiroFascia) && (
                <p className="font-semibold text-slate-800">
                  {ordine.ritiroData ? `📅 ${ordine.ritiroData}` : "📅 data da definire"}
                  {ordine.ritiroFascia ? ` — ${ordine.ritiroFascia}` : ""}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">Ti avviseremo appena il pacco parte.</p>
          )}
        </div>

        {/* Prodotti */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Package className="h-4 w-4 text-blue-500" /> Riepilogo prodotti
          </h2>
          <div className="mt-3 divide-y divide-slate-100">
            {ordine.righe.map((riga) => (
              <div key={riga.prodottoId} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 pr-4">
                  <p className="truncate text-sm font-semibold text-slate-800">{riga.nomeProdotto}</p>
                  <p className="text-xs text-slate-500">
                    {riga.quantita} × {formattaPrezzo(riga.prezzoUnitario)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-slate-900">
                  {formattaPrezzo(riga.prezzoUnitario * riga.quantita)}
                </span>
              </div>
            ))}
          </div>

          {/* Totale */}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Totale</span>
              <span className="text-xl font-black text-slate-900">{formattaPrezzo(ordine.totale)}</span>
            </div>
          </div>
        </div>

        {/* Note di ritiro (data/fascia) — salvate sull'ordine */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Calendar className="h-4 w-4 text-blue-500" /> Dettagli consegna
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {ordine.modalita === "ritiro" ? "Ritiro presso il punto vendita." : "Spedizione all'indirizzo indicato al momento dell'ordine."}
          </p>
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
      </div>
    </main>
  );
}
