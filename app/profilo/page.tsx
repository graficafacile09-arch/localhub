import { UserRound } from "lucide-react";
import AccountPlaceholder from "@/components/AccountPlaceholder";

export const metadata = {
  title: "Profilo — LocalHub",
  description: "Il tuo profilo su LocalHub: dati personali e preferenze.",
};

export default function ProfiloPage() {
  return (
    <AccountPlaceholder
      icon={UserRound}
      title="Profilo"
      description="Qui potrai gestire i tuoi dati personali, la tua immagine e le preferenze dell'account."
    />
  );
}
