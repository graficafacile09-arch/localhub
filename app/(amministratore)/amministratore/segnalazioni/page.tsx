import AdminPlaceholder from "@/components/amministratore/AdminPlaceholder";
import { getAdminNavItem } from "@/components/amministratore/navigation";

export const metadata = {
  title: "Segnalazioni — Amministratore",
};

export default function SegnalazioniPage() {
  const item = getAdminNavItem("/amministratore/segnalazioni");
  return (
    <AdminPlaceholder
      icon={item.icon}
      title={item.label}
      description={item.description}
    />
  );
}
