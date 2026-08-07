import Link from "next/link";
import type { Metadata } from "next";
import Header from "@/components/Header/Header";
import CategoriaShowcaseView from "@/components/categoria/CategoriaShowcaseView";
import { getCategoriaShowcase, getCategoriaBySlug } from "@/lib/negozi";
import { getStatoPreferitiPerPagina } from "@/lib/cliente/favorites";
import { ArrowLeft } from "lucide-react";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const categoria = await getCategoriaBySlug(slug);
  if (!categoria) return { title: "Categoria non trovata | InCittà" };
  return {
    title: `${categoria.nome} | InCittà`,
    description: categoria.descrizione ?? `Negozi e attività della categoria ${categoria.nome} a Castrovillari.`,
  };
}

export default async function PaginaCategoria({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const showcase = await getCategoriaShowcase(slug);
  const statoPreferiti = await getStatoPreferitiPerPagina();

  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      <div className="mx-auto max-w-5xl px-3 py-3 sm:px-5">
        <Link
          href="/categorie"
          className="mb-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-blue-700 transition hover:text-blue-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Tutte le categorie
        </Link>

        <CategoriaShowcaseView
          showcase={showcase}
          chiaviPreferiti={statoPreferiti.chiavi}
          autenticato={statoPreferiti.autenticato}
        />
      </div>
    </main>
  );
}