import ClienteProfiloModule from "@/components/cliente/profilo/ClienteProfiloModule";

export const metadata = {
  title: "Profilo — Area Clienti",
};

export const dynamic = "force-dynamic";

/**
 * Pagina Profilo dell'Area Clienti.
 * Modulo reale: dati anagrafici, indirizzo principale e avatar.
 */
export default function ProfiloPage() {
  return <ClienteProfiloModule />;
}
