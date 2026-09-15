import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { getDatiDashboard } from "@/lib/amministratore/dashboard-queries";

/**
 * Dashboard Amministratore — dati reali della piattaforma.
 * KPI, grafici, ultime attività e stato generale, tutti dal database
 * (negozi demo e utenti di test esclusi). Solo sessione admin.
 */
export async function GET() {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  try {
    const dashboard = await getDatiDashboard();
    return apiOk({ dashboard });
  } catch (err) {
    console.error("[/api/amministratore/dashboard] Errore:", err);
    return apiError(
      "DASHBOARD_ERROR",
      "Impossibile caricare la dashboard. Riprova tra poco.",
      500
    );
  }
}
