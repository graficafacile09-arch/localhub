import Image from "next/image";

export function ProductImage({
  prodottoId,
  categoria,
  nome,
}: {
  prodottoId: string;
  categoria: string | null;
  nome: string;
}) {
  console.log("[ProductImage] rendering, prodottoId:", prodottoId, "categoria:", categoria, "nome:", nome);
  const src = `/api/prodotto-immagine?id=${prodottoId}&categoria=${categoria ?? ""}`;
  console.log("[ProductImage] src:", src);

  return (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
      <Image
        src={src}
        alt={nome}
        fill
        className="h-full w-full object-cover"
      />
    </div>
  );
}
