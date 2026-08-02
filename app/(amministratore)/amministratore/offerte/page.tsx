import AdminPlaceholder from "@/components/amministratore/AdminPlaceholder";
import { getAdminNavItem } from "@/components/amministratore/navigation";

export const metadata = {
  title: "Offerte — Amministratore",
};

export default function OffertePage() {
  const item = getAdminNavItem("/amministratore/offerte");
  return (
    <AdminPlaceholder
      icon={item.icon}
      title={item.label}
      description={item.description}
    />
  );
}
