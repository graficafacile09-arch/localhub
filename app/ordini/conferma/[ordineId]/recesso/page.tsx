import RecessoOrdine from "@/components/cliente/RecessoOrdine.jsx";

type Params = { ordineId: string };

export default async function RecessoGuestPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { ordineId } = await params;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6">
        <a
          href={`/ordini/conferma/${encodeURIComponent(ordineId)}`}
          className="text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          ← Torna all'ordine
        </a>
      </div>
      <RecessoOrdine ordineId={ordineId} />
    </main>
  );
}
