import { requireCurrentUser } from "@/lib/auth/session";
import WizardShell from "@/components/merchant/wizard/WizardShell";

export default async function NuovoNegozioPage() {
  await requireCurrentUser("/login");
  return <WizardShell />;
}
