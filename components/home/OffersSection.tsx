// Roadmap — Sezione offerte da attivare quando il modulo promozioni sarà pronto
export default function OffersSection() {
  return (
    <section className="px-3 py-2 sm:px-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Offerte della settimana
        </h2>
      </div>
      <div className="overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 p-4 text-white">
        <p className="text-xs font-bold uppercase tracking-wider text-blue-100">
          In arrivo
        </p>
        <p className="mt-1 text-sm font-bold">
          Le migliori offerte dei negozi di Castrovillari
        </p>
        <p className="mt-0.5 text-xs text-blue-100">
          Presto potrai trovare promozioni esclusive dai negozi della tua città.
        </p>
      </div>
    </section>
  );
}
