export type AmbitoRicercaPino =
  | "prodotti"
  | "negozi_servizi"
  | "offerte"
  | "eventi"
  | "attrazioni"
  | "categorie"
  | "tutto";

export type ArgomentiRicercaPino = {
  ricerca: string;
  varianti?: string[];
  ambito: AmbitoRicercaPino;
  categoria?: string;
  tipo?: string;
  citta?: string;
  prezzoMassimo?: number;
  prezzoMinimo?: number;
  apertiOra?: boolean;
  limite: number;
  escludiNomi?: string[];
};

function testoLimitato(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().slice(0, max);
  return v || undefined;
}

function numeroLimitato(value: unknown, min: number, max: number): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

/** Valida e normalizza gli argomenti generati dal modello prima di eseguire query. */
export function normalizzaArgomentiRicercaPino(
  args: Record<string, unknown>
): ArgomentiRicercaPino {
  const ambiti: AmbitoRicercaPino[] = [
    "prodotti",
    "negozi_servizi",
    "offerte",
    "eventi",
    "attrazioni",
    "categorie",
    "tutto",
  ];
  const ambito = ambiti.includes(args.ambito as AmbitoRicercaPino)
    ? (args.ambito as AmbitoRicercaPino)
    : "tutto";
  const varianti = Array.isArray(args.varianti)
    ? Array.from(new Set(args.varianti.filter((v): v is string => typeof v === "string").map((v) => v.trim().slice(0, 100)).filter(Boolean))).slice(0, 3)
    : undefined;
  const escludiNomi = Array.isArray(args.escludiNomi)
    ? args.escludiNomi
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().slice(0, 100))
        .filter(Boolean)
        .slice(0, 20)
    : undefined;

  return {
    ricerca: testoLimitato(args.ricerca, 120) ?? "",
    varianti,
    ambito,
    categoria: testoLimitato(args.categoria, 80),
    tipo: testoLimitato(args.tipo, 80),
    citta: testoLimitato(args.citta, 80),
    prezzoMassimo: numeroLimitato(args.prezzoMassimo, 0, 1_000_000),
    prezzoMinimo: numeroLimitato(args.prezzoMinimo, 0, 1_000_000),
    apertiOra: args.apertiOra === true,
    limite: numeroLimitato(args.limite, 1, 20) ?? 8,
    escludiNomi,
  };
}
