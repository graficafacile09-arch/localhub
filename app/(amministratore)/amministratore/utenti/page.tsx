import AdminPlaceholder from "@/components/amministratore/AdminPlaceholder";
import { getAdminNavItem } from "@/components/amministratore/navigation";

export const metadata = {
  title: "Utenti — Amministratore",
};

export default function UtentiPage() {
  const item = getAdminNavItem("/amministratore/utenti");
  return (
    <AdminPlaceholder
      icon={item.icon}
      title={item.label}
      description={item.description}
    />
  );
}
