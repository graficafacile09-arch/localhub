import AttivitaModule from "@/components/amministratore/AttivitaModule";
import {
  getAttivita,
  getCategorieAttivita,
} from "@/lib/amministratore/service";

export const metadata = {
  title: "Negozi — Amministratore",
};

// I dati reali dei negozi devono riflettere lo stato corrente del database.
export const dynamic = "force-dynamic";

export default async function AttivitaPage() {
  const [attivita, categorie] = await Promise.all([
    getAttivita(),
    getCategorieAttivita(),
  ]);

  return <AttivitaModule attivita={attivita} categorie={categorie} />;
}
