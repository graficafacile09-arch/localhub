import { requireCurrentUser } from "@/lib/auth/session";
import WizardShell from "@/components/merchant/wizard/WizardShell";

export const metadata = {
  title: "Crea negozio — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Creazione negozio nell'Area Amministratore.
 * Riusa lo STESSO wizard del venditore (WizardShell, nessun secondo editor):
 * l'admin crea il negozio esattamente come un venditore (da zero, da
 * template o duplicando un negozio esistente) e viene portato nell'editor
 * condiviso in modalità admin (/amministratore/negozi/{id}/edit), da cui
 * potrà riaprire e modificare il negozio in seguito.
 * L'accesso è già garantito dal layout (sessione admin) e dalle API
 * merchant (areaConsenteAccesso consente all'admin anche le risorse negozi,
 * senza indebolire le autorizzazioni dei venditori).
 */
export default async function NuovoNegozioAdminPage() {
  await requireCurrentUser("/login");
  return <WizardShell area="admin" />;
}
