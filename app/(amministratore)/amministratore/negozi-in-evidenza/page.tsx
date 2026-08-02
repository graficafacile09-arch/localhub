import AdminPlaceholder from "@/components/amministratore/AdminPlaceholder";
import { getAdminNavItem } from "@/components/amministratore/navigation";

export const metadata = {
  title: "Negozi in evidenza — Amministratore",
};

export default function NegoziInEvidenzaPage() {
  const item = getAdminNavItem("/amministratore/negozi-in-evidenza");
  return (
    <AdminPlaceholder
      icon={item.icon}
      title={item.label}
      description={item.description}
    />
  );
}
