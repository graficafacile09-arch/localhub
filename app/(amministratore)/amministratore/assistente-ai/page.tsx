import Link from "next/link";
import AssistantAdminChat from "@/components/amministratore/AssistantAdminChat";

export const metadata = {
  title: "Assistente AI \u2014 Amministratore",
};

export default function AssistenteAiPage() {
  return (
    <section className="space-y-5" aria-label="Assistente AI Amministrazione">
      <nav aria-label="Percorso" className="mb-5">
        <Link
          href="/amministratore"
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 transition hover:text-blue-800"
        >
          Torna al pannello
        </Link>
      </nav>

      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-7 w-7"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
              />
            </svg>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Amministrazione
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Assistente AI
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Analizza e consulta i dati reali della piattaforma InCitt&#224;.
              L&#8217;assistente lavora in modalit&#224; <strong>sola consultazione</strong>:
              pu&#242; cercare, aggregare e spiegare i dati, ma non pu&#242; modificare,
              eliminare o creare risorse.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-white/70 bg-white shadow-sm md:h-[70vh]">
        <AssistantAdminChat />
      </div>

      <div className="rounded-3xl border border-blue-100 bg-blue-50/60 px-5 py-4 text-sm text-blue-900">
        <p className="leading-6">
          <span className="font-bold">Nota:</span> l&#8217;assistente consulta i dati reali del database
          (negozi, prodotti, offerte, eventi, utenti, scansioni AI, categorie)
          e risponde <strong>esclusivamente</strong> in base a questi dati.
          Se un&#8217;informazione non &#232; disponibile, lo comunicher&#224; esplicitamente.
          <br />
          Modalit&#224; attuale: <em>sola consultazione</em> \u2014 nessuna operazione distruttiva.
        </p>
      </div>
    </section>
  );
}