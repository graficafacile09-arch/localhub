export function normalizza(testo: string) {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function radice(termine: string) {
  const valore = normalizza(termine).trim();
  if (valore.length <= 4) return valore;
  return valore.replace(/[aeiou]$/i, "");
}

export function estraiTermini(query: string) {
  return query
    .split(/\s+/)
    .map((termine) => normalizza(termine).trim())
    .filter(Boolean);
}

export function estraiToken(campo: string | null | undefined) {
  return normalizza(campo ?? "")
    .split(/[^a-z0-9]+/)
    .map((termine) => termine.trim())
    .filter(Boolean);
}
