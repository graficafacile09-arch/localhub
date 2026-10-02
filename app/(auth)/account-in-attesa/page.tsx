import Link from "next/link";

export const metadata = {
  title: "Account in attesa — InCittà",
};

export default function AccountInAttesaPage() {
  return (
    <main className="min-h-[70vh] px-4 py-16">
      <div className="mx-auto max-w-xl rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <span className="text-2xl" aria-hidden>⏳</span>
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
          Registrazione ricevuta
        </p>
        <h1 className="mt-2 text-2xl font-black text-slate-900">
          Account in attesa di approvazione
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Registrazione completata e accesso effettuato. Il tuo account è ora in attesa
          dell&apos;approvazione dell&apos;amministratore prima di poter utilizzare
          le aree personali della piattaforma.
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Ti abbiamo inviato una email di conferma della registrazione. Non devi fare altro:
          riceverai una nuova comunicazione quando l&apos;amministratore avrà deciso.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
        >
          Torna alla homepage
        </Link>
      </div>
    </main>
  );
}
