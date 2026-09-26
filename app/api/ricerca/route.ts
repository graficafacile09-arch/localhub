import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/search-service";
import { getFiltriDisponibiliProdotti } from "@/lib/negozi";
import { isOrdinamentoProdottiPubblici, type OrdinamentoProdottiPubblici } from "@/lib/negozi";

const PER_PAGINA = 12;

function parseNum(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return !Number.isNaN(n) && n > 0 ? n : undefined;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const get = (k: string) => searchParams.get(k) ?? "";

  const termine = get("q").trim();
  const categoria = get("categoria").trim();
  const sottocategoria = get("sottocategoria").trim();
  const marca = get("marca").trim();
  const colore = get("colore").trim();
  const prezzoMin = parseNum(get("prezzo_min"));
  const prezzoMax = parseNum(get("prezzo_max"));
  const soloDisponibili = get("disponibile") === "1";
  const ordina: OrdinamentoProdottiPubblici = isOrdinamentoProdottiPubblici(get("ordina"))
    ? (get("ordina") as OrdinamentoProdottiPubblici)
    : "rilevanza";
  const pagina = Math.max(1, Number.parseInt(get("pagina"), 10) || 1);

  const ricercaAttiva = Boolean(
    termine || categoria || sottocategoria || marca || colore ||
    prezzoMin !== undefined || prezzoMax !== undefined || soloDisponibili
  );

  let prodotti: any[] = [];
  let negozi: any[] = [];
  let total = 0;
  let disponibili: any = {};

  if (ricercaAttiva) {
    const risultato = await search(termine, {
      categoria: categoria || undefined,
      sottocategoria: sottocategoria || undefined,
      marca: marca || undefined,
      colore: colore || undefined,
      prezzoMin,
      prezzoMax,
      soloDisponibili: soloDisponibili || undefined,
      ordina,
      pagina,
      perPagina: PER_PAGINA,
    });
    prodotti = risultato.prodotti;
    negozi = risultato.negozi;
    total = risultato.total;
    disponibili = await getFiltriDisponibiliProdotti();
  }

  return NextResponse.json({
    prodotti,
    negozi,
    total,
    disponibili,
  });
}