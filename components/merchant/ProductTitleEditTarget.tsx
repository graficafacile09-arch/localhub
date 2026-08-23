"use client";

import { useCallback } from "react";

/**
 * Titolo prodotto nella pagina "Modifica prodotto": tap/click (o Enter/Spazio
 * da tastiera) porta il focus al campo "Nome prodotto" del form sottostante,
 * riusando il campo esistente — nessuna logica di modifica duplicata.
 */
export default function ProductTitleEditTarget({
  nome,
  className,
}: {
  nome: string;
  className?: string;
}) {
  const focusaCampoNome = useCallback(() => {
    const campo = document.getElementById("nome");
    if (campo instanceof HTMLElement) {
      campo.scrollIntoView({ behavior: "smooth", block: "center" });
      campo.focus({ preventScroll: true });
    }
  }, []);

  return (
    <h1
      id="titolo-prodotto-edit"
      role="button"
      tabIndex={0}
      onClick={focusaCampoNome}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          focusaCampoNome();
        }
      }}
      title="Tocca per modificare il nome del prodotto"
      aria-label={`Modifica il nome del prodotto: ${nome}`}
      className={`cursor-pointer rounded-lg transition hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
        className ?? ""
      }`}
    >
      {nome}
    </h1>
  );
}
