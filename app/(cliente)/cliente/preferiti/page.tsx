import PreferitiModule from "@/components/cliente/preferiti/PreferitiModule";

export const metadata = {
  title: "Preferiti — Area Clienti",
};

/**
 * Pagina Preferiti dell'Area Clienti.
 * Modulo reale (FASE 3): filtri per tipologia, ricerca, ordinamento e
 * paginazione progressiva. I dati provengono da /api/cliente/preferiti.
 */
export default function PreferitiPage() {
  return <PreferitiModule />;
}
