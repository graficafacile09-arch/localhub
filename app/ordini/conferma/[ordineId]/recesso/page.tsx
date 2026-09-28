import RecessoOrdine from "@/components/cliente/RecessoOrdine.jsx";

type Params = { ordineId: string };
type SearchParams = Record<string, string | string[] | undefined>;

export default async function RecessoGuestPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { ordineId } = await params;
  const query = await searchParams;
  const token = typeof query?.token === "string" ? query.token : null;

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
      <RecessoOrdine ordineId={ordineId} token={token} />
    </main>
  );
}
