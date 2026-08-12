import type { Metadata } from "next";
import Header from "@/components/Header/Header";
import CarrelloPageClient from "@/components/carrello/CarrelloPageClient";

export const metadata: Metadata = {
  title: "Carrello",
  description: "Il tuo carrello su InCittà: prodotti dai negozi della tua città.",
};

export default function PaginaCarrello() {
  return (
    <main className="min-h-screen bg-slate-50">
      <Header />
      <CarrelloPageClient />
    </main>
  );
}
