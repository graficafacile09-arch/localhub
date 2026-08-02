import { Heart } from "lucide-react";
import AccountPlaceholder from "@/components/AccountPlaceholder";

export const metadata = {
  title: "Preferiti — LocalHub",
  description: "I tuoi negozi e prodotti preferiti su LocalHub.",
};

export default function PreferitiPage() {
  return (
    <AccountPlaceholder
      icon={Heart}
      title="Preferiti"
      description="Qui ritroverai i negozi e i prodotti che hai salvato per non perderli di vista."
    />
  );
}
