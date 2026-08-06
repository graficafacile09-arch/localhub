"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/config";

/**
 * Pagina di destinazione del link di recupero: processa i token inviati da
 * Supabase nel fragment dell'URL (sessione di recovery) e permette di
 * impostare la nuova password. Il flusso è client perché i token arrivano
 * nel #fragment: il server non li riceve mai.
 */
function ResetContent() {
  const router = useRouter();
  const [stato, setStato] = useState<"caricamento" | "form" | "errore">("caricamento");
  const [messaggio, setMessaggio] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [inviando, setInviando] = useState(false);

  useEffect(() => {
    let annullato = false;

    const { url, anonKey } = getSupabaseConfig();
    const supabase = createBrowserClient(url, anonKey);
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (annullato) return;
        if (error || !data.session) {
          setStato("errore");
          setMessaggio(
            "Il link di recupero non è valido oppure è scaduto. Richiedi un nuovo link.",
          );
          return;
        }
        setStato("form");
      })
      .catch(() => {
        if (!annullato) {
          setStato("errore");
          setMessaggio(
            "Il link di recupero non è valido oppure è scaduto. Richiedi un nuovo link.",
          );
        }
      });

    return () => {
      annullato = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (password.length < 6) {
      setMessaggio("La password deve essere di almeno 6 caratteri.");
      return;
    }
    if (password !== passwordConfirm) {
      setMessaggio("Le password non coincidono.");
      return;
    }

    setInviando(true);
    setMessaggio("");

    const { url, anonKey } = getSupabaseConfig();
    const supabase = createBrowserClient(url, anonKey);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setInviando(false);
      setMessaggio(error.message);
      return;
    }

    await supabase.auth.signOut();
    router.push("/login?ok=1");
  }

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

          {stato === "caricamento" && (
            <p className="text-sm text-slate-500">Verifica del link in corso…</p>
          )}

          {stato === "errore" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {messaggio}
              </div>
              <Link
                href="/recupero-password"
                className="block text-center text-sm font-semibold text-blue-700 hover:text-blue-800"
              >
                Richiedi un nuovo link di recupero
              </Link>
            </div>
          )}

          {stato === "form" && (
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (messaggio) setMessaggio("");
                  }}
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
                  value={passwordConfirm}
                  onChange={(e) => {
                    setPasswordConfirm(e.target.value);
                    if (messaggio) setMessaggio("");
                  }}
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              {messaggio && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {messaggio}
                </div>
              )}

              <button
                type="submit"
                disabled={inviando}
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition hover:shadow-xl hover:shadow-blue-500/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {inviando ? "Salvataggio…" : "Salva nuova password"}
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

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetContent />
    </Suspense>
  );
}