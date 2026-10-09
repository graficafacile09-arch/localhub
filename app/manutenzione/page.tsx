import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Sito in manutenzione | InCittà",
  robots: { index: false, follow: false },
};

const MESSAGGIO_DEFAULT =
  "Stiamo lavorando per migliorare il servizio. Ci scusiamo per il disagio e torneremo online al più presto.";

const TABELLA_MANUTENZIONE =
  process.env.VERCEL_ENV === "production" ? "site_maintenance" : "site_maintenance_preview";

export default async function ManutenzionePage() {
  let message = MESSAGGIO_DEFAULT;
  try {
    const db = createAdminSupabaseClient();
    const { data } = await db
      .from(TABELLA_MANUTENZIONE)
      .select("message")
      .eq("id", 1)
      .maybeSingle();
    if (data?.message) message = String(data.message);
  } catch {
    // Il testo di cortesia resta disponibile anche se il database non risponde.
  }

  return (
    <main className="flex min-h-[75vh] flex-1 items-center justify-center bg-slate-950 px-5 py-16 text-white">
      <section className="w-full max-w-2xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-yellow-400 text-3xl text-slate-950" aria-hidden>
          ⚙
        </div>
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.25em] text-yellow-300">InCittà</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Sito in manutenzione</h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">{message}</p>
      </section>
    </main>
  );
}
