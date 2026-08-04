import ClientePlaceholder from "@/components/cliente/ClientePlaceholder";
import { getClienteNavItem } from "@/components/cliente/navigation";

export const metadata = {
  title: "Ordini — Area Clienti",
};

export default function OrdiniPage() {
  const item = getClienteNavItem("/cliente/ordini");
  return (
    <ClientePlaceholder
      icon={item.icon}
      title={item.label}
      description={item.description}
    />
  );
}
