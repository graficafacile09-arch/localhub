"use client";

import { useState } from "react";
import { Check, Clipboard, Database, HardDrive, ShieldCheck } from "lucide-react";

const COMANDO_BACKUP =
  "powershell -ExecutionPolicy Bypass -File .\\scripts\\backup-supabase-docker.ps1";

export default function BackupModule() {
  const [copiato, setCopiato] = useState(false);

  async function copiaComando() {
    try {
      await navigator.clipboard.writeText(COMANDO_BACKUP);
      setCopiato(true);
      window.setTimeout(() => setCopiato(false), 1800);
    } catch {
      setCopiato(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="card overflow-hidden p-0">
        <div className="bg-blue-700 px-6 py-7 text-white md:px-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-yellow-400 text-blue-950">
                <HardDrive className="h-7 w-7" aria-hidden />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-100">
                  Sicurezza e recupero
                </p>
                <h1 className="mt-1.5 text-2xl font-black tracking-tight md:text-3xl">
                  Backup piattaforma
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-50">
                  Crea un backup locale del database InCittà usando Supabase CLI e
                  Docker Desktop. I file restano sul tuo PC, fuori dai limiti di
                  spazio del progetto Supabase.
                </p>
              </div>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/20">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Operazione read-only sul DB
            </span>
          </div>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-3 md:p-8">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <Database className="h-5 w-5 text-blue-600" aria-hidden />
            <h2 className="mt-3 text-sm font-black text-slate-900">Schema</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Struttura del database e oggetti applicativi esportabili.
            </p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <Database className="h-5 w-5 text-blue-600" aria-hidden />
            <h2 className="mt-3 text-sm font-black text-slate-900">Dati</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Dati delle tabelle applicative salvati separatamente per poterli
              verificare prima delle modifiche.
            </p>
          </div>
          <div className="rounded-2xl border border-yellow-200 bg-yellow-50/70 p-4">
            <HardDrive className="h-5 w-5 text-yellow-700" aria-hidden />
            <h2 className="mt-3 text-sm font-black text-slate-900">
              Docker Desktop
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Supabase CLI esegue il dump tramite Docker, senza esporre il
              database al browser.
            </p>
          </div>
        </div>
      </section>

      <section className="card p-6 md:p-8">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-100 text-yellow-800">
            <HardDrive className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
              Backup manuale controllato
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-900">
              Esegui backup sul PC
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Il pannello web non può accedere direttamente al Docker Desktop
              installato sul tuo computer. Per questo l&apos;operazione parte da
              un comando locale: password e connection string non finiscono nel
              browser.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-950 p-4">
          <div className="flex items-center justify-between gap-3">
            <code className="min-w-0 overflow-x-auto text-xs leading-6 text-slate-100">
              {COMANDO_BACKUP}
            </code>
            <button
              type="button"
              onClick={() => void copiaComando()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-yellow-400 px-3 py-2 text-xs font-black text-blue-950 transition hover:bg-yellow-300"
            >
              {copiato ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Clipboard className="h-3.5 w-3.5" aria-hidden />
              )}
              {copiato ? "Copiato" : "Copia"}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <h3 className="text-sm font-black text-slate-800">Cosa produce</h3>
            <div className="mt-2 space-y-1.5 text-xs leading-5 text-slate-600">
              <p><span className="font-bold">01</span> schema SQL</p>
              <p><span className="font-bold">02</span> dati SQL</p>
              <p><span className="font-bold">03</span> ruoli del database</p>
              <p><span className="font-bold">04</span> manifest con data e dimensioni</p>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <h3 className="text-sm font-black text-amber-900">Limiti del dump</h3>
            <p className="mt-2 text-xs leading-5 text-amber-800">
              Il dump logico non contiene automaticamente gli oggetti Storage
              e gli schemi gestiti internamente da Supabase Auth. Per un
              recupero completo questi componenti vanno trattati separatamente.
            </p>
          </div>
        </div>
      </section>

      <section className="card p-6 md:p-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
          Regola operativa
        </p>
        <h2 className="mt-1 text-xl font-black text-slate-900">
          Prima di ogni migrazione importante
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 p-4">
            <span className="text-xs font-black text-blue-600">01</span>
            <p className="mt-2 text-sm font-bold text-slate-800">Esegui il backup</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Docker Desktop acceso e connection string locale configurata.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 p-4">
            <span className="text-xs font-black text-blue-600">02</span>
            <p className="mt-2 text-sm font-bold text-slate-800">Verifica i file</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Controlla presenza e dimensioni di schema, dati e ruoli.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 p-4">
            <span className="text-xs font-black text-blue-600">03</span>
            <p className="mt-2 text-sm font-bold text-slate-800">Conserva una copia</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Mantieni almeno una copia esterna al PC prima di cambiare il DB.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
