import ImpostazioniClienteModule from "@/components/cliente/impostazioni/ImpostazioniClienteModule";

export const metadata = {
  title: "Impostazioni — Area Clienti",
};

export const dynamic = "force-dynamic";

/**
 * Pagina Impostazioni dell'Area Clienti.
 * Modulo reale: dati personali modificabili e cambio password (Supabase Auth).
 */
export default function ImpostazioniPage() {
  return <ImpostazioniClienteModule />;
}
