import { Bell } from "lucide-react";
import NotificheModule from "@/components/amministratore/NotificheModule";
import { getAdminNavItem } from "@/components/amministratore/navigation";
import { contaNotificheAdminNonLette } from "@/lib/amministratore/notifiche";

export const metadata = {
  title: "Notifiche — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Centro notifiche dell'Area Amministratore: inbox interna, persistente e
 * best-effort, generata dagli eventi applicativi reali (nuovi ordini,
 * segnalazioni, venditori, negozi, prodotti, offerte, eventi, payout).
 * Il conteggio non-lette è calcolato SERVER-SIDE qui (badge sidebar) e la
 * pagina interattiva gestisce lettura/archiviazione e filtri.
 */
export default async function NotifichePage() {
  const item = getAdminNavItem("/amministratore/notifiche");
  const nonLette = await contaNotificheAdminNonLette();

  return (
    <section aria-label="Notifiche Amministrazione">
      {/* Breadcrumb coerente con le altre pagine del pannello */}
      <nav aria-label="Percorso" className="mb-4">
        <a
          href="/amministratore"
          className="text-xs font-semibold text-blue-600 transition hover:text-blue-800"
        >
          ← Pannello
        </a>
      </nav>

      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
          {item.description}
        </p>
        {nonLette > 0 && (
          <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-yellow-50 px-3 py-1 text-xs font-bold text-yellow-800 ring-1 ring-yellow-200">
            <Bell className="h-3.5 w-3.5" aria-hidden />
            {nonLette} {nonLette === 1 ? "notifica non letta" : "notifiche non lette"}
          </p>
        )}
      </div>

      <NotificheModule />
    </section>
  );
}