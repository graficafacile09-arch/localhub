"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import BackButton from "@/components/BackButton";
import PasswordInput from "@/components/auth/PasswordInput";
import { isPartitaIvaValida } from "@/lib/partita-iva";
import {
  cancellaCredenzialiRicordate,
  leggiCredenzialiRicordate,
  salvaCredenzialiRicordate,
} from "@/lib/auth/remember-credentials";
import {
  risolviTemaLogin,
  type TemaLogin,
} from "@/components/auth/login-theme";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const ok = searchParams.get("ok");
  const reinviata = searchParams.get("reinviata");
  const area = searchParams.get("area") ?? "";
  const oauth = searchParams.get("oauth") ?? "";
  const isVendorOAuthCompletion = area === "merchant" && oauth === "vendor";
  // Il parametro ?area= guida SOLO l'estetica della pagina: la vera
  // autorizzazione resta server-side (lib/auth/*), qui nessuna logica auth.
  const tema = risolviTemaLogin(area);
  const banda = tema.bandaHeader;
  const isAdmin = tema.id === "admin";
  const [tab, setTab] = useState<"login" | "register">(isVendorOAuthCompletion ? "register" : "login");
  // L'amministrazione non prevede registrazione: esperienza solo di accesso.
  const tabEffettivo = isAdmin ? ("login" as const) : tab;

  // Il login fallisce perché l'email non è ancora stata confermata:
  // mostriamo il pulsante per reinviare l'email di conferma.
  const mostraReinvio = error != null && /conferm|spam/i.test(error);

  return (
    <main
      className={`relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12 ${tema.sfondoClass}`}
    >
      {tema.decorazioni.map((classe) => (
        <div
          key={classe}
          aria-hidden="true"
          className={`pointer-events-none ${classe}`}
        />
      ))}
      <BackButton
        label="Torna al sito"
        className="absolute left-4 top-4 z-20 sm:left-6 sm:top-6"
      />

      <div className="relative z-10 flex w-full flex-col items-center">
        <div className={tema.cardClass}>
          {tema.strisciaTopClasse && (
            <div aria-hidden="true" className={tema.strisciaTopClasse} />
          )}
          {banda && (
            <div className={banda.classe}>
              <banda.Icona className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
              <span>{banda.testo}</span>
            </div>
          )}

          <div className="space-y-6 p-8">
            <div>
              {tema.IconaBadge && (
                <div className={tema.badgeClass}>
                  <tema.IconaBadge className="h-5 w-5" aria-hidden="true" />
                </div>
              )}
              <p
                className={`text-xs font-semibold uppercase tracking-[0.22em] ${tema.IconaBadge ? "mt-4" : ""} ${tema.eyebrowClass}`}
              >
                {tema.eyebrow}
              </p>
              <h1 className={`mt-3 tracking-tight ${tema.titoloClass}`}>
                {tabEffettivo === "login"
                  ? tema.titoloLogin
                  : tema.titoloRegistrati}
              </h1>
              <p className={`mt-3 ${tema.sottotitoloClass}`}>
                {tabEffettivo === "login"
                  ? tema.sottotitoloLogin
                  : tema.sottotitoloRegistrati}
              </p>
              {tema.chips.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {tema.chips.map((chip) => (
                    <span key={chip.testo} className={chip.classe}>
                      {chip.testo}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* SCELTA Accedi/Registrati — l'"Accedi" SUPERIORE è un vero submit
                del form login (stessa route e logica del pulsante inferiore):
                niente più doppio "Accedi" con comportamenti diversi. In vista
                Registrati il pulsante superiore diventa "Crea account" e
                invia il form di registrazione. (Nascosto nell'area admin:
                nessuna registrazione.) */}
            {!isAdmin && (
              <div
                role="tablist"
                aria-label="Accedi o registrati"
                className={tema.tabsContainerClass}
              >
                <button
                  type={tabEffettivo === "login" ? "submit" : "button"}
                  form={tabEffettivo === "login" ? "login-form" : undefined}
                  role="tab"
                  aria-selected={tabEffettivo === "login"}
                  onClick={() => setTab("login")}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200 ${
                    tabEffettivo === "login"
                      ? tema.tabAttivoClass
                      : tema.tabInattivoClass
                  }`}
                >
                  Accedi
                </button>
                <button
                  type={tabEffettivo === "register" ? "submit" : "button"}
                  form={tabEffettivo === "register" ? "register-form" : undefined}
                  role="tab"
                  aria-selected={tabEffettivo === "register"}
                  onClick={() => setTab("register")}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200 ${
                    tabEffettivo === "register"
                      ? tema.tabAttivoClass
                      : tema.tabInattivoClass
                  }`}
                >
                  {tabEffettivo === "register" ? "Crea account" : "Registrati"}
                </button>
              </div>
            )}

            {error && <div className={tema.bannerClass}>{error}</div>}

            {ok === "1" && (
              <div className={tema.bannerClass}>
                Password aggiornata. Accedi con la nuova password.
              </div>
            )}

            {reinviata === "1" && (
              <div className={tema.bannerClass}>
                Se l&apos;account esiste e non è ancora confermato, ti abbiamo
                reinviato l&apos;email di conferma. Controlla la posta in arrivo e
                la cartella spam.
              </div>
            )}

            {tabEffettivo === "login" ? (
              <LoginForm
                area={area}
                mostraReinvio={mostraReinvio}
                tema={tema}
              />
            ) : isVendorOAuthCompletion ? (
              <RegisterVenditoreOAuthCompletionForm tema={tema} />
            ) : area === "merchant" ? (
              <RegisterVenditoreForm tema={tema} />
            ) : (
              <RegisterClienteForm tema={tema} />
            )}
          </div>
        </div>

        {tema.notaFooter && (
          <p className={`px-2 ${tema.notaFooter.classe}`}>
            {tema.notaFooter.testo}
          </p>
        )}
      </div>
    </main>
  );
}

function LoginForm({
  area,
  mostraReinvio,
  tema,
}: {
  area: string;
  mostraReinvio: boolean;
  tema: TemaLogin;
}) {
  // "Ricordami": al mount ricompila i campi con le credenziali salvate nel
  // browser (se presenti) e tiene traccia della scelta per salvarle/cancellarle.
  const [salvate] = useState(() => leggiCredenzialiRicordate());
  const [email, setEmail] = useState(salvate?.email ?? "");
  const [password, setPassword] = useState(salvate?.password ?? "");
  const [remember, setRemember] = useState(Boolean(salvate));

  const gestisciRemember = (selezionato: boolean) => {
    setRemember(selezionato);
    // Disattivazione esplicita → rimuove subito le credenziali salvate.
    if (!selezionato) cancellaCredenzialiRicordate();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    // Il POST nativo prosegue normalmente: qui gestiamo solo il "Ricordami".
    if (remember) {
      salvaCredenzialiRicordate({ email, password });
    } else {
      cancellaCredenzialiRicordate();
    }
  };

  return (
    <form
      id="login-form"
      action="/api/auth/login"
      method="post"
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      {area && <input type="hidden" name="area" value={area} />}
      <div className="space-y-2">
        <label htmlFor="email" className={tema.labelFieldClass}>Email</label>
        <input
          id="email" name="email" type="email" required autoComplete="email"
          placeholder={tema.placeholderEmailLogin}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition ${tema.inputFocusClass}`}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className={tema.labelFieldClass}>Password</label>
        <PasswordInput
          id="password" name="password" required autoComplete="current-password"
          placeholder="Inserisci la password"
          className="h-12"
          focusClassName={tema.inputFocusClass}
          value={password}
          onChange={setPassword}
        />
      </div>
      <label className="flex cursor-pointer select-none items-center gap-2.5">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => gestisciRemember(e.target.checked)}
          className={`h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 focus:ring-2 ${tema.checkboxAccentClass}`}
        />
        <span className="text-sm text-slate-600">Ricordami</span>
      </label>
      <div className="flex items-center justify-end">
        <a
          href="/recupero-password"
          className={`text-xs font-semibold underline-offset-2 ${tema.linkClass}`}
        >
          Password dimenticata?
        </a>
      </div>
      <button
        type="submit"
        className={`h-12 w-full ${tema.ctaClass}`}
      >
        Accedi
        {tema.IconaCta && (
          <tema.IconaCta className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
      {mostraReinvio && (
        <form action="/api/auth/reinvia-conferma" method="post" className={tema.boxSecondarioClass}>
          <input type="hidden" name="email" value={email} />
          <p className="text-xs leading-5 text-slate-600">
            Non hai ricevuto l&apos;email di conferma?
          </p>
          <button
            type="submit"
            className={`mt-2 text-xs font-bold underline-offset-2 hover:underline ${tema.linkClass}`}
          >
            Invia di nuovo l&apos;email di conferma
          </button>
        </form>
      )}
    </form>
  );
}

/** Registrazione CLIENTE: solo i campi del Cliente, nessun riferimento al Venditore. */
function RegisterClienteForm({ tema }: { tema: TemaLogin }) {
  return (
    <form
      id="register-form"
      action="/api/auth/register"
      method="post"
      className="space-y-4"
    >
      <div className="space-y-2">
        <label htmlFor="reg_nome" className={tema.labelFieldClass}>Nome</label>
        <input
          id="reg_nome" name="name" type="text" required
          autoComplete="given-name"
          placeholder="Mario"
          className={`h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition ${tema.inputFocusClass}`}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="reg_cognome" className={tema.labelFieldClass}>Cognome</label>
        <input
          id="reg_cognome" name="surname" type="text" required
          autoComplete="family-name"
          placeholder="Rossi"
          className={`h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition ${tema.inputFocusClass}`}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="reg_email" className={tema.labelFieldClass}>Email</label>
        <input
          id="reg_email" name="email" type="email" required autoComplete="email"
          placeholder="cliente@localhub.it"
          className={`h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition ${tema.inputFocusClass}`}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="reg_password" className={tema.labelFieldClass}>Password</label>
        <PasswordInput
          id="reg_password" name="password" required
          placeholder="Minimo 6 caratteri"
          className="h-12"
          focusClassName={tema.inputFocusClass}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password_confirm" className={tema.labelFieldClass}>Conferma Password</label>
        <PasswordInput
          id="password_confirm" name="password_confirm" required
          placeholder="Ripeti la password"
          className="h-12"
          focusClassName={tema.inputFocusClass}
        />
      </div>
      <div className="space-y-3 pt-1">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">oppure</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>
        <a
          href="/api/auth/oauth/start?area=cliente&flow=register&provider=google"
          className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200"
        >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
            <path fill="#4285F4" d="M21.35 12.27c0-.74-.07-1.45-.2-2.13H12v4.03h5.22a4.47 4.47 0 0 1-1.94 2.93v2.42h3.14c1.84-1.69 2.93-4.18 2.93-7.25Z"/>
            <path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.35l-3.14-2.42c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.71-5.46-4.02H3.3v2.5A9.75 9.75 0 0 0 12 21.75Z"/>
            <path fill="#FBBC05" d="M6.54 13.88A5.86 5.86 0 0 1 6.23 12c0-.65.11-1.28.31-1.88v-2.5H3.3A9.74 9.74 0 0 0 2.25 12c0 1.57.38 3.06 1.05 4.38l3.24-2.5Z"/>
            <path fill="#EA4335" d="M12 6.1c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.2 14.63 2.25 12 2.25A9.75 9.75 0 0 0 3.3 7.62l3.24 2.5C7.31 7.81 9.46 6.1 12 6.1Z"/>
          </svg>
          Continua con Google
        </a>
      </div>

      <button
        type="submit"
        className={`h-12 w-full ${tema.ctaClass}`}
      >
        Crea account
        {tema.IconaCta && (
          <tema.IconaCta className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </form>
  );
}

/** Registrazione VENDITORE: solo i campi del Venditore (con Partita IVA obbligatoria), nessun riferimento al Cliente. */
function RegisterVenditoreForm({ tema }: { tema: TemaLogin }) {
  const [partitaIva, setPartitaIva] = useState("");
  const [partitaIvaError, setPartitaIvaError] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (partitaIva.trim() === "") {
      e.preventDefault();
      setPartitaIvaError("Partita IVA obbligatoria.");
      return;
    }
    if (!isPartitaIvaValida(partitaIva)) {
      e.preventDefault();
      setPartitaIvaError("Partita IVA non valida.");
    }
  };

  return (
    <form
      id="register-form"
      action="/api/auth/register-merchant"
      method="post"
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      <div className="space-y-2">
        <label htmlFor="reg_nome" className={tema.labelFieldClass}>Nome</label>
        <input
          id="reg_nome" name="name" type="text" required
          autoComplete="given-name"
          placeholder="Mario"
          className={`h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition ${tema.inputFocusClass}`}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="reg_cognome" className={tema.labelFieldClass}>Cognome</label>
        <input
          id="reg_cognome" name="surname" type="text" required
          autoComplete="family-name"
          placeholder="Rossi"
          className={`h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition ${tema.inputFocusClass}`}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="reg_email" className={tema.labelFieldClass}>Email</label>
        <input
          id="reg_email" name="email" type="email" required autoComplete="email"
          placeholder="venditore@localhub.it"
          className={`h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition ${tema.inputFocusClass}`}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="reg_password" className={tema.labelFieldClass}>Password</label>
        <PasswordInput
          id="reg_password" name="password" required
          placeholder="Minimo 6 caratteri"
          className="h-12"
          focusClassName={tema.inputFocusClass}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password_confirm" className={tema.labelFieldClass}>Conferma Password</label>
        <PasswordInput
          id="password_confirm" name="password_confirm" required
          placeholder="Ripeti la password"
          className="h-12"
          focusClassName={tema.inputFocusClass}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="partita_iva" className={tema.labelFieldClass}>Partita IVA</label>
        <input
          id="partita_iva" name="partita_iva" type="text" inputMode="numeric"
          autoComplete="off" maxLength={13}
          placeholder="es. 01234567890"
          value={partitaIva}
          onChange={(e) => {
            setPartitaIva(e.target.value);
            if (partitaIvaError) setPartitaIvaError("");
          }}
          aria-invalid={partitaIvaError ? true : undefined}
          className={`h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition ${tema.inputFocusClass}`}
        />
        {partitaIvaError && (
          <p className={tema.erroreCampoClass} role="alert">{partitaIvaError}</p>
        )}
      </div>
      <div className="space-y-2">
        <label htmlFor="store_name" className={tema.labelFieldClass}>Nome attività</label>
        <input
          id="store_name" name="store_name" type="text" required
          placeholder="es. Pizzeria Da Mario"
          className={`h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition ${tema.inputFocusClass}`}
        />
      </div>
      <div className="space-y-3 pt-1">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">oppure</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>
        <a
          href="/api/auth/oauth/start?area=merchant&flow=register&provider=google"
          className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200"
        >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
            <path fill="#4285F4" d="M21.35 12.27c0-.74-.07-1.45-.2-2.13H12v4.03h5.22a4.47 4.47 0 0 1-1.94 2.93v2.42h3.14c1.84-1.69 2.93-4.18 2.93-7.25Z"/>
            <path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.35l-3.14-2.42c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.71-5.46-4.02H3.3v2.5A9.75 9.75 0 0 0 12 21.75Z"/>
            <path fill="#FBBC05" d="M6.54 13.88A5.86 5.86 0 0 1 6.23 12c0-.65.11-1.28.31-1.88v-2.5H3.3A9.74 9.74 0 0 0 2.25 12c0 1.57.38 3.06 1.05 4.38l3.24-2.5Z"/>
            <path fill="#EA4335" d="M12 6.1c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.2 14.63 2.25 12 2.25A9.75 9.75 0 0 0 3.3 7.62l3.24 2.5C7.31 7.81 9.46 6.1 12 6.1Z"/>
          </svg>
          Continua con Google
        </a>
      </div>
      <button
        type="submit"
        className={`h-12 w-full ${tema.ctaClass}`}
      >
        Crea account
        {tema.IconaCta && (
          <tema.IconaCta className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </form>
  );
}

function RegisterVenditoreOAuthCompletionForm({ tema }: { tema: TemaLogin }) {
  const [partitaIva, setPartitaIva] = useState("");
  const [partitaIvaError, setPartitaIvaError] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!isPartitaIvaValida(partitaIva)) {
      e.preventDefault();
      setPartitaIvaError(partitaIva.trim() === "" ? "Partita IVA obbligatoria." : "Partita IVA non valida.");
    }
  };

  return (
    <form
      action="/api/auth/register-merchant/oauth"
      method="post"
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      <div className={tema.bannerClass}>
        Account Google autenticato. Completa solo i dati dell’attività per concludere la registrazione.
      </div>
      <div className="space-y-2">
        <label htmlFor="oauth_partita_iva" className={tema.labelFieldClass}>Partita IVA</label>
        <input
          id="oauth_partita_iva"
          name="partita_iva"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={13}
          placeholder="es. 01234567890"
          value={partitaIva}
          onChange={(e) => {
            setPartitaIva(e.target.value);
            if (partitaIvaError) setPartitaIvaError("");
          }}
          aria-invalid={partitaIvaError ? true : undefined}
          className={`h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition ${tema.inputFocusClass}`}
        />
        {partitaIvaError && (
          <p className={tema.erroreCampoClass} role="alert">{partitaIvaError}</p>
        )}
      </div>
      <div className="space-y-2">
        <label htmlFor="oauth_store_name" className={tema.labelFieldClass}>Nome attività</label>
        <input
          id="oauth_store_name"
          name="store_name"
          type="text"
          required
          placeholder="es. Pizzeria Da Mario"
          className={`h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition ${tema.inputFocusClass}`}
        />
      </div>
      <button
        type="submit"
        className={`h-12 w-full ${tema.ctaClass}`}
      >
        Completa registrazione
        {tema.IconaCta && (
          <tema.IconaCta className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </form>
  );
}
export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
