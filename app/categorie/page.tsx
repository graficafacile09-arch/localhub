import Header from "@/components/Header/Header";
import { getCategorie } from "@/lib/negozi";
import CategoryTile from "@/components/home/CategoryTile";

export default async function CategoriePage() {
  const categorie = await getCategorie();

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
        </div>

        <div className="grid grid-cols-4 gap-2 md:gap-3">
          {categorie.map((categoria, index) => (
            <CategoryTile key={categoria.id} categoria={categoria} index={index} />
          ))}
        </div>
      </div>
    </main>
  );
}
