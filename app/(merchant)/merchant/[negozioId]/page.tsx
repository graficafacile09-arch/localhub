import Link from "next/link";
import { Camera } from "lucide-react";
import MerchantDashboardCards from "@/components/merchant/MerchantDashboardCards";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import MerchantQuickActions from "@/components/merchant/MerchantQuickActions";
import { AvvisoNuoviOrdini } from "@/components/ordini/AvvisoNuoviOrdini";
import { AvvisoReclamiAperti } from "@/components/ordini/AvvisoReclamiAperti";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantProductsForStore, getMerchantStoreForUser } from "@/lib/merchant/data";
import { getOrdiniVenditore } from "@/lib/merchant/ordini";
import { getConteggioReclamiApertiVenditore } from "@/lib/ordine-reclami";
import {
  contaNuoviAppuntamenti,
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
      .select("data, moduli_attivi")
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
        const ultimaLettura = getUltimaLetturaAgenda(dataNegozio);
        if (ultimaLettura) {
          const { data: righe } = await supabase
            .from("prenotazioni")
            .select("negozio_id, stato, created_at")
            .eq("negozio_id", negozioId);
          nuoviAppuntamenti = contaNuoviAppuntamenti(
            (righe ?? []).map(rigaPrenotazionePerBadge),
            negozioId,
            ultimaLettura
          );
        }
      }
    }
  } catch {
    nuoviAppuntamenti = 0;
  }

  return (
    <div className="space-y-4">
      {/* Header compatto */}
      <div className="rounded-2xl border border-white/70 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
          Dashboard negozio
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
          {storeResult.data.nome}
        </h1>
        {storeResult.data.descrizione && (
          <p className="mt-1 text-sm leading-5 text-slate-500">
            {storeResult.data.descrizione}
          </p>
        )}
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
        className="btn-cta gap-3 px-5 py-3 text-sm"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
          <Camera className="h-5 w-5" />
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
