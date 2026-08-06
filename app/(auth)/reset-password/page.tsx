import Link from "next/link";
import { headers } from "next/headers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { validaToken } from "@/lib/password-reset";

/**
 * Destinazione del link di recupero. Il flusso è interamente server-side
 * (nessun callback GoTrue):
 *  1. l'email contiene /reset-password?token=<random64hex>
 *  2. questa PAGINA valida il token lato server (esiste, non scaduto,
 *     non già usato) e mostra il form con cui impostare la nuova password
 *     (il token viaggia come campo hidden);
 *  3. il submit POST a /api/auth/reset-password consuma il token in modo
 *     atomico e cambia la password via Admin API (revoca tutte le sessioni).
 *
 * Se il token non è valido viene mostrato l'errore e l'invito a richiedere
 * un nuovo link: il token NON viene consumato qui.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; err?: string }>;
}) {
  const params = await searchParams;
  const tokenRaw = params.token ?? "";
  const err = params.err;

  const reqHeaders = await headers();
  // [DIAGNOSI-TEMP] URL esatto ricevuto dal server dopo il click nella mail.
  console.log(
    "[reset-flusso] PAGE " +
      `REQUEST_URL-APPROX=${reqHeaders.get("x-forwarded-host") ?? reqHeaders.get("host") ?? "?"}` +
      `|PROTO=${reqHeaders.get("x-forwarded-proto") ?? "?"}` +
      `|URI=${reqHeaders.get("x-forwarded-uri") ?? "?"}`,
  );
  console.log("[reset-flusso] PAGE SEARCHPARAMS=" + JSON.stringify(Object.fromEntries(Object.entries(params))));
  console.log("[reset-flusso] PAGE TOKEN_RAW=" + JSON.stringify(tokenRaw));

  let tokenValorizzato: string | null = null;
  let erroreLink: string | null = null;

  if (!isSupabaseConfigured()) {
    erroreLink = "Configurazione Supabase mancante.";
  } else if (err) {
    erroreLink = err;
  } else if (tokenRaw) {
    const esito = await validaToken(tokenRaw);
    if (esito.valido) {
      tokenValorizzato = tokenRaw;
    } else {
      erroreLink =
        esito.motivo === "scaduto"
          ? "Il link di recupero è scaduto. Richiedi un nuovo link."
          : "Il link di recupero non è più valido o è già stato usato. Richiedi un nuovo link.";
    }
  } else {
    erroreLink = "Link di recupero mancante. Richiedi un nuovo link.";
  }

  const mostraForm = tokenValorizzato !== null;

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
              {mostraForm
                ? "Scegli una nuova password per il tuo account. Dopo il salvataggio potrai accedere con quella nuova."
                : "Non è possibile impostare una nuova password con questo link."}
            </p>
          </div>

          {!mostraForm ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {erroreLink}
              </div>
              <Link
                href="/recupero-password"
                className="block text-center text-sm font-semibold text-blue-700 hover:text-blue-800"
              >
                Richiedi un nuovo link di recupero
              </Link>
            </div>
          ) : (
            <ResetPasswordForm token={tokenValorizzato!} />
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

function ResetPasswordForm({ token }: { token: string }) {
  return (
    <form action="/api/auth/reset-password" method="post" className="space-y-4">
      <input type="hidden" name="token" value={token} />
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
  );
}