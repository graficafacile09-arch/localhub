import { Search } from "lucide-react";

type SearchBarProps = {
  placeholder?: string;
};

export default function SearchBar({
  placeholder = "Cerca prodotti, negozi o servizi...",
}: SearchBarProps) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-2 bg-white p-2 sm:p-2.5 rounded-2xl sm:rounded-full shadow-[0_20px_60px_rgba(0,0,0,0.25)] ring-2 ring-white/60">

        <div className="relative flex-1 flex items-center min-w-0">
          <Search
            className="absolute left-4 w-5 h-5 text-slate-400 pointer-events-none"
            aria-hidden
          />
          <input
            type="text"
            placeholder={placeholder}
            className="w-full h-12 sm:h-14 pl-12 pr-4 rounded-xl sm:rounded-full text-slate-900 text-base md:text-lg bg-transparent focus:outline-none placeholder:text-slate-400"
          />
        </div>

        <button
          type="button"
          className="group flex shrink-0 items-center justify-center gap-2.5 h-12 sm:h-14 px-8 sm:px-10 rounded-xl sm:rounded-full bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 text-slate-900 font-bold text-base md:text-lg shadow-lg shadow-amber-500/50 hover:shadow-xl hover:shadow-amber-400/60 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
        >
          <Search className="w-5 h-5 transition-transform group-hover:scale-110" aria-hidden />
          Cerca
        </button>

      </div>
    </div>
  );
}
