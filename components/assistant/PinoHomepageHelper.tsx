"use client";

export default function PinoHomepageHelper() {
  const attivaRicerca = () => {
    const input = document.querySelector<HTMLInputElement>(
      'input[name="q"][aria-label="Cerca prodotto, negozio o servizio"]'
    );

    if (!input) return;

    input.focus();
    input.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <button
      type="button"
      onClick={attivaRicerca}
      aria-label="Pino: clicca per iniziare una ricerca"
      className="group mx-auto flex w-full max-w-[220px] items-center gap-2.5 rounded-xl border border-white/25 bg-white/90 px-2.5 py-2 text-left shadow-lg shadow-black/15 backdrop-blur-sm transition hover:bg-white hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-yellow-300 md:mx-0 md:w-[220px]"
    >
      <span
        aria-hidden="true"
        className="h-[70px] w-[54px] shrink-0 overflow-hidden rounded-lg bg-no-repeat"
        style={{
          backgroundImage: 'url("/pino-sprite.jpg")',
          backgroundSize: "300% 100%",
          backgroundPosition: "50% 0%",
        }}
      />
      <span className="min-w-0">
        <span className="block text-[12px] font-black leading-4 text-blue-900">
          Ciao, sono Pino!
        </span>
        <span className="mt-0.5 block text-[10px] leading-4 text-slate-600">
          Ti aiuto a trovare negozi, prodotti e servizi nella tua città.
        </span>
        <span className="mt-1 block text-[10px] font-bold leading-4 text-blue-700 transition group-hover:text-blue-900">
          Clicca qui e cerca.
        </span>
      </span>
    </button>
  );
}
