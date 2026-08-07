import NegoziInEvidenzaModule from "@/components/amministratore/NegoziInEvidenzaModule";
import { getAttivita, getCategorieAttivita } from "@/lib/amministratore/service";

export const metadata = {
  title: "Negozi in evidenza — Amministratore",
};

// I dati reali dei negozi devono riflettere lo stato corrente del database.
export const dynamic = "force-dynamic";

export default async function NegoziInEvidenzaPage() {
  const [attivita, categorie] = await Promise.all([
    getAttivita(),
    getCategorieAttivita(),
  ]);

  // Solo negozi ATTIVI e non cestinati (getAttivita esclude già il Cestino).
  const attivi = attivita.filter((negozio) => negozio.attivo);

  return <NegoziInEvidenzaModule attivita={attivi} categorie={categorie} />;
}
