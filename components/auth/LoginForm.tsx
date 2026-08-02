type LoginFormProps = {
  error?: string;
  authConfigured: boolean;
};

export default function LoginForm({ error, authConfigured }: LoginFormProps) {
  return (
    <form action="/api/auth/login" method="post" className="space-y-4">
      {!authConfigured ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Configura prima `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` per attivare l&apos;accesso commerciante.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-semibold text-slate-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="commerciante@localhub.it"
          className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-semibold text-slate-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Inserisci la password"
          className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
      </div>

      <button
        type="submit"
        disabled={!authConfigured}
        className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-linear-to-r from-amber-400 via-yellow-400 to-amber-500 text-sm font-bold text-slate-900 shadow-lg shadow-amber-400/40 transition hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Accedi al pannello
      </button>
    </form>
  );
}
