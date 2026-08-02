import Link from "next/link";
import Header from "@/components/Header/Header";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-slate-50">
      <Header />
      <div className="mx-auto max-w-5xl py-20 text-center">
        <p className="text-6xl font-black text-slate-200">404</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Contenuto non trovato
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          La pagina che cerchi non esiste o è stata spostata.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
        >
          Torna alla home
        </Link>
      </div>
    </main>
  );
}
