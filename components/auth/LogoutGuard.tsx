"use client";

import { useEffect } from "react";

/**
 * Guard anti-ripristino dalla cronologia (bfcache): se il browser ripristina
 * una pagina autenticata premendo Back senza una nuova richiesta al server,
 * ricarica la pagina: la sessione ormai chiusa non supera i gate delle aree
 * e l'utente viene reindirizzato a /login. Nessuna logica di autenticazione
 * aggiuntiva: riusa i gate esistenti.
 */
export default function LogoutGuard() {
  useEffect(() => {
    const onPageshow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", onPageshow);
    return () => window.removeEventListener("pageshow", onPageshow);
  }, []);

  return null;
}