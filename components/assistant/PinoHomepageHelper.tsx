"use client";

export default function PinoHomepageHelper() {
  return (
    <aside
      aria-label="Pino, assistente di InCittà"
      className="mx-auto flex w-full max-w-[290px] items-center gap-3 rounded-2xl border border-white/20 bg-white/95 px-3 py-3 text-left shadow-xl backdrop-blur-sm md:mx-0 md:w-[290px]"
    >
      <div
        aria-hidden="true"
        className="h-[92px] w-[72px] shrink-0 overflow-hidden bg-no-repeat"
        style={{
          backgroundImage: 'url("/pino-sprite.jpg")',
          backgroundSize: "300% 100%",
          backgroundPosition: "50% 0%",
        }}
      />
      <div className="min-w-0">
        <p className="text-sm font-black text-blue-900">
          Ciao, sono Pino!
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Sono qui per aiutarti a trovare negozi, prodotti e servizi nella tua città.
        </p>
        <p className="mt-2 text-[11px] font-semibold text-blue-700">
          Cerca quello che ti serve: io ti accompagno.
        </p>
      </div>
    </aside>
  );
}
