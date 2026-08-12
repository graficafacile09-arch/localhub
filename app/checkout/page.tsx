import type { Metadata } from "next";
import Header from "@/components/Header/Header";
import CheckoutCarrelloForm from "@/components/carrello/CheckoutCarrelloForm";
import { getCurrentUser } from "@/lib/auth/session";
import { getProfilo } from "@/lib/cliente/profile";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Completa il tuo ordine su InCittà: ritiro o spedizione dai negozi della tua città.",
};

/**
 * /checkout — FASE F2.5.
 *
 * Pagina server: monta il form client del checkout carrello (F2.4) e fornisce
 * il PRE-FILL dei dati del cliente SOLO se l'utente è autenticato (profilo +
 * email account). L'utente autenticato non viene MAI inviato dal browser come
 * autoritativo: clienteUserId è risolto server-side dalla route F2.2.
 */
export default async function PaginaCheckout() {
  const utente = await getCurrentUser();

  let prefill: {
    nome: string;
    cognome: string;
    email: string;
    telefono: string;
    indirizzo: string;
    cap: string;
    citta: string;
    provincia: string;
    autenticato: boolean;
  } = {
    nome: "",
    cognome: "",
    email: "",
    telefono: "",
    indirizzo: "",
    cap: "",
    citta: "",
    provincia: "",
    autenticato: false,
  };

  if (utente) {
    const profilo = await getProfilo(utente.id).catch(() => null);
    prefill = {
      nome: profilo?.nome ?? "",
      cognome: profilo?.cognome ?? "",
      email: utente.email ?? "",
      telefono: profilo?.telefono ?? "",
      indirizzo: profilo?.indirizzo ?? "",
      cap: profilo?.cap ?? "",
      citta: profilo?.citta ?? "",
      provincia: profilo?.provincia ?? "",
      autenticato: true,
    };
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <Header />
      <CheckoutCarrelloForm prefill={prefill} />
    </main>
  );
}
