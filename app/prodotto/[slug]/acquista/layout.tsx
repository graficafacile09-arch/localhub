import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AcquistaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-3 py-3 sm:px-5">
        <Link
          href="/"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-blue-600"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Torna al negozio
        </Link>

        <h1 className="text-lg font-black text-slate-900">Completa l'acquisto</h1>

        {children}
      </div>
    </main>
  );
}
