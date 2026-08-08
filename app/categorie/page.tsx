import Header from "@/components/Header/Header";
import { getCategorieConNegozi } from "@/lib/negozi";
import CategoryTile from "@/components/home/CategoryTile";
import { OpenAssistantButton } from "@/components/assistant/OpenAssistantButton";
import { Store, Sparkles } from "lucide-react";

export default async function CategoriePage() {
  const categorieConNegozi = await getCategorieConNegozi();

  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
        <div className="mb-6">
          <h1 className="text-xl font-black tracking-tight text-slate-900">
            Tutte le categorie
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Scegli una categoria per trovare i negozi e le attività della tua città.
          </p>
          <OpenAssistantButton label="Cerca con l'Assistente AI" />
        </div>

        {categorieConNegozi.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[2rem] border border-white/70 bg-white px-6 py-16 text-center shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
              <Store className="h-8 w-8 text-blue-500" />
            </div>
            <h2 className="mt-4 text-lg font-black tracking-tight text-slate-900">
              Nessuna categoria disponibile
            </h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Al momento non ci sono negozi registrati in città.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 md:gap-3 lg:grid-cols-6">
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
