import Link from "next/link";
import { ArrowRight, Camera, CircleDollarSign, Package, ShoppingBag } from "lucide-react";
import MerchantDashboardCards from "@/components/merchant/MerchantDashboardCards";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import MerchantQuickActions from "@/components/merchant/MerchantQuickActions";
import { AvvisoNuoviOrdini } from "@/components/ordini/AvvisoNuoviOrdini";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantProductsForStore, getMerchantStoreForUser } from "@/lib/merchant/data";
import { getOrdiniVenditore } from "@/lib/merchant/ordini";
import { getConteggioReclamiApertiVenditore } from "@/lib/ordine-reclami";
import {
  contaNuoviAppuntamenti,
  getBaselineAgenda,
  getUltimaLetturaAgenda,
  rigaPrenotazionePerBadge,
} from "@/lib/merchant/agenda-badge";
import { attivitaHaAgenda } from "@/lib/profili-attivita";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Negozio } from "@/types/negozio";

export default async function MerchantStorePage({
  params,
}: {
  params: Promise<{ negozioId: string }>;
}) {
  const { negozioId } = await params;
  const user = await requireCurrentUser("/login");
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired) {
    return (
      <MerchantEmptyState
        title="Configurazione database richiesta"
        description={storeResult.errorMessage ?? "Esegui la migrazione SQL per attivare l'area amministratore."}
      />
    );
  }

  if (!storeResult.data) {
    return (
      <MerchantEmptyState
        title="Negozio non disponibile"
        description="Non hai accesso a questo negozio oppure non esiste."
      />
    );
  }

  const productsResult = await getMerchantProductsForStore(user.id, negozioId);
  const prodotti = productsResult.data;
  const attivi = prodotti.filter((item) => item.attivo).length;
  const manuali = prodotti.filter((item) => (item.origine_pubblicazione ?? "manuale") === "manuale").length;

  // Riepilogo ordini (best-effort: un errore qui non deve far fallire la dashboard).
  let ordini: import("@/lib/merchant/ordini").OrdineVenditoreLista[] = [];
  try {
    ordini = await getOrdiniVenditore(user.id, negozioId);
  } catch {
    ordini = [];
  }
  const nonLetti = ordini.filter((o) => !o.lettoAt).length;

  // Reclami attivi (best-effort: un errore qui non deve far fallire la dashboard).
  let reclamiAperti = 0;
  try {
    reclamiAperti = await getConteggioReclamiApertiVenditore(user.id, negozioId);
  } catch {
    reclamiAperti = 0;
  }

  // Badge Agenda: appuntamenti NUOVI (non ancora visti) per il SOLO negozio
  // corrente. Definizione centralizzata in lib/merchant/agenda-badge.ts:
  // confermata con created_at > data.agenda_ultima_lettura; se l'Agenda non
  // è mai stata aperta → 0 (mai lo storico). Solo per attività con Agenda.
  let nuoviAppuntamenti = 0;
  try {
    const supabase = createAdminSupabaseClient();
    // MerchantStoreSummary non espone il jsonb `data`: leggo `data` e
    // `moduli_attivi` direttamente per il gating centralizzato e la lettura.
    const { data: rigaNegozio } = await supabase
      .from("negozi")
      .select("data, moduli_attivi, created_at")
      .eq("id", negozioId)
      .single();

    if (rigaNegozio) {
      const dataNegozio = (rigaNegozio.data ?? {}) as Record<string, unknown>;
      const negozioMinimo = {
        data: dataNegozio,
        moduli_attivi: Array.isArray(rigaNegozio.moduli_attivi)
          ? (rigaNegozio.moduli_attivi as string[])
          : [],
      } as unknown as Negozio;

      if (attivitaHaAgenda(negozioMinimo)) {
        // Soglia = ultima lettura Agenda se esiste, altrimenti la creazione
        // del negozio: così una prenotazione confermata successiva produce
        // subito il badge [N] anche prima della prima apertura dell'Agenda.
        const baseline = getBaselineAgenda(
          getUltimaLetturaAgenda(dataNegozio),
          rigaNegozio.created_at
        );
        if (baseline) {
          const { data: righe } = await supabase
            .from("prenotazioni")
            .select("negozio_id, stato, created_at")
            .eq("negozio_id", negozioId);
          nuoviAppuntamenti = contaNuoviAppuntamenti(
            (righe ?? []).map(rigaPrenotazionePerBadge),
            negozioId,
            baseline
          );
        }
      }
    }
  } catch {
    nuoviAppuntamenti = 0;
  }

  return (
    <div className="space-y-5">
      {/* Header principale */}
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_55px_-35px_rgba(15,23,42,.55)] md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">CENTRO OPERATIVO</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">{storeResult.data.nome}</h1>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Link href={`/merchant/${negozioId}/prodotti`} className="group rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white">
            <Package className="h-5 w-5 text-slate-700" /><p className="mt-3 text-sm font-black">Prodotti</p><p className="mt-1 text-xs text-slate-500">Catalogo e disponibilità</p><ArrowRight className="mt-3 h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
          <Link href={`/merchant/${negozioId}/ordini`} className="group relative rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-white">
            {nonLetti > 0 && (
              <span className="absolute right-3 top-3 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-black leading-none text-white" aria-label={`${nonLetti} nuovi ordini`}>
                {nonLetti > 99 ? "99+" : nonLetti}
              </span>
            )}
            <ShoppingBag className="h-5 w-5 text-blue-700" /><p className="mt-3 text-sm font-black">Ordini</p><p className="mt-1 text-xs text-slate-500">Gestisci le vendite</p><ArrowRight className="mt-3 h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
          <Link href={`/merchant/${negozioId}/guadagni`} className="group rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white">
            <CircleDollarSign className="h-5 w-5 text-slate-700" /><p className="mt-3 text-sm font-black">Guadagni</p><p className="mt-1 text-xs text-slate-500">Incassi e riepiloghi</p><ArrowRight className="mt-3 h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
        </div>
        {storeResult.data.descrizione && <p className="mt-4 text-sm leading-5 text-slate-500">{storeResult.data.descrizione}</p>}
      </div>

      {/* ── ATTENZIONE — AVVISI URGENTI (prima cosa visibile) ── */}
      {(nonLetti > 0 || reclamiAperti > 0) && (
        <div className="space-y-3">
          {nonLetti > 0 && (
            <AvvisoNuoviOrdini
              conteggio={nonLetti}
              href={`/merchant/${negozioId}/ordini?filtro=nuovi`}
            />
          )}
          {reclamiAperti > 0 && (
            <AvvisoReclamiAperti
              conteggio={reclamiAperti}
              href={`/merchant/${negozioId}/ordini?filtro=reclami`}
            />
          )}
        </div>
      )}

      {/* Scansione — azione principale, immediatamente visibile */}
      <Link
        href={`/merchant/${negozioId}/prodotti/ai`}
        className="flex w-full items-center justify-between rounded-[22px] border border-yellow-500 bg-yellow-400 px-5 py-4 text-sm font-black text-blue-950 shadow-[0_18px_40px_-24px_rgba(15,23,42,.25)] transition hover:bg-yellow-300"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-900/10">
          <Camera className="h-5 w-5 text-blue-950" />
        </div>
        <span>Scansiona nuovo prodotto</span>
      </Link>

      {/* Altre azioni rapide */}
      <MerchantQuickActions storeId={negozioId} nuoviAppuntamenti={nuoviAppuntamenti} />

      {/* ── Statistiche — comprimibili ──────────────────────────────────────── */}
      <MerchantDashboardCards
        totals={{
          prodotti: prodotti.length,
          attivi,
          inVetrina: manuali,
        }}
      />

      {/* Eliminazione negozio: disponibile in Impostazioni → Zona Pericolosa.
          Il ripristino dal Cestino è riservato all'amministratore. */}
    </div>
  );
}
