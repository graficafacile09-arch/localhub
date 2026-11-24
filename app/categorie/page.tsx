import Header from "@/components/Header/Header";
import IntestazionePagina from "@/components/editoriale/IntestazionePagina";
import { getCategorieConNegozi } from "@/lib/negozi";
import CategoryTile from "@/components/home/CategoryTile";
import { OpenAssistantButton } from "@/components/assistant/OpenAssistantButton";
import { Store, Sparkles } from "lucide-react";

export default async function CategoriePage() {
  const categorieConNegozi = await getCategorieConNegozi();

  return (
    <main className="rd-pagina min-h-screen">
      <Header />

      <IntestazionePagina
        occhiello="Esplora"
        titolo="Tutte le categorie"
        icona={Store}
        sommario="Scegli una categoria per scoprire produzioni, prodotti e attività del territorio."
      >
        <OpenAssistantButton label="Cerca con l'Assistente AI" />
      </IntestazionePagina>

      <div className="rd-guscio py-7 md:py-10">
        {categorieConNegozi.length === 0 ? (
          <div className="rd-fascia flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f4efe4] ring-1 ring-[#e5ded0]">
              <Store className="h-8 w-8 text-[#8a5a3b]" />
            </div>
            <h2 className="rd-titolo-scheda mt-4 text-lg">
              Nessuna categoria disponibile
            </h2>
            <p className="mt-1 max-w-sm text-sm leading-6 text-[#57534e]">
              Al momento non ci sono negozi registrati in città.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {categorieConNegozi.map(({ categoria, count }, index) => (
              <CategoryTile
                key={categoria.id}
                categoria={categoria}
                index={index}
                count={count}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
