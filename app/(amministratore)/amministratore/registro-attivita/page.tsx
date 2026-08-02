import AdminPlaceholder from "@/components/amministratore/AdminPlaceholder";
import { getAdminNavItem } from "@/components/amministratore/navigation";

export const metadata = {
  title: "Registro attività — Amministratore",
};

export default function RegistroAttivitaPage() {
  const item = getAdminNavItem("/amministratore/registro-attivita");
  return (
    <AdminPlaceholder
      icon={item.icon}
      title={item.label}
      description={item.description}
    />
  );
}
