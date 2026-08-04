import ClientePlaceholder from "@/components/cliente/ClientePlaceholder";
import { getClienteNavItem } from "@/components/cliente/navigation";

export const metadata = {
  title: "Impostazioni — Area Clienti",
};

export default function ImpostazioniPage() {
  const item = getClienteNavItem("/cliente/impostazioni");
  return (
    <ClientePlaceholder
      icon={item.icon}
      title={item.label}
      description={item.description}
    />
  );
}
