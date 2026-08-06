import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Destinazione del link di recupero. Con il flusso PKCE di Supabase:
 *  1. l'email contiene il link /auth/v1/verify?token=pkce_...&redirect_to=/reset-password
 *  2. GoTrue segue e redirige qui con ?code=<auth_code> in query string
 *  3. lo scambio code -> sessione di recovery avviene in una ROUTE HANDLER
 *     (unico contesto in cui si possono scrivere i cookie di sessione;
 *     il code_verifier è salvato in un cookie httpOnly leggibile solo dal server).
 *  4. qui rimane solo la UI: se la sessione di recovery è attiva si mostra il
 *     modulo nuova password, altrimenti un invito a richiedere un nuovo link.
 *
 * La pagina NON è client: il click su `<a href="/api/...">` nel link di Supabase
 * è a GET; tutto lo scambio avviene server-side prima di renderizzare l'HTML.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; err?: string }>;
}) {
  const params = await searchParams;
  const code = params.code;
  const err = params.err;

  // (3) Il link ha portato il codice: deleghiamo lo scambio alla route handler
  // che, se riesce, scrive i cookie di sessione e redirige qui senza code.
  if (code) {
    redirect(`/api/auth/callback-recovery?code=${encodeURIComponent(code)}`);
  }

  // Senza ?code= la sessione di recovery deve già esistere nei cookie
  // (scritta dalla route handler durante lo scambio del codice).
  let hasSession = false;
  if (!err && isSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    hasSession = Boolean(data.user);
  }

  const showError = Boolean(err) || !hasSession;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef3f8] px-4 py-12">
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-blue-200/70 bg-white shadow-[0_30px_70px_-40px_rgba(37,99,235,0.35)]">
        <div className="h-1 bg-linear-to-r from-cyan-300 via-white to-yellow-300" />
        <div className="space-y-6 p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Nuova password
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">
              Imposta una nuova password
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Scegli una nuova password per il tuo account. Dopo il salvataggio
              potrai accedere con quella nuova.
            </p>
          </div>

          {showError ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {err === "link_invalido"
                  ? "Il link di recupero non è valido oppure è scaduto. Richiedi un nuovo link."
                  : err}
              </div>
              <Link
                href="/recupero-password"
                className="block text-center text-sm font-semibold text-blue-700 hover:text-blue-800"
              >
                Richiedi un nuovo link di recupero
              </Link>
            </div>
          ) : (
            <form action="/api/auth/reset-password" method="post" className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-semibold text-slate-700">
                  Nuova password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="Minimo 6 caratteri"
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password_confirm" className="text-sm font-semibold text-slate-700">
                  Conferma nuova password
                </label>
                <input
                  id="password_confirm"
                  name="password_confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="Ripeti la password"
                  className="h-11 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <button
                type="submit"
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition hover:shadow-xl hover:shadow-blue-500/40 active:scale-[0.98]"
              >
                Salva nuova password
              </button>
            </form>
          )}

          <Link
            href="/login"
            className="block text-center text-sm font-semibold text-blue-700 hover:text-blue-800"
          >
            Torna al login
          </Link>
        </div>
      </div>
    </main>
  );
}