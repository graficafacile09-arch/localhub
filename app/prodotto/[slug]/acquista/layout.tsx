import BackButton from "@/components/BackButton";

export default async function AcquistaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-3 py-3 sm:px-5">
        <BackButton
          label="Torna al prodotto"
          fallbackHref={`/prodotto/${slug}`}
          className="mb-3 px-4 py-2"
        />

        <h1 className="text-3xl font-black text-slate-900">Completa l&apos;acquisto</h1>

        {children}
      </div>
    </main>
  );
}
