import AdminPlaceholder from "@/components/amministratore/AdminPlaceholder";
import { getAdminNavItem } from "@/components/amministratore/navigation";

export const metadata = {
  title: "Contenuti — Amministratore",
};

export default function ContenutiPage() {
  const item = getAdminNavItem("/amministratore/contenuti");
  return (
    <AdminPlaceholder
      icon={item.icon}
      title={item.label}
      description={item.description}
    />
  );
}
