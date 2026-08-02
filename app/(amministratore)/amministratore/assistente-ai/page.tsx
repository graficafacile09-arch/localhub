import AdminPlaceholder from "@/components/amministratore/AdminPlaceholder";
import { getAdminNavItem } from "@/components/amministratore/navigation";

export const metadata = {
  title: "Assistente AI — Amministratore",
};

export default function AssistenteAiPage() {
  const item = getAdminNavItem("/amministratore/assistente-ai");
  return (
    <AdminPlaceholder
      icon={item.icon}
      title={item.label}
      description={item.description}
    />
  );
}
