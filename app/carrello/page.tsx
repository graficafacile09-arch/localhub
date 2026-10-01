import type { Metadata } from "next";
import Header from "@/components/Header/Header";
import CarrelloPageClient from "@/components/carrello/CarrelloPageClient";

export const metadata: Metadata = {
  title: "Carrello",
  description: "Il tuo carrello su InCittà: prodotti dai negozi della tua città.",
};

export default function PaginaCarrello() {
  return (
    <main className="incitta-premium-cart min-h-screen">
      <Header />
      <CarrelloPageClient />
    </main>
  );
}
