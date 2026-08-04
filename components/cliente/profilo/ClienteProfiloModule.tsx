"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Mail, UserRound } from "lucide-react";
import { Field, SaveBar } from "@/components/merchant/modules/ModuleFields";
import ClienteEmptyState from "@/components/cliente/ClienteEmptyState";
import ClienteAvatarUploader from "./ClienteAvatarUploader";
import type { ClienteProfilo } from "@/lib/cliente/types";

const VUOTO = {
  nome: "",
  cognome: "",
  telefono: "",
  indirizzo: "",
  citta: "",
  cap: "",
  provincia: "",
};

type StatoCaricamento = "loading" | "ready" | "error";

/**
 * Modulo Profilo dell'Area Clienti.
 * Carica i dati dal server, permette la modifica anagrafica e dell'indirizzo,
 * l'upload dell'avatar e il salvataggio persistente.
 */
export default function ClienteProfiloModule() {
  const [stato, setStato] = useState<StatoCaricamento>("loading");
  const [erroreCaricamento, setErroreCaricamento] = useState<string | null>(null);
  const [form, setForm] = useState({ ...VUOTO });
  const [original, setOriginal] = useState({ ...VUOTO });
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [avatarSalvato, setAvatarSalvato] = useState(false);
  const [erroreSalvataggio, setErroreSalvataggio] = useState<string | null>(null);

  /** Fetch pura: nessun setState, restituisce il profilo (o null). */
  const carica = useCallback(async (): Promise<ClienteProfilo | null> => {
    const response = await fetch("/api/cliente/profilo");
    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json?.error?.message ?? "Impossibile caricare il profilo.");
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
        indirizzo: profilo.indirizzo ?? "",
        citta: profilo.citta ?? "",
        cap: profilo.cap ?? "",
        provincia: profilo.provincia ?? "",
      };
      setForm(vals);
      setOriginal(vals);
      setEmail(profilo.email ?? "");
      setAvatarUrl(profilo.avatarUrl ?? null);
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
          err instanceof Error ? err.message : "Impossibile caricare il profilo."
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
    setAvatarSalvato(false);
  }

  const dirty =
    JSON.stringify(form) !== JSON.stringify(original);

  async function handleSave() {
    setSaving(true);
    setErroreSalvataggio(null);
    setSalvato(false);
    try {
      const response = await fetch("/api/cliente/profilo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome,
          cognome: form.cognome,
          telefono: form.telefono || null,
          indirizzo: form.indirizzo || null,
          citta: form.citta || null,
          cap: form.cap || null,
          provincia: form.provincia || null,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json?.error?.message ?? "Impossibile salvare il profilo.");
      }
      setOriginal({ ...form });
      setSalvato(true);
    } catch (err) {
      setErroreSalvataggio(
        err instanceof Error ? err.message : "Impossibile salvare il profilo."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleAvatarChanged(url: string) {
    setAvatarUrl(url);
    setSalvato(false);
    setAvatarSalvato(true);
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
        err instanceof Error ? err.message : "Impossibile caricare il profilo."
      );
      setStato("error");
    }
  }

  if (stato === "loading") {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Caricamento profilo">
        <div className="h-40 animate-pulse rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm" />
        <div className="h-80 animate-pulse rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm" />
      </div>
    );
  }

  if (stato === "error") {
    return (
      <ClienteEmptyState
        title="Impossibile caricare il profilo"
        description={erroreCaricamento ?? "Riprova tra qualche istante."}
        action={
          <button
            type="button"
            onClick={handleRiprova}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-700"
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
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 ring-1 ring-teal-100">
              <UserRound className="h-7 w-7" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
                Area Clienti
              </p>
              <h1 className="mt-1.5 text-3xl font-black tracking-tight text-slate-900">
                Profilo
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                I tuoi dati personali e l&apos;indirizzo principale. L&apos;email
                è legata al tuo account e non è modificabile.
              </p>
            </div>
          </div>

          <ClienteAvatarUploader
            avatarUrl={avatarUrl}
            nome={form.nome}
            onAvatarChanged={handleAvatarChanged}
          />
        </div>
      </div>

      {/* ── Form dati personali ─────────────────────────────────────────────── */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="grid gap-4 sm:grid-cols-2">
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

        <div className="mt-6 border-t border-slate-100 pt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Indirizzo principale
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field
                label="Indirizzo"
                value={form.indirizzo}
                onChange={(v) => aggiorna("indirizzo", v)}
                placeholder="Via/Corso/Piazza, numero civico"
              />
            </div>
            <Field
              label="Città"
              value={form.citta}
              onChange={(v) => aggiorna("citta", v)}
              placeholder="Castrovillari"
            />
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="CAP"
                value={form.cap}
                onChange={(v) => aggiorna("cap", v)}
                maxLength={5}
                placeholder="87012"
              />
              <Field
                label="Provincia"
                value={form.provincia}
                onChange={(v) => aggiorna("provincia", v)}
                maxLength={2}
                placeholder="CS"
              />
            </div>
          </div>
        </div>

        {/* Messaggi di stato */}
        {salvato && (
          <p
            role="status"
            className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Profilo salvato con successo.
          </p>
        )}
        {avatarSalvato && !salvato && (
          <p
            role="status"
            className="mt-5 flex items-center gap-2 rounded-xl bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-700"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Avatar aggiornato.
          </p>
        )}
        {erroreSalvataggio && (
          <p
            role="alert"
            className="mt-5 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {erroreSalvataggio}
          </p>
        )}

        <div className="mt-6 border-t border-slate-100 pt-5">
          <SaveBar saving={saving} onSave={handleSave} dirty={dirty} />
        </div>
      </div>
    </div>
  );
}
