"use client";

import { useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Campo password con toggle "Mostra/Nascondi" (icona occhio / occhio barrato).
 *
 * - password nascosta → icona occhio; clic → visibile (occhio barrato);
 * - il valore digitato NON viene mai perso (si cambia solo il `type`);
 * - il focus resta sul campo (onMouseDown con preventDefault sul pulsante);
 * - pulsante `type="button"` → non invia mai il form;
 * - accessibile: aria-label/title "Mostra password" / "Nascondi password".
 *
 * Solo UI: nessuna logica di autenticazione (il `name` resta quello originale
 * del form, il submit continua a funzionare esattamente come prima).
 */
type PasswordInputProps = {
  id: string;
  name: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  /** Classi extra (es. altezza h-11): vengono aggiunte a quelle di default. */
  className?: string;
};

export default function PasswordInput({
  id,
  name,
  required,
  autoComplete,
  placeholder,
  className = "",
}: PasswordInputProps) {
  const [visibile, setVisibile] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = () => {
    setVisibile((v) => !v);
    // Dopo il toggle ripristina il focus sul campo (copertura per ogni browser).
    inputRef.current?.focus();
  };

  const etichetta = visibile ? "Nascondi password" : "Mostra password";

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type={visibile ? "text" : "password"}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={`w-full rounded-2xl border border-slate-200 pl-4 pr-12 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${className}`}
      />
      <button
        type="button"
        aria-label={etichetta}
        title={etichetta}
        // preventDefault su mousedown: il click non ruba il focus all'input.
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-2xl text-slate-400 transition hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {visibile ? (
          <EyeOff className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Eye className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
