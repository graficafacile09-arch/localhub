import AdminPlaceholder from "@/components/amministratore/AdminPlaceholder";
import { getAdminNavItem } from "@/components/amministratore/navigation";

export const metadata = {
  title: "Impostazioni — Amministratore",
};

export default function ImpostazioniPage() {
  const item = getAdminNavItem("/amministratore/impostazioni");
  return (
    <AdminPlaceholder
      icon={item.icon}
      title={item.label}
      description={item.description}
    />
  );
}
