"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Mail, Settings, UserRound } from "lucide-react";
import { Field, SaveBar } from "@/components/ui/ModuleFields";
import ClienteEmptyState from "@/components/cliente/ClienteEmptyState";
import type { ClienteProfilo } from "@/lib/cliente/types";

const VUOTO = {
  nome: "",
  cognome: "",
  telefono: "",
};

type StatoCaricamento = "loading" | "ready" | "error";

/**
 * Modulo Impostazioni dell'Area Clienti.
 * Dati personali modificabili (nome, cognome, telefono; email sola lettura)
 * e cambio password tramite Supabase Auth. Riusa gli stessi servizi della
 * pagina Profilo: nessuna logica duplicata.
 */
export default function ImpostazioniClienteModule() {
  const [stato, setStato] = useState<StatoCaricamento>("loading");
  const [erroreCaricamento, setErroreCaricamento] = useState<string | null>(null);
  const [form, setForm] = useState({ ...VUOTO });
  const [original, setOriginal] = useState({ ...VUOTO });
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [erroreSalvataggio, setErroreSalvataggio] = useState<string | null>(null);

  // Sezione sicurezza / cambio password
  const [password, setPassword] = useState("");
  const [confermaPassword, setConfermaPassword] = useState("");
  const [salvandoPassword, setSalvandoPassword] = useState(false);
  const [passwordSalvata, setPasswordSalvata] = useState(false);
  const [errorePassword, setErrorePassword] = useState<string | null>(null);

  /** Fetch pura: nessun setState, restituisce il profilo (o null). */
  const carica = useCallback(async (): Promise<ClienteProfilo | null> => {
    const response = await fetch("/api/cliente/impostazioni");
    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json?.error?.message ?? "Impossibile caricare le impostazioni.");
    }
    return (json.data.profilo as ClienteProfilo | null) ?? null;
  }, []);

  /** Applica i dati caricati al form (helper riusabile). */
  function applicaProfilo(profilo: ClienteProfilo | null) {
    if (profilo) {
      const vals = {
        nome: profilo.nome ?? "",
        cognome: profilo.cognome ?? "",
        telefono: profilo.telefono ?? "",
      };
      setForm(vals);
      setOriginal(vals);
      setEmail(profilo.email ?? "");
    } else {
      setOriginal({ ...VUOTO });
    }
  }

  useEffect(() => {
    let attivo = true;
    carica()
      .then((profilo) => {
        if (!attivo) return;
        applicaProfilo(profilo);
        setStato("ready");
      })
      .catch((err) => {
        if (!attivo) return;
        setErroreCaricamento(
          err instanceof Error ? err.message : "Impossibile caricare le impostazioni."
        );
        setStato("error");
      });
    return () => {
      attivo = false;
    };
  }, [carica]);

  function aggiorna(campo: keyof typeof VUOTO, valore: string) {
    setForm((f) => ({ ...f, [campo]: valore }));
    setSalvato(false);
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(original);

  async function handleSave() {
    setSaving(true);
    setErroreSalvataggio(null);
    setSalvato(false);
    try {
      const response = await fetch("/api/cliente/impostazioni", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome,
          cognome: form.cognome,
          telefono: form.telefono || null,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json?.error?.message ?? "Impossibile salvare le impostazioni.");
      }
      setOriginal({ ...form });
      setSalvato(true);
    } catch (err) {
      setErroreSalvataggio(
        err instanceof Error ? err.message : "Impossibile salvare le impostazioni."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCambiaPassword() {
    setSalvandoPassword(true);
    setErrorePassword(null);
    setPasswordSalvata(false);
    try {
      const response = await fetch("/api/cliente/impostazioni/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, conferma: confermaPassword }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json?.error?.message ?? "Impossibile cambiare la password.");
      }
      setPassword("");
      setConfermaPassword("");
      setPasswordSalvata(true);
    } catch (err) {
      setErrorePassword(
        err instanceof Error ? err.message : "Impossibile cambiare la password."
      );
    } finally {
      setSalvandoPassword(false);
    }
  }

  async function handleRiprova() {
    setStato("loading");
    setErroreCaricamento(null);
    try {
      const profilo = await carica();
      applicaProfilo(profilo);
      setStato("ready");
    } catch (err) {
      setErroreCaricamento(
        err instanceof Error ? err.message : "Impossibile caricare le impostazioni."
      );
      setStato("error");
    }
  }

  if (stato === "loading") {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Caricamento impostazioni">
        <div className="h-40 animate-pulse rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm" />
        <div className="h-72 animate-pulse rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm" />
      </div>
    );
  }

  if (stato === "error") {
    return (
      <ClienteEmptyState
        title="Impossibile caricare le impostazioni"
        description={erroreCaricamento ?? "Riprova tra qualche istante."}
        action={
          <button
            type="button"
            onClick={handleRiprova}
            className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-bold text-blue-800 transition hover:bg-yellow-300"
          >
            Riprova
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Intestazione modulo ─────────────────────────────────────────────── */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Settings className="h-7 w-7" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Area Clienti
            </p>
            <h1 className="mt-1.5 text-3xl font-black tracking-tight text-slate-900">
              Impostazioni
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              I tuoi dati personali e la sicurezza del tuo account. L&apos;email
              è legata al tuo account e non è modificabile.
            </p>
          </div>
        </div>
      </div>

      {/* ── Dati personali ───────────────────────────────────────────────────── */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <UserRound className="h-4 w-4" aria-hidden />
          </span>
          <h2 className="text-lg font-bold text-slate-900">Dati personali</h2>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field
            label="Nome"
            value={form.nome}
            onChange={(v) => aggiorna("nome", v)}
            required
            placeholder="Mario"
          />
          <Field
            label="Cognome"
            value={form.cognome}
            onChange={(v) => aggiorna("cognome", v)}
            required
            placeholder="Rossi"
          />
          <Field
            label="Telefono (facoltativo)"
            value={form.telefono}
            onChange={(v) => aggiorna("telefono", v)}
            type="tel"
            maxLength={30}
            placeholder="+39 340 000 0000"
          />

          {/* Email — sola lettura */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              Email
            </label>
            <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 text-sm text-slate-500">
              <Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <span className="truncate">{email || "—"}</span>
            </div>
          </div>
        </div>

        {salvato && (
          <p
            role="status"
            className="mt-5 flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Dati personali salvati con successo.
          </p>
        )}
        {erroreSalvataggio && (
          <p
            role="alert"
            className="mt-5 flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {erroreSalvataggio}
          </p>
        )}

        <div className="mt-6 border-t border-slate-100 pt-5">
          <SaveBar saving={saving} onSave={handleSave} dirty={dirty} />
        </div>
      </div>

      {/* ── Sicurezza: cambio password ──────────────────────────────────────── */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <KeyRound className="h-4 w-4" aria-hidden />
          </span>
          <h2 className="text-lg font-bold text-slate-900">Sicurezza</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Cambia la password del tuo account. La nuova password deve essere di
          almeno 6 caratteri.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field
            label="Nuova password"
            value={password}
            onChange={(v) => {
              setPassword(v);
              setPasswordSalvata(false);
            }}
            type="password"
            placeholder="Almeno 6 caratteri"
          />
          <Field
            label="Conferma password"
            value={confermaPassword}
            onChange={(v) => {
              setConfermaPassword(v);
              setPasswordSalvata(false);
            }}
            type="password"
            placeholder="Ripeti la password"
          />
        </div>

        {passwordSalvata && (
          <p
            role="status"
            className="mt-5 flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Password aggiornata con successo.
          </p>
        )}
        {errorePassword && (
          <p
            role="alert"
            className="mt-5 flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {errorePassword}
          </p>
        )}

        <div className="mt-6 border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={handleCambiaPassword}
            disabled={salvandoPassword || password.length < 6 || password !== confermaPassword}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-yellow-400 px-6 text-sm font-bold text-blue-800 shadow-md shadow-blue-500/25 transition hover:bg-yellow-300 active:scale-[0.98] disabled:opacity-50"
          >
            {salvandoPassword ? "Aggiornamento..." : "Cambia password"}
          </button>
        </div>
      </div>
    </div>
  );
}
