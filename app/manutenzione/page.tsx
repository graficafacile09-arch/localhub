export const dynamic = "force-dynamic";

export default function ManutenzionePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><span className="text-2xl">🔧</span></div>
        <h1 className="text-2xl font-black text-slate-900">Sito temporaneamente in manutenzione</h1>
        <p className="mt-3 text-base leading-7 text-slate-600">Stiamo lavorando per migliorare il servizio. Ci scusiamo per il disagio e torneremo online al più presto.</p>
      </section>
    </main>
  );
}
