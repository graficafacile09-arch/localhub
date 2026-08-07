import CategorieModule from "@/components/amministratore/CategorieModule";
import { getCategorieAdmin } from "@/lib/amministratore/categorie-queries";

export const metadata = {
  title: "Categorie — Amministratore",
};

// I dati reali delle categorie devono riflettere lo stato corrente del database.
export const dynamic = "force-dynamic";

export default async function CategoriePage() {
  const categorie = await getCategorieAdmin();
  return <CategorieModule categorie={categorie} />;
}