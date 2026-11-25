import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header/Header";
import {
  FILIERE_EDITORIALI,
  getFilieraEditoriale,
  slugFiliera,
} from "@/lib/filiere-editoriali";
import { getSiteUrl } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return FILIERE_EDITORIALI.map((filiera) => ({ slug: slugFiliera(filiera) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const filiera = getFilieraEditoriale(slug);
  if (!filiera) return { title: "Filiera non trovata" };

  const canonical = `${getSiteUrl()}/filiere/${slug}`;
  return {
    title: `${filiera.nome} | Radici Calabria`,
    description: filiera.testo,
    alternates: { canonical },
    openGraph: {
      title: `${filiera.nome} | Radici Calabria`,
      description: filiera.testo,
      url: canonical,
      type: "article",
      images: [{ url: filiera.img, alt: filiera.alt }],
    },
  };
}

export default async function FilieraPage({ params }: Props) {
  const { slug } = await params;
  const filiera = getFilieraEditoriale(slug);
  if (!filiera) notFound();

  const siteUrl = getSiteUrl();
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "Filiere", item: `${siteUrl}/filiere` },
      { "@type": "ListItem", position: 3, name: filiera.nome, item: `${siteUrl}/filiere/${slug}` },
    ],
  };

  return (
    <>
      <Header />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <main className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        <nav aria-label="Percorso" className="text-xs text-stone-500">
          <Link href="/" className="hover:underline">Home</Link>
          {" / "}
          <Link href="/filiere" className="hover:underline">Filiere</Link>
          {" / "}
          <span aria-current="page">{filiera.nome}</span>
        </nav>

        <h1 className="mt-4 text-3xl font-black tracking-tight text-[#1c2b22] md:text-4xl">
          {filiera.nome}
        </h1>
        <p className="mt-2 text-sm font-bold text-[#8a5a3b]">{filiera.territorio}</p>

        <div className="relative mt-6 aspect-[2/1] w-full overflow-hidden rounded-2xl bg-[#f4efe4]">
          <Image
            src={filiera.img}
            alt={filiera.alt}
            fill
            sizes="(max-width: 896px) 100vw, 896px"
            className="object-cover"
            priority
          />
        </div>
        <p className="mt-2 text-[11px] text-stone-500">{filiera.credito}</p>

        <section className="mt-8 space-y-4 text-[15px] leading-7 text-stone-700">
          <p>{filiera.testo}</p>
          {filiera.paragrafi.map((paragrafo) => (
            <p key={paragrafo}>{paragrafo}</p>
          ))}
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-black text-[#1c2b22]">Cultivar e materie prime</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-stone-700">
            {filiera.lavorazione.map((voce) => (
              <li key={voce}>{voce}</li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-black text-[#1c2b22]">Stagionalità</h2>
          <p className="mt-2 text-stone-700">{filiera.stagionalita}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-black text-[#1c2b22]">Prodotti della filiera</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-stone-700">
            {filiera.prodotti.map((prodotto) => (
              <li key={prodotto}>{prodotto}</li>
            ))}
          </ul>
        </section>

        {filiera.riconoscimenti.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-black text-[#1c2b22]">Riconoscimenti DOP / IGP / PAT</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-stone-700">
              {filiera.riconoscimenti.map((riconoscimento) => (
                <li key={riconoscimento}>{riconoscimento}</li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-10">
          <Link href="/filiere" className="font-bold text-[#24462f] hover:underline">
            ← Tutte le filiere
          </Link>
        </p>
      </main>
    </>
  );
}
