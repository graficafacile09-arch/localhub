import Form from "next/form";

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z"
      />
    </svg>
  );
}

type SearchFormProps = {
  initialQuery?: string;
};

export default function SearchForm({ initialQuery = "" }: SearchFormProps) {
  return (
    <Form
      action="/ricerca"
      className="mx-auto w-full max-w-3xl"
    >
      <div className="flex flex-col items-stretch gap-3 rounded-2xl border border-white/60 bg-white p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.25)] ring-2 ring-white/60 sm:flex-row sm:items-center sm:gap-2 sm:rounded-full sm:p-2.5">
        <div className="relative flex min-w-0 flex-1 items-center">
          <SearchIcon className="pointer-events-none absolute left-4 h-5 w-5 text-slate-400" />
          <input
            type="text"
            name="q"
            defaultValue={initialQuery}
            placeholder="Cerca un prodotto, un negozio o un servizio..."
            enterKeyHint="search"
            className="h-12 w-full rounded-xl bg-transparent pl-12 pr-4 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none sm:h-14 sm:rounded-full md:text-lg"
          />
        </div>

        <button
          type="submit"
          className="group flex h-12 shrink-0 items-center justify-center gap-2.5 rounded-xl bg-linear-to-r from-amber-400 via-yellow-400 to-amber-500 px-8 text-base font-bold text-gray-900 shadow-lg shadow-amber-500/50 transition-all duration-200 hover:-translate-y-0.5 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 hover:shadow-xl hover:shadow-amber-400/60 active:translate-y-0 sm:h-14 sm:rounded-full sm:px-10 md:text-lg"
        >
          <SearchIcon className="h-5 w-5 transition-transform group-hover:scale-110" />
          Cerca
        </button>
      </div>
    </Form>
  );
}
