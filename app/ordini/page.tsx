import { ShoppingBag } from "lucide-react";
import AccountPlaceholder from "@/components/AccountPlaceholder";

export const metadata = {
  title: "Ordini — LocalHub",
  description: "I tuoi ordini su LocalHub.",
};

export default function OrdiniPage() {
  return (
    <AccountPlaceholder
      icon={ShoppingBag}
      title="Ordini"
      description="Qui troverai lo storico dei tuoi ordini con lo stato di spedizione e consegna."
    />
  );
}
