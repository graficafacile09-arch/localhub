"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BellRing,
  ChevronDown,
  ChevronRight,
  ReceiptText,
} from "lucide-react";
import { AvvisoNuoviOrdini } from "@/components/ordini/AvvisoNuoviOrdini";
import { AvvisoReclamiAperti } from "@/components/ordini/AvvisoReclamiAperti";
import { KpiOrdini, type ConteggiOrdini } from "@/components/ordini/KpiOrdini";

/**
 * SEZIONE "GESTIONE ORDINI" DELLA DASHBOARD VENDITORE.
 *
 * Prima il contenuto (KpiOrdini) compariva SEMPRE, già aperto, duplicando
 * visivamente l'avviso giallo "Nuovi ordini" e allungando la dashboard.
 * Ora il riepilogo è CHIUSO all'avvio e si apre SOLO al click sul pulsante
 * giallo dell'avviso (o sul chevron della card). Il pulsante giallo non
 * naviga più via: apre/chiude il riepilogo inline; il link "Gestisci ordini"
 * della card continua a portare alla lista completa.
 */
export default function MerchantDashboardOrdini({
  negozioId,
  ordiniTotali,
  nonLetti,
  reclamiAperti,
  conteggi,
}: {
  negozioId: string;
  ordiniTotali: number;
  nonLetti: number;
  reclamiAperti: number;
  conteggi: ConteggiOrdini;
}) {
  const [aperto, setAperto] = useState(false);
  const toggle = () => setAperto((prev) => !prev);
  const ordiniHref = `/merchant/${negozioId}/ordini`;

  return (
    <>
      {/* ── 1. ATTENZIONE — AVVISI URGENTI (prima cosa visibile) ── */}
      {(nonLetti > 0 || reclamiAperti > 0) && (
        <div className="space-y-3">
          {nonLetti > 0 && (
            <AvvisoNuoviOrdini
              conteggio={nonLetti}
              onOpen={toggle}
              ctaLabel={aperto ? "Nascondi riepilogo" : "Mostra riepilogo"}
            />
          )}
          {reclamiAperti > 0 && (
            <AvvisoReclamiAperti
              conteggio={reclamiAperti}
              href={`${ordiniHref}?filtro=reclami`}
            />
          )}
        </div>
      )}

      {/* ── 2. ORDINI — riepilogo comprimibile (chiuso all'avvio) ── */}
      <div className="rounded-2xl border border-white/70 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md">
        <div className="flex items-center justify-between gap-3">
          {/* Link alla lista completa (navigazione preservata) */}
          <Link
            href={ordiniHref}
            className="group flex min-w-0 items-center gap-3"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <ReceiptText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold tracking-tight text-slate-900">
                Gestisci ordini
              </h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <p className="text-xs text-slate-500">
                  {ordiniTotali === 0
                    ? "Nessun ordine ricevuto"
                    : `${ordiniTotali} ordini totali`}
                </p>
                {nonLetti > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-white">
                    <BellRing className="h-3 w-3" aria-hidden />
                    {nonLetti} nuovo{nonLetti === 1 ? " ordine" : "i ordini"}
                  </span>
                )}
                {reclamiAperti > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200">
                    <AlertTriangle className="h-3 w-3" aria-hidden />
                    {reclamiAperti}{" "}
                    {reclamiAperti === 1 ? "reclamo aperto" : "reclami aperti"}
                  </span>
                )}
              </div>
            </div>
          </Link>

          {/* Toggle del riepilogo (stesso stato del pulsante giallo) */}
          <button
            type="button"
            onClick={toggle}
            aria-label={aperto ? "Nascondi riepilogo ordini" : "Mostra riepilogo ordini"}
            aria-expanded={aperto}
            className="shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
          >
            {aperto ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronRight className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Contenuto — solo dopo il click sul pulsante giallo / chevron */}
        {aperto && ordiniTotali > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <KpiOrdini baseHref={ordiniHref} conteggi={conteggi} />
          </div>
        )}
      </div>
    </>
  );
}
